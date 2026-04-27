const nodemailer = require('nodemailer');
const { db }     = require('../config/db');

const sendContact = async (req, res) => {
  const { name, email, phone, subject, message } = req.body;

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return res.status(400).json({ success: false, message: 'Ad, e-poçt və mesaj mütləqdir.' });
  }

  // 1. Save to database regardless of email success
  let savedContact = null;
  try {
    savedContact = await db.saveContact({ name, email, phone: phone || '', subject: subject || '', message, read: false });
    console.log(`📋 Əlaqə mesajı DB-yə saxlandı: ${name} <${email}>`);
  } catch (dbErr) {
    console.error('DB saxlama xətası:', dbErr.message);
  }

  // 2. Send email via Gmail SMTP
  if (!process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD === 'your_16_char_app_password_here') {
    console.log('⚠️  GMAIL_APP_PASSWORD konfiqurasiya edilməyib — e-poçt göndərilmir, DB-yə saxlandı');
    return res.json({
      success: true,
      message: 'Mesajınız qəbul edildi! Tezliklə sizinlə əlaqə saxlayacağıq.',
      saved: !!savedContact,
    });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER || 'caveotravel@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  const htmlBody = `
<!DOCTYPE html>
<html lang="az">
<head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; background:#f6f2ea; margin:0; padding:20px; }
  .card { max-width:580px; margin:0 auto; background:#fff; border-top:4px solid #C9A84C; padding:32px; }
  .logo { font-family:Georgia,serif; font-size:22px; font-weight:600; color:#0d2054; letter-spacing:4px; }
  .tag  { font-size:10px; letter-spacing:4px; text-transform:uppercase; color:#C9A84C; margin-bottom:20px; display:block; }
  hr    { border:none; border-top:1px solid #ede8dc; margin:20px 0; }
  .lbl  { font-size:10px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:#C9A84C; margin-bottom:3px; }
  .val  { font-size:14px; color:#0d2054; margin-bottom:16px; }
  .msg  { background:#f6f2ea; padding:14px; border-left:3px solid #C9A84C; font-size:14px; color:#0d2054; line-height:1.7; }
  .foot { font-size:11px; color:#8c8577; margin-top:20px; }
  a     { color:#C9A84C; }
</style></head>
<body>
  <div class="card">
    <div class="logo">CAVÉO</div>
    <span class="tag">Travel Beyond Luxury</span>
    <h2 style="font-family:Georgia,serif;font-size:18px;color:#0d2054;font-weight:500;margin-bottom:18px;">
      📩 Yeni Əlaqə Sorğusu
    </h2>
    <div class="lbl">Ad Soyad</div>
    <div class="val">${name}</div>
    <div class="lbl">E-poçt</div>
    <div class="val"><a href="mailto:${email}">${email}</a></div>
    ${phone ? `<div class="lbl">Telefon</div><div class="val"><a href="tel:${phone}">${phone}</a></div>` : ''}
    ${subject ? `<div class="lbl">Mövzu</div><div class="val">${subject}</div>` : ''}
    <hr/>
    <div class="lbl">Mesaj</div>
    <div class="msg">${message.replace(/\n/g, '<br/>')}</div>
    <div class="foot">
      caveotravel.com əlaqə forması vasitəsilə göndərildi —
      ${new Date().toLocaleString('az-AZ')}
    </div>
  </div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from:    `"CAVÉO TRAVEL" <${process.env.GMAIL_USER}>`,
      to:      process.env.CONTACT_EMAIL || 'caveotravel@gmail.com',
      replyTo: email,
      subject: `📩 CAVÉO Əlaqə — ${name}`,
      html:    htmlBody,
      text:    `Ad: ${name}\nE-poçt: ${email}\nTelefon: ${phone || '—'}\n\n${message}`,
    });

    console.log(`✅ E-poçt göndərildi → caveotravel@gmail.com`);
    res.json({ success: true, message: 'Mesajınız göndərildi! 2 saat ərzində cavab alacaqsınız.' });
  } catch (emailErr) {
    console.error('❌ E-poçt göndərilmədi:', emailErr.message);
    // Still success because DB saved it
    res.json({
      success: true,
      message: 'Mesajınız qəbul edildi! Tezliklə sizinlə əlaqə saxlayacağıq.',
    });
  }
};

// GET /api/contact — admin üçün gələn mesajları gör
const getContacts = async (req, res) => {
  try {
    const { rows, total } = await db.getContacts();
    res.json({ success: true, data: rows, pagination: { total } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Mesajlar yüklənə bilmədi' });
  }
};

module.exports = { sendContact, getContacts };
