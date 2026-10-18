/* Demande d'adhésion à un projet. Expire automatiquement après 7 jours si non traitée.
   projectOwnerId est dénormalisé pour éviter une jointure lors de la vérification des droits de l'owner. */
const { Schema, model, Types } = require('mongoose');

const projectRequestSchema = new Schema({
  projectId:      { type: Types.ObjectId, ref: 'Project', required: true, index: true },
  projectOwnerId: { type: Types.ObjectId, ref: 'User', required: true },
  senderId:       { type: Types.ObjectId, ref: 'User', required: true },
  message:        { type: String, maxlength: 500, default: '' },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'expired', 'kicked'],
    default: 'pending',
    index: true,
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  },
}, { timestamps: true });

projectRequestSchema.index({ projectId: 1, senderId: 1, createdAt: -1 });

module.exports = model('ProjectRequest', projectRequestSchema);
