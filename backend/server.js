const http = require('http');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');
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
const { resolveSession } = require('./utils/session');
const { migrateInlineAvatars } = require('./utils/avatars');
const { registrationsTotal, projectsCreatedTotal, projectsClosedTotal, joinRequestsTotal, messagesSentTotal, socketConnectionsActive } = require('./metric');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 5050;

// Derrière Cloudflare + le proxy Render : req.ip et req.protocol viennent des en-têtes du proxy
// (voir aussi middlewares/rateLimiter.js, qui lit CF-Connecting-IP).
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));

// ==============================
// Métriques Prometheus
// ==============================
client.collectDefaultMetrics();

/* Métriques internes (nombre de comptes, connexions, projets…) : jamais publiques.
   Accès avec METRICS_TOKEN (Authorization: Bearer …), ou depuis le réseau interne sans proxy
   (Prometheus du docker-compose local). En production, toute requête passe par le proxy. */
const isPrivateAddress = (ip = '') => /^(::ffff:)?(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|^::1$/.test(ip);
app.get('/metrics', async (req, res) => {
  const token = process.env.METRICS_TOKEN;
  const viaProxy = !!(req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip']);
  const allowed = token
    ? req.headers.authorization === `Bearer ${token}`
    : !viaProxy && isPrivateAddress(req.socket.remoteAddress);
  if (!allowed) return res.status(404).json({ message: 'Route introuvable' });
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

// Route inconnue et erreurs : toujours du JSON, jamais de trace serveur (chemins, pile d'appels)
app.use((_req, res) => res.status(404).json({ message: 'Route introuvable' }));
app.use((err, req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Requête invalide.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Requête trop volumineuse.' });
  if (err.name === 'CastError') return res.status(404).json({ message: 'Ressource introuvable' });
  if (err.name === 'ValidationError') return res.status(400).json({ message: 'Données invalides.' });
  console.error(`${req.method} ${req.originalUrl} :`, err);
  return res.status(500).json({ message: 'Erreur serveur' });
});

// ==============================
// Socket.io — Messagerie temps réel
// ==============================
const io = new Server(httpServer, {
  cors: { origin: process.env.FRONT_URL || 'http://localhost:3000', credentials: true },
});

app.set('io', io);

// Même contrôle que l'API : jeton valide, compte existant, session non révoquée
io.use(async (socket, next) => {
  try {
    const session = await resolveSession(socket.handshake.auth?.token);
    if (!session) return next(new Error('Unauthorized'));
    socket.userId = session.id;
    return next();
  } catch {
    return next(new Error('Unauthorized'));
  }
});

const isId = (value) => mongoose.isValidObjectId(value) && /^[a-f0-9]{24}$/i.test(String(value));
const MAX_CONTENT = 2000;
// Anti-spam : au plus 20 messages par 10 secondes et par connexion
const SOCKET_MSG_LIMIT = Number(process.env.SOCKET_MSG_LIMIT || 20);
const SOCKET_MSG_WINDOW_MS = 10 * 1000;


io.on('connection', (socket) => {
  socketConnectionsActive.inc();
  socket.on('disconnect', () => socketConnectionsActive.dec());

  socket.join(`user:${socket.userId}`);

  let sentAt = [];
  const allowMessage = () => {
    const now = Date.now();
    sentAt = sentAt.filter((t) => now - t < SOCKET_MSG_WINDOW_MS);
    if (sentAt.length >= SOCKET_MSG_LIMIT) {
      socket.emit('message_error', { message: 'Tu envoies beaucoup de messages : patiente quelques secondes.' });
      return false;
    }
    sentAt.push(now);
    return true;
  };

  /* Contenu de message : texte non vide, 2000 caractères au plus, sans grossièretés */
  const contentError = (content) => {
    if (content.trim().length > MAX_CONTENT) return `Message trop long (${MAX_CONTENT} caractères au maximum).`;
    if (containsProfanity(content)) return 'Message contient des mots inappropriés.';
    return null;
  };

  // Message cité : doit appartenir à la même conversation (DM entre les deux mêmes personnes ou même groupe)
  const validReplyTo = async (replyTo, filter) => {
    if (!replyTo || !/^[a-f0-9]{24}$/i.test(String(replyTo))) return null;
    const original = await Message.findOne({ _id: replyTo, ...filter }).select('_id');
    return original ? original._id : null;
  };

  socket.on('send_message', async ({ to, content, replyTo } = {}) => {
    if (typeof content !== 'string' || !content.trim()) return;
    if (!isId(to)) {
      socket.emit('message_error', { message: 'Destinataire invalide.' });
      return;
    }
    if (String(to) === socket.userId) return;
    const invalid = contentError(content);
    if (invalid) {
      socket.emit('message_error', { message: invalid });
      return;
    }
    if (!allowMessage()) return;

    try {
      const [receiver, sender] = await Promise.all([
        User.findById(to).select('blockedUsers'),
        User.findById(socket.userId).select('blockedUsers'),
      ]);
      // Sans retour, l'expéditeur croirait son message parti : on l'informe, sans détailler un blocage subi
      if (!receiver) {
        socket.emit('message_error', { message: 'Ce compte n’existe plus.', to: String(to) });
        return;
      }
      if (sender?.blockedUsers?.map(String).includes(String(to))) {
        socket.emit('message_error', { message: 'Tu as bloqué cette personne : débloque-la pour lui écrire.', to: String(to) });
        return;
      }
      if (receiver.blockedUsers?.map(String).includes(socket.userId)) {
        socket.emit('message_error', { message: 'Ce message n’a pas pu être distribué.', to: String(to) });
        return;
      }
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

  socket.on('typing', ({ to } = {}) => {
    if (isId(to) && String(to) !== socket.userId) {
      io.to(`user:${to}`).emit('typing', { from: socket.userId });
    }
  });
  // Indicateur de saisie de groupe : envoyé aux membres actuels seulement (pas à un ancien membre)
  socket.on('typing_group', async ({ conversationId } = {}) => {
    if (!isId(conversationId)) return;
    try {
      const conv = await Conversation.findOne({ _id: conversationId, participants: socket.userId }).select('participants').lean();
      conv?.participants.forEach((uid) => {
        if (String(uid) !== socket.userId) io.to(`user:${uid}`).emit('typing_group', { from: socket.userId, conversationId });
      });
    } catch (err) {
      console.error('typing_group error:', err.message);
    }
  });

  socket.on('send_group_message', async ({ conversationId, content, replyTo } = {}) => {
    if (!isId(conversationId) || typeof content !== 'string' || !content.trim()) return;
    const invalid = contentError(content);
    if (invalid) {
      socket.emit('message_error', { message: invalid });
      return;
    }
    if (!allowMessage()) return;
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
    migrateInlineAvatars().catch((err) => console.error('[avatars] migration :', err.message));
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
