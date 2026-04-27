/**
 * CAVÉO TRAVEL — Persistent Bilingual Database Layer
 * ====================================================
 * Storage: JSON file (default) or PostgreSQL
 * Language: AZ (default) + EN — tours store both languages
 * Data file: backend/data/caveo-data.json
 */
const bcrypt = require('bcryptjs');
const fs     = require('fs');
const path   = require('path');

// ── JSON File Store ────────────────────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, '../../data/caveo-data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) { console.error('⚠️ data.json oxuna bilmədi:', e.message); }
  return { users:[], tours:[], bookings:[], contacts:[], nextId:{ users:1, tours:1, bookings:1, contacts:1 } };
}

function saveData(store) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) { console.error('❌ data.json yazıla bilmədi:', e.message); }
}

let store = loadData();

// ── Language-aware tour helper ─────────────────────────────────────────────────
// Returns tour with title/description/services for requested language.
// Falls back to AZ if EN not set.
function localizeTour(tour, lang = 'az') {
  if (!tour) return tour;
  const l = lang === 'en' ? 'en' : 'az';
  return {
    ...tour,
    title:       (l === 'en' && tour.title_en)       ? tour.title_en       : (tour.title_az || tour.title || ''),
    description: (l === 'en' && tour.description_en) ? tour.description_en : (tour.description_az || tour.description || ''),
    services:    (l === 'en' && tour.services_en && tour.services_en.length) ? tour.services_en : (tour.services_az || tour.services || []),
  };
}

// ── File Store Query Engine ────────────────────────────────────────────────────
const fileStore = {
  query: async (table, action, data = {}) => {
    if (!store[table]) store[table] = [];
    switch (action) {

      case 'findAll': {
        let rows = [...store[table]];
        if (data.where) Object.entries(data.where).forEach(([k,v]) => { if (v !== undefined) rows = rows.filter(r => r[k] === v); });
        if (data.search && data.searchFields) {
          const q = data.search.toLowerCase();
          rows = rows.filter(r => data.searchFields.some(f => r[f] && r[f].toString().toLowerCase().includes(q)));
        }
        if (data.category)    rows = rows.filter(r => r.category === data.category);
        if (data.minPrice)    rows = rows.filter(r => r.price >= Number(data.minPrice));
        if (data.maxPrice)    rows = rows.filter(r => r.price <= Number(data.maxPrice));
        const total = rows.length;
        if (data.limit) rows = rows.slice(data.offset || 0, (data.offset || 0) + data.limit);
        return { rows, total };
      }

      case 'findOne': {
        const row = store[table].find(r => {
          if (data.id !== undefined) return r.id === data.id;
          if (data.where) return Object.entries(data.where).every(([k,v]) => r[k] === v);
          return false;
        });
        return row || null;
      }

      case 'create': {
        if (!store.nextId[table]) store.nextId[table] = 1;
        const id = store.nextId[table]++;
        const newRow = { id, ...data.values, createdAt: new Date().toISOString() };
        store[table].push(newRow);
        saveData(store);
        return newRow;
      }

      case 'update': {
        const idx = store[table].findIndex(r => r.id === data.id);
        if (idx === -1) return null;
        store[table][idx] = { ...store[table][idx], ...data.values, updatedAt: new Date().toISOString() };
        saveData(store);
        return store[table][idx];
      }

      case 'delete': {
        const idx = store[table].findIndex(r => r.id === data.id);
        if (idx === -1) return false;
        store[table].splice(idx, 1);
        saveData(store);
        return true;
      }

      case 'count': return store[table].length;
      default: throw new Error(`Naməlum əməliyyat: ${action}`);
    }
  },
};

// ── PostgreSQL ─────────────────────────────────────────────────────────────────
let pgPool = null;
const USE_PG = process.env.USE_DATABASE === 'true';

// ── Unified DB Interface ───────────────────────────────────────────────────────
const db = {
  isPostgres: USE_PG,

  // ── TOURS ──────────────────────────────────────────────────────────────────
  async getTours(filters = {}) {
    const lang = filters.lang || 'az';
    if (!USE_PG) {
      // Search in both languages
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const orig = filters.searchFields;
        filters.searchFields = [
          'title', 'title_az', 'title_en',
          'description', 'description_az', 'description_en',
          'category',
        ];
      }
      const result = await fileStore.query('tours', 'findAll', filters);
      result.rows = result.rows.map(t => localizeTour(t, lang));
      return result;
    }
    // PostgreSQL — bilingual columns
    let sql = `SELECT *, 
      CASE WHEN $1='en' AND title_en IS NOT NULL AND title_en!='' THEN title_en ELSE COALESCE(title_az,title) END as title,
      CASE WHEN $1='en' AND description_en IS NOT NULL THEN description_en ELSE COALESCE(description_az,description) END as description,
      CASE WHEN $1='en' AND services_en IS NOT NULL THEN services_en ELSE COALESCE(services_az,services) END as services
      FROM tours WHERE 1=1`;
    const params = [lang];
    if (filters.category) { params.push(filters.category); sql += ` AND category=$${params.length}`; }
    if (filters.search)   { params.push(`%${filters.search}%`); sql += ` AND (title_az ILIKE $${params.length} OR title_en ILIKE $${params.length})`; }
    if (filters.minPrice) { params.push(filters.minPrice); sql += ` AND price>=$${params.length}`; }
    if (filters.maxPrice) { params.push(filters.maxPrice); sql += ` AND price<=$${params.length}`; }
    if (filters.where?.featured !== undefined) { params.push(filters.where.featured); sql += ` AND featured=$${params.length}`; }
    const countSql = sql.replace(/SELECT.*FROM tours/, 'SELECT COUNT(*) FROM tours');
    const total = parseInt((await pgPool.query(countSql, params)).rows[0].count);
    const limit = filters.limit || 12;
    const offset = filters.offset || 0;
    params.push(limit);  sql += ` ORDER BY "createdAt" DESC LIMIT $${params.length}`;
    params.push(offset); sql += ` OFFSET $${params.length}`;
    const res = await pgPool.query(sql, params);
    return { rows: res.rows, total };
  },

  async getTourById(id, lang = 'az') {
    if (!USE_PG) {
      const tour = await fileStore.query('tours', 'findOne', { id: parseInt(id) });
      return localizeTour(tour, lang);
    }
    const res = await pgPool.query('SELECT * FROM tours WHERE id=$1', [id]);
    return res.rows[0] ? localizeTour(res.rows[0], lang) : null;
  },

  // getRawTour — for admin editing (all language fields returned)
  async getRawTour(id) {
    if (!USE_PG) return fileStore.query('tours', 'findOne', { id: parseInt(id) });
    const res = await pgPool.query('SELECT * FROM tours WHERE id=$1', [id]);
    return res.rows[0] || null;
  },

  async createTour(data) {
    // Ensure bilingual fields
    const enriched = enrichTourData(data);
    if (!USE_PG) return fileStore.query('tours', 'create', { values: enriched });
    const { title_az, title_en, description_az, description_en, price, duration, category,
            image, gallery, services_az, services_en, featured, slug } = enriched;
    const res = await pgPool.query(
      `INSERT INTO tours (title_az,title_en,description_az,description_en,price,duration,
        category,image,gallery,services_az,services_en,featured,slug)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [title_az,title_en,description_az,description_en,price,duration,
       category,image,JSON.stringify(gallery||[]),
       JSON.stringify(services_az||[]),JSON.stringify(services_en||[]),featured||false,slug||'']
    );
    return res.rows[0];
  },

  async updateTour(id, data) {
    const enriched = enrichTourData(data);
    if (!USE_PG) return fileStore.query('tours', 'update', { id: parseInt(id), values: enriched });
    const updateData = {};
    const allowedFields = ['title_az','title_en','description_az','description_en','price','duration',
                           'category','image','gallery','services_az','services_en','featured','slug',
                           'metaTitle','metaDescription'];
    allowedFields.forEach(f => { if (enriched[f] !== undefined) updateData[f] = enriched[f]; });
    const fields = Object.keys(updateData).map((k,i) => `"${k}"=$${i+2}`).join(',');
    const res = await pgPool.query(
      `UPDATE tours SET ${fields},"updatedAt"=NOW() WHERE id=$1 RETURNING *`,
      [id, ...Object.values(updateData)]
    );
    return res.rows[0] || null;
  },

  async deleteTour(id) {
    if (!USE_PG) return fileStore.query('tours', 'delete', { id: parseInt(id) });
    const res = await pgPool.query('DELETE FROM tours WHERE id=$1', [id]);
    return res.rowCount > 0;
  },

  // ── BOOKINGS ────────────────────────────────────────────────────────────────
  async getBookings(filters = {}) {
    if (!USE_PG) {
      const result = await fileStore.query('bookings', 'findAll', filters);
      result.rows = result.rows.map(b => ({
        ...b,
        tourTitle: (() => {
          const t = store.tours.find(t => t.id === b.tourId);
          return t ? (t.title_az || t.title || `Tur #${b.tourId}`) : `Tur #${b.tourId}`;
        })(),
      }));
      result.rows.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      return result;
    }
    const res = await pgPool.query(
      `SELECT b.*, COALESCE(t.title_az, t.title, 'Silinmiş Tur') as "tourTitle"
       FROM bookings b LEFT JOIN tours t ON b."tourId"=t.id ORDER BY b."createdAt" DESC`
    );
    return { rows: res.rows, total: res.rows.length };
  },

  async createBooking(data) {
    if (!USE_PG) return fileStore.query('bookings', 'create', { values: { ...data, status:'pending' } });
    const { tourId, name, email, phone, travelers, date, message } = data;
    const res = await pgPool.query(
      `INSERT INTO bookings ("tourId",name,email,phone,travelers,date,message,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING *`,
      [tourId, name, email, phone, travelers||1, date, message]
    );
    return res.rows[0];
  },

  async updateBookingStatus(id, status) {
    if (!USE_PG) return fileStore.query('bookings', 'update', { id: parseInt(id), values: { status } });
    const res = await pgPool.query('UPDATE bookings SET status=$2 WHERE id=$1 RETURNING *', [id, status]);
    return res.rows[0] || null;
  },

  async deleteBooking(id) {
    if (!USE_PG) return fileStore.query('bookings', 'delete', { id: parseInt(id) });
    const res = await pgPool.query('DELETE FROM bookings WHERE id=$1', [id]);
    return res.rowCount > 0;
  },

  // ── CONTACTS ────────────────────────────────────────────────────────────────
  async saveContact(data) {
    if (!USE_PG) return fileStore.query('contacts', 'create', { values: data });
    return { id: Date.now(), ...data };
  },

  async getContacts() {
    if (!USE_PG) {
      const result = await fileStore.query('contacts', 'findAll', {});
      result.rows.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      return result;
    }
    return { rows:[], total:0 };
  },

  // ── USERS ────────────────────────────────────────────────────────────────────
  async findUserByEmail(email) {
    if (!USE_PG) return fileStore.query('users', 'findOne', { where: { email } });
    const res = await pgPool.query('SELECT * FROM users WHERE email=$1', [email]);
    return res.rows[0] || null;
  },

  async createUser(data) {
    if (!USE_PG) return fileStore.query('users', 'create', { values: data });
    const { email, password, role } = data;
    const res = await pgPool.query('INSERT INTO users (email,password,role) VALUES ($1,$2,$3) RETURNING *', [email, password, role||'admin']);
    return res.rows[0];
  },

  async updateUserPassword(id, hashedPassword) {
    if (!USE_PG) return fileStore.query('users', 'update', { id: parseInt(id), values: { password: hashedPassword } });
    const res = await pgPool.query('UPDATE users SET password=$2 WHERE id=$1 RETURNING *', [id, hashedPassword]);
    return res.rows[0] || null;
  },

  // ── STATS ─────────────────────────────────────────────────────────────────────
  async getStats() {
    if (!USE_PG) {
      return {
        totalTours:       store.tours.length,
        totalBookings:    store.bookings.length,
        pendingBookings:  store.bookings.filter(b => b.status === 'pending').length,
        approvedBookings: store.bookings.filter(b => b.status === 'approved').length,
        featuredTours:    store.tours.filter(t => t.featured).length,
        totalContacts:    (store.contacts||[]).length,
      };
    }
    const [tours, bookings, pending, featured] = await Promise.all([
      pgPool.query('SELECT COUNT(*) FROM tours'),
      pgPool.query('SELECT COUNT(*) FROM bookings'),
      pgPool.query("SELECT COUNT(*) FROM bookings WHERE status='pending'"),
      pgPool.query('SELECT COUNT(*) FROM tours WHERE featured=true'),
    ]);
    return {
      totalTours:       parseInt(tours.rows[0].count),
      totalBookings:    parseInt(bookings.rows[0].count),
      pendingBookings:  parseInt(pending.rows[0].count),
      approvedBookings: parseInt(bookings.rows[0].count) - parseInt(pending.rows[0].count),
      featuredTours:    parseInt(featured.rows[0].count),
      totalContacts:    0,
    };
  },
};

// ── Bilingual data enrichment ─────────────────────────────────────────────────
// When tour data comes in from admin, store it with proper bilingual fields.
function enrichTourData(data) {
  const d = { ...data };

  // If admin sends title_az / title_en explicitly, use them
  // Otherwise, keep existing logic
  if (!d.title_az && d.title) d.title_az = d.title;
  if (!d.title_en && d.title_en_input) d.title_en = d.title_en_input;

  if (!d.description_az && d.description) d.description_az = d.description;
  if (!d.description_en && d.description_en_input) d.description_en = d.description_en_input;

  // Services
  if (!d.services_az) d.services_az = d.services || [];
  if (!d.services_en) d.services_en = d.services_en_input || [];

  // Price must be float
  if (d.price) d.price = parseFloat(d.price);

  return d;
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function initDB() {
  if (USE_PG) {
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
        title_az VARCHAR(255),
        title_en VARCHAR(255),
        description_az TEXT,
        description_en TEXT,
        price DECIMAL(10,2) NOT NULL DEFAULT 0,
        duration VARCHAR(100),
        category VARCHAR(100),
        image TEXT,
        gallery JSONB DEFAULT '[]',
        services_az JSONB DEFAULT '[]',
        services_en JSONB DEFAULT '[]',
        featured BOOLEAN DEFAULT false,
        slug VARCHAR(255),
        "metaTitle" VARCHAR(255),
        "metaDescription" TEXT,
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

      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255), email VARCHAR(255), phone VARCHAR(100),
        subject VARCHAR(255), message TEXT,
        "createdAt" TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ PostgreSQL bağlandı');
  } else {
    const needsSeed = store.users.length === 0;
    if (needsSeed) {
      console.log('📋 İlk işə salınma — seed data əlavə edilir...');
      await seedData();
      console.log('✅ Seed data:', DATA_FILE);
    } else {
      console.log(`✅ JSON fayl: ${store.tours.length} tur, ${store.bookings.length} rezervasiya`);
    }
  }
}

async function seedData() {
  const adminPass = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@2024', 10);
  await fileStore.query('users','create',{ values:{ email: process.env.ADMIN_EMAIL||'admin@caveotravel.com', password: adminPass, role:'admin' } });

  const tours = [
    {
      title_az:'Santorini Gün Batımı Turu',
      title_en:'Santorini Sunset Escape',
      description_az:'Oia kəndinin əfsanəvi gün batımını özəl villa ilə yaşayın. Kaldera ətrafında yaxta turu, Egey dənizinin ulduzları altında qastronom yeməklər.',
      description_en:'Experience the legendary sunsets of Oia with private villa access, yacht tours around the caldera, and gourmet dining under the Aegean stars.',
      price:4200, duration:'7 gün / 7 days', category:'Europe',
      image:'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800&fm=webp&q=85',
      gallery:['https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=1200&fm=webp&q=85'],
      services_az:['Özəl Villa','Yaxta Turu','Qastronom Yemək','Aeroport Transferi','Şərab Dadması'],
      services_en:['Private Villa','Yacht Tour','Gourmet Dining','Airport Transfer','Wine Tasting'],
      featured:true, slug:'santorini-sunset-escape',
    },
    {
      title_az:'Maldiv Mirvari Körfəzi',
      title_en:'Maldives Pearl Retreat',
      description_az:'Kristal aylaqlar üzərindəki su üstü bungalovlar. Balina köpəkbalıqları ilə üzmə, cütlük spa ritualları, şəxsi aşpazınızın hazırladığı fərdi menyular.',
      description_en:'Overwater bungalows above crystal-clear lagoons. Dive with whale sharks, enjoy couples spa rituals, and savour personalised menus crafted by your private chef.',
      price:6800, duration:'10 gün / 10 days', category:'Asia',
      image:'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=800&fm=webp&q=85',
      gallery:['https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=1200&fm=webp&q=85'],
      services_az:['Su Üstü Bungalov','Dalış Seansları','Spa Paketi','Şəxsi Aşpaz','Dəniz Uçuşu'],
      services_en:['Overwater Bungalow','Diving Sessions','Spa Package','Private Chef','Seaplane Transfer'],
      featured:true, slug:'maldives-pearl-retreat',
    },
    {
      title_az:'Yaponiya Sakura Səyahəti',
      title_en:'Japanese Sakura Journey',
      description_az:'Kiotodan Tokio-ya qədər albalı çiçəklərini izləyin. Shin-kansen sürəti, traditional ryokan qalması, kaiseki mətbəxi. Yaponiya, ən poetik anında.',
      description_en:'Chase cherry blossoms through Kyoto\'s ancient temples to Tokyo\'s neon canyons. Bullet trains, traditional ryokan stays, and kaiseki cuisine.',
      price:5100, duration:'12 gün / 12 days', category:'Asia',
      image:'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800&fm=webp&q=85',
      gallery:['https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=1200&fm=webp&q=85'],
      services_az:['Ryokan Qalması','Bullet Train Bilet','Çay Mərasimi','Məbəd Turları','Özəl Bələdçi'],
      services_en:['Ryokan Stay','Bullet Train Pass','Tea Ceremony','Temple Tours','Private Guide'],
      featured:true, slug:'japanese-sakura-journey',
    },
    {
      title_az:'Dubai Ultra Lüks',
      title_en:'Dubai Ultra Luxury',
      description_az:'Helikopterlə Burj Al Arab-a gəliş, gecə göy üzü altında səhra kempinqi, superkar şəhər turu. Müasir dəbdəbənin zirvəsi.',
      description_en:'Seven-star Burj Al Arab experience with helicopter arrival, desert glamping under the Milky Way, supercar tour of the city. The pinnacle of modern opulence.',
      price:7500, duration:'6 gün / 6 days', category:'Middle East',
      image:'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&fm=webp&q=85',
      gallery:['https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1200&fm=webp&q=85'],
      services_az:['Burj Al Arab','Helikopter Turu','Səhra Safarisi','Superkar Təcrübəsi','Şəxsi Konsyers'],
      services_en:['Burj Al Arab Stay','Helicopter Tour','Desert Safari','Supercar Experience','Personal Concierge'],
      featured:true, slug:'dubai-ultra-luxury',
    },
    {
      title_az:'Bali İlahi Sağlamlıq',
      title_en:'Bali Divine Wellness',
      description_az:'Balinin mənəvi şəfa ənənələrinə qərq olun. Ubud cəngəl villası ilə sonsuzluq hovuzu, Batur dağında gün doğuşu yoqa.',
      description_en:'Immerse in Bali\'s spiritual healing traditions. Ubud jungle villa with infinity pool, sunrise yoga at Mount Batur, traditional Balinese massage.',
      price:2900, duration:'7 gün / 7 days', category:'Asia',
      image:'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&fm=webp&q=85',
      gallery:['https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=1200&fm=webp&q=85'],
      services_az:['Cəngəl Villası','Gündəlik Yoqa','Spa Müalicəsi','Vulkan Yürüyüşü','Məbəd Turları'],
      services_en:['Jungle Villa','Daily Yoga','Spa Treatments','Volcano Trek','Temple Tours'],
      featured:true, slug:'bali-divine-wellness',
    },
    {
      title_az:'Amalfi Sahili Sürüşü',
      title_en:'Amalfi Coast Drive',
      description_az:'Parıltılı Tireniya dənizi üzərindəki uçurum yollarında sürun. Özəl limuzin, Pozitanoda Michelin naharı, Kapri-yə gün batımı kruizi.',
      description_en:'Wind along cliff-hugging roads above the sparkling Tyrrhenian Sea. Private limousine, Michelin-starred lunch in Positano, sunset cruise to Capri.',
      price:3800, duration:'8 gün / 8 days', category:'Europe',
      image:'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=800&fm=webp&q=85',
      gallery:['https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=1200&fm=webp&q=85'],
      services_az:['Lüks Villa','Özəl Sürücü','Kapri Kruizi','Yemək Dərnəyi','Michelin Axşam'],
      services_en:['Luxury Villa','Private Driver','Capri Cruise','Cooking Class','Michelin Dinner'],
      featured:false, slug:'amalfi-coast-drive',
    },
    {
      title_az:'Pataqoniya Çöl Ekspedisiyası',
      title_en:'Patagonia Wilderness Trek',
      description_az:'Torres del Paine-nin ikonik qranit qüllərinə rehberlik olunan ekspedisiya. Lüks çölkəmpinq, pampas üzrə at sürmə.',
      description_en:'Guided expedition to Torres del Paine\'s iconic granite towers. Luxury glamping with panoramic lake views, private horse rides across pampas.',
      price:4900, duration:'9 gün / 9 days', category:'Americas',
      image:'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&fm=webp&q=85',
      gallery:['https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1200&fm=webp&q=85'],
      services_az:['Lüks Çölkəmpinq','Ekspert Bələdçilər','At Sürmə','Foto Seansları','Bütün Yeməklər'],
      services_en:['Luxury Glamping','Expert Guides','Horse Riding','Photography Sessions','All Meals'],
      featured:false, slug:'patagonia-wilderness-trek',
    },
    {
      title_az:'Mərakeş İmperator Şəhərləri',
      title_en:'Moroccan Imperial Cities',
      description_az:'Marrakech medinalarından Fez qədim dabbaqxanalarına qədər. Konvertə çevrilmiş riad qalmaları, Erg Chebbi səhrasında dəvə yürüyüşü.',
      description_en:'From Marrakech medinas to Fez\'s ancient tanneries. Converted riad stays, camel rides at Erg Chebbi dunes, traditional Moroccan cuisine.',
      price:3200, duration:'10 gün / 10 days', category:'Africa',
      image:'https://images.unsplash.com/photo-1489493887464-892be6d1daae?w=800&fm=webp&q=85',
      gallery:['https://images.unsplash.com/photo-1489493887464-892be6d1daae?w=1200&fm=webp&q=85'],
      services_az:['Riad Qalmaları','Dəvə Yürüyüşü','Yemək Dərnəyi','Hamam Spa','Özəl Bələdçi'],
      services_en:['Riad Stays','Camel Trek','Cooking Class','Hammam Spa','Private Guide'],
      featured:false, slug:'moroccan-imperial-cities',
    },
  ];

  for (const t of tours) {
    await fileStore.query('tours','create',{ values:{ ...t, title: t.title_az, description: t.description_az, services: t.services_az } });
  }

  const bookings = [
    { tourId:1, name:'Leyla Hüseynova',   email:'leyla@example.com', phone:'+994501234567', travelers:2, date:'2025-06-15', message:'Toy ildönümü', status:'approved' },
    { tourId:2, name:'Murad Əliyev',      email:'murad@example.com', phone:'+994559876543', travelers:2, date:'2025-07-20', message:'İldönümü',     status:'pending'  },
    { tourId:4, name:'Anar Məmmədov',     email:'anar@example.com',  phone:'+994701112233', travelers:4, date:'2025-05-10', message:'VIP paket',    status:'approved' },
    { tourId:3, name:'Nigar Qasımova',    email:'nigar@example.com', phone:'+994514445566', travelers:1, date:'2025-04-01', message:'Tək səyahət',  status:'pending'  },
  ];

  for (const b of bookings) await fileStore.query('bookings','create',{ values:{ ...b, status:b.status } });
}

module.exports = { db, initDB };
