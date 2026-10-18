/* Gabarit commun des emails Hive : charte graphite + bleu du site (frontend/src/App.css, thème clair),
   mise en page en tableaux (Outlook, Gmail, Apple Mail), version texte jointe.
   Tout texte venant d'un utilisateur DOIT passer par escapeHtml (noms, titres, messages). */
const COLORS = {
  page: '#f6f7f9',
  card: '#ffffff',
  border: '#e3e6eb',
  soft: '#f0f2f5',
  ink: '#16181d',
  muted: '#5d6470',
  accent: '#2459d6',
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const escapeHtml = (text) => String(text ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const front = () => (process.env.FRONT_URL || 'https://hive-app.ch').replace(/\/+$/, '');

/**
 * @param {object} opts
 * @param {string} opts.preheader  aperçu affiché dans la liste des emails (texte brut)
 * @param {string} opts.heading    titre (texte brut)
 * @param {string[]} opts.paragraphs  paragraphes en HTML déjà échappé
 * @param {string} [opts.code]     code à 6 chiffres mis en avant
 * @param {string} [opts.quote]    extrait cité (texte brut, échappé ici)
 * @param {{url: string, label: string}} [opts.cta]  bouton principal
 * @param {string} [opts.note]     petite note sous le contenu (texte brut)
 * @param {string} [opts.footer]   pied de page en HTML déjà échappé
 * @param {string} opts.text       version texte complète
 */
function renderEmail({ preheader, heading, paragraphs = [], code, quote, cta, note, footer, text }) {
  const p = (html) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${COLORS.ink}">${html}</p>`;
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.page};font-family:${FONT}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page};padding:32px 12px">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
    <tr><td style="padding:0 4px 16px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:10px"><img src="${front()}/logo192.png" width="28" height="28" alt="" style="display:block;border-radius:7px"></td>
      <td style="font-size:20px;font-weight:700;letter-spacing:-0.3px;color:${COLORS.ink}">Hive</td>
    </tr></table></td></tr>
    <tr><td style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:12px;padding:28px 28px 24px">
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;font-weight:650;color:${COLORS.ink}">${escapeHtml(heading)}</h1>
      ${paragraphs.map(p).join('\n      ')}
      ${code ? `<div style="margin:6px 0 18px;padding:14px 0;background:${COLORS.soft};border-radius:10px;text-align:center;font-size:30px;font-weight:700;letter-spacing:8px;color:${COLORS.ink};font-family:'SF Mono',Menlo,Consolas,monospace">${escapeHtml(code)}</div>` : ''}
      ${quote ? `<div style="margin:4px 0 20px;padding:12px 16px;background:${COLORS.soft};border:1px solid ${COLORS.border};border-radius:8px;font-size:15px;line-height:1.5;color:${COLORS.ink};white-space:pre-wrap;word-break:break-word">${escapeHtml(quote)}</div>` : ''}
      ${cta ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 4px"><tr><td style="background:${COLORS.accent};border-radius:8px"><a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">${escapeHtml(cta.label)}</a></td></tr></table>` : ''}
      ${note ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:${COLORS.muted}">${escapeHtml(note)}</p>` : ''}
    </td></tr>
    <tr><td style="padding:16px 4px 0;font-size:12px;line-height:1.5;color:${COLORS.muted}">
      ${footer ? `${footer}<br>` : ''}Hive · <a href="${front()}" style="color:${COLORS.muted}">hive-app.ch</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
  return { html, text: `${text}\n\n— Hive · ${front()}` };
}

module.exports = { renderEmail, escapeHtml, front, COLORS };
