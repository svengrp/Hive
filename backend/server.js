const http = require('http');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');
const client = require('prom-client');
const { Server } = require('socket.io');
const { connectDB, closeDB } = require('./db');
const helmet = require('helmet');
const Message = require('./models/Message');
const Conversation = require('./models/Conversation');
const Project = require('./models/Project');
const User = require('./models/User');
const ProjectRequest = require('./models/ProjectRequest');
const { containsProfanity } = require('./utils/profanityFilter');
const { notifyNewMessage } = require('./utils/messageEmails');
const { populateMessage } = require('./utils/messagePopulate');
const { registrationsTotal, projectsCreatedTotal, projectsClosedTotal, joinRequestsTotal, messagesSentTotal, socketConnectionsActive } = require('./metric');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 5050;

// ==============================
// Métriques Prometheus
// ==============================
client.collectDefaultMetrics();

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// ==============================
// Middlewares globaux
// ==============================
app.use(helmet());
app.use(cors({
  origin: process.env.FRONT_URL || 'http://localhost:3000',
  credentials: true,
}));
// Webhook Stripe : corps brut (vérification de signature), donc AVANT express.json
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), require('./controllers/billing.controller').webhook);
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

// ==============================
// Import des routes
// ==============================
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const messagesRoutes = require('./routes/messages');
const requestsRoutes = require('./routes/request')
const workspaceRoutes = require('./routes/workspace');
const billingRoutes = require('./routes/billing');
const seoRoutes = require('./routes/seo');
// ==============================
// Montage des routes
// ==============================
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/requests', requestsRoutes);
app.use('/api/workspace', workspaceRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/seo', seoRoutes);
app.get('/health', (_req, res) => res.send('OK'));
app.get('/', (_req, res) => res.send('API Hive en ligne'));

// ==============================
// Socket.io — Messagerie temps réel
// ==============================
const io = new Server(httpServer, {
  cors: { origin: process.env.FRONT_URL || 'http://localhost:3000', credentials: true },
});

app.set('io', io);

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Unauthorized'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = payload.id;
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});


io.on('connection', (socket) => {
  socketConnectionsActive.inc();
  socket.on('disconnect', () => socketConnectionsActive.dec());

  socket.join(`user:${socket.userId}`);

  // Rejoindre les conversations de groupe existantes
  Conversation.find({ participants: socket.userId })
    .then(convs => convs.forEach(c => socket.join(`conv:${c._id}`)))
    .catch(console.error);

  // Message cité : doit appartenir à la même conversation (DM entre les deux mêmes personnes ou même groupe)
  const validReplyTo = async (replyTo, filter) => {
    if (!replyTo || !/^[a-f0-9]{24}$/i.test(String(replyTo))) return null;
    const original = await Message.findOne({ _id: replyTo, ...filter }).select('_id');
    return original ? original._id : null;
  };

  socket.on('send_message', async ({ to, content, replyTo }) => {
    if (!to || !content?.trim()) return;
    if (to === socket.userId) return;

    if (containsProfanity(content)) {
      socket.emit('message_error', { message: 'Message contient des mots inappropriés.' });
      return;
    }

    try {
      const [receiver, sender] = await Promise.all([
        User.findById(to).select('blockedUsers'),
        User.findById(socket.userId).select('blockedUsers'),
      ]);
      if (receiver?.blockedUsers?.map(String).includes(socket.userId)) return;
      if (sender?.blockedUsers?.map(String).includes(to.toString())) return;
      const replyId = await validReplyTo(replyTo, {
        conversationId: null,
        $or: [
          { senderId: socket.userId, receiverId: to },
          { senderId: to, receiverId: socket.userId },
        ],
      });
      const msg = await Message.create({
        senderId: socket.userId,
        receiverId: to,
        content: content.trim(),
        replyTo: replyId,
      });

      const populated = await populateMessage(Message.findById(msg._id), { receiver: true });

      io.to(`user:${to}`).emit('new_message', populated);
      socket.emit('new_message', populated);
      messagesSentTotal.inc({ type: 'direct' });

      notifyNewMessage({
        io,
        recipientIds: [String(to)],
        sender: populated.senderId,
        key: `dm:${socket.userId}`,
        content: msg.content,
        path: `/messages?with=${socket.userId}`,
      });
    } catch (err) {
      console.error('Socket send_message error:', err);
      socket.emit('message_error', { message: 'Erreur lors de l\'envoi.' });
    }
  });

  socket.on('typing', ({ to }) => {
    if (to && to !== socket.userId) {
      io.to(`user:${to}`).emit('typing', { from: socket.userId });
    }
  });
  socket.on('typing_group', ({ conversationId }) => {
    if (conversationId) {
      socket.to(`conv:${conversationId}`).emit('typing_group', { from: socket.userId, conversationId });
    }
  });
  socket.on('join_conversation', (convId) => {
    socket.join(`conv:${convId}`);
  });

  socket.on('send_group_message', async ({ conversationId, content, replyTo }) => {
    if (!conversationId || !content?.trim()) return;
    if (containsProfanity(content)) {
      socket.emit('message_error', { message: 'Message contient des mots inappropriés.' });
      return;
    }
    try {
      const conv = await Conversation.findById(conversationId);
      if (!conv || !conv.participants.map(String).includes(socket.userId)) return;

      if (conv.projectId) {
        const project = await Project.findById(conv.projectId).select('status');
        if (project?.status === 'closed') {
          socket.emit('message_error', { message: 'Ce projet est clôturé — la discussion est fermée.' });
          return;
        }
      }

      const replyId = await validReplyTo(replyTo, { conversationId });
      const msg = await Message.create({
        conversationId,
        senderId: socket.userId,
        content: content.trim(),
        readBy: [socket.userId],
        replyTo: replyId,
      });
      const populated = await populateMessage(Message.findById(msg._id));
      conv.participants.forEach(uid => {
        io.to(`user:${uid}`).emit('new_group_message', { conversationId, message: populated });
      });
      messagesSentTotal.inc({ type: 'group' });

      notifyNewMessage({
        io,
        recipientIds: conv.participants.map(String).filter((uid) => uid !== socket.userId),
        sender: populated.senderId,
        key: `grp:${conversationId}`,
        title: conv.projectTitle,
        content: msg.content,
        path: `/messages?group=${conversationId}`,
      });
    } catch (err) {
      console.error('send_group_message error:', err);
    }
  });
});

// ==============================
// Initialisation des métriques depuis la DB
// ==============================
async function initMetricsFromDB() {
  const [userCount, projectCount, closedCount, requestCount, messageCount] = await Promise.all([
    User.countDocuments(),
    Project.countDocuments(),
    Project.countDocuments({ status: 'closed' }),
    ProjectRequest.countDocuments(),
    Message.countDocuments(),
  ]);
  registrationsTotal.inc(userCount);
  projectsCreatedTotal.inc(projectCount);
  projectsClosedTotal.inc(closedCount);
  joinRequestsTotal.inc({ status: 'sent' }, requestCount);
  messagesSentTotal.inc({ type: 'direct' }, messageCount);
  console.log(`[metrics] init — users:${userCount} projects:${projectCount} closed:${closedCount} requests:${requestCount} messages:${messageCount}`);
}

// ==============================
// Démarrage du serveur + connexion DB
// ==============================
(async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    await initMetricsFromDB();
    httpServer.listen(PORT, () =>
      console.log(`Serveur Hive démarré sur http://localhost:${PORT}`)
    );
  } catch (err) {
    console.error('Erreur de démarrage serveur :', err);
    process.exit(1);
  }
})();

// ==============================
// Arrêt propre (Ctrl+C / kill)
// ==============================
const shutdown = async () => {
  console.log('Arrêt du serveur...');
  await closeDB();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
