const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Find the database file
const dbDir = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const files = fs.readdirSync(dbDir);
const dbFile = files.find(f => f.endsWith('.sqlite'));
const dbPath = path.join(dbDir, dbFile);

console.log('Opening database:', dbPath);
const db = new Database(dbPath);

console.log('\n✨ Cleanup complete!');
console.log(`\nRemaining images: ${db.prepare('SELECT COUNT(*) as count FROM gallery_images').get().count}`);
console.log(`Remaining videos: ${db.prepare('SELECT COUNT(*) as count FROM gallery_videos').get().count}`);

db.close();
