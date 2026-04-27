require('dotenv').config();
const { validateEnv } = require('./utils/validateEnv');
validateEnv(); // Validate before anything else

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const path    = require('path');
const { initDB } = require('./config/db');

const authRoutes    = require('./routes/auth');
const tourRoutes    = require('./routes/tours');
const bookingRoutes = require('./routes/bookings');
const contactRoutes = require('./routes/contact');
const { apiRateLimit } = require('./middleware/rateLimit');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Security Headers ────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Disable for now to allow Unsplash images
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ────────────────────────────────────────────────────
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    process.env.ADMIN_URL    || 'http://localhost:5174',
    // Also allow the deployed domain
    process.env.DOMAIN ? `https://${process.env.DOMAIN}` : null,
  ].filter(Boolean),
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve data directory (for backup download — admin only)
// NOT exposed publicly

// ── Health check ────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const { db } = require('./config/db');
  let dbStatus = 'unknown';
  
  try {
    if (process.env.USE_DATABASE === 'true') {
      // Test PostgreSQL connection
      await db.query('users', 'findAll', { limit: 1 });
      dbStatus = 'connected';
    } else {
      dbStatus = 'json-file';
    }
  } catch (err) {
    dbStatus = 'error: ' + err.message;
  }

  res.json({
    status: 'OK',
    app: 'CAVÉO TRAVEL API',
    version: '3.0.0',
    storage: process.env.USE_DATABASE === 'true' ? 'PostgreSQL' : 'JSON File',
    database: dbStatus,
    uptime: process.uptime(),
    time: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

// ── Routes ──────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/tours',    tourRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/contact',  contactRoutes);

// ── 404 ────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Marşrut tapılmadı' });
});

// ── Error handler ───────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Daxili server xətası',
  });
});

// ── Start ───────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  🚀  CAVÉO TRAVEL API işə düşdü');
    console.log(`  📡  http://localhost:${PORT}`);
    console.log(`  🗄   Saxlama: ${process.env.USE_DATABASE === 'true' ? 'PostgreSQL' : 'JSON Fayl (data/caveo-data.json)'}`);
    console.log(`  📧  E-poçt: ${process.env.GMAIL_APP_PASSWORD && process.env.GMAIL_APP_PASSWORD !== 'your_16_char_app_password_here' ? '✅ Konfiqurasiya edilib' : '⚠️  Konfiqurasiya edilməyib'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  });
}).catch(err => {
  console.error('❌ DB başladılmadı:', err);
  process.exit(1);
});
