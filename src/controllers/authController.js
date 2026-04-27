const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { db } = require('../config/db');

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'E-poçt və şifrə tələb olunur' });
    }
    const user = await db.findUserByEmail(email);
    if (!user) return res.status(401).json({ success: false, message: 'Yanlış məlumatlar' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Yanlış məlumatlar' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'caveo_secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true,
      message: 'Giriş uğurlu',
      token,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Login xətası:', err);
    res.status(500).json({ success: false, message: 'Server xətası' });
  }
};

const getMe = async (req, res) => {
  try {
    const user = await db.findUserByEmail(req.user.email);
    if (!user) return res.status(404).json({ success: false, message: 'İstifadəçi tapılmadı' });
    res.json({ success: true, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server xətası' });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Cari və yeni şifrə tələb olunur' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Yeni şifrə ən az 8 simvol olmalıdır' });
    }

    const user = await db.findUserByEmail(req.user.email);
    if (!user) return res.status(404).json({ success: false, message: 'İstifadəçi tapılmadı' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Cari şifrə yanlışdır' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.updateUserPassword(user.id, hashed);

    res.json({ success: true, message: 'Şifrə uğurla dəyişdirildi' });
  } catch (err) {
    console.error('Şifrə dəyişdirmə xətası:', err);
    res.status(500).json({ success: false, message: 'Server xətası' });
  }
};

module.exports = { login, getMe, changePassword };
