/* Sessions (JWT) : émission et vérification, communes à l'API HTTP et à Socket.io.
   Un jeton n'est accepté que si le compte existe encore et que sa version de session n'a pas changé
   (mot de passe changé ou réinitialisé) ; le rôle est relu en base, jamais pris du jeton. */
const jwt = require('jsonwebtoken');
const User = require('../models/User');

function signSession(user, remember = false) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role, v: user.sessionVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: remember ? '30d' : '1d' }
  );
}

/* Renvoie { id, email, role } ou null (jeton invalide, expiré, compte supprimé, session révoquée). */
async function resolveSession(token) {
  if (!token) return null;
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
  const user = await User.findById(decoded.id).select('email role sessionVersion').lean();
  if (!user || (decoded.v || 0) !== (user.sessionVersion || 0)) return null;
  return { id: String(user._id), email: user.email, role: user.role };
}

const bearer = (req) => req.header('Authorization')?.replace('Bearer ', '') || null;

module.exports = { signSession, resolveSession, bearer };
