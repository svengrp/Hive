const mongoose     = require('mongoose');
const Message      = require('../models/Message');
const Conversation = require('../models/Conversation');
const Notification = require('../models/Notification');
const User         = require('../models/User');

const { POPULATE_FIELDS, populateMessage, REACTIONS } = require('../utils/messagePopulate');
const { containsProfanity } = require('../utils/profanityFilter');

const isId = (value) => mongoose.isValidObjectId(value) && /^[a-f0-9]{24}$/i.test(String(value));
const MAX_CONTENT = 2000;

const HISTORY_LIMIT = 200;

/* Les HISTORY_LIMIT derniers messages, dans l'ordre chronologique. */
const latestMessages = async (filter, opts) => {
  const docs = await populateMessage(Message.find(filter), opts).sort({ createdAt: -1 }).limit(HISTORY_LIMIT);
  return docs.reverse();
};

/* Qui peut voir un message : les deux personnes d'un DM, ou les participants du groupe (null si aucun). */
const audienceOf = async (msg) => {
  if (msg.conversationId) {
    const conv = await Conversation.findById(msg.conversationId).select('participants');
    return conv ? conv.participants.map(String) : null;
  }
  return [String(msg.senderId), String(msg.receiverId)];
};

const emitTo = (req, userIds, event, payload) => {
  const io = req.app.get('io');
  if (io) userIds.forEach((uid) => io.to(`user:${uid}`).emit(event, payload));
};

// ==============================
// CONVERSATIONS DIRECTES
// ==============================

// GET /messages/conversations — liste toutes les conversations DM avec le dernier message et le nombre de non-lus
/* Une ligne par interlocuteur : dernier message et nombre de non-lus, calculés par la base
   (avant : tous les messages de la personne étaient chargés puis dédupliqués en mémoire). */
async function dmThreads(me, { only, exclude = [] }) {
  const meId = new mongoose.Types.ObjectId(me);
  const partnerFilter = only ? { $in: only } : { $nin: exclude };
  const rows = await Message.aggregate([
    { $match: { conversationId: null, receiverId: { $ne: null }, $or: [{ senderId: meId }, { receiverId: meId }] } },
    { $sort: { createdAt: -1 } },
    { $group: {
      _id: { $cond: [{ $eq: ['$senderId', meId] }, '$receiverId', '$senderId'] },
      lastId: { $first: '$_id' },
      unread: { $sum: { $cond: [{ $and: [{ $eq: ['$receiverId', meId] }, { $eq: ['$read', false] }] }, 1, 0] } },
    } },
    { $match: { _id: partnerFilter } },
  ]);
  const lastMessages = await Message.find({ _id: { $in: rows.map((r) => r.lastId) } })
    .populate('senderId', POPULATE_FIELDS)
    .populate('receiverId', POPULATE_FIELDS)
    .sort({ createdAt: -1 });
  const unreadByLast = new Map(rows.map((r) => [String(r.lastId), r.unread]));
  return lastMessages
    // Compte supprimé : populate renvoie null, la conversation n'a plus d'interlocuteur.
    .filter((msg) => msg.senderId && msg.receiverId)
    .map((msg) => ({
      partner: String(msg.senderId._id) === me ? msg.receiverId : msg.senderId,
      lastMessage: msg,
      unread: unreadByLast.get(String(msg._id)) || 0,
    }));
}

exports.getConversations = async (req, res) => {
  const me = req.user.id;
  try {
    const meUser = await User.findById(me).select('blockedUsers archivedDMs').lean();
    if (!meUser) return res.status(401).json({ message: 'Session expirée' });
    const threads = await dmThreads(me, { exclude: [...(meUser.blockedUsers || []), ...(meUser.archivedDMs || [])] });
    return res.json(threads);
  } catch (err) {
    console.error('getConversations error:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /messages/:userId — historique des messages directs avec un utilisateur (200 max)
exports.getMessages = async (req, res) => {
  const me = req.user.id;
  const { userId } = req.params;
  if (!isId(userId)) return res.status(404).json({ message: 'Conversation introuvable' });
  try {
    const messages = await latestMessages({
      $or: [
        { senderId: me, receiverId: userId },
        { senderId: userId, receiverId: me },
      ],
    }, { receiver: true });

    return res.json(messages);
  } catch (err) {
    console.error('getMessages error:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /messages/:userId/read — marque tous les messages reçus d'un utilisateur comme lus
exports.markRead = async (req, res) => {
  const me = req.user.id;
  const { userId } = req.params;
  if (!isId(userId)) return res.status(404).json({ message: 'Conversation introuvable' });
  try {
    await Message.updateMany(
      { senderId: userId, receiverId: me, read: false },
      { read: true },
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('markRead error:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /messages/dm/archived — liste des conversations DM archivées
exports.getArchivedDMs = async (req, res) => {
  const me = req.user.id;
  try {
    const meUser = await User.findById(me).select('archivedDMs').lean();
    if (!meUser?.archivedDMs?.length) return res.json([]);
    const threads = await dmThreads(me, { only: meUser.archivedDMs });
    return res.json(threads.map(({ partner, lastMessage }) => ({ partner, lastMessage })));
  } catch (err) {
    console.error('getArchivedDMs error:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /messages/dm/:userId/archive — archive la conversation DM avec cet utilisateur
exports.archiveDM = async (req, res) => {
  const me = req.user.id;
  const { userId } = req.params;
  if (!isId(userId)) return res.status(400).json({ message: 'Utilisateur invalide' });
  try {
    await User.findByIdAndUpdate(me, { $addToSet: { archivedDMs: userId } });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /messages/dm/:userId/unarchive — désarchive la conversation DM avec cet utilisateur
exports.unarchiveDM = async (req, res) => {
  const me = req.user.id;
  const { userId } = req.params;
  if (!isId(userId)) return res.status(400).json({ message: 'Utilisateur invalide' });
  try {
    await User.findByIdAndUpdate(me, { $pull: { archivedDMs: userId } });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /messages/unread — nombre total de messages directs non lus (badge header)
exports.getUnreadCount = async (req, res) => {
  const me = req.user.id;
  try {
    // Les messages des personnes bloquées n'apparaissent nulle part : ils ne comptent pas
    const meUser = await User.findById(me).select('blockedUsers').lean();
    const count = await Message.countDocuments({
      receiverId: me,
      read: false,
      conversationId: null,
      senderId: { $nin: meUser?.blockedUsers || [] },
    });
    return res.json({ count });
  } catch (err) {
    console.error('getUnreadCount error:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ==============================
// CONVERSATIONS DE GROUPE (PROJETS)
// ==============================

// GET /messages/group/mine — conversations actives (non archivées, non supprimées)
exports.getMyConversations = async (req, res) => {
  const me = req.user.id;
  try {
    const convs = await Conversation.find({ participants: me, archivedBy: { $ne: me }, deletedBy: { $ne: me } })
      .populate('participants', POPULATE_FIELDS)
      .populate('projectId', 'title _id ownerId status participants')
      .sort({ updatedAt: -1 });

    // Enrichit chaque conversation avec son dernier message
    const result = await Promise.all(convs.map(async (conv) => {
      const last = await Message.findOne({ conversationId: conv._id })
        .populate('senderId', POPULATE_FIELDS)
        .sort({ createdAt: -1 });
      return { conversation: conv, lastMessage: last };
    }));

    return res.json(result);
  } catch (err) {
    console.error('getMyConversations error:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /messages/group/archived — conversations archivées
exports.getArchivedConversations = async (req, res) => {
  const me = req.user.id;
  try {
    const convs = await Conversation.find({ participants: me, archivedBy: me, deletedBy: { $ne: me } })
      .populate('participants', POPULATE_FIELDS)
      .populate('projectId', 'title _id ownerId status')
      .sort({ updatedAt: -1 });

    const result = await Promise.all(convs.map(async (conv) => {
      const last = await Message.findOne({ conversationId: conv._id })
        .populate('senderId', POPULATE_FIELDS)
        .sort({ createdAt: -1 });
      return { conversation: conv, lastMessage: last };
    }));

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /messages/group/:convId/archive — archiver une conversation
exports.archiveConversation = async (req, res) => {
  const me = req.user.id;
  if (!isId(req.params.convId)) return res.status(404).json({ message: 'Conversation introuvable' });
  try {
    const conv = await Conversation.findOne({ _id: req.params.convId, participants: me });
    if (!conv) return res.status(404).json({ message: 'Conversation introuvable' });
    await Conversation.findByIdAndUpdate(conv._id, { $addToSet: { archivedBy: me } });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /messages/group/:convId/unarchive — désarchiver
exports.unarchiveConversation = async (req, res) => {
  const me = req.user.id;
  if (!isId(req.params.convId)) return res.status(404).json({ message: 'Conversation introuvable' });
  try {
    const conv = await Conversation.findOne({ _id: req.params.convId, participants: me });
    if (!conv) return res.status(404).json({ message: 'Conversation introuvable' });
    await Conversation.findByIdAndUpdate(conv._id, { $pull: { archivedBy: me } });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /messages/group/:convId — suppression définitive (seulement si archivée)
exports.deleteConversation = async (req, res) => {
  const me = req.user.id;
  if (!isId(req.params.convId)) return res.status(404).json({ message: 'Conversation introuvable' });
  try {
    const conv = await Conversation.findOne({ _id: req.params.convId, participants: me, archivedBy: me });
    if (!conv) return res.status(404).json({ message: 'Conversation introuvable ou non archivée' });
    await Conversation.findByIdAndUpdate(conv._id, { $addToSet: { deletedBy: me } });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /messages/group/:convId — messages d'une conversation de groupe (accès réservé aux participants)
exports.getConversationMessages = async (req, res) => {
  const me = req.user.id;
  if (!isId(req.params.convId)) return res.status(404).json({ message: 'Conversation introuvable' });
  const { convId } = req.params;
  try {
    const conv = await Conversation.findById(convId);
    if (!conv) return res.status(404).json({ message: 'Conversation introuvable' });
    if (!conv.participants.map(String).includes(me)) return res.status(403).json({ message: 'Non autorisé' });

    // Les 200 DERNIERS messages (et non les 200 premiers) dans l'ordre chronologique
    const messages = await latestMessages({ conversationId: convId });
    return res.json(messages);
  } catch (err) {
    console.error('getConversationMessages error:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ==============================
// ÉDITION ET SUPPRESSION DE MESSAGES
// ==============================

// PUT /messages/:msgId/edit — modifie le contenu d'un message (expéditeur uniquement), propage via Socket.io
exports.editMessage = async (req, res) => {
  const me = req.user.id;
  const { msgId } = req.params;
  const { content } = req.body;
  try {
    if (typeof content !== 'string' || !content.trim()) return res.status(400).json({ message: 'Contenu vide' });
    if (content.trim().length > MAX_CONTENT) return res.status(400).json({ message: `Message trop long (${MAX_CONTENT} caractères au maximum).` });
    if (containsProfanity(content)) return res.status(400).json({ message: 'Message contient des mots inappropriés.' });
    if (!isId(msgId)) return res.status(404).json({ message: 'Message introuvable' });
    const msg = await Message.findById(msgId);
    if (!msg) return res.status(404).json({ message: 'Message introuvable' });
    // Les messages système (« X a rejoint le projet ») portent l'id du membre mais ne lui appartiennent pas
    if (msg.senderId.toString() !== me || msg.isSystem) return res.status(403).json({ message: 'Non autorisé' });
    if (msg.deleted) return res.status(400).json({ message: 'Message supprimé' });
    const audience = await audienceOf(msg);
    if (!audience?.includes(me)) return res.status(403).json({ message: 'Non autorisé' });
    msg.content = content.trim();
    msg.edited = true;
    await msg.save();

    // Propager la modification en temps réel à tous les destinataires
    const io = req.app.get('io');
    if (io) {
      const payload = { msgId, content: msg.content };
      if (msg.conversationId) {
        const conv = await Conversation.findById(msg.conversationId);
        conv?.participants.forEach(uid => io.to(`user:${uid}`).emit('message_edited', payload));
      } else if (msg.receiverId) {
        io.to(`user:${msg.receiverId}`).emit('message_edited', payload);
        io.to(`user:${me}`).emit('message_edited', payload);
      }
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /messages/:msgId/delete — suppression logique (contenu remplacé, flag deleted=true), propage via Socket.io
exports.deleteMessage = async (req, res) => {
  const me = req.user.id;
  const { msgId } = req.params;
  if (!isId(msgId)) return res.status(404).json({ message: 'Message introuvable' });
  try {
    const msg = await Message.findById(msgId);
    if (!msg) return res.status(404).json({ message: 'Message introuvable' });
    if (msg.senderId.toString() !== me || msg.isSystem) return res.status(403).json({ message: 'Non autorisé' });
    msg.deleted = true;
    msg.content = 'Message supprimé';
    await msg.save();

    // Propager la suppression en temps réel à tous les destinataires
    const io = req.app.get('io');
    if (io) {
      if (msg.conversationId) {
        const conv = await Conversation.findById(msg.conversationId);
        conv?.participants.forEach(uid => {
          io.to(`user:${uid}`).emit('message_deleted', { msgId, conversationId: msg.conversationId });
        });
      } else if (msg.receiverId) {
        io.to(`user:${msg.receiverId}`).emit('message_deleted', { msgId });
        io.to(`user:${me}`).emit('message_deleted', { msgId });
      }
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ==============================
// RÉACTIONS ET ÉPINGLES
// ==============================

// POST /messages/:msgId/react { emoji } — ajoute ou retire la réaction de l'utilisateur, propage via Socket.io
exports.reactToMessage = async (req, res) => {
  const me = req.user.id;
  const { emoji } = req.body || {};
  if (!REACTIONS.includes(emoji)) return res.status(400).json({ message: 'Réaction non autorisée' });
  if (!isId(req.params.msgId)) return res.status(404).json({ message: 'Message introuvable' });
  try {
    const msg = await Message.findById(req.params.msgId);
    if (!msg || msg.deleted || msg.isSystem) return res.status(404).json({ message: 'Message introuvable' });
    const audience = await audienceOf(msg);
    if (!audience?.includes(me)) return res.status(403).json({ message: 'Non autorisé' });

    const index = msg.reactions.findIndex((r) => r.emoji === emoji && String(r.userId) === me);
    if (index >= 0) msg.reactions.splice(index, 1);
    else msg.reactions.push({ emoji, userId: me });
    await msg.save();

    const payload = { msgId: String(msg._id), reactions: msg.reactions };
    emitTo(req, audience, 'message_reactions', payload);
    return res.json(payload);
  } catch (err) {
    console.error('reactToMessage error:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /messages/:msgId/pin { pinned } — épingle ou désépingle un message de groupe (tout participant)
exports.pinMessage = async (req, res) => {
  const me = req.user.id;
  const pinned = !!req.body?.pinned;
  if (!isId(req.params.msgId)) return res.status(404).json({ message: 'Message introuvable' });
  try {
    const msg = await Message.findById(req.params.msgId);
    if (!msg || msg.deleted || msg.isSystem) return res.status(404).json({ message: 'Message introuvable' });
    if (!msg.conversationId) return res.status(400).json({ message: 'Seuls les messages de groupe peuvent être épinglés' });
    const audience = await audienceOf(msg);
    if (!audience?.includes(me)) return res.status(403).json({ message: 'Non autorisé' });

    msg.pinned = pinned;
    msg.pinnedBy = pinned ? me : null;
    msg.pinnedAt = pinned ? new Date() : null;
    await msg.save();

    const payload = { msgId: String(msg._id), conversationId: String(msg.conversationId), pinned, pinnedBy: msg.pinnedBy, pinnedAt: msg.pinnedAt };
    emitTo(req, audience, 'message_pinned', payload);
    return res.json(payload);
  } catch (err) {
    console.error('pinMessage error:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /messages/group/:convId/pinned — messages épinglés d'un groupe (plus récents d'abord)
exports.getPinnedMessages = async (req, res) => {
  const me = req.user.id;
  if (!isId(req.params.convId)) return res.status(404).json({ message: 'Conversation introuvable' });
  try {
    const conv = await Conversation.findById(req.params.convId).select('participants');
    if (!conv) return res.status(404).json({ message: 'Conversation introuvable' });
    if (!conv.participants.map(String).includes(me)) return res.status(403).json({ message: 'Non autorisé' });
    const pinned = await populateMessage(Message.find({ conversationId: conv._id, pinned: true, deleted: false }))
      .sort({ pinnedAt: -1 })
      .limit(50);
    return res.json(pinned);
  } catch (err) {
    console.error('getPinnedMessages error:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ==============================
// BLOCAGE D'UTILISATEURS
// ==============================

// POST /messages/block/:userId — ajoute l'utilisateur à la liste de blocage (addToSet évite les doublons)
exports.blockUser = async (req, res) => {
  const me = req.user.id;
  const { userId } = req.params;
  if (!isId(userId)) return res.status(400).json({ message: 'Utilisateur invalide' });
  if (userId === me) return res.status(400).json({ message: 'Tu ne peux pas te bloquer toi-même' });
  try {
    if (!(await User.exists({ _id: userId }))) return res.status(404).json({ message: 'Utilisateur introuvable' });
    await User.findByIdAndUpdate(me, { $addToSet: { blockedUsers: userId } });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /messages/block/:userId — retire l'utilisateur de la liste de blocage
exports.unblockUser = async (req, res) => {
  const me = req.user.id;
  const { userId } = req.params;
  if (!isId(userId)) return res.status(400).json({ message: 'Utilisateur invalide' });
  try {
    await User.findByIdAndUpdate(me, { $pull: { blockedUsers: userId } });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ==============================
// NOTIFICATIONS
// ==============================

// GET /messages/notifications — 30 dernières notifications de l'utilisateur connecté
exports.getNotifications = async (req, res) => {
  const me = req.user.id;
  try {
    const notifs = await Notification.find({ userId: me })
      .sort({ createdAt: -1 })
      .limit(30);
    return res.json(notifs);
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /messages/notifications/read — marque toutes les notifications comme lues
exports.markNotificationsRead = async (req, res) => {
  const me = req.user.id;
  try {
    await Notification.updateMany({ userId: me, read: false }, { read: true });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

exports.getBlockedUsers = async (req, res) => {
  const me = req.user.id; 
  try{
    const user = await User.findById(me).populate('blockedUsers', 'displayName firstName lastName avatarUrl avatarVersion _id');
    return res.json(user.blockedUsers || []);
  }
  catch(err){
    return res.status(500).json({message: 'Erreur serveur'});
  }
}