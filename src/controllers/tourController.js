const { db } = require('../config/db');
const path = require('path');

const getTours = async (req, res) => {
  try {
    const { category, search, minPrice, maxPrice, minDuration, maxDuration, featured, page = 1, limit = 9 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const filters = {
      category, search, minPrice, maxPrice, minDuration, maxDuration,
      featured: featured === 'true' ? true : undefined,
      limit: parseInt(limit),
      offset,
      searchFields: ['title', 'description', 'category'],
    };
    if (featured === 'true') filters.where = { featured: true };
    const { rows, total } = await db.getTours(filters);
    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      }
    });
  } catch (err) {
    console.error('getTours error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch tours' });
  }
};

const getTourById = async (req, res) => {
  try {
    const tour = await db.getTourById(req.params.id);
    if (!tour) return res.status(404).json({ success: false, message: 'Tour not found' });
    res.json({ success: true, data: tour });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch tour' });
  }
};

const createTour = async (req, res) => {
  try {
    let { title, description, price, duration, category, image, gallery, services, featured } = req.body;
    if (!title || !price) {
      return res.status(400).json({ success: false, message: 'Title and price are required' });
    }
    // Handle file upload
    if (req.file) {
      image = `/uploads/${req.file.filename}`;
    }
    // Parse JSON fields if they're strings
    if (typeof services === 'string') {
      try { services = JSON.parse(services); } catch { services = services.split(',').map(s => s.trim()); }
    }
    if (typeof gallery === 'string') {
      try { gallery = JSON.parse(gallery); } catch { gallery = []; }
    }
    const tour = await db.createTour({
      title, description, price: parseFloat(price), duration, category,
      image: image || '', gallery: gallery || [], services: services || [],
      featured: featured === 'true' || featured === true
    });
    res.status(201).json({ success: true, message: 'Tour created successfully', data: tour });
  } catch (err) {
    console.error('createTour error:', err);
    res.status(500).json({ success: false, message: 'Failed to create tour' });
  }
};

const updateTour = async (req, res) => {
  try {
    let { title, description, price, duration, category, image, gallery, services, featured } = req.body;
    if (req.file) image = `/uploads/${req.file.filename}`;
    if (typeof services === 'string') {
      try { services = JSON.parse(services); } catch { services = services.split(',').map(s => s.trim()); }
    }
    if (typeof gallery === 'string') {
      try { gallery = JSON.parse(gallery); } catch { gallery = []; }
    }
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (price !== undefined) updateData.price = parseFloat(price);
    if (duration !== undefined) updateData.duration = duration;
    if (category !== undefined) updateData.category = category;
    if (image !== undefined) updateData.image = image;
    if (gallery !== undefined) updateData.gallery = gallery;
    if (services !== undefined) updateData.services = services;
    if (featured !== undefined) updateData.featured = featured === 'true' || featured === true;

    const tour = await db.updateTour(req.params.id, updateData);
    if (!tour) return res.status(404).json({ success: false, message: 'Tour not found' });
    res.json({ success: true, message: 'Tour updated successfully', data: tour });
  } catch (err) {
    console.error('updateTour error:', err);
    res.status(500).json({ success: false, message: 'Failed to update tour' });
  }
};

const deleteTour = async (req, res) => {
  try {
    const deleted = await db.deleteTour(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Tour not found' });
    res.json({ success: true, message: 'Tour deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete tour' });
  }
};

const uploadImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const url = `/uploads/${req.file.filename}`;
    res.json({ success: true, url, message: 'Image uploaded successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
};

const getStats = async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
};

module.exports = { getTours, getTourById, createTour, updateTour, deleteTour, uploadImage, getStats };
