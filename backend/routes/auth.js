/* Routes d'authentification — préfixe /api/auth
   loginLimiter : 10 connexions/min par IP. codeLimiter : codes à 6 chiffres (en plus des 5 essais par code,
   voir auth.controller). mailLimiter : routes qui envoient un email (anti spam de boîtes aux lettres). */
const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const requireAuth = require('../middlewares/requireAuth');
const { loginLimiter, codeLimiter, mailLimiter } = require('../middlewares/rateLimiter');

router.post('/register', mailLimiter, authController.register);
router.post('/verify-email', codeLimiter, authController.verifyEmail);
router.post('/resend-verification-email', mailLimiter, authController.resendVerificationEmail);
router.post('/login', loginLimiter, authController.login);
router.post('/forgot-password', mailLimiter, authController.forgotPassword);
router.post('/reset-password', codeLimiter, authController.resetPassword);
router.post("/verify-reset-code", codeLimiter, authController.verifyResetCode);
router.get('/me', requireAuth, authController.getMe);

// Connexion via Google / GitHub (voir utils/oauthProviders.js)
router.get('/providers', authController.oauthProviders);
router.get('/oauth/:provider', authController.oauthStart);
router.get('/oauth/:provider/callback', authController.oauthCallback);

module.exports = router;
