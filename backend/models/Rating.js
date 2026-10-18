/* Notation attribuée entre participants après clôture d'un projet.
   targetType utilise refPath pour une référence polymorphique (user ou project).
   L'unicité rater/cible/projet est garantie par un index unique. */
const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  targetType: { type: String, enum: ['user', 'project'], required: true },
  targetId:   { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'targetType' },
  raterId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  projectId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  score:      { type: Number, required: true, min: 1, max: 5 },
  comment:    { type: String, default: '' },
  createdAt:  { type: Date, default: Date.now },
});

// Une seule note par auteur, cible et projet : garantie par la base, même pour deux envois simultanés
ratingSchema.index({ projectId: 1, raterId: 1, targetId: 1 }, { unique: true });
ratingSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

module.exports = mongoose.model('Rating', ratingSchema);
