const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  role: { type: String, enum: ["user", "admin"], default: "user" },

  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, default: null }, // null pour un compte créé via Google/GitHub
  // Identifiants chez les fournisseurs OAuth (absents tant que le compte n'est pas lié)
  googleId: { type: String, unique: true, sparse: true },
  githubId: { type: String, unique: true, sparse: true },
  emailVerified: { type: Boolean, default: false },
  emailVerificationCodeHash: { type: String, default: null },
  emailVerificationExpire: { type: Date, default: null },
  resetCodeHash: { type: String, default: null },
  resetCodeExpire: { type: Date, default: null },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorExpire: { type: Date, default: null },
  twoFactorCode: { type: String, default: null },


  // --- Infos de base ---
  firstName: { type: String, default: "" },
  lastName:  { type: String, default: "" },
  displayName: { type: String, default: "" },
  phone: { type: String, default: "" },

  // --- Adresse ---
  address: {
    street: { type: String, default: "" },
    city: { type: String, default: "" },
    country: { type: String, default: "" },
    postalCode: { type: String, default: "" }
  },

  // --- Profil ---
  bio: { type: String, default: "Nouvel utilisateur Hive !" },
  age: { type: Number, default: null },
  languages: { type: [String], default: [] },
  education: { type: [String], default: [] },
  skills: { type: [String], default: [] },
  avatarUrl: { type: String, default: "/avatars/default.png" },

  // --- Réputation ---
  reputation: {
    score: { type: Number, default: 0 },
    votes: { type: Number, default: 0 }
  },

  // --- Statut du profil ---
  profileCompleted: { type: Boolean, default: false },

  // --- Consentement (preuve exigée par le RGPD art. 7) : date et version des conditions acceptées
  termsAcceptedAt: { type: Date, default: null },
  termsVersion: { type: String, default: null },

  // --- Messagerie ---
  blockedUsers:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  archivedDMs:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // --- Abonnement Hive+ (Stripe) ---
  plan: { type: String, enum: ['free', 'plus'], default: 'free' },
  planStatus: { type: String, default: null },          // statut Stripe : active, trialing, past_due, canceled…
  planRenewsAt: { type: Date, default: null },          // fin de la période en cours
  planCancelAtPeriodEnd: { type: Boolean, default: false },
  stripeCustomerId: { type: String, default: null, index: true },
  stripeSubscriptionId: { type: String, default: null },
  boostCredits: { type: Number, default: 0, min: 0 },   // boosts inclus dans Hive+ (crédités à chaque facture payée)
  // --- Notifications ---
  notificationPrefs: {
    // Email quand un message arrive et que l'utilisateur n'est pas connecté
    emailMessages: { type: Boolean, default: true },
  },
  // Dernier email « nouveau message » par conversation (anti-spam : 1 email / conversation / 15 min)
  messageEmailSentAt: { type: Map, of: Date, default: {} },

  // --- Sécurité — verrouillage du compte ---
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null }

}, { timestamps: true }); // ajoute createdAt & updatedAt auto

module.exports = mongoose.model('User', userSchema);
