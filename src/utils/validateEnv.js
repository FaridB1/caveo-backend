// backend/src/utils/validateEnv.js
// Environment variable validation for production safety

function validateEnv() {
  const required = [
    'JWT_SECRET',
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD',
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ XƏTA: Lazımi environment variable-lar yoxdur:');
    missing.forEach(key => console.error(`   - ${key}`));
    process.exit(1);
  }

  // JWT_SECRET must be at least 32 characters
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.error('❌ XƏTA: JWT_SECRET ən azı 32 simvol olmalıdır!');
    console.error('   Hazırda:', process.env.JWT_SECRET.length, 'simvol');
    process.exit(1);
  }

  // Production warnings
  if (process.env.NODE_ENV === 'production') {
    // Warn if using default admin password
    if (process.env.ADMIN_PASSWORD === 'Admin@2024') {
      console.warn('⚠️  XƏBƏRDARLIQ: Default admin şifrəsini istifadə edirsiniz!');
      console.warn('   İlk login-dən sonra dəyişdirin.');
    }

    // Warn if not using PostgreSQL
    if (process.env.USE_DATABASE !== 'true') {
      console.warn('⚠️  XƏBƏRDARLIQ: PostgreSQL istifadə etmirsiniz!');
      console.warn('   Production-da bütün məlumatlar silinəcək.');
      console.warn('   USE_DATABASE=true edin və DATABASE_URL əlavə edin.');
    }

    // Warn if DATABASE_URL missing when USE_DATABASE=true
    if (process.env.USE_DATABASE === 'true' && !process.env.DATABASE_URL) {
      console.error('❌ XƏTA: USE_DATABASE=true amma DATABASE_URL yoxdur!');
      process.exit(1);
    }
  }

  console.log('✅ Environment variables yoxlandı');
}

module.exports = { validateEnv };
