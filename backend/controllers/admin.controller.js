const User = require('../models/User');
const Project = require('../models/Project');
const { deleteUserAccount } = require('../utils/accountDeletion');

const SENSITIVE_FIELDS = '-passwordHash -resetCodeHash -resetCodeExpire -emailVerificationCodeHash -emailVerificationExpire';

// ==============================
// GESTION DES UTILISATEURS
// ==============================

// GET /admin/users — liste tous les utilisateurs sans les champs sensibles
exports.getUsers = async (_req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 }).select(SENSITIVE_FIELDS);
    return res.status(200).json(users);
  } catch (err) {
    console.error('Admin getUsers error:', err);
    return res.status(500).json({ message: 'Erreur lors du chargement des utilisateurs' });
  }
};

// DELETE /admin/users/:id — supprime un utilisateur (interdit sur les admins)
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });
    if (user.role === 'admin') return res.status(403).json({ message: 'Impossible de supprimer un administrateur' });
    // Même effacement complet que la suppression par la personne elle-même (LPD / RGPD)
    await deleteUserAccount(user);
    return res.status(200).json({ message: 'Utilisateur supprimé' });
  } catch (err) {
    console.error('Admin deleteUser error:', err);
    return res.status(500).json({ message: 'Erreur lors de la suppression' });
  }
};

// PUT /admin/users/:id/role — change le rôle d'un utilisateur (user | admin)
exports.changeRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) return res.status(400).json({ message: 'Rôle invalide' });
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select(SENSITIVE_FIELDS);
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });
    return res.status(200).json(user);
  } catch (err) {
    console.error('Admin changeRole error:', err);
    return res.status(500).json({ message: 'Erreur lors du changement de rôle' });
  }
};

// ==============================
// GESTION DES PROJETS
// ==============================

// GET /admin/projects — liste tous les projets avec owner populé
exports.getProjects = async (_req, res) => {
  try {
    const projects = await Project.find({})
      .populate('ownerId', 'displayName firstName lastName email')
      .sort({ createdAt: -1 });
    return res.status(200).json(projects);
  } catch (err) {
    console.error('Admin getProjects error:', err);
    return res.status(500).json({ message: 'Erreur lors du chargement des projets' });
  }
};

// DELETE /admin/projects/:id — supprime n'importe quel projet (droits admin)
exports.deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Projet introuvable' });
    await project.deleteOne();
    return res.status(200).json({ message: 'Projet supprimé' });
  } catch (err) {
    console.error('Admin deleteProject error:', err);
    return res.status(500).json({ message: 'Erreur lors de la suppression' });
  }
};
