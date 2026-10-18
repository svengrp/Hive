/* Fonction générique d'envoi d'email. Centralise tous les appels sortants via le transporteur Zoho.
   Pas de transporter.verify() avant chaque envoi : il ouvrait une deuxième connexion SMTP à chaque email
   (envoi deux fois plus lent) ; une configuration invalide fait de toute façon échouer sendMail. */
const transporter = require("./mailer");
const mailFrom = require("./mailFrom");

async function sendEmail({ to, subject, html, text }) {
  return transporter.sendMail({
    from: mailFrom(),
    to,
    subject,
    html,
    ...(text ? { text } : {}),
  });
}

module.exports = sendEmail;
