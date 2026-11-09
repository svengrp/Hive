/* Bannière et CV du profil, stockés à part du document User (comme UserAvatar) pour que le profil,
   recopié dans les projets et les messages, reste léger. Un document par personne et par sorte.
   - banner : image déjà recadrée et compressée par le navigateur, servie publiquement (URL versionnée)
   - cv     : PDF, téléchargeable seulement par les membres connectés */
const mongoose = require('mongoose');

const userMediaSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind:        { type: String, enum: ['banner', 'cv'], required: true },
  data:        { type: Buffer, required: true },
  contentType: { type: String, required: true },
  name:        { type: String, default: '' },
}, { timestamps: true });

userMediaSchema.index({ userId: 1, kind: 1 }, { unique: true });

module.exports = mongoose.model('UserMedia', userMediaSchema);
