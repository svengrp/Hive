const Project        = require('../models/Project');
const Conversation   = require('../models/Conversation');
const Message        = require('../models/Message');
const Notification   = require('../models/Notification');
const User           = require('../models/User');
const { containsProfanity } = require('../utils/profanityFilter');
const ProjectHistory = require('../models/ProjectHistory');
const ProjectRequest = require('../models/ProjectRequest');
const Rating         = require('../models/Rating');
const ProjectCover   = require('../models/ProjectCover');
const { projectsCreatedTotal, projectsClosedTotal } = require('../metric');

// ==============================
// VALIDATION DES DONNÉES PROJET
// ==============================

/* Normalise et valide les données reçues avant création ou mise à jour d'un projet */
function normalizeProjectPayload(body = {}) {
  const startDate = body.projectMeta?.startDate ? new Date(body.projectMeta.startDate) : null;
  const endDate = body.projectMeta?.endDate ? new Date(body.projectMeta.endDate) : null;
  const minAge = body.minAge == null || body.minAge === "" ? null : Number(body.minAge);
  const maxAge = body.maxAge == null || body.maxAge === "" ? null : Number(body.maxAge);

  return {
    title: body.title?.trim(),
    city: body.projectMeta?.city?.trim(),
    country: body.projectMeta?.region?.trim(),
    startDate,
    endDate,
    minAge,
    maxAge,
    coordinates: body.location?.coordinates,
  };
}

function validateProjectPayload(body = {}, options = {}) {
  const { title, city, country, startDate, endDate, minAge, maxAge, coordinates } = normalizeProjectPayload(body);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const allowPastStartDate = options.allowPastStartDate === true;

  if (!title) return 'Le titre est obligatoire.';
  if (!city) return 'La ville est obligatoire.';
  if (!country) return 'Le pays est obligatoire.';
  if (!startDate || Number.isNaN(startDate.getTime())) return 'La date de début est obligatoire.';
  if (!allowPastStartDate && startDate < today) return "La date de début ne peut pas être avant aujourd'hui.";
  if (endDate && Number.isNaN(endDate.getTime())) return 'La date de fin est invalide.';
  if (endDate && endDate <= startDate) return 'La date de fin doit être strictement après la date de début.';
  if (minAge != null && (Number.isNaN(minAge) || minAge < 0)) return "L'âge minimum est invalide.";
  if (maxAge != null && (Number.isNaN(maxAge) || maxAge < 0)) return "L'âge maximum est invalide.";
  if (minAge != null && maxAge != null && maxAge < minAge) return "L'âge maximum doit être supérieur ou égal à l'âge minimum.";
  if (!Array.isArray(coordinates) || coordinates.length !== 2) return 'La localisation du projet est invalide.';
  if (coordinates.some((value) => typeof value !== 'number' || Number.isNaN(value))) return 'La localisation du projet est invalide.';

  return null;
}

/* Seuls les champs du formulaire projet sont modifiables par l'utilisateur.
   Sans cette liste, une requête forgée pouvait réécrire ownerId, participants,
   cached (note moyenne), coverVersion, etc. */
const EDITABLE_FIELDS = ['title', 'description', 'tags', 'requiredSkills', 'langues', 'minAge', 'maxAge', 'maxParticipants', 'visibility'];
const EDITABLE_META_FIELDS = ['startDate', 'endDate', 'repoUrl', 'budget', 'city', 'region'];
const EDITABLE_STATUSES = ['open', 'closed', 'draft'];

function pickEditableProjectFields(body = {}) {
  const picked = {};
  EDITABLE_FIELDS.forEach((field) => {
    if (body[field] !== undefined) picked[field] = body[field];
  });

  if (body.status !== undefined) {
    if (!EDITABLE_STATUSES.includes(body.status)) return { error: 'Statut invalide.' };
    picked.status = body.status;
  }

  if (body.location !== undefined) {
    picked.location = { type: 'Point', coordinates: body.location?.coordinates };
  }

  if (body.projectMeta && typeof body.projectMeta === 'object') {
    picked.projectMeta = {};
    EDITABLE_META_FIELDS.forEach((field) => {
      if (body.projectMeta[field] !== undefined) picked.projectMeta[field] = body.projectMeta[field];
    });
  }

  return { picked };
}

/* ==============================
   ALGORITHME DE RECOMMANDATION
   ============================== */

/**
 * Encode les tags d'un projet en vecteur binaire selon le vocabulaire donné.
 * Chaque dimension correspond à un mot du vocabulaire : 1 si le tag est présent, 0 sinon.
 * Exemple : vocabulary = ["sport","art","tech"], tags = ["sport","tech"] → [1, 0, 1]
 */
function buildVector(tags, vocabulary){
    const safeTags = Array.isArray(tags) ? tags : []; // guard : certains projets n'ont pas de tags
    return vocabulary.map(word => safeTags.includes(word) ? 1 : 0);
}

/**
 * Calcule la similarité cosinus entre deux vecteurs.
 * Formule : cos(θ) = (A · B) / (||A|| × ||B||)
 * Retourne une valeur entre 0 (aucune similarité) et 1 (identiques).
 * Retourne 0 si l'un des vecteurs est nul pour éviter la division par zéro.
 */
function cosinSimilarity(vecA, vecB){
   const dotProduct = vecA.reduce((acc, val, i) => acc + val * vecB[i], 0); // produit scalaire A · B
   const normA = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));  // ||A||
   const normB = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));  // ||B||
   if (normA === 0 || normB === 0) return 0; // projet sans tags → score nul
   return dotProduct / (normA * normB);
}
/* ==============================
   CRUD PROJETS
   ============================== */

// GET /projects — liste des projets avec filtres optionnels (search, q, tags, region, status)
// Sans `limit` : renvoie le tableau complet (utilisé par la carte).
// Avec `limit` : renvoie une page { items, total, page, hasMore } (page Projets).
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MAX_PAGE_SIZE = 48;

exports.getAllProjects = async (req, res) => {
  // Seules les chaînes sont acceptées : `?status[$ne]=x` ne doit pas devenir un opérateur Mongo.
  const str = (value) => (typeof value === 'string' ? value : '');
  const search = str(req.query.search);
  const q = str(req.query.q);
  const tags = str(req.query.tags);
  const region = str(req.query.region);
  const status = str(req.query.status);
  const userId = req.user?.id;
  const conditions = [];

  if (search) conditions.push({ $text: { $search: search } });
  if (tags) conditions.push({ tags: { $in: tags.split(',').filter(Boolean) } });
  if (region) conditions.push({ 'projectMeta.region': region });

  // Recherche partielle (titre, description, thèmes), comme la saisie en direct du front
  const term = q.trim().slice(0, 100);
  if (term) {
    const pattern = new RegExp(escapeRegex(term), 'i');
    conditions.push({ $or: [{ title: pattern }, { description: pattern }, { tags: pattern }] });
  }

  if (status) {
    conditions.push({ status });
  } else if (userId) {
    conditions.push({ $or: [{ status: 'open' }, { ownerId: userId }] });
  } else {
    conditions.push({ status: 'open' });
  }

  const query = conditions.length === 1 ? conditions[0] : { $and: conditions };
  const find = () => Project.find(query)
    .populate('ownerId', 'displayName firstName lastName avatarUrl plan')
    .populate('participants', '_id')
    .sort({ createdAt: -1, _id: -1 });

  if (req.query.limit === undefined) {
    return res.json(await find());
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), MAX_PAGE_SIZE);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

  const [items, total] = await Promise.all([
    find().skip((page - 1) * limit).limit(limit),
    Project.countDocuments(query),
  ]);

  res.json({ items, total, page, hasMore: page * limit < total });
};

// GET /projects/:id — détail d'un projet avec owner et participants populés
exports.getProjectById = async (req, res) => {
  const project = await Project.findById(req.params.id)
    // Vie privée : ville et pays du créateur seulement (jamais la rue ni le code postal)
    .populate('ownerId', 'displayName firstName lastName avatarUrl bio skills languages address.city address.country reputation createdAt plan')
    .populate('participants', 'displayName firstName lastName avatarUrl');

  if (!project) return res.status(404).json({ error: 'Project not found' });

  res.json(project);
};

// GET /projects/mine — projets appartenant à l'utilisateur connecté
exports.getMyProjects = async (req, res) => {
  const projects = await Project.find({ ownerId: req.user.id })
    .sort({ createdAt: -1 });

  res.json(projects);
};

// POST /projects — crée un projet après validation, assigne l'owner depuis le token
exports.createProject = async (req, res) => {
  const { picked, error } = pickEditableProjectFields(req.body);
  if (error) return res.status(400).json({ error });

  const validationError = validateProjectPayload(picked);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  if (containsProfanity(picked.title, picked.description)) {
    return res.status(400).json({ error: 'Le contenu contient des termes inappropriés.' });
  }

  // ownerId vient du jeton ; participants, notes et image ne passent jamais par ici.
  const project = await Project.create({
    ...picked,
    ownerId: req.user.id,
  });

  projectsCreatedTotal.inc();
  res.status(201).json(project);
};

// PUT /projects/:id — mise à jour réservée à l'owner, revalide le payload complet
exports.updateProject = async (req, res) => {
  const project = await Project.findById(req.params.id);

  if (!project) return res.status(404).json({ error: 'Project not found' });

  if (project.ownerId.toString() !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const { picked, error } = pickEditableProjectFields(req.body);
  if (error) return res.status(400).json({ error });

  // Les sous-champs envoyés complètent les métadonnées existantes au lieu de les effacer.
  if (picked.projectMeta) {
    picked.projectMeta = { ...(project.projectMeta?.toObject?.() || project.projectMeta || {}), ...picked.projectMeta };
  }

  const validationError = validateProjectPayload(
    { ...project.toObject(), ...picked },
    { allowPastStartDate: true }
  );
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  if (containsProfanity(picked.title, picked.description)) {
    return res.status(400).json({ error: 'Le contenu contient des termes inappropriés.' });
  }

  Object.assign(project, picked);
  await project.save();

  res.json(project);
};

// DELETE /projects/:id — suppression réservée à l'owner
exports.deleteProject = async (req, res) => {
  const project = await Project.findById(req.params.id);

  if (!project) return res.status(404).json({ error: 'Project not found' });

  if (project.ownerId.toString() !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  await project.deleteOne();
  await ProjectCover.deleteOne({ projectId: project._id });

  res.json({ message: 'Project deleted' });
};

// ==============================
// MÉTADONNÉES (TAGS & RÉGIONS)
// ==============================

// GET /projects/tags — liste tous les tags distincts pour les filtres
// `?popular=N` : les N thèmes les plus utilisés parmi les projets ouverts
exports.getAllTags = async (req, res) => {
  const popular = parseInt(req.query.popular, 10);
  if (popular > 0) {
    const top = await Project.aggregate([
      { $match: { status: 'open' } },
      { $unwind: '$tags' },
      { $match: { tags: { $type: 'string', $ne: '' } } },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: Math.min(popular, 30) },
    ]);
    return res.json(top.map((entry) => entry._id).filter((t) => t.trim()));
  }

  const tags = await Project.distinct('tags');
  res.json(tags.filter(t => t && t.trim()));
};

// GET /projects/regions — liste toutes les régions distinctes pour les filtres
exports.getAllRegions = async (req, res) => {
  const regions = await Project.distinct('projectMeta.region');
  res.json(regions.filter(Boolean));
};

// ==============================
// GESTION DES PARTICIPANTS
// ==============================

// POST /projects/:id/leave — un participant quitte volontairement le projet avec un message optionnel
exports.leaveProject = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = req.user.id;
    const { message } = req.body;

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (project.ownerId.toString() === userId)
      return res.status(403).json({ error: "Le créateur ne peut pas quitter son propre projet" });
    if (!project.participants.map(String).includes(userId))
      return res.status(400).json({ error: "Vous n'êtes pas membre de ce projet" });
    if (project.status !== 'open')
      return res.status(400).json({ error: "Impossible de quitter un projet clôturé" });

    await Project.findByIdAndUpdate(projectId, { $pull: { participants: userId } });

    // Marquer la demande comme expirée pour permettre une re-candidature future
    await ProjectRequest.findOneAndUpdate(
      { projectId, senderId: userId, status: 'accepted' },
      { status: 'expired' }
    );

    const conv = await Conversation.findOne({ projectId });
    if (conv) {
      await Conversation.findByIdAndUpdate(conv._id, { $pull: { participants: userId } });

      const leavingUser = await User.findById(userId).select('displayName firstName lastName');
      const userName = leavingUser?.displayName ||
        [leavingUser?.firstName, leavingUser?.lastName].filter(Boolean).join(' ') || 'Un membre';
      const leaveContent = message?.trim()
        ? `${userName} a quitté le projet. Message : "${message.trim()}"`
        : `${userName} a quitté le projet.`;

      const sysMsg = await Message.create({
        conversationId: conv._id,
        senderId: userId,
        content: leaveContent,
        isSystem: true,
        readBy: [userId],
      });

      const io = req.app.get('io');
      if (io) {
        const populated = await Message.findById(sysMsg._id)
          .populate('senderId', 'displayName firstName lastName avatarUrl _id');
        conv.participants.forEach(uid => {
          if (uid.toString() !== userId) {
            io.to(`user:${uid}`).emit('new_group_message', {
              conversationId: conv._id.toString(),
              message: populated,
            });
          }
        });
        io.to(`user:${userId}`).emit('conversation_updated');
      }
    }

    return res.json({ message: 'Vous avez quitté le projet' });
  } catch (err) {
    console.error('leaveProject error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};

// DELETE /projects/:id/participants/:userId — kick par l'owner avec raison + note
exports.kickParticipant = async (req, res) => {
  try {
    const { id: projectId, userId: targetId } = req.params;
    const { reason, rating } = req.body;

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (project.ownerId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Non autorisé' });
    }
    if (!project.participants.map(String).includes(targetId)) {
      return res.status(404).json({ error: 'Participant introuvable' });
    }

    // Retirer du projet
    await Project.findByIdAndUpdate(projectId, { $pull: { participants: targetId } });

    // Marquer la demande comme kicked pour que le frontend affiche le bon état
    await ProjectRequest.findOneAndUpdate(
      { projectId, senderId: targetId, status: 'accepted' },
      { status: 'kicked' }
    );

    // Retirer de la conversation de groupe
    const conv = await Conversation.findOne({ projectId });
    if (conv) {
      await Conversation.findByIdAndUpdate(conv._id, { $pull: { participants: targetId } });

      // Message système visible par tous
      const owner = await User.findById(req.user.id).select('displayName firstName lastName');
      const ownerName = owner?.displayName || [owner?.firstName, owner?.lastName].filter(Boolean).join(' ') || 'L\'owner';
      const kicked = await User.findById(targetId).select('displayName firstName lastName');
      const kickedName = kicked?.displayName || [kicked?.firstName, kicked?.lastName].filter(Boolean).join(' ') || 'Un membre';

      const sysMsg = await Message.create({
        conversationId: conv._id,
        senderId: req.user.id,
        content: `${kickedName} a été retiré du projet par ${ownerName}.${reason ? ` Raison : "${reason}"` : ''}`,
        isSystem: true,
        readBy: [req.user.id],
      });

      const io = req.app.get('io');
      if (io) {
        const populated = await Message.findById(sysMsg._id).populate('senderId', 'displayName firstName lastName avatarUrl _id');
        conv.participants.forEach(uid => {
          if (uid.toString() !== targetId) {
            io.to(`user:${uid}`).emit('new_group_message', { conversationId: conv._id.toString(), message: populated });
          }
        });
        // Forcer le rechargement côté kicked
        io.to(`user:${targetId}`).emit('conversation_updated');
        io.to(`user:${targetId}`).emit('kicked_from_project', { projectId, projectTitle: project.title });
      }
    }

    // Appliquer la note si fournie
    if (rating && rating >= 1 && rating <= 5) {
      const kicked = await User.findById(targetId);
      if (kicked) {
        const prev = kicked.reputation || { score: 0, votes: 0 };
        const newVotes = prev.votes + 1;
        const newScore = ((prev.score * prev.votes) + Number(rating)) / newVotes;
        await User.findByIdAndUpdate(targetId, {
          'reputation.score': Math.round(newScore * 10) / 10,
          'reputation.votes': newVotes,
        });
        await Rating.create({
          targetType: 'user',
          targetId,
          raterId: req.user.id,
          projectId,
          score: Number(rating),
          comment: reason || '',
        });
      }
    }

    // Notification pour le participant retiré
    const notif = await Notification.create({
      userId: targetId,
      type: 'kicked',
      message: `Vous avez été retiré du projet "${project.title}".${reason ? ` Raison : ${reason}` : ''}`,
      meta:  { projectTitle: project.title, reason: reason || '' },
      link: `/projects/${projectId}`,
    });

    const io = req.app.get('io');
    if (io) io.to(`user:${targetId}`).emit('new_notification', notif);

    return res.json({ message: 'Participant retiré' });
  } catch (err) {
    console.error('kickParticipant error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};
// ==============================
// CLÔTURE & NOTATION
// ==============================

// POST /projects/:id/close — l'owner clôture le projet
exports.closeProject = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const ownerId = req.user.id;

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (project.ownerId.toString() !== ownerId) return res.status(403).json({ error: 'Non autorisé' });
    if (project.status === 'closed') return res.status(400).json({ error: 'Projet déjà clôturé' });

    project.status = 'closed';
    project.projectMeta.endDate = new Date();
    await project.save();

    projectsClosedTotal.inc();
    return res.json({ message: 'Projet clôturé' });
  } catch (err) {
    console.error('closeProject error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};

// POST /projects/:id/rate — noter un autre participant (projet clôturé uniquement)
exports.rateParticipant = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const raterId = req.user.id;
    const { targetId, score, comment } = req.body;

    if (!score || score < 1 || score > 5) return res.status(400).json({ error: 'Score invalide (1-5)' });
    if (targetId === raterId) return res.status(400).json({ error: 'Vous ne pouvez pas vous noter vous-même' });

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    if (project.status !== 'closed') return res.status(400).json({ error: 'Le projet doit être clôturé pour noter' });

    const memberIds = project.participants.map(m => m.toString());
    if (!memberIds.includes(raterId) && project.ownerId.toString() !== raterId)
      return res.status(403).json({ error: 'Vous ne faites pas partie de ce projet' });
    if (!memberIds.includes(targetId) && project.ownerId.toString() !== targetId)
      return res.status(404).json({ error: 'Participant introuvable dans ce projet' });

    const existing = await Rating.findOne({ projectId, raterId, targetId });
    if (existing) return res.status(400).json({ error: 'Vous avez déjà noté ce participant pour ce projet' });

    const target = await User.findById(targetId);
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const prev = target.reputation || { score: 0, votes: 0 };
    const newVotes = prev.votes + 1;
    const newScore = ((prev.score * prev.votes) + Number(score)) / newVotes;
    await User.findByIdAndUpdate(targetId, {
      'reputation.score': Math.round(newScore * 10) / 10,
      'reputation.votes': newVotes,
    });

    const rating = await Rating.create({
      targetType: 'user',
      targetId,
      raterId,
      projectId,
      score: Number(score),
      comment: comment || '',
    });

    const rater = await User.findById(raterId).select('displayName firstName lastName');
    const raterName = rater?.displayName || [rater?.firstName, rater?.lastName].filter(Boolean).join(' ') || 'Un membre';
    const notif = await Notification.create({
      userId: targetId,
      type: 'rated',
      message: `${raterName} vous a attribué une note de ${score}/5 pour le projet "${project.title}".`,
      meta: { projectTitle: project.title, score: Number(score), raterName },
      link: '/profile',
    });
    const io = req.app.get('io');
    if (io) io.to(`user:${targetId}`).emit('new_notification', notif);

    return res.status(201).json(rating);
  } catch (err) {
    console.error('rateParticipant error:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ==============================
// HISTORIQUE & RECOMMANDATIONS
// ==============================

// POST /projects/:id/view — enregistre une vue dans l'historique pour alimenter les recommandations
exports.recordView = async(req, res) => {
    try{
       const project = await Project.findById(req.params.id)
       if (!project) return res.status(404).json({ error: 'Project not found' });

       // Crée une entrée dans ProjectHistory (userId + projectId + viewedAt automatique)
       await ProjectHistory.create({
        userId:    req.user.id,
        projectId: req.params.id
       });

       return res.status(201).json({ ok: true })
    }
    catch(err){
      return res.status(500).json({ error: 'Erreur serveur' });
    }
}

// GET /projects/boosted — projets mis en avant en ce moment (emplacement dédié de la page Projets)
exports.getBoosted = async (_req, res) => {
    try {
        const projects = await Project.find({ boostedUntil: { $gt: new Date() }, status: 'open', visibility: { $ne: 'private' } })
            .sort({ boostedUntil: -1 })
            .limit(6)
            .populate('ownerId', 'displayName firstName lastName avatarUrl plan')
            .populate('participants', '_id');
        return res.json(projects);
    } catch (err) {
        return res.status(500).json({ error: 'Erreur serveur' });
    }
};

// GET /projects/:id/stats — vues et demandes (propriétaire ; détail réservé à Hive+)
exports.getStats = async (req, res) => {
    try {
        const project = await Project.findById(req.params.id).select('ownerId boostedUntil');
        if (!project) return res.status(404).json({ error: 'Projet introuvable' });
        if (String(project.ownerId) !== req.user.id) return res.status(403).json({ error: 'Non autorisé' });
        const owner = await User.findById(req.user.id).select('plan');
        if (owner?.plan !== 'plus') return res.json({ locked: true });

        const since = (days) => new Date(Date.now() - days * 86400000);
        const [views7, views30, viewers30, requests30, accepted30] = await Promise.all([
            ProjectHistory.countDocuments({ projectId: project._id, viewedAt: { $gte: since(7) } }),
            ProjectHistory.countDocuments({ projectId: project._id, viewedAt: { $gte: since(30) } }),
            ProjectHistory.distinct('userId', { projectId: project._id, viewedAt: { $gte: since(30) } }),
            ProjectRequest.countDocuments({ projectId: project._id, createdAt: { $gte: since(30) } }),
            ProjectRequest.countDocuments({ projectId: project._id, status: 'accepted', updatedAt: { $gte: since(30) } }),
        ]);
        return res.json({
            locked: false,
            views7,
            views30,
            uniqueViewers30: viewers30.length,
            requests30,
            accepted30,
            boostedUntil: project.boostedUntil,
        });
    } catch (err) {
        return res.status(500).json({ error: 'Erreur serveur' });
    }
};

// GET /projects/recommended — retourne jusqu'à 10 projets recommandés par similarité cosinus
exports.getRecommended = async(req, res) => {
    try {
        //  on ne retient que les 10 dernières vues
        const history = await ProjectHistory.find({ userId: req.user.id }).sort({ viewedAt: -1 }).limit(10);

        // Cold start : aucune vue → section masquée côté frontend
        if (history.length === 0) {
            return res.json([]);
        }

        // Cold start partiel : moins de 3 vues → projets récents sans score
        if (history.length < 3) {
            const recent = await Project.find().sort({ createdAt: -1 }).limit(6).populate('ownerId', 'displayName firstName lastName avatarUrl plan');
            return res.json(recent.map(p => ({ project: p, score: null })));
        }

        // Récupère les projets déjà vus pour en extraire les tags
        const projectIds = history.map(entry => entry.projectId);
        const viewedProjects = await Project.find({_id: { $in: projectIds}});

        // Construit le profil implicite : fréquence de chaque tag dans l'historique
        const allTags = viewedProjects.flatMap(project => project.tags)
        const tagFrequency = allTags.reduce((acc, tag) => {
            acc[tag] = (acc[tag] || 0) + 1;
            return acc;
        }, {})

        // Le vocabulaire = liste des tags uniques vus ; le vecteur profil = leurs fréquences
        const vocabulary = Object.keys(tagFrequency);
        const profileVector = vocabulary.map(word => tagFrequency[word]);

        // Candidats : projets non vus et non créés par l'utilisateur
        const candidates = await Project.find({_id: {$nin: projectIds} , ownerId: {$ne: req.user.id}}).populate('ownerId', 'displayName firstName lastName avatarUrl plan');

        // Calcule le score cosinus de chaque candidat par rapport au profil
        const scored = candidates.map(entry => {
            const vec = buildVector(entry.tags, vocabulary);
            const score = cosinSimilarity(profileVector, vec);
            return { project: entry, score};
        });

        // Trie par score décroissant et retourne le top 10
        const sorted = scored.sort((a,b) => b.score - a.score).slice(0, 10);
        return res.json(sorted);
    }
    catch(err){
        return res.status(500).json({ error: 'Erreur serveur'});
    }
}
