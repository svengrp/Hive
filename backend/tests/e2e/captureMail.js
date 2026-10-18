/* Préchargé dans le serveur de test (node -r) : remplace le transporteur SMTP par une boîte aux lettres
   locale. Chaque email est ajouté en JSON (une ligne) dans MAIL_CAPTURE_FILE. Aucun envoi réel. */
const fs = require('fs');
const nodemailer = require('nodemailer');

const file = process.env.MAIL_CAPTURE_FILE;
if (!file) throw new Error('MAIL_CAPTURE_FILE manquant');

nodemailer.createTransport = () => ({
  verify: async () => true,
  sendMail: async (mail) => {
    fs.appendFileSync(file, `${JSON.stringify({ to: mail.to, from: mail.from, subject: mail.subject, html: mail.html, at: Date.now() })}\n`);
    return { messageId: `test-${Date.now()}` };
  },
});
