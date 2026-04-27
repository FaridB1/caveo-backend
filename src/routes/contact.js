const express = require('express');
const router  = express.Router();
const { sendContact, getContacts } = require('../controllers/contactController');
const { auth, adminOnly } = require('../middleware/auth');

router.post('/', sendContact);
router.get('/', auth, adminOnly, getContacts); // admin: gələn mesajları gör

module.exports = router;
