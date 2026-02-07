// COMPLETE EXPRESS VERSION OF FLOODIFY APP
// ALL routes from Cloudflare Workers - NO restrictions!

import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import archiver from 'archiver'
import fetch from 'node-fetch'
import { v2 as cloudinary } from 'cloudinary'

// Load environment from .dev.vars (not .env)
dotenv.config({ path: '.dev.vars' })
import path from 'path'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'

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
const dbPath = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/391411e33ef3a24dec4a6d2f55da94c90eaaa4ec5d4b1c153b5e1760bbf8aa66.sqlite'
const db = new Database(dbPath)

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

console.log(`📁 Database: ${dbPath}`)

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

// Helper to convert D1 queries to SQLite (better-sqlite3 format)
const dbQuery = (query, params = []) => {
  try {
    const upperQuery = query.trim().toUpperCase()
    
    if (upperQuery.startsWith('SELECT') || upperQuery.startsWith('WITH')) {
      const stmt = db.prepare(query)
      const results = params.length > 0 ? stmt.all(...params) : stmt.all()
      return { results, success: true }
    } else {
      const stmt = db.prepare(query)
      const info = params.length > 0 ? stmt.run(...params) : stmt.run()
      return { 
        success: true, 
        meta: { 
          changes: info.changes, 
          last_row_id: info.lastInsertRowid,
          rows_written: info.changes
        } 
      }
    }
  } catch (error) {
    console.error('❌ Database error:', error.message)
    console.error('Query:', query)
    console.error('Params:', params)
    throw error
  }
}

const sendError = (res, status, error, fallbackMessage) => {
  const message = EXPOSE_ERRORS && error?.message ? error.message : fallbackMessage
  return res.status(status).json({ success: false, error: message })
}

// Environment helper (mimics Cloudflare Workers env)
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
}

// Import services (we'll load them dynamically)
let generateUltraSimpleVideos
let generateImage, generateImageBatch, MODEL_MAPPINGS
let getDeploymentLogs, logDeploymentStep, runBulkDeploy
let generateMultiselectVideos

// Load services dynamically
const loadServices = async () => {
  try {
    const ultraSimpleVideo = await import('./src/ultra-simple-video-express.js')
    generateUltraSimpleVideos = ultraSimpleVideo.generateUltraSimpleVideos
    console.log('✅ Loaded: ultra-simple-video')
  } catch (err) {
    console.log('⚠️  ultra-simple-video not available:', err.message)
  }
  
  // Add more service loading as needed
}

// Load services on startup
await loadServices()

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

// ============= THEME MANAGEMENT =============

app.get('/api/themes', async (req, res) => {
  try {
    const themes = await env.DB.prepare(`
      SELECT 
        t.*,
        s.name as style_name,
        COUNT(CASE WHEN te.test_result = 'pass' THEN 1 END) as approved_count,
        COUNT(CASE WHEN te.test_result = 'fail' THEN 1 END) as failed_count,
        COUNT(CASE WHEN te.tested = 0 THEN 1 END) as remaining_count,
        COUNT(te.id) as total_elements
      FROM themes t
      LEFT JOIN styles s ON t.style_id = s.id
      LEFT JOIN testing_elements te ON t.theme_id = te.theme_id
      GROUP BY t.theme_id
      ORDER BY t.created_at DESC
    `).all()
    
    res.json({ success: true, themes: themes.results || [] })
  } catch (error) {
    sendError(res, 500, error, 'Internal server error')
  }
})

app.get('/api/themes/:themeId/details', async (req, res) => {
  const { themeId } = req.params
  
  try {
    const theme = await env.DB.prepare(`
      SELECT t.*, s.name as style_name, s.master_prompt
      FROM themes t
      LEFT JOIN styles s ON t.style_id = s.id
      WHERE t.theme_id = ?
    `).bind(themeId).first()
    
    if (!theme) {
      return res.status(404).json({ success: false, error: 'Theme not found' })
    }
    
    res.json({ success: true, theme })
  } catch (error) {
    sendError(res, 500, error, 'Internal server error')
  }
})

app.post('/api/themes', async (req, res) => {
  const { name, description, style_id, testing_rules } = req.body
  
  try {
    const themeId = `theme-${Date.now()}-${Math.random().toString(36).substring(7)}`
    
    await env.DB.prepare(`
      INSERT INTO themes (theme_id, name, description, style_id, testing_rules, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).bind(themeId, name, description || '', style_id, JSON.stringify(testing_rules || {})).run()
    
    res.json({ success: true, themeId })
  } catch (error) {
    sendError(res, 500, error, 'Internal server error')
  }
})

app.delete('/api/themes/:themeId', async (req, res) => {
  const { themeId } = req.params
  
  try {
    await env.DB.prepare(`DELETE FROM testing_elements WHERE theme_id = ?`).bind(themeId).run()
    await env.DB.prepare(`DELETE FROM themes WHERE theme_id = ?`).bind(themeId).run()
    
    res.json({ success: true })
  } catch (error) {
    sendError(res, 500, error, 'Internal server error')
  }
})

// ============= MANUAL IMAGE UPLOAD =============

app.post('/api/manual-upload', async (req, res) => {
  const { sessionId, sessionName, category, images, batchInfo } = req.body
  
  console.log(`📤 Manual upload batch: ${sessionName} (${category}) - ${images?.length || 0} images - Batch ${batchInfo?.batchIndex + 1 || 1}/${batchInfo?.totalBatches || 1}`)
  
  // Validate input
  if (!images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ 
      success: false, 
      error: 'No images provided' 
    })
  }
  
  try {
    // Use provided sessionId (from frontend) or generate new one
    const actualSessionId = sessionId || `manual-upload-${Date.now()}-${Math.random().toString(36).substring(7)}`
    const batchId = `bulk-deploy-${actualSessionId}-manual`
    const themeId = category || 'Manual'
    const themeName = `${themeId} - ${sessionName}`
    
    console.log(`📤 Processing batch for session: ${actualSessionId}`)
    
    // Only log start on first batch
    if (batchInfo?.isFirstBatch) {
      await env.DB.prepare(`
        INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
        VALUES (?, 'manual_upload_start', ?, ?, 'info', datetime('now'))
      `).bind(
        actualSessionId, 
        `Starting manual upload: ${sessionName}`, 
        JSON.stringify({ category: themeId, sessionName, totalBatches: batchInfo.totalBatches })
      ).run()
    }
    
    // Process images in background (don't await - return immediately)
    processManualUpload(env, actualSessionId, batchId, themeId, themeName, images, batchInfo).then(() => {
      console.log(`✅ Manual upload batch ${batchInfo?.batchIndex + 1 || 1} completed for ${actualSessionId}`)
    }).catch(error => {
      console.error(`❌ Manual upload batch failed for ${actualSessionId}:`, error)
    })
    
    // Return immediately
    res.json({ 
      success: true, 
      sessionId: actualSessionId,
      message: `Processing batch ${batchInfo?.batchIndex + 1 || 1}/${batchInfo?.totalBatches || 1}`
    })
    
  } catch (error) {
    console.error('❌ Manual upload error:', error)
    sendError(res, 500, error, 'Internal server error')
  }
})

// Process manual upload (async function with Cloudinary upload)
async function processManualUpload(env, sessionId, batchId, themeId, themeName, images, batchInfo) {
  console.log(`📤 Processing manual upload batch ${batchInfo?.batchIndex + 1 || 1}: ${images.length} images`)
  
  try {
    // Upload each image to Cloudinary and save to database
    let successCount = 0
    const globalOffset = batchInfo?.globalOffset || 0 // Get global offset to prevent duplicates
    
    for (let i = 0; i < images.length; i++) {
      const image = images[i]
      const globalIndex = globalOffset + i // Use GLOBAL index, not batch-local index
      
      try {
        console.log(`📤 [${globalIndex + 1}] Uploading ${image.filename} to Cloudinary...`)
        
        // Upload to Cloudinary (base64 data URL)
        const uploadResult = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload(
            image.data, // Base64 data URL
            {
              folder: 'manual-uploads',
              resource_type: 'image',
              public_id: `${sessionId}_${globalIndex}` // Use GLOBAL index to ensure uniqueness
            },
            (error, result) => {
              if (error) reject(error)
              else resolve(result)
            }
          )
        })
        
        console.log(`✅ [${globalIndex + 1}] Uploaded to Cloudinary: ${uploadResult.secure_url}`)
        
        // Insert into gallery_images (EXACT SAME STRUCTURE as Midjourney)
        await env.DB.prepare(`
          INSERT INTO gallery_images (
            batch_id, session_id, theme_id, theme_name, model, 
            prompt, image_url, tags, favorited, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          batchId,
          sessionId,
          themeId,
          themeName,
          'MANUAL_UPLOAD',
          image.filename, // Use filename as prompt
          uploadResult.secure_url,
          JSON.stringify([themeId, 'Uploaded']),
          0
        ).run()
        
        successCount++
        
        // Log progress every 10 images
        if ((i + 1) % 10 === 0) {
          await env.DB.prepare(`
            INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
            VALUES (?, 'manual_upload_progress', ?, ?, 'info', datetime('now'))
          `).bind(
            sessionId,
            `Uploaded ${i + 1}/${images.length} images`,
            JSON.stringify({ completed: i + 1, total: images.length })
          ).run()
        }
        
      } catch (imageError) {
        console.error(`❌ Failed to upload image ${i + 1}:`, imageError)
        // Continue with next image instead of failing entire batch
      }
    }
    
    // Log progress for this batch
    await env.DB.prepare(`
      INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
      VALUES (?, 'manual_upload_progress', ?, ?, 'info', datetime('now'))
    `).bind(
      sessionId,
      `Batch ${batchInfo?.batchIndex + 1 || 1}/${batchInfo?.totalBatches || 1} uploaded`,
      JSON.stringify({ batchIndex: batchInfo?.batchIndex, successCount, batchSize: images.length })
    ).run()
    
    // Only log completion on last batch
    if (batchInfo?.isLastBatch) {
      await env.DB.prepare(`
        INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
        VALUES (?, 'manual_upload_complete', ?, ?, 'success', datetime('now'))
      `).bind(
        sessionId,
        `Manual upload complete`,
        JSON.stringify({ totalBatches: batchInfo.totalBatches })
      ).run()
    }
    
    console.log(`✅ Manual upload batch ${batchInfo?.batchIndex + 1 || 1} completed: ${successCount}/${images.length} images`)
    
  } catch (error) {
    console.error(`❌ Manual upload ${sessionId} failed:`, error)
    
    // Log error
    await env.DB.prepare(`
      INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
      VALUES (?, 'manual_upload_error', ?, ?, 'error', datetime('now'))
    `).bind(
      sessionId,
      `Manual upload failed: ${error.message}`,
      JSON.stringify({ error: error.message })
    ).run()
    
    throw error
  }
}

// ============= MIDJOURNEY BATCH IMPORT =============

app.post('/api/midjourney/start-batch', async (req, res) => {
  const { category, theme, prompts } = req.body
  
  // Validate input (exact same as Cloudflare)
  if (!category || !theme || !prompts || !Array.isArray(prompts)) {
    return res.status(400).json({ success: false, error: 'Category, theme, and prompts array required' })
  }
  
  if (prompts.length < 1 || prompts.length > 50) {
    return res.status(400).json({ success: false, error: 'Between 1 and 50 prompts required' })
  }
  
  try {
    // Generate session ID - SAME FORMAT as Cloudflare
    const sessionId = `bulk-midjourney-${Date.now()}-${Math.random().toString(36).substring(7)}`
    
    // Store job in database for tracking (exact same as Cloudflare)
    await env.DB.prepare(`
      INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
      VALUES (?, 'midjourney_start', ?, ?, 'info', datetime('now'))
    `).bind(
      sessionId, 
      `Starting Midjourney batch: ${category} - ${theme}`, 
      JSON.stringify({ category, theme, promptCount: prompts.length })
    ).run()
    
    console.log(`🎨 Starting Midjourney batch ${sessionId}: ${category} - ${theme} (${prompts.length} prompts)`)
    
    // Start async processing (don't await - return immediately)
    processMidjourneyBatch(env, sessionId, category, theme, prompts).then(() => {
      console.log(`✅ Midjourney batch ${sessionId} completed`)
    }).catch(error => {
      console.error(`❌ Midjourney batch ${sessionId} failed:`, error)
    })
    
    // Return immediately (exact same response as Cloudflare)
    res.json({ 
      success: true, 
      sessionId,
      message: `Started generation for ${prompts.length} prompts`
    })
    
  } catch (error) {
    console.error('❌ Midjourney start-batch error:', error)
    sendError(res, 500, error, 'Internal server error')
  }
})

app.get('/api/midjourney/status/:sessionId', async (req, res) => {
  const { sessionId } = req.params
  
  try {
    // Get latest status from deployment logs (exact same as Cloudflare)
    const logs = await env.DB.prepare(`
      SELECT * FROM deployment_logs 
      WHERE session_id = ? 
      ORDER BY created_at DESC 
      LIMIT 20
    `).bind(sessionId).all()
    
    // Check if completed by looking for session in gallery
    const imageCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM gallery_images 
      WHERE session_id = ?
    `).bind(sessionId).first()
    
    const logsResults = logs.results || []
    const isComplete = logsResults.some(log => log.step_type === 'midjourney_complete')
    const hasError = logsResults.some(log => log.log_level === 'error')
    
    res.json({
      sessionId,
      status: isComplete ? 'complete' : hasError ? 'error' : 'processing',
      logs: logsResults,
      imageCount: imageCount?.count || 0,
      theme: logsResults[0]?.metadata ? JSON.parse(logsResults[0].metadata).theme : null
    })
  } catch (error) {
    sendError(res, 500, error, 'Internal server error')
  }
})

// Process Midjourney batch (async function with polling) - EXACT PORT from Cloudflare
async function processMidjourneyBatch(env, sessionId, category, theme, prompts) {
  console.log(`🎨 Starting Midjourney batch ${sessionId} for theme: ${category} - ${theme}`)
  
  try {
    // Check for Apify token
    if (!env.APIFY_TOKEN) {
      throw new Error('APIFY_TOKEN not configured')
    }
    
    // Log progress
    await env.DB.prepare(`
      INSERT INTO deployment_logs (session_id, step_type, message, log_level, created_at)
      VALUES (?, 'midjourney_progress', 'Starting Apify actor run', 'info', datetime('now'))
    `).bind(sessionId).run()
    
    // Start Apify actor run (async - returns immediately with run_id)
    const startResponse = await fetch('https://api.apify.com/v2/acts/igolaizola~midjourney-automation/runs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.APIFY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompts: prompts,
        mode: 'relaxed',
        concurrency: 5,
        privacy: true,
        cookie: env.MIDJOURNEY_COOKIE,
        upscale: '',
        proxyConfiguration: {
          useApifyProxy: true,
          apifyProxyGroups: ['RESIDENTIAL']
        }
      })
    })
    
    if (!startResponse.ok) {
      throw new Error(`Apify API error: ${startResponse.status}`)
    }
    
    const runData = await startResponse.json()
    const runId = runData.data.id
    const datasetId = runData.data.defaultDatasetId
    
    console.log(`✅ Apify run started: ${runId}`)
    
    // Log run ID for tracking
    await env.DB.prepare(`
      INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
      VALUES (?, 'midjourney_run_started', 'Apify run started', ?, 'info', datetime('now'))
    `).bind(sessionId, JSON.stringify({ runId, datasetId, promptCount: prompts.length })).run()
    
    // Poll for completion (check every 30 seconds, max 3 hours)
    const maxAttempts = 360 // 3 hours = 360 * 30 seconds
    let attempts = 0
    let runStatus = 'RUNNING'
    
    while (attempts < maxAttempts && runStatus === 'RUNNING') {
      // Wait 30 seconds before checking
      await new Promise(resolve => setTimeout(resolve, 30000))
      attempts++
      
      // Check run status
      const statusResponse = await fetch(`https://api.apify.com/v2/acts/igolaizola~midjourney-automation/runs/${runId}`, {
        headers: {
          'Authorization': `Bearer ${env.APIFY_TOKEN}`
        }
      })
      
      if (!statusResponse.ok) {
        throw new Error(`Failed to check run status: ${statusResponse.status}`)
      }
      
      const statusData = await statusResponse.json()
      runStatus = statusData.data.status
      
      console.log(`⏳ Apify run ${runId} status: ${runStatus} (attempt ${attempts}/${maxAttempts})`)
      
      // Log progress every 5 minutes
      if (attempts % 10 === 0) {
        await env.DB.prepare(`
          INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
          VALUES (?, 'midjourney_polling', 'Waiting for Apify to complete', ?, 'info', datetime('now'))
        `).bind(sessionId, JSON.stringify({ runStatus, attempts, elapsed: attempts * 30 })).run()
      }
    }
    
    // Check if run succeeded
    if (runStatus !== 'SUCCEEDED') {
      throw new Error(`Apify run failed or timed out. Status: ${runStatus}`)
    }
    
    console.log(`✅ Apify run completed: ${runId}`)
    
    // Fetch dataset items (all generated images)
    const itemsResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items`, {
      headers: {
        'Authorization': `Bearer ${env.APIFY_TOKEN}`
      }
    })
    
    if (!itemsResponse.ok) {
      throw new Error(`Failed to fetch dataset items: ${itemsResponse.status}`)
    }
    
    const items = await itemsResponse.json()
    console.log(`✅ Got ${items.length} images from Apify`)
    
    // Log completion
    await env.DB.prepare(`
      INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
      VALUES (?, 'midjourney_images', 'Received images from Apify', ?, 'success', datetime('now'))
    `).bind(sessionId, JSON.stringify({ imageCount: items.length })).run()
    
    // Insert images into gallery - EXACT SAME STRUCTURE as bulk deploy
    let successCount = 0
    for (const item of items) {
      try {
        await env.DB.prepare(`
          INSERT INTO gallery_images (
            batch_id, session_id, theme_id, theme_name, model, 
            prompt, image_url, tags, favorited, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          `bulk-deploy-${sessionId}-midjourney`, // Same format as bulk deploy
          sessionId,
          category, // theme_id = category (consistent with bulk deploy)
          `${category} - ${theme}`, // theme_name = combined format
          'MIDJOURNEY',
          item.prompt,
          item.url,
          JSON.stringify([category]), // tags = [category] for searchability
          0 // not favorited
        ).run()
        
        successCount++
      } catch (err) {
        console.error(`Failed to insert image: ${err}`)
      }
    }
    
    // Log completion
    await env.DB.prepare(`
      INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
      VALUES (?, 'midjourney_complete', 'Batch completed successfully', ?, 'success', datetime('now'))
    `).bind(sessionId, JSON.stringify({ 
      totalImages: successCount,
      category: category,
      theme: theme 
    })).run()
    
    console.log(`🎉 Midjourney batch ${sessionId} complete! ${successCount} images added to gallery`)
    
  } catch (error) {
    console.error(`❌ Midjourney batch ${sessionId} failed:`, error)
    
    // Log error
    await env.DB.prepare(`
      INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
      VALUES (?, 'midjourney_error', 'Batch failed', ?, 'error', datetime('now'))
    `).bind(sessionId, JSON.stringify({ error: error.message })).run()
  }
}

// ============= VIDEO GENERATION =============

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
    // Generate video session ID immediately
    const videoSessionId = `ultra-simple-${Date.now()}-${Math.random().toString(36).substring(7)}`
    
    console.log(`🎬 Creating video session ${videoSessionId}`)
    
    // Create placeholder records immediately so session appears with correct count
    let totalPlaceholders = 0
    for (const sessionId of sessionIds) {
      const imagesResult = await env.DB.prepare(`
        SELECT id FROM gallery_images
        WHERE session_id = ? AND (image_url IS NOT NULL OR r2_key IS NOT NULL)
      `).bind(sessionId).all()
      
      const images = imagesResult.results || []
      console.log(`📝 Creating ${images.length} placeholder videos for session ${sessionId}`)
      
      for (const image of images) {
        await env.DB.prepare(`
          INSERT INTO gallery_videos (
            session_id, image_id, gallery_image_id, video_url, prompt,
            model, aspect_ratio, resolution, duration, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          videoSessionId,
          image.id,
          image.id,
          'PROCESSING', // Placeholder - will be updated when video completes
          'subtle',
          'pixverse-v5',
          '9:16',
          '720p',
          5
        ).run()
        
        totalPlaceholders++
      }
    }
    
    console.log(`✅ Created ${totalPlaceholders} placeholder videos in session ${videoSessionId}`)
    
    res.json({ 
      success: true, 
      videoSessionId,
      message: 'Video generation started',
      status: 'processing',
      totalVideos: totalPlaceholders
    })
    
    // Process videos in background (don't await)
    generateUltraSimpleVideos(env, {
      sessionIds,
      apiKey,
      videoSessionId // Pass the session ID we created
    }).then(result => {
      console.log(`✅ ULTRA SIMPLE VIDEO - Complete:`, result)
    }).catch(error => {
      console.error(`❌ ULTRA SIMPLE VIDEO - Error:`, error)
    })
    
  } catch (error) {
    console.error(`❌ ULTRA SIMPLE VIDEO - Error creating session:`, error)
    sendError(res, 500, error, 'Ultra simple video failed')
  }
})

// SEQUENTIAL VIDEO GENERATION - Process multiple sessions one at a time
app.post('/api/ultra-simple-video-sequential', async (req, res) => {
  const { videoSessions, sessionPrompts } = req.body
  const apiKey = req.headers['x-api-key'] || process.env.FAL_API_KEY
  
  if (!apiKey) {
    return res.status(401).json({ success: false, error: 'FAL API key required' })
  }
  
  if (!videoSessions || !Array.isArray(videoSessions) || videoSessions.length === 0) {
    return res.status(400).json({ success: false, error: 'videoSessions array required' })
  }
  
  console.log(`🎬 SEQUENTIAL VIDEO - Starting ${videoSessions.length} sessions sequentially`)
  console.log(`📝 Custom prompts received:`, sessionPrompts)
  
  try {
    // Log each video generation job to deployment_logs for persistence
    for (const session of videoSessions) {
      const { videoSessionId, imageSessionId } = session
      
      await env.DB.prepare(`
        INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
        VALUES (?, 'video_generation_start', ?, ?, 'info', datetime('now'))
      `).bind(
        videoSessionId,
        `Starting video generation from image session ${imageSessionId}`,
        JSON.stringify({ 
          videoSessionId, 
          imageSessionId, 
          status: 'processing',
          startTime: Date.now()
        })
      ).run()
    }
    
    // Create placeholder records for ALL sessions immediately
    for (const session of videoSessions) {
      const { videoSessionId, imageSessionId } = session
      
      console.log(`📝 Creating placeholders for ${videoSessionId} (image session: ${imageSessionId})`)
      
      const imagesResult = await env.DB.prepare(`
        SELECT id FROM gallery_images
        WHERE session_id = ? AND (image_url IS NOT NULL OR r2_key IS NOT NULL)
      `).bind(imageSessionId).all()
      
      const images = imagesResult.results || []
      
      for (const image of images) {
        await env.DB.prepare(`
          INSERT INTO gallery_videos (
            session_id, image_id, gallery_image_id, video_url, prompt,
            model, aspect_ratio, resolution, duration, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          videoSessionId,
          image.id,
          image.id,
          'PROCESSING',
          'subtle',
          'pixverse-v5',
          '9:16',
          '720p',
          5
        ).run()
      }
      
      console.log(`✅ Created ${images.length} placeholders for ${videoSessionId}`)
    }
    
    // Return immediately
    res.json({ 
      success: true,
      message: `Sequential video generation started for ${videoSessions.length} sessions`,
      totalSessions: videoSessions.length
    })
    
    // Process sessions SEQUENTIALLY in background with custom prompts
    processSessionsSequentially(env, videoSessions, apiKey, sessionPrompts || {}).then(result => {
      console.log(`✅ SEQUENTIAL VIDEO - All ${videoSessions.length} sessions complete`)
    }).catch(error => {
      console.error(`❌ SEQUENTIAL VIDEO - Error:`, error)
    })
    
  } catch (error) {
    console.error(`❌ SEQUENTIAL VIDEO - Error creating sessions:`, error)
    sendError(res, 500, error, 'Sequential video generation failed')
  }
})

// Helper: Process sessions ONE AT A TIME
async function processSessionsSequentially(env, videoSessions, apiKey, sessionPrompts) {
  console.log(`🔄 Processing ${videoSessions.length} video sessions sequentially`)
  
  for (let i = 0; i < videoSessions.length; i++) {
    const session = videoSessions[i]
    const { videoSessionId, imageSessionId } = session
    
    // Get custom prompt for this session
    const customPrompt = sessionPrompts[imageSessionId] || 'subtle'
    
    console.log(`📹 [${i + 1}/${videoSessions.length}] Processing video session: ${videoSessionId}`)
    console.log(`📸 Source image session: ${imageSessionId}`)
    console.log(`📝 Using prompt: "${customPrompt}"`)
    
    try {
      // Process this ONE session completely before moving to next
      await generateUltraSimpleVideos(env, {
        sessionIds: [imageSessionId],
        apiKey,
        videoSessionId,
        customPrompt: customPrompt  // Pass custom prompt for this session
      })
      
      // Log completion to deployment_logs
      await env.DB.prepare(`
        INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
        VALUES (?, 'video_generation_complete', ?, ?, 'success', datetime('now'))
      `).bind(
        videoSessionId,
        `Video generation completed`,
        JSON.stringify({ 
          videoSessionId, 
          imageSessionId,
          status: 'complete'
        })
      ).run()
      
      console.log(`✅ [${i + 1}/${videoSessions.length}] Completed: ${videoSessionId}`)
      
    } catch (error) {
      console.error(`❌ [${i + 1}/${videoSessions.length}] Failed: ${videoSessionId}`, error)
      
      // Log error to deployment_logs
      await env.DB.prepare(`
        INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
        VALUES (?, 'video_generation_error', ?, ?, 'error', datetime('now'))
      `).bind(
        videoSessionId,
        `Video generation failed: ${error.message}`,
        JSON.stringify({ 
          videoSessionId, 
          imageSessionId,
          status: 'error',
          error: error.message
        })
      ).run()
      
      // Continue to next session even if this one fails
    }
  }
  
  console.log(`🎉 All ${videoSessions.length} sessions completed sequentially`)
  return { success: true, completedSessions: videoSessions.length }
}

// ============= VIDEO GENERATION JOBS =============

// Get all video generation jobs from deployment_logs
app.get('/api/video-generation/jobs', async (req, res) => {
  try {
    // Get all video generation jobs that were started
    const jobs = await env.DB.prepare(`
      SELECT session_id, step_type, message, metadata, log_level, created_at
      FROM deployment_logs
      WHERE step_type IN ('video_generation_start', 'video_generation_complete', 'video_generation_error')
      ORDER BY created_at DESC
    `).all()
    
    // Group by session_id to get the latest status for each job
    const jobsMap = new Map()
    const jobsResults = jobs.results || []
    
    for (const log of jobsResults) {
      const sessionId = log.session_id
      const metadata = JSON.parse(log.metadata || '{}')
      
      if (!jobsMap.has(sessionId)) {
        // Get video count from gallery_videos
        const videoCount = await env.DB.prepare(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN video_url IS NOT NULL AND video_url != 'PROCESSING' THEN 1 ELSE 0 END) as completed
          FROM gallery_videos
          WHERE session_id = ?
        `).bind(sessionId).first()
        
        jobsMap.set(sessionId, {
          videoSessionId: sessionId,
          imageSessionId: metadata.imageSessionId,
          status: log.step_type === 'video_generation_complete' ? 'complete' : 
                 log.step_type === 'video_generation_error' ? 'error' : 'processing',
          startTime: metadata.startTime || Date.parse(log.created_at),
          totalVideos: videoCount?.total || 0,
          completedVideos: videoCount?.completed || 0,
          created_at: log.created_at
        })
      }
    }
    
    const jobsArray = Array.from(jobsMap.values())
    
    res.json({ success: true, jobs: jobsArray })
  } catch (error) {
    console.error('❌ Error fetching video generation jobs:', error)
    sendError(res, 500, error, 'Internal server error')
  }
})

// ============= GALLERY ROUTES =============

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
    
    // Fetch images
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
    
    // Fetch videos
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
    console.error('❌ Gallery search error:', error)
    sendError(res, 500, error, 'Internal server error')
  }
})

app.get('/api/gallery/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params
  const { page, limit } = req.query
  
  try {
    // Get images
    const images = await env.DB.prepare(`
      SELECT * FROM gallery_images 
      WHERE session_id = ? 
      ORDER BY created_at DESC
    `).bind(sessionId).all()
    
    // Get videos with optional pagination
    let videoQuery = `
      SELECT v.*, g.image_url as thumbnail_url
      FROM gallery_videos v
      LEFT JOIN gallery_images g ON v.gallery_image_id = g.id
      WHERE v.session_id = ?
      ORDER BY v.created_at DESC
    `
    
    // Add pagination if requested
    if (page && limit) {
      const offset = (parseInt(page) - 1) * parseInt(limit)
      videoQuery += ` LIMIT ${parseInt(limit)} OFFSET ${offset}`
    }
    
    const videos = await env.DB.prepare(videoQuery).bind(sessionId).all()
    
    // Get total video count for pagination
    const totalVideos = await env.DB.prepare(`
      SELECT COUNT(*) as total FROM gallery_videos WHERE session_id = ?
    `).bind(sessionId).all()
    
    const total = totalVideos.results?.[0]?.total || 0
    const hasMore = page && limit ? (parseInt(page) * parseInt(limit)) < total : false
    
    res.json({
      success: true,
      session_id: sessionId,
      images: images.results || [],
      videos: videos.results || [],
      pagination: page && limit ? {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        hasMore: hasMore
      } : null
    })
  } catch (error) {
    console.error('❌ Session detail error:', error)
    sendError(res, 500, error, 'Internal server error')
  }
})

// Download all videos from a session as ZIP
app.get('/api/gallery/session/:sessionId/download-zip', async (req, res) => {
  const { sessionId } = req.params
  
  try {
    console.log(`📦 Creating ZIP for session: ${sessionId}`)
    
    // Get all videos with URLs from this session
    const videos = await env.DB.prepare(`
      SELECT id, video_url, created_at
      FROM gallery_videos
      WHERE session_id = ? AND video_url IS NOT NULL AND video_url != 'PROCESSING'
      ORDER BY created_at ASC
    `).bind(sessionId).all()
    
    const videoList = videos.results || []
    
    if (videoList.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'No videos found in this session' 
      })
    }
    
    console.log(`📦 Found ${videoList.length} videos to zip`)
    
    // Set response headers for ZIP download
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="videos-${sessionId}.zip"`)
    
    // Create archiver instance
    const archive = archiver('zip', {
      zlib: { level: 0 } // No compression for faster processing (videos are already compressed)
    })
    
    // Pipe archive to response
    archive.pipe(res)
    
    // Handle archiver errors
    archive.on('error', (err) => {
      console.error('❌ Archive error:', err)
      throw err
    })
    
    // Add each video to the ZIP
    let successCount = 0
    for (let i = 0; i < videoList.length; i++) {
      const video = videoList[i]
      try {
        console.log(`📥 [${i + 1}/${videoList.length}] Fetching: ${video.video_url}`)
        
        // Fetch video from URL
        const videoResponse = await fetch(video.video_url)
        
        if (!videoResponse.ok) {
          console.error(`❌ Failed to fetch video ${video.id}: ${videoResponse.status}`)
          continue
        }
        
        // Get video as buffer
        const videoBuffer = await videoResponse.buffer()
        
        // Add to archive with numbered filename
        const filename = `video-${String(i + 1).padStart(3, '0')}.mp4`
        archive.append(videoBuffer, { name: filename })
        
        successCount++
        console.log(`✅ [${i + 1}/${videoList.length}] Added to ZIP: ${filename}`)
        
      } catch (err) {
        console.error(`❌ Error adding video ${video.id} to ZIP:`, err.message)
        // Continue with other videos even if one fails
      }
    }
    
    // Finalize the archive
    await archive.finalize()
    
    console.log(`✅ ZIP complete: ${successCount}/${videoList.length} videos`)
    
  } catch (error) {
    console.error('❌ ZIP download error:', error)
    if (!res.headersSent) {
      sendError(res, 500, error, 'Internal server error')
    }
  }
})

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
          SUM(CASE WHEN video_url IS NOT NULL AND video_url != 'PROCESSING' THEN 1 ELSE 0 END) as videos_with_url
        FROM gallery_videos
        WHERE session_id NOT LIKE 'ultra-simple-%'
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
    console.error('❌ Gallery sessions error:', error)
    sendError(res, 500, error, 'Internal server error')
  }
})

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

app.delete('/api/gallery/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params
  
  try {
    await env.DB.prepare(`DELETE FROM gallery_videos WHERE session_id = ?`).bind(sessionId).run()
    await env.DB.prepare(`DELETE FROM gallery_images WHERE session_id = ?`).bind(sessionId).run()
    
    res.json({ success: true })
  } catch (error) {
    sendError(res, 500, error, 'Internal server error')
  }
})

// ============= ROOT ROUTE =============

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Express error:', err)
  const isProd = process.env.NODE_ENV === 'production'
  res.status(500).json({ success: false, error: isProd ? 'Internal Server Error' : err.message })
})

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(``)
  console.log(`🚀 Express Server Started (FULL VERSION)`)
  console.log(``)
  console.log(`✅ Server: http://localhost:${PORT}`)
  console.log(`✅ Database: SQLite (${dbPath})`)
  console.log(`✅ Puppeteer: http://localhost:3001`)
  console.log(``)
  console.log(`📋 Available Routes:`)
  console.log(`   POST /api/ultra-simple-video - Generate videos`)
  console.log(`   POST /api/midjourney/start-batch - Import Midjourney`)
  console.log(`   GET  /api/midjourney/status/:sessionId - Check status`)
  console.log(`   GET  /api/gallery/sessions - List sessions`)
  console.log(`   GET  /api/gallery/session/:sessionId - Session detail`)
  console.log(`   GET  /api/gallery/search - Search gallery`)
  console.log(`   GET  /api/gallery/stats - Gallery stats`)
  console.log(`   DELETE /api/gallery/session/:sessionId - Delete session`)
  console.log(`   GET  /api/themes - List themes`)
  console.log(`   POST /api/themes - Create theme`)
  console.log(`   DELETE /api/themes/:themeId - Delete theme`)
  console.log(`   GET  /api/styles - List styles`)
  console.log(`   POST /api/styles - Add style`)
  console.log(``)
  console.log(`🔥 ALL CORE ROUTES ACTIVE - Midjourney import ready!`)
  console.log(``)
})

export default app
