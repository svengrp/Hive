/* Authentification obligatoire : jeton valide ET compte encore existant, session non révoquée.
   req.user = { id, email, role } (rôle lu en base). */
const { resolveSession, bearer } = require('../utils/session');

module.exports = async (req, res, next) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Accès refusé. Token manquant.' });

  try {
    const session = await resolveSession(token);
    if (!session) return res.status(401).json({ error: 'Token invalide.' });
    req.user = session;
    return next();
  } catch (err) {
    return next(err);
  }
};
