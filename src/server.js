// require('dotenv').config();
// const express = require('express');
// const cors = require('cors');
// const path = require('path');
// const { initDB } = require('./config/db');

// const authRoutes = require('./routes/auth');
// const tourRoutes = require('./routes/tours');
// const bookingRoutes = require('./routes/bookings');

// const app = express();
// const PORT = process.env.PORT || 5000;

// // Middleware
// app.use(cors({
//   origin: [
//     process.env.FRONTEND_URL || 'http://localhost:5173',
//     process.env.ADMIN_URL || 'http://localhost:5174',
//   ],
//   credentials: true,
// }));
// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// // Static files for uploads
// app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// // Health check
// app.get('/api/health', (req, res) => {
//   res.json({ status: 'OK', message: 'CAVEO TRAVEL API Running', version: '1.0.0' });
// });

// // Routes
// app.use('/api/auth', authRoutes);
// app.use('/api/tours', tourRoutes);
// app.use('/api/bookings', bookingRoutes);

// // 404
// app.use((req, res) => {
//   res.status(404).json({ success: false, message: 'Route not found' });
// });

// // Error handler
// app.use((err, req, res, next) => {
//   console.error(err.stack);
//   res.status(err.status || 500).json({
//     success: false,
//     message: err.message || 'Internal server error',
//   });
// });

// // Initialize DB and start server
// initDB().then(() => {
//   app.listen(PORT, () => {
//     console.log(`\n🚀 CAVEO TRAVEL API running on http://localhost:${PORT}`);
//     console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
//     console.log(`🗄️  Database: ${process.env.USE_DATABASE === 'true' ? 'PostgreSQL' : 'In-Memory'}\n`);
//   });
// }).catch(err => {
//   console.error('Failed to initialize database:', err);
//   process.exit(1);
// });
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./config/db');

const authRoutes = require('./routes/auth');
const tourRoutes = require('./routes/tours');
const bookingRoutes = require('./routes/bookings');

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Allowed origins (production + local)
const allowedOrigins = [
  'https://caveotravel.com',
  'http://localhost:5173',
  'http://localhost:5174',
];

// ✅ CORS CONFIG (FULL FIX)
app.use(cors({
  origin: function (origin, callback) {
    // Postman və ya server-side requestlər üçün
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS blocked: ' + origin));
    }
  },
  credentials: true,
}));

// 🔧 Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 📁 Static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ❤️ Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'CAVEO TRAVEL API Running',
    version: '1.0.0',
  });
});

// 🚀 Routes
app.use('/api/auth', authRoutes);
app.use('/api/tours', tourRoutes);
app.use('/api/bookings', bookingRoutes);

// ❌ 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// ⚠️ Error handler
app.use((err, req, res, next) => {
  console.error('ERROR:', err.message);

  if (err.message.includes('CORS')) {
    return res.status(403).json({
      success: false,
      message: err.message,
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

// 🗄️ Start server
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀 CAVEO TRAVEL API running on port ${PORT}`);
      console.log(`🌍 Allowed origins:`, allowedOrigins);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗄️ Database: ${process.env.USE_DATABASE === 'true' ? 'PostgreSQL' : 'In-Memory'}\n`);
    });
  })
  .catch((err) => {
    console.error('❌ Failed to initialize database:', err);
    process.exit(1);
  });