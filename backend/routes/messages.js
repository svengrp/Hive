/* Routes messagerie — préfixe /api/messages. Toutes les routes exigent l'authentification.
   Ordre important : les routes statiques (/conversations, /group/*, /dm/*, /blocked, /notifications)
   doivent précéder les routes dynamiques (/:userId, /:msgId) pour ne pas être capturées par elles. */
const router = require('express').Router();
const requireAuth = require('../middlewares/requireAuth');
const ctrl = require('../controllers/messages.controller');

router.use(requireAuth);

// Pièces jointes : fichier brut (5 Mo au plus), avant les routes dynamiques
const express = require('express');
const { MAX_SIZE } = require('../utils/attachments');
router.post('/attachments', express.raw({ type: () => true, limit: MAX_SIZE }), ctrl.uploadAttachment);
router.get('/attachments/:id', ctrl.downloadAttachment);

router.get('/conversations',         ctrl.getConversations);
router.get('/unread',                ctrl.getUnreadCount);
router.get('/group/mine',            ctrl.getMyConversations);
router.get('/group/archived',        ctrl.getArchivedConversations);
router.put('/group/:convId/archive', ctrl.archiveConversation);
router.put('/group/:convId/unarchive', ctrl.unarchiveConversation);
router.delete('/group/:convId',      ctrl.deleteConversation);
router.get('/group/:convId/pinned',  ctrl.getPinnedMessages);
router.get('/group/:convId',         ctrl.getConversationMessages);
router.get('/notifications',         ctrl.getNotifications);
router.put('/notifications/read',    ctrl.markNotificationsRead);
router.put('/:msgId/edit',           ctrl.editMessage);
router.post('/:msgId/react',         ctrl.reactToMessage);
router.put('/:msgId/pin',            ctrl.pinMessage);
router.delete('/:msgId/delete',      ctrl.deleteMessage);
router.get('/blocked',               ctrl.getBlockedUsers);
router.post('/block/:userId',        ctrl.blockUser);
router.delete('/block/:userId',      ctrl.unblockUser);
router.get('/dm/archived',           ctrl.getArchivedDMs);
router.put('/dm/:userId/archive',    ctrl.archiveDM);
router.put('/dm/:userId/unarchive',  ctrl.unarchiveDM);
router.get('/:userId',               ctrl.getMessages);
router.put('/:userId/read',          ctrl.markRead);
module.exports = router;
