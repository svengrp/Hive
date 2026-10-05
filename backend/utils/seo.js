/* SEO : sitemap.xml et pages d'aperçu pour les robots de partage (LinkedIn, WhatsApp, Facebook…).
   Ces robots n'exécutent pas le JavaScript de l'application React : nginx leur envoie
   /api/seo/share/projects/:id, une page minimale avec les balises Open Graph du projet.
   Titres et descriptions viennent des utilisateurs : tout est échappé. */

const DESCRIPTION_MAX = 160;
const SHAREABLE_COVER_TYPES = ['image/jpeg', 'image/png']; // WebP mal pris en charge par LinkedIn
const STATIC_PAGES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/projects', changefreq: 'hourly', priority: '0.9' },
  { path: '/abonnement', changefreq: 'monthly', priority: '0.5' },
];

/* Projets indexables : ouverts et publics (même règle que le noindex côté frontend) */
const PUBLIC_PROJECT_FILTER = { status: 'open', visibility: 'public' };

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

const trimSlash = (url) => String(url || '').replace(/\/+$/, '');

function toMetaDescription(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= DESCRIPTION_MAX) return clean;
  const cut = clean.slice(0, DESCRIPTION_MAX - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > 80 ? cut.slice(0, lastSpace) : cut}…`;
}

/* projects : [{ _id, updatedAt }] */
function buildSitemap(frontUrl, projects) {
  const base = trimSlash(frontUrl);
  const urls = [
    ...STATIC_PAGES.map((p) => `  <url><loc>${escape(base + p.path)}</loc><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`),
    ...projects.map((p) => {
      const lastmod = p.updatedAt ? `<lastmod>${new Date(p.updatedAt).toISOString().slice(0, 10)}</lastmod>` : '';
      return `  <url><loc>${escape(`${base}/projects/${p._id}`)}</loc>${lastmod}<changefreq>weekly</changefreq><priority>0.7</priority></url>`;
    }),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/* project : { _id, title, description, coverVersion } ; coverType : type MIME de la couverture ou null */
function buildShareHtml({ frontUrl, backendUrl, project, coverType }) {
  const front = trimSlash(frontUrl);
  const url = `${front}/projects/${project._id}`;
  const title = `${project.title} — Hive`;
  const description = toMetaDescription(project.description)
    || 'Rejoins ce projet sur Hive : trouve les bonnes personnes pour faire naître ton projet.';
  const image = project.coverVersion && SHAREABLE_COVER_TYPES.includes(coverType)
    ? `${trimSlash(backendUrl)}/api/projects/${project._id}/cover?size=full&v=${project.coverVersion}`
    : `${front}/og-image.png`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<link rel="canonical" href="${escape(url)}">
<meta property="og:site_name" content="Hive">
<meta property="og:type" content="website">
<meta property="og:locale" content="fr_CH">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:url" content="${escape(url)}">
<meta property="og:image" content="${escape(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(title)}">
<meta name="twitter:description" content="${escape(description)}">
<meta name="twitter:image" content="${escape(image)}">
<meta http-equiv="refresh" content="0; url=${escape(url)}">
</head>
<body>
<h1>${escape(project.title)}</h1>
<p>${escape(description)}</p>
<p><a href="${escape(url)}">Voir le projet sur Hive</a></p>
</body>
</html>
`;
}

module.exports = { PUBLIC_PROJECT_FILTER, buildSitemap, buildShareHtml, toMetaDescription, escape };
