const { db } = require('../config/db');

const getTours = async (req, res) => {
  try {
    const { category, search, minPrice, maxPrice, featured, page=1, limit=9, lang='az' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const filters = { category, search, minPrice, maxPrice, lang,
      featured: featured==='true' ? true : undefined,
      limit: parseInt(limit), offset,
      searchFields: ['title','title_az','title_en','description','description_az','description_en','category'],
    };
    if (featured === 'true') filters.where = { featured: true };
    const { rows, total } = await db.getTours(filters);
    res.json({ success:true, data:rows, pagination:{ total, page:parseInt(page), limit:parseInt(limit), totalPages:Math.ceil(total/parseInt(limit)) } });
  } catch (err) {
    console.error('getTours xətası:', err);
    res.status(500).json({ success:false, message:'Turlar yüklənə bilmədi' });
  }
};

const getTourById = async (req, res) => {
  try {
    const lang = req.query.lang || 'az';
    const tour = await db.getTourById(req.params.id, lang);
    if (!tour) return res.status(404).json({ success:false, message:'Tur tapılmadı' });
    res.json({ success:true, data:tour });
  } catch (err) {
    res.status(500).json({ success:false, message:'Tur yüklənə bilmədi' });
  }
};

// Admin: get raw tour with all language fields for editing
const getRawTour = async (req, res) => {
  try {
    const tour = await db.getRawTour(req.params.id);
    if (!tour) return res.status(404).json({ success:false, message:'Tur tapılmadı' });
    res.json({ success:true, data:tour });
  } catch (err) {
    res.status(500).json({ success:false, message:'Tur yüklənə bilmədi' });
  }
};

const createTour = async (req, res) => {
  try {
    let body = { ...req.body };
    if (req.file) body.image = `/uploads/${req.file.filename}`;

    // Parse JSON array fields
    ['services_az','services_en','gallery'].forEach(f => {
      if (typeof body[f] === 'string') {
        try { body[f] = JSON.parse(body[f]); }
        catch { body[f] = body[f].split(',').map(s => s.trim()).filter(Boolean); }
      }
    });

    // Legacy: if only 'services' sent (no _az/_en), map to services_az
    if (!body.services_az && body.services) {
      body.services_az = typeof body.services === 'string'
        ? JSON.parse(body.services).catch(() => body.services.split(',').map(s=>s.trim()))
        : body.services;
    }

    if (!body.title_az && !body.title) return res.status(400).json({ success:false, message:'Tur adı tələb olunur' });
    if (!body.price) return res.status(400).json({ success:false, message:'Qiymət tələb olunur' });

    const tour = await db.createTour(body);
    res.status(201).json({ success:true, message:'Tur yaradıldı', data:tour });
  } catch (err) {
    console.error('createTour xətası:', err);
    res.status(500).json({ success:false, message:'Tur yaradıla bilmədi' });
  }
};

const updateTour = async (req, res) => {
  try {
    let body = { ...req.body };
    if (req.file) body.image = `/uploads/${req.file.filename}`;

    ['services_az','services_en','gallery'].forEach(f => {
      if (typeof body[f] === 'string') {
        try { body[f] = JSON.parse(body[f]); }
        catch { body[f] = body[f].split(',').map(s => s.trim()).filter(Boolean); }
      }
    });
    if (body.price) body.price = parseFloat(body.price);
    if (body.featured !== undefined) body.featured = body.featured === 'true' || body.featured === true;

    const tour = await db.updateTour(req.params.id, body);
    if (!tour) return res.status(404).json({ success:false, message:'Tur tapılmadı' });
    res.json({ success:true, message:'Tur yeniləndi', data:tour });
  } catch (err) {
    console.error('updateTour xətası:', err);
    res.status(500).json({ success:false, message:'Tur yenilənə bilmədi' });
  }
};

const deleteTour = async (req, res) => {
  try {
    const deleted = await db.deleteTour(req.params.id);
    if (!deleted) return res.status(404).json({ success:false, message:'Tur tapılmadı' });
    res.json({ success:true, message:'Tur silindi' });
  } catch (err) {
    res.status(500).json({ success:false, message:'Tur silinə bilmədi' });
  }
};

const uploadImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success:false, message:'Şəkil yüklənmədi' });
    res.json({ success:true, url:`/uploads/${req.file.filename}` });
  } catch (err) {
    res.status(500).json({ success:false, message:'Yükləmə uğursuz oldu' });
  }
};

const getStats = async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json({ success:true, data:stats });
  } catch (err) {
    res.status(500).json({ success:false, message:'Statistika yüklənə bilmədi' });
  }
};

module.exports = { getTours, getTourById, getRawTour, createTour, updateTour, deleteTour, uploadImage, getStats };
