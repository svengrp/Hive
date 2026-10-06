/* Transporteur Nodemailer configuré pour Zoho Mail via SMTP sécurisé (port 465 / SSL).
   Variables d'environnement requises : MAIL_USER (compte SMTP Zoho) et MAIL_PASS (mot de passe d'application). Expéditeur affiché : utils/mailFrom.js.
   MAIL_TRANSPORT=json (tests, développement) : aucun envoi réel, le message est rendu en JSON. */
const nodemailer = require("nodemailer");

const transporter = process.env.MAIL_TRANSPORT === "json"
  ? nodemailer.createTransport({ jsonTransport: true })
  : nodemailer.createTransport({
    host: "smtp.zoho.eu",
    port: 465,
    secure: true,
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });

module.exports = transporter;
