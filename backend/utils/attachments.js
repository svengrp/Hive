/* Pièces jointes de la messagerie : types acceptés (vérifiés sur le contenu, pas seulement sur le nom),
   limites, et rattachement à un message envoyé. */
const mongoose = require('mongoose');
const MessageAttachment = require('../models/MessageAttachment');

const MAX_SIZE = 5 * 1024 * 1024;        // 5 Mo par fichier
const MAX_PER_MESSAGE = 4;
// La base gratuite (Atlas M0) fait 512 Mo : chaque compte garde au plus 50 Mo de pièces jointes
const USER_QUOTA = 50 * 1024 * 1024;

const startsWith = (buf, bytes, offset = 0) => bytes.every((b, i) => buf[offset + i] === b);
const isZip = (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]);
const isText = (b) => !b.subarray(0, 4096).includes(0);

/* Type → contrôle du contenu. Pas de SVG ni de HTML (scripts), pas d'exécutables. */
const TYPES = {
  'image/jpeg': { kind: 'image', check: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  'image/png':  { kind: 'image', check: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]) },
  'image/gif':  { kind: 'image', check: (b) => startsWith(b, [0x47, 0x49, 0x46, 0x38]) },
  'image/webp': { kind: 'image', check: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8) },
  'application/pdf': { kind: 'file', check: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]) },
  'application/zip': { kind: 'file', check: isZip },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { kind: 'file', check: isZip },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { kind: 'file', check: isZip },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { kind: 'file', check: isZip },
  'text/plain': { kind: 'file', check: isText },
  'text/csv':   { kind: 'file', check: isText },
};

// Le navigateur envoie parfois un type vide ou générique : on le déduit de l'extension
const BY_EXTENSION = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  pdf: 'application/pdf', zip: 'application/zip', txt: 'text/plain', csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function cleanName(raw) {
  let name = '';
  try { name = decodeURIComponent(String(raw || '')); } catch { name = String(raw || ''); }
  name = name.replace(/[\u0000-\u001f\u007f/\\]/g, '').trim().slice(-120);
  return name || 'fichier';
}

/* Renvoie { name, mime, kind } ou { error } */
function identify(buffer, rawName, rawMime) {
  const name = cleanName(rawName);
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  let mime = String(rawMime || '').split(';')[0].trim().toLowerCase();
  if (!TYPES[mime]) mime = BY_EXTENSION[ext] || mime;
  const type = TYPES[mime];
  if (!type) return { error: 'Type de fichier non accepté (images, PDF, Word, Excel, PowerPoint, texte ou ZIP).' };
  if (!type.check(buffer)) return { error: 'Le contenu du fichier ne correspond pas à son type.' };
  return { name, mime, kind: type.kind };
}

/* Vérifie et réserve les pièces jointes d'un message (envoyées juste avant par la même personne, pas encore utilisées).
   Renvoie la liste à copier dans le message, ou { error }. */
async function claimAttachments(ids, uploaderId) {
  if (ids === undefined || ids === null) return [];
  if (!Array.isArray(ids)) return { error: 'Pièces jointes invalides.' };
  const unique = [...new Set(ids.map(String))];
  if (unique.length > MAX_PER_MESSAGE) return { error: `${MAX_PER_MESSAGE} pièces jointes au maximum par message.` };
  if (unique.some((id) => !mongoose.isValidObjectId(id) || !/^[a-f0-9]{24}$/i.test(id))) return { error: 'Pièces jointes invalides.' };
  if (!unique.length) return [];
  const docs = await MessageAttachment.find({ _id: { $in: unique }, uploaderId, messageId: null }).select('-data').lean();
  if (docs.length !== unique.length) return { error: 'Une pièce jointe a expiré : ajoute-la à nouveau.' };
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  return unique.map((id) => {
    const d = byId.get(id);
    return { _id: d._id, name: d.name, mime: d.mime, kind: d.kind, size: d.size };
  });
}

/* Une fois le message créé : les pièces jointes lui appartiennent et n'expirent plus. */
async function attachToMessage(list, messageId) {
  if (!list.length) return;
  await MessageAttachment.updateMany({ _id: { $in: list.map((a) => a._id) } }, { $set: { messageId }, $unset: { expiresAt: 1 } });
}

const deleteForMessages = (messageIds) =>
  messageIds.length ? MessageAttachment.deleteMany({ messageId: { $in: messageIds } }) : Promise.resolve();

module.exports = { MAX_SIZE, MAX_PER_MESSAGE, USER_QUOTA, identify, claimAttachments, attachToMessage, deleteForMessages };
