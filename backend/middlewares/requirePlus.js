/* Réserve une route aux membres Hive+. À chaîner après requireAuth ; l'abonnement est relu en base
   (jamais pris du jeton) : un abonnement résilié perd l'accès immédiatement. */
const User = require('../models/User');

module.exports = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('plan').lean();
    if (user?.plan !== 'plus') {
      return res.status(402).json({ code: 'plus_required', message: 'Cette fonction fait partie de Hive+.' });
    }
    return next();
  } catch (err) {
    return next(err);
  }
};
