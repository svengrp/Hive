/* SEO — sitemap et pages d'aperçu pour les robots de partage.
   Lancer : npm test (node:test, Mongo simulé : aucune base requise) */
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const Project = require('../models/Project');
const ProjectCover = require('../models/ProjectCover');
const { buildSitemap, buildShareHtml, toMetaDescription } = require('../utils/seo');

const ID = '64b7f0c2a1b2c3d4e5f60718';

/* Requête Mongoose simulée : .select().sort().limit().lean() renvoient la même chaîne */
const query = (result) => {
  const chain = { select: () => chain, sort: () => chain, limit: () => chain, lean: async () => result };
  return chain;
};

async function startApp() {
  process.env.FRONT_URL = 'https://hive-app.ch';
  process.env.BACKEND_URL = 'https://api.hive-app.ch';
  const app = express();
  app.use('/api/seo', require('../routes/seo'));
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}/api/seo` };
}

test('sitemap : pages fixes + projets avec date', () => {
  const xml = buildSitemap('https://hive-app.ch/', [{ _id: ID, updatedAt: new Date('2026-10-01T12:00:00Z') }]);
  assert.match(xml, /<loc>https:\/\/hive-app\.ch\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/hive-app\.ch\/projects<\/loc>/);
  assert.match(xml, new RegExp(`<loc>https://hive-app.ch/projects/${ID}</loc><lastmod>2026-10-01</lastmod>`));
});

test('aperçu : titre et description du projet, contenu utilisateur échappé', () => {
  const html = buildShareHtml({
    frontUrl: 'https://hive-app.ch',
    backendUrl: 'https://api.hive-app.ch',
    project: { _id: ID, title: '"><script>alert(1)</script>', description: 'Festival & bénévoles' },
  });
  assert.ok(!html.includes('<script>'), 'aucune balise script injectée');
  assert.match(html, /&quot;&gt;&lt;script&gt;/);
  assert.match(html, /content="Festival &amp; bénévoles"/);
  assert.match(html, /og:image" content="https:\/\/hive-app\.ch\/og-image\.png"/);
});

test('aperçu : couverture JPEG utilisée, WebP remplacé par l\'image par défaut', () => {
  const project = { _id: ID, title: 'Projet', description: '', coverVersion: 123 };
  const args = { frontUrl: 'https://hive-app.ch', backendUrl: 'https://api.hive-app.ch', project };
  assert.match(buildShareHtml({ ...args, coverType: 'image/jpeg' }), /api\.hive-app\.ch\/api\/projects\/[0-9a-f]+\/cover\?size=full&amp;v=123/);
  assert.match(buildShareHtml({ ...args, coverType: 'image/webp' }), /hive-app\.ch\/og-image\.png/);
});

test('description : 160 caractères max', () => {
  assert.ok(toMetaDescription('mot '.repeat(80)).length <= 160);
});

test('routes : sitemap, projet public, projet introuvable', async (t) => {
  const calls = [];
  t.mock.method(Project, 'find', (filter) => { calls.push(filter); return query([{ _id: ID, updatedAt: new Date() }]); });
  t.mock.method(Project, 'findOne', (filter) => query(filter._id === ID ? { _id: ID, title: 'Festival', description: 'Desc', coverVersion: null } : null));
  t.mock.method(ProjectCover, 'findOne', () => query(null));
  const { server, base } = await startApp();
  t.after(() => server.close());

  const sitemap = await fetch(`${base}/sitemap.xml`);
  assert.strictEqual(sitemap.status, 200);
  assert.match(sitemap.headers.get('content-type'), /application\/xml/);
  assert.match(await sitemap.text(), new RegExp(`/projects/${ID}`));
  assert.deepStrictEqual(calls[0], { status: 'open', visibility: 'public' }, 'seuls les projets ouverts et publics');

  const share = await fetch(`${base}/share/projects/${ID}`);
  assert.strictEqual(share.status, 200);
  assert.match(await share.text(), /og:title" content="Festival — Hive"/);

  const missing = await fetch(`${base}/share/projects/64b7f0c2a1b2c3d4e5f60000`);
  assert.strictEqual(missing.status, 404);
  assert.strictEqual(missing.headers.get('x-robots-tag'), 'noindex');

  const invalid = await fetch(`${base}/share/projects/pas-un-id`);
  assert.strictEqual(invalid.status, 404);
});
