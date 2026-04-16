const { db } = require('../config/db');

const createBooking = async (req, res) => {
  try {
    const { tourId, name, email, phone, travelers, date, message } = req.body;
    if (!tourId || !name || !phone) {
      return res.status(400).json({ success: false, message: 'Tour ID, name, and phone are required' });
    }
    const tour = await db.getTourById(tourId);
    if (!tour) return res.status(404).json({ success: false, message: 'Tour not found' });

    const booking = await db.createBooking({ tourId: parseInt(tourId), name, email, phone, travelers: parseInt(travelers) || 1, date, message });
    res.status(201).json({ success: true, message: 'Booking submitted successfully! We will contact you soon.', data: booking });
  } catch (err) {
    console.error('createBooking error:', err);
    res.status(500).json({ success: false, message: 'Failed to create booking' });
  }
};

const getBookings = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filters = { limit: parseInt(limit), offset: (parseInt(page) - 1) * parseInt(limit) };
    if (status) filters.where = { status };
    const { rows, total } = await db.getBookings(filters);
    res.json({
      success: true,
      data: rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch bookings' });
  }
};

const updateBookingStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const booking = await db.updateBookingStatus(req.params.id, status);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, message: 'Booking status updated', data: booking });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update booking' });
  }
};

const deleteBooking = async (req, res) => {
  try {
    const deleted = await db.deleteBooking(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, message: 'Booking deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete booking' });
  }
};

module.exports = { createBooking, getBookings, updateBookingStatus, deleteBooking };
