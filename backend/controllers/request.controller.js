const mongoose       = require("mongoose");
const ProjectRequest = require("../models/ProjectRequest");
const Project        = require("../models/Project");
const Conversation   = require("../models/Conversation");
const Message        = require("../models/Message");
const Notification   = require("../models/Notification");
const { joinRequestsTotal } = require('../metric');
const User           = require("../models/User");
const { sendJoinRequestEmail, sendRequestAcceptedEmail } = require("../utils/sendRequestEmail");
const { containsProfanity } = require('../utils/profanityFilter');

const isId = (value) => mongoose.isValidObjectId(value) && /^[a-f0-9]{24}$/i.test(String(value));
const isFull = (project) => project.maxParticipants != null && project.participants.length >= project.maxParticipants;

/* Émet une notification Socket.io à un utilisateur spécifique via sa room personnelle */
async function emitNotification(app, userId, notification) {
  const io = app.get('io');
  if (io) io.to(`user:${userId}`).emit('new_notification', notification);
}

// ==============================
// ENVOI D'UNE DEMANDE
// ==============================

// POST /requests/:projectId — envoie une demande de participation, notifie l'owner via Socket.io
exports.sendRequest = async (req, res) => {
  try {
    const message = req.body?.message ?? '';
    if (typeof message !== 'string' || message.length > 500) return res.status(400).json({ message: "Message trop long (500 caractères au maximum)." });
    if (containsProfanity(message)) return res.status(400).json({ message: 'Le contenu contient des termes inappropriés.' });
    if (!isId(req.params.projectId)) return res.status(404).json({ message: "Projet introuvable" });
    const project = await Project.findById(req.params.projectId);

    if (!project || project.status === 'draft' || project.status === 'archived') return res.status(404).json({ message: "Projet introuvable" });
    if (project.status !== 'open') return res.status(400).json({ message: "Projet fermé" });
    if (project.ownerId.toString() === req.user.id) {
      return res.status(403).json({ message: "Vous êtes le créateur du projet" });
    }
    if (project.participants.map(String).includes(req.user.id)) {
      return res.status(409).json({ message: "Tu fais déjà partie de ce projet" });
    }
    if (isFull(project)) return res.status(409).json({ message: "Ce projet est complet" });

    // Empêche l'envoi d'une demande si une est déjà en attente ou si l'utilisateur a été kické
    const existing = await ProjectRequest.findOne({
      projectId: project._id,
      senderId: req.user.id,
      status: { $in: ['pending', 'kicked'] },
    });
    if (existing?.status === 'kicked') return res.status(403).json({ message: "Vous avez été retiré de ce projet." });
    if (existing?.status === 'pending') return res.status(409).json({ message: "Demande déjà envoyée" });

    const request = await ProjectRequest.create({
      projectId:      project._id,
      projectOwnerId: project.ownerId,
      senderId:       req.user.id,
      message:        message.trim(),
    });

    // Crée et émet une notification à l'owner du projet
    const sender = await User.findById(req.user.id).select('displayName firstName lastName avatarUrl avatarVersion');
    const senderName = sender?.displayName ||
      [sender?.firstName, sender?.lastName].filter(Boolean).join(' ') || 'Un utilisateur';

    const notif = await Notification.create({
      userId:  project.ownerId,
      type:    'new_member',
      message: `${senderName} a demandé à rejoindre votre projet "${project.title}".`,
      meta:    { senderName, senderId: req.user.id, senderAvatarUrl: sender?.avatarUrl || null, senderAvatarVersion: sender?.avatarVersion || null, projectTitle: project.title },
      link:    `/projects/${project._id}`,
    });

    const io = req.app.get('io');
    if (io) io.to(`user:${project.ownerId}`).emit('new_notification', notif);

    try {
      const owner = await User.findById(project.ownerId).select('email displayName firstName lastName');
      const ownerName = owner?.displayName ||
        [owner?.firstName, owner?.lastName].filter(Boolean).join(' ') || 'Propriétaire';
      await sendJoinRequestEmail({ to: owner.email, ownerName, senderName, projectTitle: project.title, projectId: project._id });
    } catch (_) {}

    joinRequestsTotal.inc({ status: 'sent' });
    return res.status(201).json(request);
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur" });
  }
};

// ==============================
// CONSULTATION DES DEMANDES
// ==============================

// GET /requests/:projectId/mine — statut de la demande de l'utilisateur connecté pour un projet
exports.getMyRequest = async (req, res) => {
  try {
    if (!isId(req.params.projectId)) return res.json(null);
    const request = await ProjectRequest.findOne({
      projectId: req.params.projectId,
      senderId:  req.user.id,
    }).sort({ createdAt: -1 });

    if (!request) return res.json(null);
    return res.json({ status: request.status });
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur" });
  }
};

// GET /requests/:projectId/list — liste des demandes en attente (owner uniquement)
exports.getProjectRequests = async (req, res) => {
  try {
    if (!isId(req.params.projectId)) return res.status(404).json({ message: "Projet introuvable" });
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ message: "Projet introuvable" });
    if (project.ownerId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Vous n'êtes pas le propriétaire du projet" });
    }

    const requests = await ProjectRequest.find({
      projectId: req.params.projectId,
      status: 'pending',
    }).populate('senderId', 'displayName firstName lastName avatarUrl avatarVersion _id');

    return res.json(requests);
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur" });
  }
};

// ==============================
// TRAITEMENT DES DEMANDES
// ==============================

// PUT /requests/:reqId/accept — accepte la demande, ajoute le membre au projet et à la conversation de groupe
exports.acceptRequest = async (req, res) => {
  try {
    if (!isId(req.params.reqId)) return res.status(404).json({ message: "Demande introuvable" });
    const found = await ProjectRequest.findById(req.params.reqId);
    if (!found) return res.status(404).json({ message: "Demande introuvable" });
    if (found.projectOwnerId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Vous n'êtes pas le propriétaire du projet" });
    }

    // Passage pending → accepted atomique : un double clic n'accepte pas deux fois
    const request = await ProjectRequest.findOneAndUpdate(
      { _id: found._id, status: 'pending' },
      { status: 'accepted' },
      { new: true }
    );
    if (!request) return res.status(409).json({ message: "Cette demande a déjà été traitée" });

    // Ajoute le membre seulement s'il reste une place (vérifié par la base, dans la même opération)
    const project = await Project.findOneAndUpdate(
      {
        _id: request.projectId,
        status: 'open',
        $expr: { $or: [{ $eq: [{ $ifNull: ['$maxParticipants', null] }, null] }, { $lt: [{ $size: '$participants' }, '$maxParticipants'] }] },
      },
      { $addToSet: { participants: request.senderId } },
      { new: true }
    );
    if (!project) {
      await ProjectRequest.updateOne({ _id: request._id }, { status: 'pending' });
      const current = await Project.findById(request.projectId).select('status');
      return res.status(409).json({ message: current?.status === 'open' ? "Le projet est complet" : "Le projet n'est plus ouvert" });
    }

    // Crée la conversation de groupe si elle n'existe pas encore, sinon ajoute le membre
    let conv = await Conversation.findOne({ projectId: project._id });
    if (!conv) {
      conv = await Conversation.create({
        type: 'project',
        projectId: project._id,
        projectTitle: project.title,
        participants: [project.ownerId, request.senderId],
      });
    } else {
      await Conversation.findByIdAndUpdate(conv._id, {
        $addToSet: { participants: request.senderId },
      });
      conv = await Conversation.findById(conv._id);
    }

    // Message système de bienvenue visible dans le chat du groupe
    const newMember = await User.findById(request.senderId).select('displayName firstName lastName');
    const memberName = newMember?.displayName ||
      [newMember?.firstName, newMember?.lastName].filter(Boolean).join(' ') ||
      'Un membre';

    const sysMsg = await Message.create({
      conversationId: conv._id,
      senderId: request.senderId,
      content: ` ${memberName} a rejoint le projet ! Bienvenue dans l'équipe — commencez à partager vos idées !`,
      isSystem: true,
      readBy: [project.ownerId, request.senderId],
    });

    // Notification persistée pour le nouveau membre
    const owner = await User.findById(req.user.id).select('displayName firstName lastName avatarUrl avatarVersion');
    const ownerName = owner?.displayName ||
      [owner?.firstName, owner?.lastName].filter(Boolean).join(' ') || 'Propriétaire';

    const notif = await Notification.create({
      userId: request.senderId,
      type: 'request_accepted',
      message: `Votre demande pour rejoindre "${project.title}" a été acceptée !`,
      meta:  { projectTitle: project.title, senderName: ownerName, senderId: req.user.id, senderAvatarUrl: owner?.avatarUrl || null, senderAvatarVersion: owner?.avatarVersion || null },
      link: `/messages?group=${conv._id}`,
    });

    // Diffuse le message système et la notification via Socket.io
    const io = req.app.get('io');
    if (io) {
      const populatedMsg = await Message.findById(sysMsg._id).populate('senderId', 'displayName firstName lastName avatarUrl avatarVersion _id');
      conv.participants.forEach(uid => {
        io.to(`user:${uid}`).emit('new_group_message', { conversationId: conv._id.toString(), message: populatedMsg });
        io.to(`user:${uid}`).emit('conversation_updated');
      });
      io.to(`user:${request.senderId}`).emit('new_notification', notif);
    }

    try {
      const member = await User.findById(request.senderId).select('email');
      await sendRequestAcceptedEmail({ to: member.email, senderName: memberName, projectTitle: project.title, conversationId: conv._id });
    } catch (_) {}

    joinRequestsTotal.inc({ status: 'accepted' });
    return res.json({ message: "Demande acceptée", conversationId: conv._id });
  } catch (err) {
    console.error('acceptRequest error:', err);
    return res.status(500).json({ message: "Erreur serveur" });
  }
};

// PUT /requests/:reqId/decline — refuse la demande, met à jour le statut sans notifier
exports.declineRequest = async (req, res) => {
  try {
    if (!isId(req.params.reqId)) return res.status(404).json({ message: "Demande introuvable" });
    const request = await ProjectRequest.findById(req.params.reqId);
    if (!request) return res.status(404).json({ message: "Demande introuvable" });
    if (request.projectOwnerId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Vous n'êtes pas le propriétaire du projet" });
    }
    if (request.status !== 'pending') return res.status(409).json({ message: "Cette demande a déjà été traitée" });
    request.status = 'declined';
    await request.save();
    joinRequestsTotal.inc({ status: 'declined' });
    return res.json({ message: "Demande Refusée" });
  } catch (err) {
    return res.status(500).json({ message: "Erreur serveur" });
  }
};
