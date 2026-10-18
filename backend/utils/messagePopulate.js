/* Population commune des messages : expéditeur/destinataire et message cité (réponse). */
const POPULATE_FIELDS = 'displayName firstName lastName avatarUrl avatarVersion _id';

const REPLY_POPULATE = {
  path: 'replyTo',
  select: 'content senderId deleted',
  populate: { path: 'senderId', select: 'displayName firstName lastName _id' },
};

/** Applique les populations standard à une requête Mongoose de messages. */
const populateMessage = (query, { receiver = false } = {}) => {
  let q = query.populate('senderId', POPULATE_FIELDS).populate(REPLY_POPULATE);
  if (receiver) q = q.populate('receiverId', POPULATE_FIELDS);
  return q;
};

/** Réaction autorisées (liste courte, lisible partout). */
const REACTIONS = ['👍', '❤️', '😂', '🎉', '🔥', '👀'];

module.exports = { POPULATE_FIELDS, REPLY_POPULATE, populateMessage, REACTIONS };
