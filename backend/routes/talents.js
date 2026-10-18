/* Recherche de talents et invitations (Hive+) — monté sur /api.
   GET  /talents                 recherche (402 sans Hive+, avec le nombre de talents disponibles)
   POST /invitations             inviter une personne dans un de ses projets (Hive+)
   GET  /invitations/mine        invitations reçues en attente
   PUT  /invitations/:id/accept  rejoindre le projet
   PUT  /invitations/:id/decline refuser */
const router = require('express').Router();
const requireAuth = require('../middlewares/requireAuth');
const requirePlus = require('../middlewares/requirePlus');
const ctrl = require('../controllers/talent.controller');

router.get('/talents', requireAuth, ctrl.searchTalents);
router.post('/invitations', requireAuth, requirePlus, ctrl.createInvitation);
router.get('/invitations/mine', requireAuth, ctrl.getMyInvitations);
router.put('/invitations/:id/accept', requireAuth, ctrl.acceptInvitation);
router.put('/invitations/:id/decline', requireAuth, ctrl.declineInvitation);

module.exports = router;
