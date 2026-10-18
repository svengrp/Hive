/* Photo de profil envoyée par la personne, stockée à part du document User (comme ProjectCover) :
   le profil est recopié dans chaque projet, message et notification, il doit rester léger.
   Servie par GET /api/user/:id/avatar?v=<avatarVersion> (voir utils/avatars.js). */
const mongoose = require('mongoose');

const userAvatarSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  data:        { type: Buffer, required: true },
  contentType: { type: String, enum: ['image/webp', 'image/jpeg', 'image/png', 'image/gif'], required: true },
}, { timestamps: true });

module.exports = mongoose.model('UserAvatar', userAvatarSchema);
