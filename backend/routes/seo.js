/* SEO — préfixe /api/seo (servi via nginx sur /sitemap.xml et aux robots de partage sur /projects/:id).
   Pas de redirection vers le front pour un projet absent ou privé : nginx renverrait le robot ici (boucle). */
const router = require('express').Router();
const mongoose = require('mongoose');
const Project = require('../models/Project');
const ProjectCover = require('../models/ProjectCover');
const { PUBLIC_PROJECT_FILTER, buildSitemap, buildShareHtml } = require('../utils/seo');

const SITEMAP_LIMIT = 50000; // maximum autorisé par fichier sitemap
const front = () => (process.env.FRONT_URL || 'http://localhost:3000').replace(/\/+$/, '');
const backend = () => process.env.BACKEND_URL || 'http://localhost:5050';

router.get('/sitemap.xml', async (_req, res) => {
  const projects = await Project.find(PUBLIC_PROJECT_FILTER)
    .select('_id updatedAt')
    .sort({ updatedAt: -1 })
    .limit(SITEMAP_LIMIT)
    .lean();
  res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(buildSitemap(front(), projects));
});

router.get('/share/projects/:id', async (req, res) => {
  const project = mongoose.isValidObjectId(req.params.id)
    ? await Project.findOne({ _id: req.params.id, ...PUBLIC_PROJECT_FILTER })
      .select('_id title description coverVersion')
      .lean()
    : null;

  if (!project) {
    return res.status(404).type('html').set('X-Robots-Tag', 'noindex')
      .send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Hive</title><meta property="og:title" content="Hive — Trouve les bonnes personnes pour ton projet"><meta property="og:image" content="${front()}/og-image.png"></head><body>Projet introuvable.</body></html>`);
  }

  const cover = project.coverVersion
    ? await ProjectCover.findOne({ projectId: project._id }).select('contentType').lean()
    : null;

  res.type('html').set('Cache-Control', 'public, max-age=600')
    .send(buildShareHtml({ frontUrl: front(), backendUrl: backend(), project, coverType: cover?.contentType }));
});

module.exports = router;
