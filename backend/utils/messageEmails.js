/* Emails « nouveau message » (DM et groupes).
   Règles : le destinataire n'est pas connecté (aucun socket ouvert), il n'a pas désactivé l'option,
   et il n'a pas déjà reçu d'email pour cette conversation dans les 15 dernières minutes.
   Les erreurs sont journalisées sans jamais bloquer l'envoi du message. */
const transporter = require('./mailer');
const mailFrom = require('./mailFrom');
const User = require('../models/User');

const THROTTLE_MS = 15 * 60 * 1000;
const PREVIEW_LENGTH = 160;

const escapeHtml = (text) => String(text || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const nameOf = (user) => user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Quelqu’un';

function buildEmail({ recipient, senderName, title, preview, url }) {
  const settingsUrl = `${process.env.FRONT_URL || ''}/profile`;
  return {
    subject: title ? `${senderName} dans ${title}` : `Nouveau message de ${senderName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#2b2016">
        <p style="margin:0 0 16px">Bonjour ${escapeHtml(nameOf(recipient))},</p>
        <p style="margin:0 0 12px"><strong>${escapeHtml(senderName)}</strong> t’a écrit${title ? ` dans <strong>${escapeHtml(title)}</strong>` : ''} :</p>
        <blockquote style="margin:0 0 20px;padding:12px 16px;background:#faf6f0;border-radius:10px;color:#4a3b2c">${escapeHtml(preview)}</blockquote>
        <a href="${url}" style="display:inline-block;background:#a0560d;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold">Répondre sur Hive</a>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0 12px"/>
        <p style="color:#888;font-size:12px;margin:0">Tu reçois cet email car tu n’étais pas connecté·e. <a href="${settingsUrl}" style="color:#888">Gérer mes notifications</a></p>
      </div>`,
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
  const url = `${process.env.FRONT_URL || ''}${path}`;
  const senderName = nameOf(sender);

  await Promise.all(recipientIds.map(async (id) => {
    try {
      if (await isOnline(io, id)) return;
      const recipient = await User.findById(id).select('email displayName firstName lastName notificationPrefs messageEmailSentAt');
      if (!recipient?.email || recipient.notificationPrefs?.emailMessages === false) return;
      const last = recipient.messageEmailSentAt?.get(key);
      if (last && now - new Date(last).getTime() < THROTTLE_MS) return;

      const { subject, html } = buildEmail({ recipient, senderName, title, preview, url });
      await transporter.sendMail({
        from: mailFrom(),
        to: recipient.email,
        subject,
        html,
      });
      await User.updateOne({ _id: id }, { $set: { [`messageEmailSentAt.${key}`]: new Date(now) } });
    } catch (err) {
      console.error('notifyNewMessage error:', err.message);
    }
  }));
}

module.exports = { notifyNewMessage, THROTTLE_MS };
