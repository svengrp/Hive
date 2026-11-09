/* Pièce jointe de la messagerie. Le fichier est stocké ici (comme les photos de profil et les couvertures),
   envoyé avant le message : tant qu'il n'est rattaché à aucun message, expiresAt le fait disparaître
   au bout de 24 h (index TTL). Rattaché, expiresAt est retiré et il vit aussi longtemps que son message. */
const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  uploaderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  messageId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null, index: true },
  name:       { type: String, required: true },
  mime:       { type: String, required: true },
  kind:       { type: String, enum: ['image', 'file'], required: true },
  size:       { type: Number, required: true },
  data:       { type: Buffer, required: true },
  expiresAt:  { type: Date, default: () => new Date(Date.now() + 24 * 3600 * 1000) },
}, { timestamps: true });

attachmentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Le contenu n'est jamais renvoyé en JSON : il ne passe que par la route de téléchargement
const hideData = (_doc, ret) => { delete ret.data; return ret; };
attachmentSchema.set('toJSON', { transform: hideData });
attachmentSchema.set('toObject', { transform: hideData });

module.exports = mongoose.model('MessageAttachment', attachmentSchema);
