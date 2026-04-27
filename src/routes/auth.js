const express = require('express');
const router  = express.Router();
const { login, getMe, changePassword } = require('../controllers/authController');
const { auth }          = require('../middleware/auth');
const { loginRateLimit } = require('../middleware/rateLimit');

router.post('/login',           loginRateLimit, login);
router.get('/me',               auth, getMe);
router.patch('/change-password', auth, changePassword);

module.exports = router;
