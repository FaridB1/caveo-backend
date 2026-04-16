const express = require('express');
const router = express.Router();
const { createBooking, getBookings, updateBookingStatus, deleteBooking } = require('../controllers/bookingController');
const { auth, adminOnly } = require('../middleware/auth');

router.post('/', createBooking);
router.get('/', auth, adminOnly, getBookings);
router.patch('/:id/status', auth, adminOnly, updateBookingStatus);
router.delete('/:id', auth, adminOnly, deleteBooking);

module.exports = router;
