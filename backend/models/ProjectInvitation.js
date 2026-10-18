/* Invitation envoyée par le créateur d'un projet (membre Hive+) à une personne trouvée dans la recherche
   de talents. La personne accepte (elle rejoint le projet et son groupe) ou refuse.
   Une seule invitation en attente par projet et par personne (index unique partiel). */
const { Schema, model, Types } = require('mongoose');

const projectInvitationSchema = new Schema({
  projectId: { type: Types.ObjectId, ref: 'Project', required: true, index: true },
  inviterId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  inviteeId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  message: { type: String, maxlength: 300, default: '' },
  status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending', index: true },
}, { timestamps: true });

projectInvitationSchema.index(
  { projectId: 1, inviteeId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

module.exports = model('ProjectInvitation', projectInvitationSchema);
