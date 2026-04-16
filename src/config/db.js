const bcrypt = require('bcryptjs');

// ─── In-Memory Store (default) ────────────────────────────────────────────────
let store = {
  users: [],
  tours: [],
  bookings: [],
  nextId: { users: 1, tours: 1, bookings: 1 },
};

const inMemory = {
  query: async (table, action, data = {}) => {
    switch (action) {
      case 'findAll': {
        let rows = [...store[table]];
        if (data.where) {
          Object.entries(data.where).forEach(([k, v]) => {
            rows = rows.filter(r => r[k] === v);
          });
        }
        if (data.search && data.searchFields) {
          const q = data.search.toLowerCase();
          rows = rows.filter(r =>
            data.searchFields.some(f => r[f] && r[f].toString().toLowerCase().includes(q))
          );
        }
        if (data.category) rows = rows.filter(r => r.category === data.category);
        if (data.minPrice) rows = rows.filter(r => r.price >= Number(data.minPrice));
        if (data.maxPrice) rows = rows.filter(r => r.price <= Number(data.maxPrice));
        if (data.minDuration) rows = rows.filter(r => parseInt(r.duration) >= Number(data.minDuration));
        if (data.maxDuration) rows = rows.filter(r => parseInt(r.duration) <= Number(data.maxDuration));
        const total = rows.length;
        if (data.limit) {
          const offset = data.offset || 0;
          rows = rows.slice(offset, offset + data.limit);
        }
        return { rows, total };
      }
      case 'findOne': {
        const row = store[table].find(r => r.id === data.id || (data.where && Object.entries(data.where).every(([k, v]) => r[k] === v)));
        return row || null;
      }
      case 'create': {
        const id = store.nextId[table]++;
        const newRow = { id, ...data.values, createdAt: new Date().toISOString() };
        store[table].push(newRow);
        return newRow;
      }
      case 'update': {
        const idx = store[table].findIndex(r => r.id === data.id);
        if (idx === -1) return null;
        store[table][idx] = { ...store[table][idx], ...data.values, updatedAt: new Date().toISOString() };
        return store[table][idx];
      }
      case 'delete': {
        const idx = store[table].findIndex(r => r.id === data.id);
        if (idx === -1) return false;
        store[table].splice(idx, 1);
        return true;
      }
      case 'count': {
        return store[table].length;
      }
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
};

// ─── PostgreSQL Store ──────────────────────────────────────────────────────────
let pgPool = null;
const pgStore = {
  query: async (sql, params) => {
    const client = await pgPool.connect();
    try {
      const result = await client.query(sql, params);
      return result;
    } finally {
      client.release();
    }
  }
};

// ─── DB Interface ──────────────────────────────────────────────────────────────
const USE_DB = process.env.USE_DATABASE === 'true';

const db = {
  isPostgres: USE_DB,

  // Tours
  async getTours(filters = {}) {
    if (!USE_DB) return inMemory.query('tours', 'findAll', filters);
    let sql = 'SELECT * FROM tours WHERE 1=1';
    const params = [];
    if (filters.category) { params.push(filters.category); sql += ` AND category = $${params.length}`; }
    if (filters.search) { params.push(`%${filters.search}%`); sql += ` AND (title ILIKE $${params.length} OR description ILIKE $${params.length})`; }
    if (filters.minPrice) { params.push(filters.minPrice); sql += ` AND price >= $${params.length}`; }
    if (filters.maxPrice) { params.push(filters.maxPrice); sql += ` AND price <= $${params.length}`; }
    const countResult = await pgStore.query(sql.replace('SELECT *', 'SELECT COUNT(*)'), params);
    const total = parseInt(countResult.rows[0].count);
    const limit = filters.limit || 12;
    const offset = filters.offset || 0;
    params.push(limit); sql += ` LIMIT $${params.length}`;
    params.push(offset); sql += ` OFFSET $${params.length}`;
    const result = await pgStore.query(sql, params);
    return { rows: result.rows, total };
  },

  async getTourById(id) {
    if (!USE_DB) return inMemory.query('tours', 'findOne', { id: parseInt(id) });
    const result = await pgStore.query('SELECT * FROM tours WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async createTour(data) {
    if (!USE_DB) return inMemory.query('tours', 'create', { values: data });
    const { title, description, price, duration, category, image, gallery, services, featured } = data;
    const result = await pgStore.query(
      `INSERT INTO tours (title, description, price, duration, category, image, gallery, services, featured) 
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [title, description, price, duration, category, image, JSON.stringify(gallery || []), JSON.stringify(services || []), featured || false]
    );
    return result.rows[0];
  },

  async updateTour(id, data) {
    if (!USE_DB) return inMemory.query('tours', 'update', { id: parseInt(id), values: data });
    const fields = Object.keys(data).map((k, i) => `${k} = $${i + 2}`).join(', ');
    const result = await pgStore.query(
      `UPDATE tours SET ${fields}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...Object.values(data)]
    );
    return result.rows[0] || null;
  },

  async deleteTour(id) {
    if (!USE_DB) return inMemory.query('tours', 'delete', { id: parseInt(id) });
    const result = await pgStore.query('DELETE FROM tours WHERE id = $1', [id]);
    return result.rowCount > 0;
  },

  // Bookings
  async getBookings(filters = {}) {
    if (!USE_DB) {
      const result = await inMemory.query('bookings', 'findAll', filters);
      result.rows = result.rows.map(b => ({
        ...b,
        tourTitle: (store.tours.find(t => t.id === b.tourId) || {}).title || 'Unknown Tour'
      }));
      return result;
    }
    const result = await pgStore.query(
      `SELECT b.*, t.title as "tourTitle" FROM bookings b LEFT JOIN tours t ON b."tourId" = t.id ORDER BY b."createdAt" DESC`
    );
    return { rows: result.rows, total: result.rows.length };
  },

  async createBooking(data) {
    if (!USE_DB) return inMemory.query('bookings', 'create', { values: { ...data, status: 'pending' } });
    const { tourId, name, email, phone, travelers, date, message } = data;
    const result = await pgStore.query(
      `INSERT INTO bookings ("tourId", name, email, phone, travelers, date, message, status) 
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING *`,
      [tourId, name, email, phone, travelers || 1, date, message]
    );
    return result.rows[0];
  },

  async updateBookingStatus(id, status) {
    if (!USE_DB) return inMemory.query('bookings', 'update', { id: parseInt(id), values: { status } });
    const result = await pgStore.query('UPDATE bookings SET status = $2 WHERE id = $1 RETURNING *', [id, status]);
    return result.rows[0] || null;
  },

  async deleteBooking(id) {
    if (!USE_DB) return inMemory.query('bookings', 'delete', { id: parseInt(id) });
    const result = await pgStore.query('DELETE FROM bookings WHERE id = $1', [id]);
    return result.rowCount > 0;
  },

  // Users
  async findUserByEmail(email) {
    if (!USE_DB) return inMemory.query('users', 'findOne', { where: { email } });
    const result = await pgStore.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0] || null;
  },

  async createUser(data) {
    if (!USE_DB) return inMemory.query('users', 'create', { values: data });
    const { email, password, role } = data;
    const result = await pgStore.query(
      'INSERT INTO users (email, password, role) VALUES ($1,$2,$3) RETURNING *',
      [email, password, role || 'admin']
    );
    return result.rows[0];
  },

  // Stats
  async getStats() {
    if (!USE_DB) {
      return {
        totalTours: store.tours.length,
        totalBookings: store.bookings.length,
        pendingBookings: store.bookings.filter(b => b.status === 'pending').length,
        approvedBookings: store.bookings.filter(b => b.status === 'approved').length,
        featuredTours: store.tours.filter(t => t.featured).length,
      };
    }
    const [tours, bookings, pending, featured] = await Promise.all([
      pgStore.query('SELECT COUNT(*) FROM tours'),
      pgStore.query('SELECT COUNT(*) FROM bookings'),
      pgStore.query("SELECT COUNT(*) FROM bookings WHERE status='pending'"),
      pgStore.query('SELECT COUNT(*) FROM tours WHERE featured=true'),
    ]);
    return {
      totalTours: parseInt(tours.rows[0].count),
      totalBookings: parseInt(bookings.rows[0].count),
      pendingBookings: parseInt(pending.rows[0].count),
      approvedBookings: parseInt(bookings.rows[0].count) - parseInt(pending.rows[0].count),
      featuredTours: parseInt(featured.rows[0].count),
    };
  }
};

// ─── Init ──────────────────────────────────────────────────────────────────────
async function initDB() {
  if (USE_DB) {
    const { Pool } = require('pg');
    pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
        "createdAt" TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS tours (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        duration VARCHAR(100),
        category VARCHAR(100),
        image TEXT,
        gallery JSONB DEFAULT '[]',
        services JSONB DEFAULT '[]',
        featured BOOLEAN DEFAULT false,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        "tourId" INTEGER REFERENCES tours(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        travelers INTEGER DEFAULT 1,
        date VARCHAR(100),
        message TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        "createdAt" TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ PostgreSQL connected and tables created');
  } else {
    // Seed in-memory data
    await seedInMemory();
    console.log('✅ In-memory database initialized with seed data');
  }
}

async function seedInMemory() {
  const adminPass = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@2024', 10);
  store.users.push({ id: store.nextId.users++, email: process.env.ADMIN_EMAIL || 'admin@caveotravel.com', password: adminPass, role: 'admin', createdAt: new Date().toISOString() });

  const sampleTours = [
    { title: 'Santorini Sunset Escape', description: 'Experience the legendary sunsets of Oia with private villa access, yacht tours around the caldera, and gourmet dining under the Aegean stars. This exclusive journey combines volcanic landscapes with Cycladic luxury.', price: 4200, duration: '7 days', category: 'Europe', image: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800', gallery: ['https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=1200', 'https://images.unsplash.com/photo-1613395877344-13d4a8e0d49e?w=1200'], services: ['Private Villa', 'Yacht Tour', 'Gourmet Dining', 'Airport Transfer', 'Wine Tasting'], featured: true },
    { title: 'Maldives Pearl Retreat', description: 'Overwater bungalows above crystal-clear lagoons. Dive with whale sharks, enjoy couples spa rituals, and savor personalized menus crafted by your private chef. Paradise, perfected.', price: 6800, duration: '10 days', category: 'Asia', image: 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=800', gallery: ['https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=1200'], services: ['Overwater Bungalow', 'Diving Sessions', 'Spa Package', 'Private Chef', 'Seaplane Transfer'], featured: true },
    { title: 'Japanese Sakura Journey', description: 'Chase cherry blossoms through Kyoto\'s ancient temples, ride the Shinkansen to Tokyo\'s neon canyons, and experience a traditional ryokan stay with kaiseki cuisine. Japan at its most poetic.', price: 5100, duration: '12 days', category: 'Asia', image: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800', gallery: ['https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=1200'], services: ['Ryokan Stay', 'Bullet Train Pass', 'Tea Ceremony', 'Temple Tours', 'Private Guide'], featured: true },
    { title: 'Amalfi Coast Drive', description: 'Wind along cliff-hugging roads above the sparkling Tyrrhenian Sea. Private limousine service, Michelin-starred lunches in Positano, and a sunset cruise to Capri. La dolce vita elevated.', price: 3800, duration: '8 days', category: 'Europe', image: 'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=800', gallery: ['https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=1200'], services: ['Luxury Villa', 'Private Driver', 'Capri Cruise', 'Cooking Class', 'Michelin Dinner'], featured: false },
    { title: 'Dubai Ultra Luxury', description: 'Seven-star Burj Al Arab experience with helicopter arrival, desert glamping under the Milky Way, supercar tour of the city, and world-class shopping. The pinnacle of modern opulence.', price: 7500, duration: '6 days', category: 'Middle East', image: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800', gallery: ['https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1200'], services: ['Burj Al Arab Stay', 'Helicopter Tour', 'Desert Safari', 'Supercar Experience', 'Personal Concierge'], featured: true },
    { title: 'Patagonia Wilderness Trek', description: 'Guided expedition to Torres del Paine\'s iconic granite towers. Luxury glamping with panoramic lake views, private horse rides across pampas, and asado dinners by the fire.', price: 4900, duration: '9 days', category: 'Americas', image: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800', gallery: ['https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1200'], services: ['Luxury Glamping', 'Expert Guides', 'Horse Riding', 'Photography Sessions', 'All Meals'], featured: false },
    { title: 'Maroccan Imperial Cities', description: 'From Marrakech medinas to Fez\'s ancient tanneries and the blue streets of Chefchaouen. Stay in converted riads, ride camels at Erg Chebbi dunes, and feast on traditional Moroccan cuisine.', price: 3200, duration: '10 days', category: 'Africa', image: 'https://images.unsplash.com/photo-1489493887464-892be6d1daae?w=800', gallery: ['https://images.unsplash.com/photo-1489493887464-892be6d1daae?w=1200'], services: ['Riad Stays', 'Camel Trek', 'Cooking Class', 'Hammam Spa', 'Private Guide'], featured: false },
    { title: 'Bali Divine Wellness', description: 'Immerse in Bali\'s spiritual healing traditions. Ubud jungle villa with infinity pool, sunrise yoga at Mount Batur, traditional Balinese massage sequences, and sacred temple ceremonies.', price: 2900, duration: '7 days', category: 'Asia', image: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800', gallery: ['https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=1200'], services: ['Jungle Villa', 'Daily Yoga', 'Spa Treatments', 'Volcano Trek', 'Temple Tours'], featured: true },
  ];

  sampleTours.forEach(t => {
    store.tours.push({ id: store.nextId.tours++, ...t, updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() });
  });

  const sampleBookings = [
    { tourId: 1, name: 'Alexandra Morrison', email: 'alex@example.com', phone: '+1 555 0101', travelers: 2, date: '2024-06-15', message: 'Honeymoon trip, please arrange special setup', status: 'approved' },
    { tourId: 2, name: 'James & Sarah Chen', email: 'jchen@example.com', phone: '+44 20 7946 0321', travelers: 2, date: '2024-07-20', message: 'Anniversary celebration', status: 'pending' },
    { tourId: 5, name: 'Sheikh Mohammed Al-Rashid', email: 'smr@example.com', phone: '+971 50 123 4567', travelers: 4, date: '2024-05-10', message: 'Full VIP package required', status: 'approved' },
    { tourId: 3, name: 'Yuki Tanaka', email: 'ytanaka@example.com', phone: '+81 90 1234 5678', travelers: 1, date: '2024-04-01', message: 'Solo traveler, interested in cultural experiences', status: 'pending' },
  ];

  sampleBookings.forEach(b => {
    store.bookings.push({ id: store.nextId.bookings++, ...b, createdAt: new Date().toISOString() });
  });
}

module.exports = { db, initDB };
