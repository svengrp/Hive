/* Emails spécialisés pour les demandes de participation : notification à l'owner lors d'une nouvelle demande
   et confirmation au demandeur lors de l'acceptation. Expéditeur commun : utils/mailFrom.js. */
const transporter = require('./mailer');
const mailFrom = require('./mailFrom');

async function sendJoinRequestEmail({ to, ownerName, senderName, projectTitle }) {
  await transporter.sendMail({
    from: mailFrom(),
    to,
    subject: `Nouvelle demande de participation — ${projectTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
        <h2 style="color:#b8650f">Nouvelle demande sur Hive</h2>
        <p>Bonjour ${ownerName},</p>
        <p><strong>${senderName}</strong> souhaite rejoindre ton projet <strong>${projectTitle}</strong>.</p>
        <p>Connecte-toi à Hive pour voir la demande et y répondre.</p>
        <hr style="border:1px solid #eee;margin:20px 0"/>
        <p style="color:#888;font-size:12px">Hive — Plateforme collaborative</p>
      </div>
    `,
  });
}

async function sendRequestAcceptedEmail({ to, senderName, projectTitle }) {
  await transporter.sendMail({
    from: mailFrom(),
    to,
    subject: `Demande acceptée — ${projectTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
        <h2 style="color:#b8650f">Bonne nouvelle !</h2>
        <p>Bonjour ${senderName},</p>
        <p>Ta demande pour rejoindre <strong>${projectTitle}</strong> a été <strong style="color:#b8650f">acceptée</strong>.</p>
        <p>Tu as maintenant accès à la discussion de groupe du projet sur Hive.</p>
        <hr style="border:1px solid #eee;margin:20px 0"/>
        <p style="color:#888;font-size:12px">Hive — Plateforme collaborative</p>
      </div>
    `,
  });
}

module.exports = { sendJoinRequestEmail, sendRequestAcceptedEmail };
