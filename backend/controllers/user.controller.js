const User = require("../models/User");
const Project = require("../models/Project");
const Rating = require("../models/Rating");
const Message = require("../models/Message");
const ProjectRequest = require("../models/ProjectRequest");
const ProjectHistory = require("../models/ProjectHistory");
const { deleteUserAccount } = require("../utils/accountDeletion");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const { containsProfanity } = require('../utils/profanityFilter');
const { normalizeInterests, ONBOARDING_GOALS } = require('../utils/interests');
const { signSession } = require('../utils/session');
const { decodeAvatar, storeAvatar, removeAvatar } = require('../utils/avatars');

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@.#$!%*?&])[A-Za-z\d@.#$!%*?&]{8,15}$/;

/* Limites des champs du profil : un profil sert partout (cartes, messages, projets),
   un champ démesuré alourdit toutes ces réponses. */
const TEXT_LIMITS = { firstName: 60, lastName: 60, displayName: 60, phone: 30, bio: 1000 };
const LIST_LIMITS = { skills: 30, languages: 15, education: 15 };
const LIST_ITEM_MAX = 80;
const ADDRESS_MAX = 100;

/* Photo de profil : image envoyée (data URL PNG/JPEG/WebP, réduite par le navigateur),
   lien https, avatar fourni par Hive (/avatars/…) ou vide. */
function validAvatar(value) {
  if (value === '' || value === null) return true;
  if (typeof value !== 'string') return false;
  if (value.startsWith('data:')) return !decodeAvatar(value).error;
  if (/^\/avatars\/[\w.-]+$/.test(value)) return true;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && value.length <= 2048;
  } catch {
    return false;
  }
}

/* Renvoie un message d'erreur, ou null si les champs envoyés sont valides. */
function profileError(data) {
  for (const [field, max] of Object.entries(TEXT_LIMITS)) {
    if (data[field] === undefined || data[field] === null) continue;
    if (typeof data[field] !== 'string') return 'Valeur invalide.';
    if (data[field].length > max) return `Ce champ est limité à ${max} caractères.`;
  }
  for (const [field, max] of Object.entries(LIST_LIMITS)) {
    if (data[field] === undefined) continue;
    if (!Array.isArray(data[field]) || data[field].some((item) => typeof item !== 'string' || item.length > LIST_ITEM_MAX)) return 'Liste invalide.';
    if (data[field].length > max) return `${max} éléments au maximum.`;
  }
  if (data.age !== undefined && data.age !== null && data.age !== '') {
    const age = Number(data.age);
    if (!Number.isInteger(age) || age < 13 || age > 120) return "L'âge doit être compris entre 13 et 120 ans.";
  }
  if (data.address !== undefined) {
    if (typeof data.address !== 'object' || data.address === null || Array.isArray(data.address)) return 'Adresse invalide.';
    for (const key of ['street', 'city', 'country', 'postalCode']) {
      const value = data.address[key];
      if (value !== undefined && (typeof value !== 'string' || value.length > ADDRESS_MAX)) return 'Adresse invalide.';
    }
  }
  if (data.avatarUrl !== undefined && !validAvatar(data.avatarUrl)) {
    return 'Photo de profil invalide (image PNG, JPEG ou WebP de 200 Ko au plus, ou lien web).';
  }
  return null;
}

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
    avatarVersion: user.avatarVersion ?? null,
    languages: user.languages,
    education: user.education,
    skills: user.skills,
    interests: user.interests || [],
    // Vie privée : jamais la rue ni le code postal en public, seulement ville et pays
    address: { city: user.address?.city || "", country: user.address?.country || "" },
    reputation: user.reputation,
    // Badge Hive+ public (seulement le fait d'être membre, rien sur la facturation)
    plan: user.plan === 'plus' ? 'plus' : 'free',
    createdAt: user.createdAt,
  };
}

/* ==============================
   PROFIL UTILISATEUR
   ============================== */

// GET /user/:id — profil public d'un utilisateur (sans données sensibles)
exports.getPublicProfile = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Utilisateur introuvable" });
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
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Utilisateur introuvable" });
    // Ni brouillons ni projets privés sur un profil public
    const projects = await Project.find({
      ownerId: req.params.id,
      visibility: "public",
      status: { $in: ["open", "closed"] },
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
      interests,
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
      interests: normalizeInterests(interests) ?? undefined,
    };

    Object.keys(updateData).forEach(
      (key) => updateData[key] === undefined && delete updateData[key]
    );

    // Avatar renvoyé tel quel par le formulaire : seul un avatar modifié est revalidé
    // (les anciens avatars, envoyés avant la réduction côté navigateur, restent acceptés).
    if (updateData.avatarUrl !== undefined) {
      const current = await User.findById(userId).select('avatarUrl avatarVersion').lean();
      if (current && current.avatarUrl === updateData.avatarUrl) delete updateData.avatarUrl;
    }

    const invalid = profileError(updateData);
    if (invalid) return res.status(400).json({ message: invalid });

    // Photo envoyée : stockée à part (UserAvatar), le profil ne garde que sa version.
    // Lien externe ou retrait : l'ancienne photo envoyée est supprimée.
    if (typeof updateData.avatarUrl === 'string') {
      if (updateData.avatarUrl.startsWith('data:')) {
        updateData.avatarVersion = await storeAvatar(userId, decodeAvatar(updateData.avatarUrl));
        updateData.avatarUrl = '';
      } else {
        await removeAvatar(userId);
        updateData.avatarVersion = null;
      }
    }

    if (containsProfanity(displayName, bio, firstName, lastName)) {
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

// PUT /user/onboarding — réponses du parcours de bienvenue (prénom, centres d'intérêt, pays, objectif),
// envoyées une fois le compte créé.
// Ne remplit que ce qui est encore vide : un choix déjà fait sur le profil n'est jamais écrasé.
exports.saveOnboarding = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable" });

    const { country, city, goal, firstName } = req.body || {};
    const interests = normalizeInterests(req.body?.interests);
    const clean = (value) => (typeof value === "string" ? value.trim().slice(0, 80) : "");

    if (interests?.length && !user.interests?.length) user.interests = interests;
    const name = typeof firstName === "string" ? firstName.trim().slice(0, 40) : "";
    if (name && !user.firstName) {
      if (containsProfanity(name)) return res.status(400).json({ message: 'Le contenu contient des termes inappropriés.' });
      user.firstName = name;
    }
    if (ONBOARDING_GOALS.includes(goal) && !user.onboardingGoal) user.onboardingGoal = goal;
    if (clean(country) && !user.address?.country) {
      user.address = user.address || {};
      user.address.country = clean(country);
      if (clean(city) && !user.address.city) user.address.city = clean(city);
    }

    await user.save();
    const saved = user.toObject();
    delete saved.passwordHash;
    return res.status(200).json(saved);
  } catch (err) {
    console.error("Save onboarding error:", err);
    return res.status(500).json({ message: "Erreur lors de l'enregistrement" });
  }
};

// ==============================
// CHANGEMENT DE MOT DE PASSE
// ==============================

// PUT /user/password — vérifie l'ancien mot de passe avant d'en hasher et sauvegarder un nouveau
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    const { currentPassword, newPassword } = req.body || {};

    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
      return res.status(400).json({ message: "Champs requis manquants" });
    }
    if (!PASSWORD_REGEX.test(newPassword)) {
      return res.status(400).json({ message: "Le mot de passe doit contenir 8 à 15 caractères, avec majuscule, minuscule, chiffre et caractère spécial." });
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
    // Les autres sessions ouvertes sont fermées ; celle-ci reçoit un nouveau jeton
    user.sessionVersion = (user.sessionVersion || 0) + 1;

    await user.save();

    res.status(200).json({ message: "Mot de passe mis à jour avec succès", token: signSession(user, true) });
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
      .populate('raterId', 'displayName firstName lastName avatarUrl avatarVersion')
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
