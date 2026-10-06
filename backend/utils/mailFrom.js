/* Expéditeur commun à tous les emails de Hive.
   MAIL_FROM_EMAIL : adresse affichée (ex. noreply@hive-app.ch, alias du compte Zoho de MAIL_USER) ;
   à défaut, l'adresse de connexion SMTP (MAIL_USER). MAIL_FROM_NAME : nom affiché (« Hive » par défaut). */
const mailFrom = () => {
  const name = process.env.MAIL_FROM_NAME || 'Hive';
  const address = process.env.MAIL_FROM_EMAIL || process.env.MAIL_USER;
  return `"${name}" <${address}>`;
};

module.exports = mailFrom;
