const User = require("../models/User");
const Project = require("../models/Project");
const Rating = require("../models/Rating");
const Message = require("../models/Message");
const ProjectRequest = require("../models/ProjectRequest");
const ProjectHistory = require("../models/ProjectHistory");
const { deleteUserAccount } = require("../utils/accountDeletion");
const bcrypt = require("bcrypt");
const { containsProfanity } = require('../utils/profanityFilter');

/* Retire les champs sensibles (passwordHash, codes de reset…) avant d'exposer un profil public */
function sanitizePublicProfile(user) {
  if (!user) return null;

  return {
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    bio: user.bio,
    age: user.age,
    avatarUrl: user.avatarUrl,
    languages: user.languages,
    education: user.education,
    skills: user.skills,
    // Vie privée : jamais la rue ni le code postal en public, seulement ville et pays
    address: { city: user.address?.city || "", country: user.address?.country || "" },
    reputation: user.reputation,
    createdAt: user.createdAt,
  };
}

/* ==============================
   PROFIL UTILISATEUR
   ============================== */

// GET /user/:id — profil public d'un utilisateur (sans données sensibles)
exports.getPublicProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    return res.status(200).json(sanitizePublicProfile(user));
  } catch (err) {
    console.error("Get public profile error:", err);
    return res.status(500).json({ message: "Erreur lors du chargement du profil" });
  }
};

// GET /user/:id/projects — projets publics d'un utilisateur
exports.getPublicProjects = async (req, res) => {
  try {
    const projects = await Project.find({
      ownerId: req.params.id,
      visibility: "public",
    }).sort({ createdAt: -1 });

    return res.status(200).json(projects);
  } catch (err) {
    console.error("Get public projects error:", err);
    return res.status(500).json({ message: "Erreur lors du chargement des projets" });
  }
};

// PUT /user/profile — mise à jour des infos de l'utilisateur connecté (ignore les champs undefined)
exports.updateInfos = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    const {
      firstName,
      lastName,
      displayName,
      age,
      phone,
      bio,

      skills,
      languages,
      education,
      avatarUrl,
      address,
    } = req.body;

    const updateData = {
      firstName,
      lastName,
      displayName,
      age,
      phone,
      bio,
      skills,
      languages,
      education,
      avatarUrl,
      address,
    };

    Object.keys(updateData).forEach(
      (key) => updateData[key] === undefined && delete updateData[key]
    );

    if (containsProfanity(displayName, bio)) {
      return res.status(400).json({ message: 'Le contenu contient des termes inappropriés.' });
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    }).select("-passwordHash");

    res.status(200).json(updatedUser);
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ message: "Erreur lors de la mise à jour du profil" });
  }
};

// ==============================
// CHANGEMENT DE MOT DE PASSE
// ==============================

// PUT /user/password — vérifie l'ancien mot de passe avant d'en hasher et sauvegarder un nouveau
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Champs requis manquants" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    // Compte créé via Google/GitHub : aucun mot de passe actuel à comparer
    if (!user.passwordHash) {
      return res.status(400).json({ message: "Ce compte n'a pas encore de mot de passe. Utilisez « Mot de passe oublié » pour en définir un." });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: "Mot de passe actuel incorrect" });
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);

    await user.save();

    res.status(200).json({ message: "Mot de passe mis à jour avec succès" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ message: "Erreur lors du changement de mot de passe" });
  }
};

// GET /user/ratings — historique des notes reçues par l'utilisateur connecté
// PUT /user/notification-prefs { emailMessages } — préférences de notification par email
exports.updateNotificationPrefs = async (req, res) => {
  const { emailMessages } = req.body || {};
  if (typeof emailMessages !== 'boolean') return res.status(400).json({ message: 'Valeur invalide' });
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { 'notificationPrefs.emailMessages': emailMessages } },
      { new: true }
    ).select('notificationPrefs');
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });
    return res.json({ notificationPrefs: user.notificationPrefs });
  } catch (err) {
    console.error('updateNotificationPrefs error:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

exports.getUserRatings = async (req, res) => {
  try {
    const ratings = await Rating.find({ targetType: 'user', targetId: req.user.id })
      .populate('raterId', 'displayName firstName lastName avatarUrl')
      .populate('projectId', 'title')
      .sort({ createdAt: -1 });
    return res.json(ratings);
  } catch (err) {
    console.error('getUserRatings error:', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

/* ==============================
   DROITS LPD / RGPD
   ============================== */

// Champs internes jamais exportés (secrets, codes à usage unique, verrouillage)
const EXPORT_EXCLUDED = '-passwordHash -emailVerificationCodeHash -resetCodeHash -twoFactorCode -loginAttempts -lockUntil';

// GET /user/me/export — droit d'accès et portabilité (LPD art. 25 et 28, RGPD art. 15 et 20)
exports.exportMyData = async (req, res) => {
  const userId = req.user.id || req.user._id;
  const user = await User.findById(userId).select(EXPORT_EXCLUDED).lean();
  if (!user) return res.status(404).json({ message: "Utilisateur introuvable" });

  const [projects, requests, messages, ratingsGiven, history] = await Promise.all([
    Project.find({ ownerId: userId }).lean(),
    ProjectRequest.find({ senderId: userId }).select('projectId message status createdAt').lean(),
    Message.find({ senderId: userId, deleted: { $ne: true } }).select('content conversationId receiverId createdAt').lean(),
    Rating.find({ raterId: userId }).lean(),
    ProjectHistory.find({ userId }).select('projectId viewedAt').lean(),
  ]);

  const data = {
    exportedAt: new Date().toISOString(),
    profile: user,
    projects,
    joinRequests: requests,
    messages,
    ratingsGiven,
    projectViews: history,
  };
  res.set('Content-Disposition', 'attachment; filename="hive-mes-donnees.json"');
  return res.status(200).json(data);
};

// DELETE /user/me — droit à l'effacement (LPD art. 32, RGPD art. 17)
// Confirmation : mot de passe, ou email pour un compte créé via Google/GitHub (pas de mot de passe).
exports.deleteMyAccount = async (req, res) => {
  const userId = req.user.id || req.user._id;
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: "Utilisateur introuvable" });
  if (user.role === 'admin') {
    return res.status(403).json({ message: "Un compte administrateur ne peut pas se supprimer lui-même." });
  }

  const { password, email } = req.body || {};
  const confirmed = user.passwordHash
    ? typeof password === 'string' && await bcrypt.compare(password, user.passwordHash)
    : typeof email === 'string' && email.trim().toLowerCase() === user.email.toLowerCase();
  // 403 et non 401 : côté front, un 401 déconnecte automatiquement la personne
  if (!confirmed) {
    return res.status(403).json({ message: user.passwordHash ? "Mot de passe incorrect" : "L'email ne correspond pas à ce compte" });
  }

  try {
    await deleteUserAccount(user);
  } catch (err) {
    // L'abonnement est résilié en premier : s'il échoue, rien n'a été supprimé
    console.error('deleteMyAccount error:', err.message);
    return res.status(502).json({ message: "La suppression n'a pas pu aboutir. Réessaie dans quelques minutes ou écris à contact@hive-app.ch." });
  }
  return res.status(200).json({ message: "Compte supprimé" });
};
