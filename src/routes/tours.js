const express = require('express');
const router  = express.Router();
const { getTours, getTourById, getRawTour, createTour, updateTour, deleteTour, uploadImage, getStats } = require('../controllers/tourController');
const { auth, adminOnly } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// Simple cache middleware for public routes (5 minutes)
const cacheMiddleware = (req, res, next) => {
  res.set('Cache-Control', 'public, max-age=300'); // 5 min
  next();
};

router.get('/',             cacheMiddleware, getTours);
router.get('/stats',        auth, adminOnly, getStats);
router.get('/:id/raw',      auth, adminOnly, getRawTour);   // admin: all lang fields
router.get('/:id',          cacheMiddleware, getTourById);
router.post('/',            auth, adminOnly, upload.single('image'), createTour);
router.put('/:id',          auth, adminOnly, upload.single('image'), updateTour);
router.delete('/:id',       auth, adminOnly, deleteTour);
router.post('/upload/image',auth, adminOnly, upload.single('image'), uploadImage);

module.exports = router;
