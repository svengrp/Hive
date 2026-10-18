/* Photos de profil : stockage hors du document User et service par URL versionnée.
   Le navigateur réduit l'image avant l'envoi (frontend/src/lib/avatar.js) ; ici on vérifie le format
   réel (signature binaire) et la taille, puis on garde l'image dans UserAvatar.
   Le profil ne porte plus qu'avatarVersion : le front en déduit /api/user/:id/avatar?v=… */
const mongoose = require('mongoose');
const User = require('../models/User');
const UserAvatar = require('../models/UserAvatar');

const MAX_BYTES = 200 * 1024;
const DATA_URL = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/;
const LEGACY_DATA_URL = /^data:(image\/(?:webp|jpeg|png|gif));base64,([A-Za-z0-9+/=]+)$/;

function matchesSignature(buffer, contentType) {
  if (contentType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (contentType === 'image/webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (contentType === 'image/gif') return buffer.subarray(0, 4).toString('ascii') === 'GIF8';
  return false;
}

/* data URL → { buffer, contentType } ou { error } */
function decodeAvatar(dataUrl, { maxBytes = MAX_BYTES, legacy = false } = {}) {
  const match = typeof dataUrl === 'string' ? (legacy ? LEGACY_DATA_URL : DATA_URL).exec(dataUrl) : null;
  if (!match) return { error: 'Format de photo non pris en charge (PNG, JPEG ou WebP).' };
  const [, contentType, base64] = match;
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) return { error: 'Photo vide.' };
  if (buffer.length > maxBytes) return { error: 'Photo trop lourde (200 Ko au maximum après réduction).' };
  if (!matchesSignature(buffer, contentType)) return { error: 'Le fichier ne correspond pas au format annoncé.' };
  return { buffer, contentType };
}

/* Enregistre la photo et renvoie la nouvelle version (horodatage) */
async function storeAvatar(userId, { buffer, contentType }) {
  await UserAvatar.findOneAndUpdate(
    { userId },
    { data: buffer, contentType },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return Date.now();
}

const removeAvatar = (userId) => UserAvatar.deleteOne({ userId });

// GET /api/user/:id/avatar?v=… — public, mis en cache (la version est dans l'URL)
async function serveAvatar(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Photo introuvable' });
  const avatar = await UserAvatar.findOne({ userId: req.params.id }).select('data contentType').lean();
  if (!avatar) return res.status(404).json({ message: 'Photo introuvable' });
  res.set({
    'Content-Type': avatar.contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  const data = avatar.data;
  return res.send(Buffer.isBuffer(data) ? data : Buffer.from(data.buffer));
}

/* Migration (idempotente, au démarrage) : les anciennes photos enregistrées en data URL dans le profil
   passent dans UserAvatar. Une photo illisible est simplement retirée (les initiales s'affichent). */
async function migrateInlineAvatars() {
  const cursor = User.find({ avatarUrl: /^data:/ }).select('avatarUrl').lean().cursor();
  let moved = 0;
  for await (const user of cursor) {
    const decoded = decodeAvatar(user.avatarUrl, { maxBytes: 15 * 1024 * 1024, legacy: true });
    const update = { avatarUrl: '', avatarVersion: null };
    if (!decoded.error) update.avatarVersion = await storeAvatar(user._id, decoded);
    await User.updateOne({ _id: user._id }, { $set: update });
    moved += 1;
  }
  if (moved) console.log(`[avatars] ${moved} photo(s) de profil déplacée(s) hors des profils`);
}

module.exports = { decodeAvatar, storeAvatar, removeAvatar, serveAvatar, migrateInlineAvatars };
