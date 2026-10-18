/* Recherche de talents et invitations à rejoindre un projet (fonction Hive+).
   - Recherche : seulement les personnes qui ont activé « Disponible pour rejoindre des projets »
     (opt-in, LPD), jamais soi-même ni une personne bloquée dans un sens ou dans l'autre.
     Sans Hive+ : 402 avec le nombre de talents disponibles (page de présentation).
   - Invitation : depuis un de ses projets ouverts, 10 par jour au plus, une seule en attente par
     projet et par personne. Acceptée, la personne rejoint le projet comme après une candidature. */
const mongoose = require('mongoose');
const User = require('../models/User');
const Project = require('../models/Project');
const ProjectRequest = require('../models/ProjectRequest');
const ProjectInvitation = require('../models/ProjectInvitation');
const Notification = require('../models/Notification');
const { containsProfanity } = require('../utils/profanityFilter');
const { addMemberToProject, nameOf } = require('../utils/projectMembership');
const { sendInvitationEmail } = require('../utils/sendRequestEmail');

const isId = (value) => mongoose.isValidObjectId(value) && /^[a-f0-9]{24}$/i.test(String(value));
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

const PAGE_SIZE = 24;
const DAILY_INVITES = Number(process.env.DAILY_INVITES || 10);
const TALENT_FIELDS = 'displayName firstName lastName avatarUrl avatarVersion bio skills languages interests address.city address.country reputation plan createdAt';
const PUBLIC_USER = 'displayName firstName lastName avatarUrl avatarVersion plan';

/* Personnes bloquées par moi ou qui m'ont bloqué */
async function blockedWith(me) {
  const [mine, blockers] = await Promise.all([
    User.findById(me).select('blockedUsers').lean(),
    User.find({ blockedUsers: me }).select('_id').lean(),
  ]);
  return [...(mine?.blockedUsers || []), ...blockers.map((u) => u._id)];
}

// GET /api/talents?q=&skill=&city=&page=
exports.searchTalents = async (req, res) => {
  try {
    const me = req.user.id;
    const available = { openToProjects: true, emailVerified: true };
    const viewer = await User.findById(me).select('plan').lean();
    if (viewer?.plan !== 'plus') {
      const count = await User.countDocuments({ ...available, _id: { $ne: me } });
      return res.status(402).json({ code: 'plus_required', message: 'La recherche de talents fait partie de Hive+.', count });
    }

    const conditions = [{ ...available, _id: { $nin: [new mongoose.Types.ObjectId(me), ...(await blockedWith(me))] } }];
    const q = text(req.query.q, 60);
    const skill = text(req.query.skill, 60);
    const city = text(req.query.city, 60);
    if (q) {
      const pattern = new RegExp(escapeRegex(q), 'i');
      conditions.push({ $or: [{ displayName: pattern }, { firstName: pattern }, { lastName: pattern }, { skills: pattern }, { bio: pattern }] });
    }
    if (skill) conditions.push({ skills: new RegExp(`^${escapeRegex(skill)}$`, 'i') });
    if (city) conditions.push({ 'address.city': new RegExp(escapeRegex(city), 'i') });
    const query = { $and: conditions };

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const [items, total] = await Promise.all([
      User.find(query)
        .select(TALENT_FIELDS)
        .sort({ 'reputation.votes': -1, 'reputation.score': -1, updatedAt: -1, _id: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean(),
      User.countDocuments(query),
    ]);

    // Projets pour lesquels j'ai déjà une invitation en attente avec chaque personne
    const pending = await ProjectInvitation.find({ inviterId: me, inviteeId: { $in: items.map((u) => u._id) }, status: 'pending' })
      .select('inviteeId projectId').lean();
    const invitedTo = new Map();
    pending.forEach((inv) => {
      const key = String(inv.inviteeId);
      invitedTo.set(key, [...(invitedTo.get(key) || []), String(inv.projectId)]);
    });

    return res.json({
      items: items.map((u) => ({ ...u, invitedTo: invitedTo.get(String(u._id)) || [] })),
      total,
      page,
      hasMore: page * PAGE_SIZE < total,
    });
  } catch (err) {
    console.error('searchTalents error:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /api/invitations { projectId, userId, message? } — Hive+ (requirePlus)
exports.createInvitation = async (req, res) => {
  try {
    const me = req.user.id;
    const { projectId, userId } = req.body || {};
    const message = req.body?.message ?? '';
    if (!isId(projectId) || !isId(userId)) return res.status(400).json({ message: 'Invitation invalide' });
    if (userId === me) return res.status(400).json({ message: 'Tu ne peux pas t’inviter toi-même' });
    if (typeof message !== 'string' || message.length > 300) return res.status(400).json({ message: 'Message trop long (300 caractères au maximum).' });
    if (containsProfanity(message)) return res.status(400).json({ message: 'Le contenu contient des termes inappropriés.' });

    const project = await Project.findById(projectId).select('ownerId title status participants maxParticipants');
    if (!project) return res.status(404).json({ message: 'Projet introuvable' });
    if (String(project.ownerId) !== me) return res.status(403).json({ message: 'Tu ne peux inviter que dans tes propres projets' });
    if (project.status !== 'open') return res.status(400).json({ message: 'Seuls les projets ouverts acceptent des membres' });
    if (project.maxParticipants != null && project.participants.length >= project.maxParticipants) {
      return res.status(409).json({ message: 'Ce projet est complet' });
    }

    const invitee = await User.findById(userId).select('email displayName firstName lastName openToProjects emailVerified');
    if (!invitee?.openToProjects || !invitee.emailVerified) return res.status(404).json({ message: 'Cette personne n’est pas disponible pour le moment' });
    if ((await blockedWith(me)).some((id) => String(id) === userId)) return res.status(403).json({ message: 'Invitation impossible' });
    if (project.participants.map(String).includes(userId)) return res.status(409).json({ message: 'Cette personne fait déjà partie du projet' });
    if (await ProjectRequest.exists({ projectId, senderId: userId, status: 'pending' })) {
      return res.status(409).json({ message: 'Cette personne a déjà demandé à rejoindre ce projet : tu peux accepter sa demande' });
    }

    const sentToday = await ProjectInvitation.countDocuments({ inviterId: me, createdAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) } });
    if (sentToday >= DAILY_INVITES) {
      return res.status(429).json({ message: `Tu as atteint la limite de ${DAILY_INVITES} invitations par jour. Réessaie demain.` });
    }

    let invitation;
    try {
      invitation = await ProjectInvitation.create({ projectId, inviterId: me, inviteeId: userId, message: message.trim() });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ message: 'Invitation déjà envoyée pour ce projet' });
      throw err;
    }

    const inviter = await User.findById(me).select(PUBLIC_USER).lean();
    const inviterName = nameOf(inviter, 'Un membre');
    const notif = await Notification.create({
      userId,
      type: 'invitation',
      message: `${inviterName} t'invite à rejoindre "${project.title}".`,
      meta: {
        projectTitle: project.title,
        senderName: inviterName,
        senderId: me,
        senderAvatarUrl: inviter?.avatarUrl || null,
        senderAvatarVersion: inviter?.avatarVersion || null,
        invitationId: String(invitation._id),
      },
      link: '/invitations',
    });
    const io = req.app.get('io');
    if (io) io.to(`user:${userId}`).emit('new_notification', notif);

    sendInvitationEmail({
      to: invitee.email,
      inviteeName: nameOf(invitee, ''),
      inviterName,
      projectTitle: project.title,
      message: invitation.message,
    }).catch((err) => console.error('sendInvitationEmail error:', err.message));

    return res.status(201).json(invitation);
  } catch (err) {
    console.error('createInvitation error:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/invitations/mine — invitations reçues en attente
exports.getMyInvitations = async (req, res) => {
  try {
    const invitations = await ProjectInvitation.find({ inviteeId: req.user.id, status: 'pending' })
      .sort({ createdAt: -1 })
      .populate('projectId', 'title description tags coverVersion projectMeta.city projectMeta.region projectMeta.startDate status participants maxParticipants')
      .populate('inviterId', PUBLIC_USER)
      .lean();
    // Projet supprimé ou créateur supprimé : l'invitation n'a plus de sens
    return res.json(invitations.filter((inv) => inv.projectId && inv.inviterId));
  } catch (err) {
    console.error('getMyInvitations error:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /api/invitations/:id/accept
exports.acceptInvitation = async (req, res) => {
  try {
    const me = req.user.id;
    if (!isId(req.params.id)) return res.status(404).json({ message: 'Invitation introuvable' });
    // Passage pending → accepted atomique : un double clic ne rejoint pas deux fois
    const invitation = await ProjectInvitation.findOneAndUpdate(
      { _id: req.params.id, inviteeId: me, status: 'pending' },
      { status: 'accepted' },
      { new: true }
    );
    if (!invitation) return res.status(404).json({ message: 'Invitation introuvable ou déjà traitée' });

    const io = req.app.get('io');
    const joined = await addMemberToProject({ projectId: invitation.projectId, userId: me, io });
    if (joined.error) {
      await ProjectInvitation.updateOne({ _id: invitation._id }, { status: 'pending' });
      return res.status(409).json({ message: joined.error === 'full' ? 'Le projet est complet' : 'Le projet n’est plus ouvert' });
    }
    const { project, conv, memberName } = joined;

    // Même trace qu'une candidature acceptée : départ, exclusion et nouvelle candidature fonctionnent pareil
    await ProjectRequest.create({
      projectId: project._id,
      projectOwnerId: project.ownerId,
      senderId: me,
      message: '',
      status: 'accepted',
    });

    const member = await User.findById(me).select(PUBLIC_USER).lean();
    const notif = await Notification.create({
      userId: project.ownerId,
      type: 'invitation_accepted',
      message: `${memberName} a accepté ton invitation à rejoindre "${project.title}".`,
      meta: {
        projectTitle: project.title,
        senderName: memberName,
        senderId: me,
        senderAvatarUrl: member?.avatarUrl || null,
        senderAvatarVersion: member?.avatarVersion || null,
      },
      link: `/messages?group=${conv._id}`,
    });
    if (io) io.to(`user:${project.ownerId}`).emit('new_notification', notif);

    return res.json({ message: 'Invitation acceptée', conversationId: conv._id, projectId: project._id });
  } catch (err) {
    console.error('acceptInvitation error:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /api/invitations/:id/decline — refus discret (le créateur n'est pas notifié)
exports.declineInvitation = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: 'Invitation introuvable' });
    const invitation = await ProjectInvitation.findOneAndUpdate(
      { _id: req.params.id, inviteeId: req.user.id, status: 'pending' },
      { status: 'declined' },
      { new: true }
    );
    if (!invitation) return res.status(404).json({ message: 'Invitation introuvable ou déjà traitée' });
    return res.json({ message: 'Invitation refusée' });
  } catch (err) {
    console.error('declineInvitation error:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};
