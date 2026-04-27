/**
 * Simple rate limiter — no extra packages needed
 * Uses in-memory Map (resets on restart, production use express-rate-limit)
 */
const attempts = new Map();

const rateLimit = (maxAttempts = 10, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    const key = req.ip + (req.path || '');
    const now = Date.now();
    const record = attempts.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + windowMs;
    }

    record.count++;
    attempts.set(key, record);

    if (record.count > maxAttempts) {
      return res.status(429).json({
        success: false,
        message: `Çox sayda sorğu. ${Math.ceil((record.resetAt - now) / 60000)} dəqiqə gözləyin.`,
      });
    }

    next();
  };
};

// Strict limit for login
const loginRateLimit   = rateLimit(5, 15 * 60 * 1000);   // 5 cəhd / 15 dəq
// Normal limit for API
const apiRateLimit     = rateLimit(100, 60 * 1000);        // 100 sorğu / dəq
// Contact form limit
const contactRateLimit = rateLimit(3, 60 * 60 * 1000);    // 3 mesaj / saat

module.exports = { loginRateLimit, apiRateLimit, contactRateLimit };
