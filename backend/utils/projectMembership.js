/* Entrée d'un membre dans un projet, commune à l'acceptation d'une candidature et d'une invitation :
   place vérifiée par la base dans la même opération (jamais au-delà de maxParticipants), ajout à la
   conversation de groupe (créée au premier membre), message système « X a rejoint le projet » et
   diffusion en temps réel au groupe. Les notifications et emails restent propres à chaque appelant. */
const Project = require('../models/Project');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');

const nameOf = (user, fallback) => user?.displayName
  || [user?.firstName, user?.lastName].filter(Boolean).join(' ')
  || fallback;

/* Renvoie { project, conv, memberName } ou { error: 'full' | 'closed' }. */
async function addMemberToProject({ projectId, userId, io }) {
  const project = await Project.findOneAndUpdate(
    {
      _id: projectId,
      status: 'open',
      $expr: { $or: [{ $eq: [{ $ifNull: ['$maxParticipants', null] }, null] }, { $lt: [{ $size: '$participants' }, '$maxParticipants'] }] },
    },
    { $addToSet: { participants: userId } },
    { new: true }
  );
  if (!project) {
    const current = await Project.findById(projectId).select('status');
    return { error: current?.status === 'open' ? 'full' : 'closed' };
  }

  // Conversation de groupe : créée au premier membre, sinon on y ajoute la personne
  let conv = await Conversation.findOne({ projectId: project._id });
  if (!conv) {
    conv = await Conversation.create({
      type: 'project',
      projectId: project._id,
      projectTitle: project.title,
      participants: [project.ownerId, userId],
    });
  } else {
    conv = await Conversation.findByIdAndUpdate(conv._id, { $addToSet: { participants: userId } }, { new: true });
  }

  // Message système de bienvenue visible dans le chat du groupe
  const member = await User.findById(userId).select('displayName firstName lastName');
  const memberName = nameOf(member, 'Un membre');
  const sysMsg = await Message.create({
    conversationId: conv._id,
    senderId: userId,
    content: ` ${memberName} a rejoint le projet ! Bienvenue dans l'équipe — commencez à partager vos idées !`,
    isSystem: true,
    readBy: [project.ownerId, userId],
  });

  if (io) {
    const populatedMsg = await Message.findById(sysMsg._id).populate('senderId', 'displayName firstName lastName avatarUrl avatarVersion _id');
    conv.participants.forEach((uid) => {
      io.to(`user:${uid}`).emit('new_group_message', { conversationId: conv._id.toString(), message: populatedMsg });
      io.to(`user:${uid}`).emit('conversation_updated');
    });
  }

  return { project, conv, memberName };
}

module.exports = { addMemberToProject, nameOf };
