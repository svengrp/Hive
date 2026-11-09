/* Bannière et CV du profil (voir models/UserMedia.js). */
const mongoose = require('mongoose');
const User = require('../models/User');
const UserMedia = require('../models/UserMedia');
const { decodeAvatar } = require('../utils/avatars');

const BANNER_MAX = 600 * 1024;          // après recadrage et compression par le navigateur
const CV_MAX = 5 * 1024 * 1024;

const me = (req) => req.user.id || req.user._id;

// PUT /user/banner — body { image: data URL (WebP, JPEG ou PNG) }
exports.uploadBanner = async (req, res) => {
  try {
    const image = decodeAvatar(req.body?.image, { maxBytes: BANNER_MAX });
    if (image.error) return res.status(400).json({ message: image.error.replace('Photo', 'Image').replace('200 Ko', '600 Ko') });
    await UserMedia.findOneAndUpdate(
      { userId: me(req), kind: 'banner' },
      { data: image.buffer, contentType: image.contentType },
      { upsert: true, setDefaultsOnInsert: true },
    );
    const user = await User.findByIdAndUpdate(me(req), { bannerVersion: Date.now() }, { new: true }).select('bannerVersion');
    return res.json({ bannerVersion: user.bannerVersion });
  } catch (err) {
    console.error('Upload banner error:', err);
    return res.status(500).json({ message: 'Enregistrement de la bannière impossible.' });
  }
};

exports.removeBanner = async (req, res) => {
  await UserMedia.deleteOne({ userId: me(req), kind: 'banner' });
  await User.updateOne({ _id: me(req) }, { bannerVersion: null });
  return res.json({ bannerVersion: null });
};

// GET /user/:id/banner?v=… — public, mis en cache (la version est dans l'URL)
exports.serveBanner = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Image introuvable' });
  const media = await UserMedia.findOne({ userId: req.params.id, kind: 'banner' }).select('data contentType').lean();
  if (!media) return res.status(404).json({ message: 'Image introuvable' });
  res.set({
    'Content-Type': media.contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  return res.send(Buffer.isBuffer(media.data) ? media.data : Buffer.from(media.data.buffer));
};

// PUT /user/cv — PDF brut (corps de la requête), nom dans X-File-Name
exports.uploadCv = async (req, res) => {
  try {
    const buffer = Buffer.isBuffer(req.body) ? req.body : null;
    if (!buffer || !buffer.length) return res.status(400).json({ message: 'Fichier vide.' });
    if (buffer.length > CV_MAX) return res.status(413).json({ message: 'CV trop lourd (5 Mo au maximum).' });
    if (buffer.subarray(0, 4).toString('ascii') !== '%PDF') return res.status(400).json({ message: 'Le CV doit être un PDF.' });
    let name = '';
    try { name = decodeURIComponent(req.get('x-file-name') || ''); } catch { name = ''; }
    name = name.replace(/[\u0000-\u001f\u007f/\\]/g, '').trim().slice(-120) || 'CV.pdf';
    if (!/\.pdf$/i.test(name)) name += '.pdf';
    await UserMedia.findOneAndUpdate(
      { userId: me(req), kind: 'cv' },
      { data: buffer, contentType: 'application/pdf', name },
      { upsert: true, setDefaultsOnInsert: true },
    );
    const cv = { name, size: buffer.length, updatedAt: new Date() };
    await User.updateOne({ _id: me(req) }, { cv });
    return res.json({ cv });
  } catch (err) {
    console.error('Upload CV error:', err);
    return res.status(500).json({ message: 'Enregistrement du CV impossible.' });
  }
};

exports.removeCv = async (req, res) => {
  await UserMedia.deleteOne({ userId: me(req), kind: 'cv' });
  await User.updateOne({ _id: me(req) }, { cv: null });
  return res.json({ cv: null });
};

// GET /user/:id/cv — réservé aux membres connectés (un CV contient des coordonnées)
exports.serveCv = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'CV introuvable' });
  const media = await UserMedia.findOne({ userId: req.params.id, kind: 'cv' }).select('data name').lean();
  if (!media) return res.status(404).json({ message: 'CV introuvable' });
  const name = media.name || 'CV.pdf';
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${name.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  return res.send(Buffer.isBuffer(media.data) ? media.data : Buffer.from(media.data.buffer));
};
