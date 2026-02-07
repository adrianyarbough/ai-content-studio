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

const keepSessions = [
  'bulk-video-1760219716572-8uvwcq',
  'bulk-video-1760219716572-wku3gc',
  'bulk-video-1760219716573-g13g6',
  'bulk-video-1760219716573-i1654n',
  'bulk-video-1760219716573-n2ncw',
  'bulk-video-1760219716573-z6asfw',
  'bulk-video-1760219716573-zh1fsk',
  'bulk-video-1760215231449-521igq',
  'bulk-video-1760215231449-b1da1c',
  'bulk-video-1760215231449-e7futi',
  'bulk-video-1760215231449-vg938',
  'bulk-video-1760215231449-z7zr8k',
  'bulk-midjourney-1760211823716-8s2i0m',
  'bulk-midjourney-1760210472458-eesph',
  'bulk-midjourney-1760208000161-4golz6',
  'bulk-midjourney-1760206642523-drbdn',
  'bulk-midjourney-1760203294612-h8dlxo',
  'bulk-midjourney-1760202120034-dj92vf',
  'bulk-midjourney-1760198747831-b26q7b',
  'bulk-midjourney-1760195959222-83o7fk',
  'bulk-midjourney-1760193639474-goczlr',
  'bulk-video-1760144762289-7qah2c',
  'bulk-video-1760144762289-8k2gbx',
  'bulk-video-1760144762290-7nzxwj',
  'bulk-video-1760144762290-8loavn',
  'bulk-video-1760144762290-e1el4p',
  'bulk-video-1760144762290-fm8u0j',
  'bulk-video-1760144762290-lnw45e'
];

const placeholders = keepSessions.map(() => '?').join(',');

// Disable foreign keys temporarily - MUST be on same connection
db.exec('PRAGMA foreign_keys = OFF');

console.log('\nDeleting images from unwanted sessions...');
const deleteImages = db.prepare(`DELETE FROM gallery_images WHERE session_id NOT IN (${placeholders}) AND session_id LIKE 'bulk-%'`);
const imagesResult = deleteImages.run(...keepSessions);
console.log(`✅ Deleted ${imagesResult.changes} images`);

console.log('\nDeleting videos from unwanted sessions...');
const deleteVideos = db.prepare(`DELETE FROM gallery_videos WHERE session_id NOT IN (${placeholders}) AND session_id LIKE 'bulk-%'`);
const videosResult = deleteVideos.run(...keepSessions);
console.log(`✅ Deleted ${videosResult.changes} videos`);

console.log('\nSkipping production_sessions (empty or no session_id column)...');

console.log('\nSkipping bulk_theme_profiles (no session_id column)...');

// Re-enable foreign keys
db.prepare('PRAGMA foreign_keys = ON').run();

console.log('\n✨ Cleanup complete!');
console.log(`\nRemaining images: ${db.prepare('SELECT COUNT(*) as count FROM gallery_images').get().count}`);
console.log(`Remaining videos: ${db.prepare('SELECT COUNT(*) as count FROM gallery_videos').get().count}`);

db.close();
