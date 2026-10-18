/* Notifications persistées pour l'utilisateur (demande acceptée/refusée, expulsion, nouveau membre, notation).
   Le champ meta est libre (Mixed) pour transporter des données contextuelles sans schéma rigide. */
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:      { type: String, enum: ['request_accepted', 'request_declined', 'kicked', 'new_member', 'rated', 'invitation', 'invitation_accepted'], required: true },
  message:   { type: String, required: true },
  meta:      { type: mongoose.Schema.Types.Mixed, default: {} },
  link:      { type: String, default: '' },
  read:      { type: Boolean, default: false },
}, { timestamps: true });

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
