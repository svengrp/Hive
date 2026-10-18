/* Emails « nouveau message » (DM et groupes).
   Règles : le destinataire n'est pas connecté (aucun socket ouvert), il n'a pas désactivé l'option,
   et il n'a pas déjà reçu d'email pour cette conversation dans les 15 dernières minutes.
   Les erreurs sont journalisées sans jamais bloquer l'envoi du message. */
const transporter = require('./mailer');
const mailFrom = require('./mailFrom');
const User = require('../models/User');

const THROTTLE_MS = 15 * 60 * 1000;
const PREVIEW_LENGTH = 160;

const { renderEmail, escapeHtml, front } = require('./emailLayout');

const nameOf = (user) => user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Quelqu’un';

function buildEmail({ recipient, senderName, title, preview, url }) {
  const settingsUrl = `${front()}/profile`;
  const where = title ? ` dans <strong>${escapeHtml(title)}</strong>` : '';
  const { html, text } = renderEmail({
    preheader: `${senderName} : ${preview}`,
    heading: title ? `Nouveau message dans ${title}` : `Nouveau message de ${senderName}`,
    paragraphs: [
      `Bonjour ${escapeHtml(nameOf(recipient))},`,
      `<strong>${escapeHtml(senderName)}</strong> t’a écrit${where} :`,
    ],
    quote: preview,
    cta: { url, label: 'Répondre sur Hive' },
    footer: `Tu reçois cet email car tu n’étais pas connecté·e. <a href="${escapeHtml(settingsUrl)}" style="color:inherit">Gérer mes notifications</a>`,
    text: `Bonjour ${nameOf(recipient)},\n\n${senderName} t’a écrit${title ? ` dans « ${title} »` : ''} :\n\n${preview}\n\nRépondre : ${url}\nGérer mes notifications : ${settingsUrl}`,
  });
  return {
    subject: title ? `${senderName} dans ${title}` : `Nouveau message de ${senderName}`,
    html,
    text,
  };
}

async function isOnline(io, userId) {
  if (!io) return false;
  const sockets = await io.in(`user:${userId}`).fetchSockets();
  return sockets.length > 0;
}

/**
 * @param {object} opts
 * @param {import('socket.io').Server} opts.io
 * @param {string[]} opts.recipientIds   destinataires (hors expéditeur)
 * @param {object} opts.sender           expéditeur (nom affiché)
 * @param {string} opts.key              clé de conversation (anti-spam) : dm:<id> ou grp:<id>
 * @param {string} [opts.title]          titre du groupe
 * @param {string} opts.content          contenu du message
 * @param {string} opts.path             lien relatif vers la conversation
 */
async function notifyNewMessage({ io, recipientIds, sender, key, title, content, path }) {
  const now = Date.now();
  const preview = content.length > PREVIEW_LENGTH ? `${content.slice(0, PREVIEW_LENGTH)}…` : content;
  const url = `${front()}${path}`;
  const senderName = nameOf(sender);

  await Promise.all(recipientIds.map(async (id) => {
    try {
      if (await isOnline(io, id)) return;
      const recipient = await User.findById(id).select('email displayName firstName lastName notificationPrefs messageEmailSentAt');
      if (!recipient?.email || recipient.notificationPrefs?.emailMessages === false) return;
      const last = recipient.messageEmailSentAt?.get(key);
      if (last && now - new Date(last).getTime() < THROTTLE_MS) return;

      const { subject, html, text } = buildEmail({ recipient, senderName, title, preview, url });
      await transporter.sendMail({
        from: mailFrom(),
        to: recipient.email,
        subject,
        html,
        text,
      });
      await User.updateOne({ _id: id }, { $set: { [`messageEmailSentAt.${key}`]: new Date(now) } });
    } catch (err) {
      console.error('notifyNewMessage error:', err.message);
    }
  }));
}

module.exports = { notifyNewMessage, THROTTLE_MS };
