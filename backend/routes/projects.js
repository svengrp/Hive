/* Routes projets — préfixe /api/projects
   Les routes statiques (/mine, /tags, /regions, /recommended) doivent être déclarées AVANT
   la route dynamique /:id pour éviter qu'Express les interprète comme des IDs de projet. */
const express = require('express');
const router = express.Router();
const controller = require('../controllers/project.controller');
const coverController = require('../controllers/projectCover.controller');
const requireAuth = require('../middlewares/requireAuth');
const optionalAuth = require('../middlewares/optionalAuth');
// Public
router.get('/', optionalAuth, controller.getAllProjects);

// Les routes spécifiques AVANT les dynamiques
router.get('/mine', requireAuth, controller.getMyProjects);
router.get('/tags', controller.getAllTags);
router.get('/regions', controller.getAllRegions);



// route recommendation de projets
router.get('/recommended', requireAuth, controller.getRecommended)
router.get('/boosted', controller.getBoosted);


// Protected CRUD
router.post('/create', requireAuth, controller.createProject);
router.put('/:id', requireAuth, controller.updateProject);
router.delete('/:id', requireAuth, controller.deleteProject);
router.post('/:id/leave', requireAuth, controller.leaveProject);
router.delete('/:id/participants/:userId', requireAuth, controller.kickParticipant);
router.post('/:id/close', requireAuth, controller.closeProject);
router.post('/:id/rate', requireAuth, controller.rateParticipant);
router.post('/:id/view', requireAuth, controller.recordView);
router.get('/:id/stats', requireAuth, controller.getStats);

// Image de couverture (lecture publique, écriture réservée au propriétaire)
router.get('/:id/cover', coverController.getCover);
router.put('/:id/cover', requireAuth, coverController.uploadCover);
router.delete('/:id/cover', requireAuth, coverController.deleteCover);

// Route dynamique toujours en dernier
router.get('/:id', optionalAuth, controller.getProjectById);

module.exports = router;
