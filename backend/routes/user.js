/* Routes utilisateurs — préfixe /api/user
   /ratings doit être déclaré avant /:id pour éviter d'être interprété comme un ID.
   Les routes de profil public (:id, :id/projects) sont accessibles sans token. */
const router = require("express").Router();
const { serveAvatar } = require("../utils/avatars");
const requireAuth = require("../middlewares/requireAuth");
const { getPublicProfile, getPublicProjects, updateInfos, changePassword, getUserRatings, updateNotificationPrefs, exportMyData, deleteMyAccount, saveOnboarding } = require("../controllers/user.controller");

router.get("/ratings", requireAuth, getUserRatings);
// Droits LPD / RGPD (avant /:id, sinon « me » serait pris pour un identifiant)
router.get("/me/export", requireAuth, exportMyData);
router.delete("/me", requireAuth, deleteMyAccount);
router.put("/notification-prefs", requireAuth, updateNotificationPrefs);
router.get("/:id/avatar", serveAvatar);
// Bannière (publique) et CV (membres connectés) du profil
const express = require("express");
const media = require("../controllers/userMedia.controller");
router.put("/banner", requireAuth, media.uploadBanner);
router.delete("/banner", requireAuth, media.removeBanner);
router.put("/cv", requireAuth, express.raw({ type: () => true, limit: 5 * 1024 * 1024 }), media.uploadCv);
router.delete("/cv", requireAuth, media.removeCv);
router.get("/:id/banner", media.serveBanner);
router.get("/:id/cv", requireAuth, media.serveCv);
router.get("/:id/projects", getPublicProjects);
router.get("/:id", getPublicProfile);
router.put("/profile", requireAuth, updateInfos);
router.put("/onboarding", requireAuth, saveOnboarding);
router.put("/password", requireAuth, changePassword);

module.exports = router;
