const express = require('express');
const router = express.Router();
const { getTours, getTourById, createTour, updateTour, deleteTour, uploadImage, getStats } = require('../controllers/tourController');
const { auth, adminOnly } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

router.get('/', getTours);
router.get('/stats', auth, adminOnly, getStats);
router.get('/:id', getTourById);
router.post('/', auth, adminOnly, upload.single('image'), createTour);
router.put('/:id', auth, adminOnly, upload.single('image'), updateTour);
router.delete('/:id', auth, adminOnly, deleteTour);
router.post('/upload/image', auth, adminOnly, upload.single('image'), uploadImage);

module.exports = router;
