// EXPRESS VERSION OF FLOODIFY APP
// Replaces Cloudflare Workers with standard Node.js/Express

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'
import { generateUltraSimpleVideos } from './src/ultra-simple-video-express.js'

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3000
const ADMIN_API_KEY = process.env.ADMIN_API_KEY
const MAX_BODY_MB = parseInt(process.env.MAX_BODY_MB || '50', 10)
const EXPOSE_ERRORS = process.env.EXPOSE_ERRORS === 'true'
const REQUIRE_ADMIN_KEY = (process.env.REQUIRE_ADMIN_KEY ?? (process.env.NODE_ENV === 'production' ? 'true' : 'false')) === 'true'

app.disable('x-powered-by')

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    if (allowedOrigins.length === 0) {
      const isLocal = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')
      return callback(null, isLocal)
    }
    return callback(null, allowedOrigins.includes(origin))
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}

const securityHeaders = (req, res, next) => {
  const defaultCsp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
    "img-src 'self' data: https: blob:",
    "font-src 'self' https://cdnjs.cloudflare.com data:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
  ].join('; ')

  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  res.setHeader('Content-Security-Policy', process.env.CSP || defaultCsp)
  next()
}

const requireAdminKey = (req, res, next) => {
  if (!REQUIRE_ADMIN_KEY) return next()
  if (!ADMIN_API_KEY) {
    return res.status(503).json({ success: false, error: 'Admin API key is required' })
  }
  const headerKey = req.get('x-admin-key') || ''
  const authHeader = req.get('authorization') || ''
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : ''
  const key = headerKey || bearer
  if (key !== ADMIN_API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }
  return next()
}

// Initialize SQLite database (same as D1)
const db = new Database('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/391411e33ef3a24dec4a6d2f55da94c90eaaa4ec5d4b1c153b5e1760bbf8aa66.sqlite')

// Middleware
app.use(cors(corsOptions))
app.use(securityHeaders)
app.use(express.json({ limit: `${MAX_BODY_MB}mb` }))
app.use(express.urlencoded({ extended: true, limit: `${MAX_BODY_MB}mb` }))
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  return requireAdminKey(req, res, next)
})

// Serve static files
app.use('/static', express.static(path.join(__dirname, 'public/static')))
app.use('/static', express.static(path.join(__dirname, 'dist/static')))

// Helper to convert D1 queries to SQLite
const dbQuery = (query, params = []) => {
  try {
    if (query.trim().toUpperCase().startsWith('SELECT')) {
      const stmt = db.prepare(query)
      const results = params.length > 0 ? stmt.all(...params) : stmt.all()
      return { results, success: true }
    } else {
      const stmt = db.prepare(query)
      const info = params.length > 0 ? stmt.run(...params) : stmt.run()
      return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } }
    }
  } catch (error) {
    console.error('Database error:', error)
    throw error
  }
}

const sendError = (res, status, error, fallbackMessage) => {
  const message = EXPOSE_ERRORS && error?.message ? error.message : fallbackMessage
  return res.status(status).json({ success: false, error: message })
}

// Environment helper
const env = {
  DB: {
    prepare: (query) => ({
      bind: (...params) => ({
        all: () => dbQuery(query, params),
        run: () => dbQuery(query, params),
        first: () => {
          const result = dbQuery(query, params)
          return result.results?.[0] || null
        }
      }),
      all: () => dbQuery(query),
      run: () => dbQuery(query),
      first: () => {
        const result = dbQuery(query)
        return result.results?.[0] || null
      }
    })
  },
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  FAL_API_KEY: process.env.FAL_API_KEY,
  IMAGE_GENERATION_ENABLED: process.env.IMAGE_GENERATION_ENABLED,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  RUNWAY_API_KEY: process.env.RUNWAY_API_KEY,
  APIFY_TOKEN: process.env.APIFY_TOKEN,
  MIDJOURNEY_COOKIE: process.env.MIDJOURNEY_COOKIE,
  // External processing removed for this portfolio repo
  PROCESS_MYSQL_USER: process.env.PROCESS_MYSQL_USER,
  PROCESS_MYSQL_PASSWORD: process.env.PROCESS_MYSQL_PASSWORD,
  PROCESS_MYSQL_SSL_CERT: process.env.PROCESS_MYSQL_SSL_CERT
}

// Video service imported at top of file

// ============= STYLES MANAGEMENT =============

app.get('/api/styles', async (req, res) => {
  try {
    const styles = await env.DB.prepare(`
      SELECT * FROM styles ORDER BY model, name
    `).all()
    
    if (!styles.results || styles.results.length === 0) {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO styles (name, model, master_prompt) VALUES
        ('Gritty iPhone Realism', 'SEED_DREAM', 'low quality, extreme grain, raw, Shaky iPhone candid video still of [subject] [action]'),
        ('Custom Style 1', 'SEED_DREAM', '[subject] [action]')
      `).run()
      
      await env.DB.prepare(`
        INSERT OR IGNORE INTO styles (name, model, master_prompt) VALUES
        ('Style 1', 'IMAGEN_4', '[subject] [action] [location]'),
        ('Style 2', 'IMAGEN_4', '[subject] [action]')
      `).run()
      
      const updatedStyles = await env.DB.prepare(`
        SELECT * FROM styles ORDER BY model, name
      `).all()
      
      return res.json({ success: true, styles: updatedStyles.results })
    }
    
    res.json({ success: true, styles: styles.results })
  } catch (error) {
    sendError(res, 500, error, 'Internal server error')
  }
})

app.post('/api/styles', async (req, res) => {
  const { name, model, masterPrompt, isCustom } = req.body
  
  try {
    await env.DB.prepare(`
      INSERT INTO styles (name, model, master_prompt, is_custom)
      VALUES (?, ?, ?, ?)
    `).bind(name, model, masterPrompt, isCustom ? 1 : 0).run()
    
    res.json({ success: true })
  } catch (error) {
    sendError(res, 500, error, 'Internal server error')
  }
})

// ============= ULTRA SIMPLE VIDEO =============

app.post('/api/ultra-simple-video', async (req, res) => {
  const { sessionIds } = req.body
  
  if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
    return res.status(400).json({ 
      success: false, 
      error: 'sessionIds array is required' 
    })
  }
  
  const apiKey = env.FAL_API_KEY
  
  if (!apiKey) {
    return res.status(500).json({ 
      success: false, 
      error: 'FAL_API_KEY not configured' 
    })
  }
  
  console.log(`🎬 ULTRA SIMPLE VIDEO - Starting for ${sessionIds.length} sessions`)
  
  try {
    const result = await generateUltraSimpleVideos(env, {
      sessionIds,
      apiKey
    })
    
    console.log(`✅ ULTRA SIMPLE VIDEO - Complete:`, result)
    
    res.json(result)
  } catch (error) {
    console.error(`❌ ULTRA SIMPLE VIDEO - Error:`, error)
    sendError(res, 500, error, 'Ultra simple video failed')
  }
})

// ============= GALLERY SEARCH =============

app.get('/api/gallery/search', async (req, res) => {
  const { 
    search, 
    theme, 
    model, 
    tags,
    sessionIds,
    limit = '50',
    sort = 'newest',
    type = 'all'
  } = req.query
  
  try {
    const items = []
    
    // Fetch images if requested
    if (type === 'all' || type === 'images') {
      let imageQuery = `SELECT *, 'image' as media_type FROM gallery_images WHERE 1=1`
      const imageParams = []
      
      if (search) {
        imageQuery += ` AND (prompt LIKE ? OR theme_name LIKE ?)`
        imageParams.push(`%${search}%`, `%${search}%`)
      }
      
      if (theme) {
        imageQuery += ` AND theme_name = ?`
        imageParams.push(theme)
      }
      
      if (model) {
        imageQuery += ` AND model = ?`
        imageParams.push(model)
      }
      
      if (tags) {
        imageQuery += ` AND tags LIKE ?`
        imageParams.push(`%${tags}%`)
      }
      
      if (sessionIds) {
        const sessionIdList = sessionIds.split(',').map(id => id.trim()).filter(id => id)
        if (sessionIdList.length > 0) {
          const placeholders = sessionIdList.map(() => '?').join(',')
          imageQuery += ` AND session_id IN (${placeholders})`
          imageParams.push(...sessionIdList)
        }
      }
      
      imageQuery += ` ORDER BY created_at DESC LIMIT ?`
      imageParams.push(parseInt(limit))
      
      const imageResults = await env.DB.prepare(imageQuery).bind(...imageParams).all()
      items.push(...imageResults.results || [])
    }
    
    // Fetch videos if requested
    if (type === 'all' || type === 'videos') {
      let videoQuery = `
        SELECT v.*, 'video' as media_type, g.image_url as thumbnail_url, g.theme_name, g.model, g.prompt
        FROM gallery_videos v
        LEFT JOIN gallery_images g ON v.gallery_image_id = g.id
        WHERE 1=1
      `
      const videoParams = []
      
      if (search) {
        videoQuery += ` AND (v.prompt LIKE ? OR g.theme_name LIKE ?)`
        videoParams.push(`%${search}%`, `%${search}%`)
      }
      
      if (sessionIds) {
        const sessionIdList = sessionIds.split(',').map(id => id.trim()).filter(id => id)
        if (sessionIdList.length > 0) {
          const placeholders = sessionIdList.map(() => '?').join(',')
          videoQuery += ` AND v.session_id IN (${placeholders})`
          videoParams.push(...sessionIdList)
        }
      }
      
      videoQuery += ` ORDER BY v.created_at DESC LIMIT ?`
      videoParams.push(parseInt(limit))
      
      const videoResults = await env.DB.prepare(videoQuery).bind(...videoParams).all()
      items.push(...videoResults.results || [])
    }
    
    res.json({ 
      success: true, 
      items,
      totalCount: items.length
    })
  } catch (error) {
    console.error('Gallery search error:', error)
    sendError(res, 500, error, 'Internal server error')
  }
})

// ============= GALLERY SESSION DETAIL =============

app.get('/api/gallery/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params
  
  try {
    // Get images
    const images = await env.DB.prepare(`
      SELECT * FROM gallery_images 
      WHERE session_id = ? 
      ORDER BY created_at DESC
    `).bind(sessionId).all()
    
    // Get videos
    const videos = await env.DB.prepare(`
      SELECT v.*, g.image_url as thumbnail_url
      FROM gallery_videos v
      LEFT JOIN gallery_images g ON v.gallery_image_id = g.id
      WHERE v.session_id = ?
      ORDER BY v.created_at DESC
    `).bind(sessionId).all()
    
    res.json({
      success: true,
      session: {
        session_id: sessionId,
        images: images.results || [],
        videos: videos.results || []
      }
    })
  } catch (error) {
    console.error('Session detail error:', error)
    sendError(res, 500, error, 'Internal server error')
  }
})

// ============= GALLERY SESSIONS =============

app.get('/api/gallery/sessions', async (req, res) => {
  try {
    const sessions = await env.DB.prepare(`
      WITH session_images AS (
        SELECT 
          session_id,
          COUNT(*) as image_count,
          SUM(CASE WHEN image_url IS NOT NULL OR r2_key IS NOT NULL THEN 1 ELSE 0 END) as images_with_url
        FROM gallery_images
        GROUP BY session_id
      ),
      session_videos AS (
        SELECT 
          session_id,
          COUNT(*) as video_count,
          SUM(CASE WHEN video_url IS NOT NULL THEN 1 ELSE 0 END) as videos_with_url
        FROM gallery_videos
        GROUP BY session_id
      )
      SELECT 
        COALESCE(si.session_id, sv.session_id) as session_id,
        COALESCE(si.image_count, 0) as image_count,
        COALESCE(si.images_with_url, 0) as images_with_url,
        COALESCE(sv.video_count, 0) as video_count,
        COALESCE(sv.videos_with_url, 0) as videos_with_url,
        CASE 
          WHEN sv.session_id IS NOT NULL THEN 1
          ELSE 0
        END as is_video_session,
        CASE
          WHEN sv.video_count > 0 AND sv.videos_with_url < sv.video_count THEN 'processing'
          WHEN sv.video_count > 0 AND sv.videos_with_url = sv.video_count THEN 'complete'
          ELSE 'complete'
        END as status
      FROM session_images si
      FULL OUTER JOIN session_videos sv ON si.session_id = sv.session_id
      ORDER BY COALESCE(si.session_id, sv.session_id) DESC
    `).all()
    
    res.json({ success: true, sessions: sessions.results || [] })
  } catch (error) {
    console.error('Error fetching sessions:', error)
    sendError(res, 500, error, 'Internal server error')
  }
})

// ============= GALLERY STATS =============

app.get('/api/gallery/stats', async (req, res) => {
  try {
    const stats = await env.DB.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM gallery_images WHERE image_url IS NOT NULL OR r2_key IS NOT NULL) as total_images,
        (SELECT COUNT(DISTINCT session_id) FROM gallery_images) as total_sessions,
        (SELECT COUNT(*) FROM gallery_videos WHERE video_url IS NOT NULL) as total_videos
    `).first()
    
    res.json({ success: true, stats })
  } catch (error) {
    sendError(res, 500, error, 'Internal server error')
  }
})

// ============= ROOT ROUTE - Serve Frontend =============

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

// Error handler
app.use((err, req, res, next) => {
  console.error('Express error:', err)
  const isProd = process.env.NODE_ENV === 'production'
  res.status(500).json({ success: false, error: isProd ? 'Internal Server Error' : err.message })
})

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(``)
  console.log(`🚀 Express Server Started`)
  console.log(``)
  console.log(`✅ Server: http://localhost:${PORT}`)
  console.log(`✅ Database: SQLite (same as D1)`)
  console.log(`✅ Puppeteer: http://localhost:3001`)
  console.log(``)
  console.log(`📋 Available APIs:`)
  console.log(`   POST /api/ultra-simple-video`)
  console.log(`   GET  /api/gallery/sessions`)
  console.log(`   GET  /api/gallery/stats`)
  console.log(`   GET  /api/styles`)
  console.log(`   ... and more routes`)
  console.log(``)
})

export default app
