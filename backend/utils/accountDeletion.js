/* Suppression complète d'un compte (droit à l'effacement : LPD art. 32, RGPD art. 17).
   - Projets créés par la personne : supprimés avec tout leur contenu (couverture, conversation,
     messages, tâches, rendez-vous, candidatures, notes, historique).
   - Projets d'autres personnes : la personne est retirée ; ses messages deviennent « supprimés »
     (texte effacé) pour que le fil reste lisible pour l'équipe.
   - Abonnement Stripe résilié immédiatement. Les factures restent chez Stripe : obligation
     légale de conservation comptable (CO art. 958f, 10 ans).
   Les identifiants restants (auteur d'une tâche, d'un rendez-vous) ne pointent plus vers personne. */
const Project = require('../models/Project');
const ProjectCover = require('../models/ProjectCover');
const ProjectHistory = require('../models/ProjectHistory');
const ProjectRequest = require('../models/ProjectRequest');
const ProjectTask = require('../models/ProjectTask');
const ProjectEvent = require('../models/ProjectEvent');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const Rating = require('../models/Rating');
const User = require('../models/User');
const { getStripe } = require('./billing');

const ACTIVE_STATUSES = ['active', 'trialing', 'past_due', 'incomplete', 'unpaid'];

/* Supprime des projets et tout ce qui leur est rattaché */
async function deleteProjectsData(projectIds) {
  if (!projectIds.length) return;
  const conversations = await Conversation.find({ projectId: { $in: projectIds } }).select('_id').lean();
  const conversationIds = conversations.map((c) => c._id);

  await Promise.all([
    Message.deleteMany({ conversationId: { $in: conversationIds } }),
    ProjectTask.deleteMany({ conversationId: { $in: conversationIds } }),
    ProjectEvent.deleteMany({ conversationId: { $in: conversationIds } }),
    ProjectCover.deleteMany({ projectId: { $in: projectIds } }),
    ProjectRequest.deleteMany({ projectId: { $in: projectIds } }),
    ProjectHistory.deleteMany({ projectId: { $in: projectIds } }),
    Rating.deleteMany({ $or: [{ projectId: { $in: projectIds } }, { targetType: 'project', targetId: { $in: projectIds } }] }),
  ]);
  await Conversation.deleteMany({ _id: { $in: conversationIds } });
  await Project.deleteMany({ _id: { $in: projectIds } });
}

/* Résilie l'abonnement en cours. Lève une erreur si Stripe refuse : on ne supprime pas
   un compte qui continuerait d'être facturé. */
async function cancelSubscription(user) {
  const stripe = getStripe();
  if (!stripe || !user.stripeSubscriptionId || !ACTIVE_STATUSES.includes(user.planStatus)) return;
  try {
    await stripe.subscriptions.cancel(user.stripeSubscriptionId);
  } catch (err) {
    if (err?.code !== 'resource_missing') throw err; // déjà supprimé chez Stripe : rien à faire
  }
}

async function deleteUserAccount(user) {
  const userId = user._id;
  await cancelSubscription(user);

  const owned = await Project.find({ ownerId: userId }).select('_id').lean();
  await deleteProjectsData(owned.map((p) => p._id));

  await Promise.all([
    // Projets des autres : retrait de la personne
    Project.updateMany({ participants: userId }, { $pull: { participants: userId } }),
    Conversation.updateMany(
      { $or: [{ participants: userId }, { archivedBy: userId }, { deletedBy: userId }] },
      { $pull: { participants: userId, archivedBy: userId, deletedBy: userId } },
    ),
    // Ses messages restent visibles comme « supprimés », sans texte
    Message.updateMany(
      { senderId: userId },
      { $set: { content: '[supprimé]', deleted: true, reactions: [], pinned: false, pinnedBy: null, pinnedAt: null } },
    ),
    Message.updateMany(
      { $or: [{ readBy: userId }, { 'reactions.userId': userId }] },
      { $pull: { readBy: userId, reactions: { userId } } },
    ),
    Message.updateMany({ pinnedBy: userId }, { $set: { pinnedBy: null } }),
    User.updateMany(
      { $or: [{ blockedUsers: userId }, { archivedDMs: userId }] },
      { $pull: { blockedUsers: userId, archivedDMs: userId } },
    ),
    ProjectTask.updateMany({ assigneeId: userId }, { $set: { assigneeId: null } }),
    ProjectEvent.updateMany({ 'rsvps.userId': userId }, { $pull: { rsvps: { userId } } }),
    // Données propres à la personne
    ProjectRequest.deleteMany({ $or: [{ senderId: userId }, { projectOwnerId: userId }] }),
    ProjectHistory.deleteMany({ userId }),
    Notification.deleteMany({ userId }),
    Rating.deleteMany({ $or: [{ raterId: userId }, { targetType: 'user', targetId: userId }] }),
  ]);

  await User.deleteOne({ _id: userId });
}

module.exports = { deleteUserAccount, deleteProjectsData };
