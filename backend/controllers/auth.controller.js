const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const sendEmail = require("../utils/sendEmail");
const { renderEmail, escapeHtml } = require('../utils/emailLayout');
const { signSession } = require('../utils/session');
const User = require('../models/User');
const { registrationsTotal, loginsTotal } = require('../metric');
const oauth = require('../utils/oauthProviders');
const { TERMS_VERSION } = require('../utils/legal');

/* Regex de validation — email RFC-compatible, mot de passe 8-15 cars avec maj/min/chiffre/spécial */
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@.#$!%*?&])[A-Za-z\d@.#$!%*?&]{8,15}$/;
const PASSWORD_RULE = "Le mot de passe doit contenir 8 à 15 caractères, avec majuscule, minuscule, chiffre et caractère spécial.";
const VERIFICATION_CODE_TTL_MS = 15 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
// Délai minimal entre deux envois de code au même compte (anti spam de boîte aux lettres)
const CODE_RESEND_COOLDOWN_MS = Number(process.env.CODE_RESEND_COOLDOWN_MS ?? 60 * 1000);
// Un code bloqué (trop d'essais) peut toujours être remplacé tout de suite.
const sentRecently = (expire, attempts) => !!expire && (attempts || 0) < MAX_CODE_ATTEMPTS
  && expire.getTime() - VERIFICATION_CODE_TTL_MS > Date.now() - CODE_RESEND_COOLDOWN_MS;
const TOO_MANY_CODE_ATTEMPTS = "Trop d'essais avec ce code. Demande un nouveau code.";

/* Seules les chaînes sont acceptées : { "$ne": null } ne doit jamais atteindre une requête Mongo */
const str = (value) => (typeof value === 'string' ? value : '');
const normalizeEmail = (value) => str(value).trim().toLowerCase();

/* Code à 6 chiffres (générateur cryptographique), stocké hashé en base avec une TTL de 15 min */
function generateVerificationCode() {
  return String(crypto.randomInt(100000, 1000000));
}

async function assignEmailVerificationCode(user) {
  const verificationCode = generateVerificationCode();
  user.emailVerificationCodeHash = await bcrypt.hash(verificationCode, 10);
  user.emailVerificationExpire = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
  user.emailVerificationAttempts = 0;
  return verificationCode;
}

/* Vérifie un code à usage unique (vérification d'email ou réinitialisation).
   L'essai est compté AVANT la comparaison, de façon atomique : des requêtes envoyées en parallèle
   ne peuvent pas dépasser MAX_CODE_ATTEMPTS. Renvoie { status: 'ok', user } | 'invalid' | 'locked'. */
async function checkCode(email, code, { hash, expire, attempts }) {
  const reserved = await User.findOneAndUpdate(
    { email, [hash]: { $ne: null }, [expire]: { $gt: new Date() }, [attempts]: { $lt: MAX_CODE_ATTEMPTS } },
    { $inc: { [attempts]: 1 } },
    { new: true }
  );
  if (!reserved) {
    const exists = await User.exists({ email, [hash]: { $ne: null }, [expire]: { $gt: new Date() } });
    return exists ? 'locked' : 'invalid';
  }
  const value = typeof code === 'number' ? String(code) : str(code).trim();
  if (/^\d{6}$/.test(value) && await bcrypt.compare(value, reserved[hash])) return { status: 'ok', user: reserved };
  return reserved[attempts] >= MAX_CODE_ATTEMPTS ? 'locked' : 'invalid';
}

function codeEmail({ heading, intro, code, note }) {
  return renderEmail({
    preheader: `Ton code Hive : ${code}`,
    heading,
    paragraphs: [intro],
    code,
    note,
    text: `${heading}\n\nTon code : ${code}\nIl est valable 15 minutes.\n\n${note}`,
  });
}

async function sendVerificationEmail(user, verificationCode) {
  const name = user.firstName || user.displayName;
  const { html, text } = codeEmail({
    heading: 'Confirme ton adresse email',
    intro: `${name ? `Bonjour ${escapeHtml(name)}, merci` : 'Merci'} d’avoir créé ton compte Hive. Saisis ce code pour confirmer ton adresse ; il est valable <strong>15 minutes</strong>.`,
    code: verificationCode,
    note: 'Si tu n’es pas à l’origine de cette inscription, ignore cet email.',
  });
  await sendEmail({ to: user.email, subject: `${verificationCode} est ton code de vérification Hive`, html, text });
}


// ==============================
// INSCRIPTION 
// ==============================
exports.register = async (req, res) => {
  try {
    const { password, acceptTerms } = req.body || {};
    const normalizedEmail = normalizeEmail(req.body?.email);

    if (!normalizedEmail || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    // Consentement explicite (conditions, confidentialité, 16 ans ou plus)
    if (acceptTerms !== true) {
      return res.status(400).json({ error: "Tu dois accepter les conditions d'utilisation et la politique de confidentialité." });
    }

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ error: "Veuillez saisir une adresse email valide." });
    }

    if (!PASSWORD_REGEX.test(password)) {
      return res.status(400).json({ error: PASSWORD_RULE });
    }

    let user = await User.findOne({ email: normalizedEmail });

    if (user && user.emailVerified) {
      return res.status(409).json({ error: 'Cet email existe déjà' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    if (!user) {
      user = new User({
        email: normalizedEmail,
        passwordHash,
        role: 'user',
      });
    } else {
      user.passwordHash = passwordHash;
      user.loginAttempts = 0;
      user.lockUntil = null;
    }

    user.emailVerified = false;
    user.termsAcceptedAt = new Date();
    user.termsVersion = TERMS_VERSION;
    const verificationCode = await assignEmailVerificationCode(user);

    await user.save();
    await sendVerificationEmail(user, verificationCode);
    registrationsTotal.inc();

    return res.status(201).json({
      message: "Compte créé. Vérifiez votre email avec le code reçu.",
      email: normalizedEmail,
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: "L'inscription n'a pas pu aboutir. Réessaie dans un instant." });
  }
};

// ==============================
// CONNEXION
// ==============================
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

exports.login = async (req, res) => {
  try {
    const password = str(req.body?.password);
    const normalizedEmail = normalizeEmail(req.body?.email);

    const user = normalizedEmail ? await User.findOne({ email: normalizedEmail }) : null;
    if (!user) {
      loginsTotal.inc({ status: 'failed' });
      return res.status(401).json({ error: 'Email ou mot de passe invalide' });
    }

    if (user.lockUntil && user.lockUntil > Date.now()) {
      const remainingMs = user.lockUntil - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      loginsTotal.inc({ status: 'failed' });
      return res.status(423).json({
        error: `Compte bloqué suite à trop de tentatives. Réessayez dans ${remainingMin} minute${remainingMin > 1 ? 's' : ''}.`
      });
    }

    // Compte créé via Google/GitHub : pas de mot de passe tant que l'utilisateur n'en définit pas un
    if (!user.passwordHash) {
      loginsTotal.inc({ status: 'failed' });
      return res.status(401).json({
        error: "Ce compte utilise la connexion Google ou GitHub. Utilisez le bouton correspondant, ou « Mot de passe oublié » pour définir un mot de passe."
      });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      loginsTotal.inc({ status: 'failed' });
      user.loginAttempts += 1;

      if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
        await user.save();
        return res.status(423).json({
          error: `Compte bloqué après ${MAX_LOGIN_ATTEMPTS} tentatives échouées. Réessayez dans 15 minutes.`
        });
      }

      await user.save();
      const remaining = MAX_LOGIN_ATTEMPTS - user.loginAttempts;
      return res.status(401).json({
        error: `Email ou mot de passe invalide. ${remaining} tentative${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}.`
      });
    }

    user.loginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    // Bon mot de passe mais adresse jamais confirmée : pas de session tant que le code n'est pas saisi
    // (le front renvoie un code et affiche l'étape de vérification).
    if (!user.emailVerified) {
      loginsTotal.inc({ status: 'failed' });
      return res.status(403).json({
        code: 'email_not_verified',
        email: user.email,
        error: "Confirme d'abord ton adresse email avec le code reçu.",
      });
    }

    const token = signSession(user, req.body.rememberMe === true);

    loginsTotal.inc({ status: 'success' });
    return res.json({ message: 'Connexion réussie', token, user });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// ==============================
// CONNEXION GOOGLE / GITHUB (OAuth 2.0)
// ==============================
const OAUTH_COOKIE = 'hive_oauth';
const OAUTH_STATE_TTL_S = 10 * 60;

function frontUrl(path) {
  return `${(process.env.FRONT_URL || 'http://localhost:3000').replace(/\/$/, '')}${path}`;
}

function oauthCookie(value, maxAgeS) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${OAUTH_COOKIE}=${value}; Path=/api/auth/oauth; HttpOnly; SameSite=Lax; Max-Age=${maxAgeS}${secure}`;
}

function readCookie(req, name) {
  const match = (req.headers.cookie || '').split(';').map((c) => c.trim().split('='))
    .find(([key]) => key === name);
  return match ? decodeURIComponent(match.slice(1).join('=')) : null;
}

// GET /auth/providers — liste des fournisseurs configurés, pour afficher les bons boutons
exports.oauthProviders = (_req, res) => {
  res.json({ providers: oauth.enabledProviders() });
};

// GET /auth/oauth/:provider — redirige vers la page de connexion du fournisseur.
// Le state est signé (JWT) et lié au navigateur par un cookie httpOnly (protection CSRF).
exports.oauthStart = (req, res) => {
  const { provider } = req.params;
  if (!oauth.getProvider(provider)) {
    return res.redirect(frontUrl('/login?oauthError=unavailable'));
  }
  const nonce = crypto.randomBytes(16).toString('hex');
  const state = jwt.sign(
    { n: nonce, p: provider, r: req.query.remember === '1' },
    process.env.JWT_SECRET,
    { expiresIn: OAUTH_STATE_TTL_S }
  );
  res.setHeader('Set-Cookie', oauthCookie(nonce, OAUTH_STATE_TTL_S));
  return res.redirect(oauth.buildAuthorizeUrl(provider, state));
};

/* Retrouve le compte lié au fournisseur, sinon le compte ayant le même email, sinon en crée un. */
async function findOrCreateOAuthUser(providerName, profile) {
  const { idField } = oauth.getProvider(providerName);

  let user = await User.findOne({ [idField]: profile.id });
  if (user) return user;

  const email = profile.email.trim().toLowerCase();
  user = await User.findOne({ email });

  if (user) {
    if (!user.emailVerified) {
      // Inscription jamais confirmée : le fournisseur prouve que l'email appartient à cette personne,
      // on invalide donc le mot de passe choisi par un tiers qui aurait pu pré-créer le compte.
      user.passwordHash = null;
      user.emailVerified = true;
      user.emailVerificationCodeHash = null;
      user.emailVerificationExpire = null;
    }
    user[idField] = profile.id;
  } else {
    user = new User({
      email,
      role: 'user',
      emailVerified: true,
      firstName: profile.firstName,
      lastName: profile.lastName,
      ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
      [idField]: profile.id,
      // Conditions affichées à côté des boutons Google/GitHub (« En continuant, tu acceptes… »)
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
    });
    registrationsTotal.inc();
  }

  user.loginAttempts = 0;
  user.lockUntil = null;
  await user.save();
  return user;
}

// GET /auth/oauth/:provider/callback — retour du fournisseur avec ?code&state.
// Le JWT Hive est transmis au frontend dans le fragment d'URL (#token=…), jamais envoyé à un serveur.
exports.oauthCallback = async (req, res) => {
  const { provider } = req.params;
  const fail = (reason) => {
    loginsTotal.inc({ status: 'failed' });
    return res.redirect(frontUrl(`/login?oauthError=${reason}`));
  };

  const nonce = readCookie(req, OAUTH_COOKIE);
  res.setHeader('Set-Cookie', oauthCookie('', 0));

  if (!oauth.getProvider(provider)) return fail('unavailable');
  if (req.query.error) return fail('cancelled'); // l'utilisateur a refusé l'accès

  let state;
  try {
    state = jwt.verify(String(req.query.state || ''), process.env.JWT_SECRET);
  } catch {
    return fail('expired');
  }
  if (!nonce || state.n !== nonce || state.p !== provider || !req.query.code) {
    return fail('expired');
  }

  try {
    const profile = await oauth.exchangeCode(provider, String(req.query.code));
    if (!profile.email || !profile.emailVerified) return fail('email');

    const user = await findOrCreateOAuthUser(provider, profile);
    const token = signSession(user, !!state.r);

    loginsTotal.inc({ status: 'success' });
    return res.redirect(frontUrl(`/auth/callback#token=${encodeURIComponent(token)}`));
  } catch (err) {
    console.error(`OAuth ${provider} error:`, err.message);
    return fail('server');
  }
};

// ==============================
// MOT DE PASSE OUBLIÉ
// ==============================
exports.forgotPassword = async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body?.email);
    if (!normalizedEmail) {
      return res.status(400).json({ message: "Email requis" });
    }

    const user = await User.findOne({ email: normalizedEmail });

    if (user && !sentRecently(user.resetCodeExpire, user.resetCodeAttempts)) {
      const resetCode = generateVerificationCode();
      user.resetCodeHash = await bcrypt.hash(resetCode, 10);
      user.resetCodeExpire = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
      user.resetCodeAttempts = 0;
      await user.save();

      const name = user.firstName || user.displayName;
      const { html, text } = codeEmail({
        heading: 'Réinitialise ton mot de passe',
        intro: `${name ? `Bonjour ${escapeHtml(name)}, voici` : 'Voici'} ton code pour choisir un nouveau mot de passe. Il est valable <strong>15 minutes</strong>.`,
        code: resetCode,
        note: 'Si tu n’as rien demandé, ignore cet email : ton mot de passe reste inchangé.',
      });
      await sendEmail({ to: user.email, subject: `${resetCode} est ton code de réinitialisation Hive`, html, text });
    }

    return res.json({
      message:
        "Si un compte existe avec cet email, un code a été envoyé.",
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ message: "Erreur serveur" });
  }
};

const RESET_FIELDS = { hash: 'resetCodeHash', expire: 'resetCodeExpire', attempts: 'resetCodeAttempts' };
const VERIFY_FIELDS = { hash: 'emailVerificationCodeHash', expire: 'emailVerificationExpire', attempts: 'emailVerificationAttempts' };

/* Réponse commune d'un code refusé */
const codeRefused = (res, result) => (result === 'locked'
  ? res.status(429).json({ code: 'code_locked', message: TOO_MANY_CODE_ATTEMPTS, error: TOO_MANY_CODE_ATTEMPTS })
  : res.status(400).json({ message: "Code invalide ou expiré", error: "Code invalide ou expiré" }));


// ==============================
// RESET MOT DE PASSE
// ==============================
exports.resetPassword = async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body?.email);
    const newPassword = str(req.body?.newPassword);

    if (!normalizedEmail || !req.body?.code || !newPassword) {
      return res.status(400).json({ error: "Données manquantes" });
    }
    if (!PASSWORD_REGEX.test(newPassword)) {
      return res.status(400).json({ error: PASSWORD_RULE, message: PASSWORD_RULE });
    }

    const result = await checkCode(normalizedEmail, req.body.code, RESET_FIELDS);
    if (result?.status !== 'ok') return codeRefused(res, result);
    const { user } = result;

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetCodeHash = null;
    user.resetCodeExpire = null;
    user.resetCodeAttempts = 0;
    // Le code reçu prouve que l'adresse appartient à la personne ; on lève aussi un verrouillage éventuel
    user.emailVerified = true;
    user.loginAttempts = 0;
    user.lockUntil = null;
    // Toutes les sessions ouvertes avant la réinitialisation sont fermées
    user.sessionVersion = (user.sessionVersion || 0) + 1;

    await user.save();

    return res.json({
      message: "Mot de passe réinitialisé avec succès",
    });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};


// ==============================
// VÉRIFICATION DU CODE DE RESET
// ==============================

// POST /auth/verify-reset-code — vérifie le code sans encore changer le mot de passe (étape intermédiaire UI)
exports.verifyResetCode = async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body?.email);
    if (!normalizedEmail || !req.body?.code) {
      return res.status(400).json({ message: "Données manquantes" });
    }

    const result = await checkCode(normalizedEmail, req.body.code, RESET_FIELDS);
    if (result?.status !== 'ok') return codeRefused(res, result);
    // Bon code : l'essai n'est pas décompté, l'étape suivante (nouveau mot de passe) le revérifie
    await User.updateOne({ _id: result.user._id }, { $set: { resetCodeAttempts: 0 } });

    return res.json({ message: "Code valide" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// ==============================
// VÉRIFICATION EMAIL (OTP)
// ==============================

// POST /auth/verify-email — valide le code reçu par email et marque le compte comme vérifié
exports.verifyEmail = async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body?.email);
    if (!normalizedEmail || !req.body?.code) {
      return res.status(400).json({ message: "Données manquantes" });
    }

    const result = await checkCode(normalizedEmail, req.body.code, VERIFY_FIELDS);
    if (result?.status !== 'ok') return codeRefused(res, result);
    const { user } = result;

    user.emailVerified = true;
    user.emailVerificationCodeHash = null;
    user.emailVerificationExpire = null;
    user.emailVerificationAttempts = 0;
    await user.save();

    return res.json({ message: "Email vérifié avec succès." });
  } catch (err) {
    console.error("Verify email error:", err);
    return res.status(500).json({ message: "Erreur serveur" });
  }
};

// ==============================
// RENVOI DU CODE DE VÉRIFICATION
// ==============================

// POST /auth/resend-verification-email — renvoie un code si le compte existe et n'est pas encore vérifié
exports.resendVerificationEmail = async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body?.email);

    if (!normalizedEmail) {
      return res.status(400).json({ message: "Email requis" });
    }

    const user = await User.findOne({ email: normalizedEmail });

    if (user && !user.emailVerified && !sentRecently(user.emailVerificationExpire, user.emailVerificationAttempts)) {
      const verificationCode = await assignEmailVerificationCode(user);
      await user.save();
      await sendVerificationEmail(user, verificationCode);
    }

    return res.json({
      message: "Si un compte non vérifié existe avec cet email, un code a été renvoyé.",
    });
  } catch (err) {
    console.error("Resend verification email error:", err);
    return res.status(500).json({ message: "Erreur serveur" });
  }
};

// ==============================
// UTILISATEUR CONNECTÉ
// ==============================

// GET /auth/me — retourne l'utilisateur connecté depuis le token JWT (sans passwordHash)
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash');
    res.json({ user });
  } catch (err) {
    console.error("GetMe error:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};
