const { db } = require('../config/db');

// Send email notification to admin when booking is created
async function notifyAdmin(booking, tourTitle) {
  if (!process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD === 'your_16_char_app_password_here') return;
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
    await transporter.sendMail({
      from:    `"CAVÉO TRAVEL" <${process.env.GMAIL_USER}>`,
      to:      process.env.CONTACT_EMAIL || 'caveotravel@gmail.com',
      subject: `🗓 Yeni Rezervasiya — ${booking.name} (${tourTitle})`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;border-top:4px solid #C9A84C;padding:24px;background:#fff">
          <h2 style="font-family:Georgia,serif;color:#0d2054;font-size:20px">Yeni Rezervasiya Gəldi</h2>
          <p><b>Müştəri:</b> ${booking.name}</p>
          <p><b>E-poçt:</b> <a href="mailto:${booking.email}">${booking.email}</a></p>
          <p><b>Telefon:</b> <a href="tel:${booking.phone}">${booking.phone}</a></p>
          <p><b>Tur:</b> ${tourTitle}</p>
          <p><b>Tarix:</b> ${booking.date || '—'}</p>
          <p><b>Şəxs sayı:</b> ${booking.travelers}</p>
          ${booking.message ? `<p><b>Mesaj:</b> ${booking.message}</p>` : ''}
          <hr style="border:none;border-top:1px solid #ede8dc;margin:16px 0"/>
          <a href="${process.env.ADMIN_URL || 'http://localhost:5174'}/bookings"
             style="background:#C9A84C;color:#0d2054;padding:10px 22px;text-decoration:none;font-weight:700">
            Admin Paneldə Gör
          </a>
        </div>`,
    });
    console.log(`📧 Admin bildirişi göndərildi: ${booking.name}`);
  } catch (e) {
    console.error('Admin bildirişi göndərilmədi:', e.message);
  }
}

const createBooking = async (req, res) => {
  try {
    const { tourId, name, email, phone, travelers, date, message } = req.body;
    if (!tourId || !name || !phone) {
      return res.status(400).json({ success: false, message: 'Tur ID, ad və telefon tələb olunur' });
    }

    const tour = await db.getTourById(tourId);
    if (!tour) return res.status(404).json({ success: false, message: 'Tur tapılmadı' });

    const booking = await db.createBooking({
      tourId: parseInt(tourId), name, email, phone,
      travelers: parseInt(travelers) || 1, date, message,
    });

    // Notify admin (async — don't wait)
    notifyAdmin(booking, tour.title).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'Rezervasiyanız uğurla göndərildi! 24 saat ərzində sizinlə əlaqə saxlayacağıq.',
      data: booking,
    });
  } catch (err) {
    console.error('createBooking xətası:', err);
    res.status(500).json({ success: false, message: 'Rezervasiya yaradıla bilmədi' });
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
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Rezervasiyalar yüklənə bilmədi' });
  }
};

const updateBookingStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending','approved','rejected','cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Yanlış status' });
    }
    const booking = await db.updateBookingStatus(req.params.id, status);
    if (!booking) return res.status(404).json({ success: false, message: 'Rezervasiya tapılmadı' });
    res.json({ success: true, message: 'Status yeniləndi', data: booking });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Status yenilənə bilmədi' });
  }
};

const deleteBooking = async (req, res) => {
  try {
    const deleted = await db.deleteBooking(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Rezervasiya tapılmadı' });
    res.json({ success: true, message: 'Rezervasiya silindi' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Rezervasiya silinə bilmədi' });
  }
};

module.exports = { createBooking, getBookings, updateBookingStatus, deleteBooking };
