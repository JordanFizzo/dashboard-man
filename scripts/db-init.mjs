import { ensureTables } from '../lib/db.js';

(async () => {
  try {
    await ensureTables();
    console.log('Database tables ensured.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to ensure tables:', err);
    process.exit(1);
  }
})();
