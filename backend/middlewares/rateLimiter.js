/* Limiteurs de débit par IP (anti force brute et anti spam d'emails).
   En production, l'API est derrière Cloudflare puis le proxy Render : l'adresse vue par Express est celle
   du proxy, commune à TOUS les visiteurs. L'IP réelle est donc lue dans CF-Connecting-IP (posé par
   Cloudflare, impossible à forger à travers lui), sinon dans req.ip (trust proxy réglé dans server.js).
   Le verrouillage par compte (5 mots de passe faux → 15 min) est dans auth.controller. */
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const clientIp = (req) => req.headers['cf-connecting-ip'] || req.ip;

const limiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(clientIp(req)),
  message: { error: message, message },
  // L'IP vient de CF-Connecting-IP : les contrôles d'en-têtes de la librairie ne s'appliquent pas
  validate: { xForwardedForHeader: false },
});

// Connexion : 10 tentatives par minute et par IP (une IP peut être partagée : foyer, école, bureau ;
// chaque compte est en plus verrouillé 15 min après 5 mots de passe faux)
const loginLimiter = limiter(60 * 1000, 10, 'Trop de tentatives de connexion. Réessayez dans une minute.');

// Codes à 6 chiffres (vérification d'email, réinitialisation) : en plus de la limite par code
const codeLimiter = limiter(15 * 60 * 1000, 30, 'Trop de codes essayés. Réessayez dans quelques minutes.');

// Envois d'emails (inscription, renvoi de code, mot de passe oublié)
const mailLimiter = limiter(15 * 60 * 1000, 20, 'Trop de demandes. Réessayez dans quelques minutes.');

module.exports = { loginLimiter, codeLimiter, mailLimiter, clientIp };
