/* Emails spécialisés pour les demandes de participation : notification à l'owner lors d'une nouvelle demande,
   confirmation au demandeur lors de l'acceptation, invitation envoyée depuis la recherche de talents. Gabarit et échappement : utils/emailLayout.js. */
const sendEmail = require('./sendEmail');
const { renderEmail, escapeHtml, front } = require('./emailLayout');

async function sendJoinRequestEmail({ to, ownerName, senderName, projectTitle, projectId }) {
  const url = `${front()}/projects/${projectId || ''}`;
  const { html, text } = renderEmail({
    preheader: `${senderName} souhaite rejoindre ${projectTitle}`,
    heading: 'Nouvelle demande de participation',
    paragraphs: [
      `Bonjour ${escapeHtml(ownerName)},`,
      `<strong>${escapeHtml(senderName)}</strong> souhaite rejoindre ton projet <strong>${escapeHtml(projectTitle)}</strong>.`,
    ],
    cta: { url, label: 'Voir la demande' },
    text: `Bonjour ${ownerName},\n\n${senderName} souhaite rejoindre ton projet « ${projectTitle} ».\nVoir la demande : ${url}`,
  });
  await sendEmail({ to, subject: `Nouvelle demande de participation — ${projectTitle}`, html, text });
}

async function sendRequestAcceptedEmail({ to, senderName, projectTitle, conversationId }) {
  const url = `${front()}/messages${conversationId ? `?group=${conversationId}` : ''}`;
  const { html, text } = renderEmail({
    preheader: `Tu fais maintenant partie de ${projectTitle}`,
    heading: 'Demande acceptée',
    paragraphs: [
      `Bonjour ${escapeHtml(senderName)},`,
      `Ta demande pour rejoindre <strong>${escapeHtml(projectTitle)}</strong> a été acceptée. Tu as maintenant accès à la discussion de groupe du projet.`,
    ],
    cta: { url, label: 'Ouvrir la discussion' },
    text: `Bonjour ${senderName},\n\nTa demande pour rejoindre « ${projectTitle} » a été acceptée.\nOuvrir la discussion : ${url}`,
  });
  await sendEmail({ to, subject: `Demande acceptée — ${projectTitle}`, html, text });
}

/* Invitation à rejoindre un projet (recherche de talents Hive+) */
async function sendInvitationEmail({ to, inviteeName, inviterName, projectTitle, message }) {
  const url = `${front()}/invitations`;
  const { html, text } = renderEmail({
    preheader: `${inviterName} t’invite à rejoindre ${projectTitle}`,
    heading: 'Tu es invité·e à rejoindre un projet',
    paragraphs: [
      `Bonjour ${escapeHtml(inviteeName)},`,
      `<strong>${escapeHtml(inviterName)}</strong> t’invite à rejoindre son projet <strong>${escapeHtml(projectTitle)}</strong>.`,
    ],
    quote: message || undefined,
    cta: { url, label: 'Voir l’invitation' },
    note: 'Tu reçois cet email car tu as indiqué sur ton profil être disponible pour rejoindre des projets. Tu peux le désactiver à tout moment.',
    text: `Bonjour ${inviteeName},\n\n${inviterName} t’invite à rejoindre son projet « ${projectTitle} ».${message ? `\n\n« ${message} »` : ''}\n\nVoir l’invitation : ${url}`,
  });
  await sendEmail({ to, subject: `${inviterName} t’invite à rejoindre ${projectTitle}`, html, text });
}

module.exports = { sendJoinRequestEmail, sendRequestAcceptedEmail, sendInvitationEmail };
