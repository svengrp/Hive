/* Middleware d'authentification optionnelle. Tente de résoudre la session si un jeton est présent,
   mais laisse toujours passer la requête. Utilisé sur les routes publiques qui personnalisent
   leur réponse selon que l'utilisateur est connecté ou non (ex : liste de projets). */
const { resolveSession, bearer } = require('../utils/session');

module.exports = async (req, _res, next) => {
  const token = bearer(req);
  if (token) {
    try {
      const session = await resolveSession(token);
      if (session) req.user = session;
    } catch { /* session ignorée */ }
  }
  next();
};
