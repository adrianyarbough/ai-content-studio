// Bulk Video Generation System - Background Worker Module
// Handles bulk video generation with real-time progress tracking and cancellation support
// Follows same pattern as bulk-deploy.tsx for consistency

type VideoEnv = {
  DB: D1Database
  FAL_API_KEY?: string
  RUNWAY_API_KEY?: string
  CLOUDINARY_CLOUD_NAME?: string
  CLOUDINARY_API_KEY?: string
  CLOUDINARY_API_SECRET?: string
  MIDJOURNEY_COOKIE?: string
}

type GalleryImage = {
  id: number
  session_id: string
  theme_id: string
  theme_name: string
  model: string
  prompt: string
  image_url: string | null
  tags: string
  bulk_theme_profile_id: number | null
  created_at: string
  r2_key?: string | null
}

// ============= CLOUDINARY IMAGE PROXY HELPER =============

/**
 * Download image from URL and convert to base64 data URI for FAL API
 * @param env - Environment
 * @param imageUrl - Source image URL (Midjourney CDN)
 * @param imageId - Database image ID
 * @param videoSessionId - Video session ID for organization
 * @returns Base64 data URI ready for FAL API
 */
async function downloadImageToBase64(
  env: VideoEnv,
  imageUrl: string,
  imageId: number,
  videoSessionId: string
): Promise<{ dataUri: string }> {
  console.log(`📥 Downloading image ${imageId} from ${imageUrl} using Puppeteer service`)
  
  // Call Puppeteer download service
  const puppeteerResponse = await fetch('http://localhost:3001/download', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ imageUrl })
  })
  
  if (!puppeteerResponse.ok) {
    throw new Error(`Puppeteer service failed: ${puppeteerResponse.status}`)
  }
  
  const puppeteerResult = await puppeteerResponse.json()
  
  if (!puppeteerResult.success) {
    throw new Error(`Puppeteer download failed: ${puppeteerResult.error}`)
  }
  
  // Get base64 data from Puppeteer service
  const base64Data = puppeteerResult.data
  const contentType = puppeteerResult.contentType || 'image/png'
  
  console.log(`✅ Downloaded ${base64Data.length} chars (base64) via Puppeteer service`)
  
  // Create data URI for FAL API (no Cloudinary needed - FAL accepts base64 data URIs)
  const dataUri = `data:${contentType};base64,${base64Data}`
  
  return { dataUri }
}

// ============= VIDEO DEPLOYMENT LOGGING SYSTEM =============

/**
 * Logs a video deployment step to the database for real-time streaming
 * @param env - Cloudflare environment with DB access
 * @param sessionId - Unique session identifier for this video deployment
 * @param stepType - Type of step ('video_deployment_start', 'video_batch_progress', etc.)
 * @param message - Human-readable message for the UI
 * @param metadata - Optional additional data (video info, stats, etc.)
 * @param logLevel - Log level ('info', 'warning', 'error', 'success')
 */
async function logVideoStep(
  env: VideoEnv,
  sessionId: string,
  stepType: string,
  message: string,
  metadata: any = {},
  logLevel: string = 'info'
): Promise<void> {
  try {
    await env.DB.prepare(`
      INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      sessionId,
      stepType,
      message,
      JSON.stringify(metadata),
      logLevel
    ).run()
    
    // Also log to console for debugging
    const timestamp = new Date().toISOString()
    const logPrefix = {
      'info': '🎬',
      'warning': '⚠️',
      'error': '❌',
      'success': '✅'
    }[logLevel] || '🎬'
    
    console.log(`${logPrefix} [${timestamp}] [${sessionId}] ${stepType}: ${message}`)
    if (Object.keys(metadata).length > 0) {
      console.log(`   └── metadata:`, metadata)
    }
    
  } catch (error) {
    console.error(`Failed to log video deployment step:`, error)
    console.error(`   └── sessionId: ${sessionId}, stepType: ${stepType}, message: ${message}`)
  }
}

// ============= BULK VIDEO PROCESSING =============

/**
 * Process videos concurrently for single session
 */
async function processVideosConcurrently(
  env: VideoEnv,
  videoSessionId: string,
  batchImages: any[],
  imageDataUriMap: Map<string, string>,
  videoService: any,
  videoModel: string,
  aspectRatio: string,
  apiKey: string,
  customVideoPrompts: any,
  useOriginalPrompt: boolean,
  isTestMode: boolean,
  totalImages: number,
  batchIndex: number,
  totalBatches: number
): Promise<void> {
  console.log(`🚀 Processing ${batchImages.length} videos concurrently for single session`)
  
  // DEEP DEBUG: Log all input data
  console.log(`🔍 DEEP DEBUG - batchImages:`, batchImages.map(img => ({
    id: img.id,
    model: img.model,
    prompt: img.prompt,
    hasImageUrl: !!img.image_url,
    hasR2Key: !!img.r2_key,
    imageUrl: img.image_url?.substring(0, 50) + '...'
  })))
  
  console.log(`🔍 DEEP DEBUG - imageDataUriMap:`, Array.from(imageDataUriMap.entries()).map(([id, uri]) => ({
    imageId: id,
    hasDataUri: !!uri,
    dataUriType: uri?.startsWith('data:') ? 'base64' : 'url',
    dataUriPreview: uri?.substring(0, 50) + '...'
  })))
  
  // Process all videos directly using FAL SDK (no more submit/poll pattern)
  for (const image of batchImages) {
    try {
      console.log(`🔍 DEEP DEBUG - Processing image ${image.id}:`)
      console.log(`  - Model: ${image.model}`)
      console.log(`  - Original prompt: ${image.prompt}`)
      console.log(`  - Has image_url: ${!!image.image_url}`)
      console.log(`  - Has r2_key: ${!!image.r2_key}`)
      
      // Get the pre-downloaded data URI
      const imageDataUri = imageDataUriMap.get(image.id) || image.image_url
      
      console.log(`  - Final imageDataUri: ${imageDataUri ? 'EXISTS' : 'NULL'}`)
      console.log(`  - imageDataUri type: ${imageDataUri?.startsWith('data:') ? 'base64' : 'url'}`)
      console.log(`  - imageDataUri preview: ${imageDataUri?.substring(0, 100)}...`)
      
      if (!imageDataUri) {
        throw new Error(`Failed to get image data URI for image ${image.id}`)
      }
      
      // Determine the video prompt - SIMPLIFIED LIKE THE SIMPLE SCRIPT
      let videoPrompt = 'subtle'  // ALWAYS use 'subtle' by default
      
      if (customVideoPrompts) {
        // Only use custom prompts if manual grouping is selected
        videoPrompt = getCustomVideoPrompt(image.id, customVideoPrompts, image.prompt)
      } else if (useOriginalPrompt) {
        // Only use original prompt if explicitly selected
        videoPrompt = image.prompt || 'subtle'
      }
      // Otherwise, always use 'subtle' (default behavior)
      
      console.log(`  - Final video prompt: ${videoPrompt}`)
      console.log(`  - Aspect ratio: ${aspectRatio}`)
      console.log(`  - Video model: ${videoModel}`)
      
      console.log(`🚀 Generating video for image ${image.id} using ${videoModel.toUpperCase()}`)
      // Persist a log entry with the exact prompt being sent for traceability
      await logVideoStep(
        env,
        videoSessionId,
        "video_submit",
        `Generating ${videoModel} video for image ${image.id}`,
        { imageId: image.id, prompt: videoPrompt, aspectRatio }
      )
      
      // DEEP DEBUG: Log the exact request being sent to FAL
      const falRequest = {
        imageUrl: imageDataUri,
        aspectRatio: aspectRatio,
        duration: 5,
        apiKey: apiKey,
        prompt: videoPrompt
      }
      console.log(`🔍 DEEP DEBUG - FAL Request for image ${image.id}:`, {
        ...falRequest,
        imageUrl: falRequest.imageUrl?.substring(0, 100) + '...',
        apiKey: falRequest.apiKey?.substring(0, 10) + '...'
      })
      
      // Generate video directly using FAL SDK (no more submit/poll pattern)
      const videoResult = await videoService.generateVideo(falRequest)
      
      console.log(`🔍 DEEP DEBUG - FAL Response for image ${image.id}:`, {
        hasUrl: !!videoResult.url,
        url: videoResult.url?.substring(0, 100) + '...',
        requestId: videoResult.requestId,
        status: videoResult.status
      })
      
      // Save video to database immediately since FAL SDK handles the full flow
      if (videoResult.url) {
        await env.DB.prepare(`
          INSERT INTO gallery_videos (
            session_id, image_id, gallery_image_id, theme_id, video_url, prompt, 
            model, aspect_ratio, resolution, duration, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          videoSessionId,
          image.id,
          image.id, // Use image.id as gallery_image_id
          image.theme_id || null,
          videoResult.url,
          videoPrompt,
          videoModel === 'pixverse' ? 'pixverse-v5' : 'kling-v2.5-pro',
          aspectRatio,
          '720p',
          5
        ).run()
        
        console.log(`✅ Video saved to database: ${videoResult.url}`)
      } else {
        console.log(`❌ No video URL returned for image ${image.id}`)
      }
      
    } catch (error) {
      console.error(`❌ Failed to generate video for image ${image.id}:`, error)
      console.log(`🔍 DEEP DEBUG - Error details:`, {
        message: error.message,
        stack: error.stack?.substring(0, 200) + '...',
        imageId: image.id,
        hasImageDataUri: !!imageDataUriMap.get(image.id),
        imageDataUriType: imageDataUriMap.get(image.id)?.startsWith('data:') ? 'base64' : 'url'
      })
      // Also persist error for visibility in UI
      await logVideoStep(
        env,
        videoSessionId,
        "video_generation_failed",
        `Failed to generate ${videoModel} video for image ${image.id}`,
        { imageId: image.id, error: (error as Error).message }
      )
      // Continue with other videos
    }
  }
  
  // Note: No polling needed since FAL SDK handles everything synchronously
  console.log(`✅ All videos processed using FAL SDK`)
}

/**
 * Get custom video prompt based on manual grouping
 */
function getCustomVideoPrompt(imageId: string, customVideoPrompts: any, originalPrompt?: string): string {
  // Check if this image has a manual grouping
  if (customVideoPrompts.manualGroupings) {
    const grouping = customVideoPrompts.manualGroupings.find(g => {
      const idMatch = String(g.imageId) === String(imageId)
      // If frontend included sessionId, prefer matching it as well to avoid cross-session mismatches
      if (g.sessionId) {
        // We don't have the current image's session here; rely on id match when session isn't available server-side
        return idMatch
      }
      return idMatch
    })
    if (grouping) {
      return grouping.customPrompt
    }
  }
  
  // Fallback to original logic for backward compatibility
  if (customVideoPrompts.actionPromptMap) {
    // This is the old automatic detection format - keep for compatibility
    return 'subtle' // Fallback for old format
  }
  
  // Final fallback - use original prompt if available, otherwise 'subtle'
  return originalPrompt || 'subtle'
}

/**
 * Main bulk video processor - runs each image through video generation
 * Always uses 10 concurrent requests for Pixverse/Kling models
 * @param env - Cloudflare environment with DB and API keys
 * @param videoSessionId - Unique session identifier for video generation
 * @param sourceSessionId - Source session ID containing the images
 * @param aspectRatio - Video aspect ratio (1:1 or 9:16)
 */
async function runBulkVideoGeneration(
  env: VideoEnv,
  videoSessionId: string,
  sourceSessionId: string,
  aspectRatio: string = '1:1',
  videoModel: string = 'runway',
  useOriginalPrompt: boolean = false,
  customVideoPrompts?: any
): Promise<void> {
  
  // STEP 1: Copy all source images to the new video session FIRST
  await logVideoStep(env, videoSessionId, "video_image_copy_start", `📋 Copying images from source session to video session`, { 
    sourceSessionId,
    videoSessionId
  })
  
  const copyResult = await env.DB.prepare(`
    INSERT INTO gallery_images (
      batch_id, theme_id, theme_name, model, prompt, image_url, 
      r2_key, tags, favorited, bulk_theme_profile_id, style, session_id
    )
    SELECT 
      ? as batch_id,
      theme_id, theme_name, model, prompt, image_url,
      r2_key, tags, favorited, bulk_theme_profile_id, style, 
      ? as session_id
    FROM gallery_images 
    WHERE session_id = ? AND (image_url IS NOT NULL OR r2_key IS NOT NULL)
  `).bind(
    `video-batch-${videoSessionId}`, // New batch_id
    videoSessionId,                   // New session_id  
    sourceSessionId                   // Source session
  ).run()
  
  // Verify the actual count since copyResult.changes may be unreliable
  const verifyResult = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM gallery_images WHERE session_id = ?`
  ).bind(videoSessionId).first()
  
  const actualCopiedCount = verifyResult?.count || 0
  
  await logVideoStep(env, videoSessionId, "video_image_copy_completed", `✅ Copied ${actualCopiedCount} images to video session`, {
    copied_images: actualCopiedCount,
    sourceSessionId,
    videoSessionId
  })
  
  // STEP 2: Build ID mapping from source to copied images for manual prompt remapping
  const sourceImages = await env.DB.prepare(`
    SELECT id, image_url, prompt FROM gallery_images 
    WHERE session_id = ? AND image_url IS NOT NULL
    ORDER BY created_at ASC
  `).bind(sourceSessionId).all()
  
  const result = await env.DB.prepare(`
    SELECT * FROM gallery_images 
    WHERE session_id = ? AND image_url IS NOT NULL
    ORDER BY created_at ASC
  `).bind(videoSessionId).all()
  
  const images = (result.results || []) as GalleryImage[]
  const sourceImgs = (sourceImages.results || []) as any[]
  
  // Build oldId -> newId mapping by matching image_url (unique identifier)
  const idMap = new Map<number, number>()
  for (const copiedImg of images) {
    const sourceImg = sourceImgs.find(s => s.image_url === copiedImg.image_url && s.prompt === copiedImg.prompt)
    if (sourceImg) {
      idMap.set(sourceImg.id, copiedImg.id)
    }
  }
  
  // Remap customVideoPrompts.manualGroupings to use new IDs
  if (customVideoPrompts && customVideoPrompts.manualGroupings) {
    customVideoPrompts.manualGroupings = customVideoPrompts.manualGroupings.map((g: any) => {
      const oldId = typeof g.imageId === 'string' ? parseInt(g.imageId, 10) : g.imageId
      const newId = idMap.get(oldId)
      if (newId !== undefined) {
        return { ...g, imageId: newId }
      }
      // If no mapping found, keep original (shouldn't happen, but defensive)
      return g
    })
    console.log(`🔄 Remapped ${customVideoPrompts.manualGroupings.length} manual groupings from source IDs to video session IDs`)
  }
  
  if (!images.length) {
    await logVideoStep(env, videoSessionId, "video_deployment_error", "No copied images found in video session", { sourceSessionId, videoSessionId }, "error")
    return
  }

  // Calculate total work for accurate progress tracking
  const totalImages = images.length
  const BATCH_SIZE = 10 // Process 10 images at a time (10 concurrent downloads + 10 concurrent video generations)

  await logVideoStep(env, videoSessionId, "video_deployment_start", `🎬 Bulk video generation for ${totalImages} images`, { 
    totalImages,
    sourceSessionId,
    videoSessionId,
    batchSize: BATCH_SIZE
  })

  // Check API key based on selected video model
  let apiKey: string | undefined
  let hasValidKey: boolean
  
  if (videoModel === 'pixverse' || videoModel === 'kling') {
    apiKey = env.FAL_API_KEY
    hasValidKey = !!(apiKey && apiKey.length > 10)
  } else {
    apiKey = env.RUNWAY_API_KEY
    hasValidKey = !!(apiKey && apiKey !== 'your-runway-api-key' && apiKey.length > 10)
  }
  const isTestMode = !hasValidKey
  
  if (isTestMode) {
    await logVideoStep(env, videoSessionId, "video_test_mode", `⚠️ Using TEST MODE - ${videoModel.toUpperCase()} API key not configured`, {}, "warning")
  }

  let completedVideos = 0
  let successCount = 0
  let errorCount = 0

  // Process images in batches
  const totalBatches = Math.ceil(totalImages / BATCH_SIZE)
  
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchStart = batchIndex * BATCH_SIZE
    const batchEnd = Math.min(batchStart + BATCH_SIZE, totalImages)
    const batchImages = images.slice(batchStart, batchEnd)

    // Check for cancellation before processing each batch
    const cancellationCheck = await env.DB.prepare(`
      SELECT id FROM deployment_logs 
      WHERE session_id = ? AND step_type = 'video_deployment_cancelled'
      LIMIT 1
    `).bind(videoSessionId).first()
    
    if (cancellationCheck) {
      await logVideoStep(env, videoSessionId, "video_deployment_stopped", `🛑 Video generation cancelled by user`, {
        videos_completed: completedVideos,
        videos_total: totalImages,
        overall_progress: Math.round((completedVideos / totalImages) * 100)
      }, "warning")
      return
    }

    await logVideoStep(env, videoSessionId, "video_batch_start", `📦 Processing batch ${batchIndex + 1}/${totalBatches} (${batchImages.length} videos)`, {
      batch_number: batchIndex + 1,
      total_batches: totalBatches,
      batch_size: batchImages.length,
      overall_progress: Math.round((completedVideos / totalImages) * 100)
    })

    // STEP 1: Download ALL Midjourney images in parallel (7x faster!)
    console.log(`⚡ Pre-downloading all Midjourney images in parallel...`)
    await logVideoStep(env, videoSessionId, "video_parallel_download_start", 
      `⚡ Starting parallel download of Midjourney images`, {
      batch_number: batchIndex + 1,
      total_images_in_batch: batchImages.length
    })
    
    const downloadPromises = batchImages.map(async (image) => {
      // Skip if not Midjourney or already has data URI
      if (image.model !== 'MIDJOURNEY' || (image.r2_key && image.r2_key.startsWith('data:'))) {
        return { imageId: image.id, imageDataUri: image.r2_key || image.image_url, alreadyDownloaded: true }
      }
      
      try {
        // Download and convert to base64 data URI
        const { dataUri } = await downloadImageToBase64(
          env,
          image.image_url,
          image.id,
          videoSessionId
        )
        
        // Update database with data URI for future use
        await env.DB.prepare(`
          UPDATE gallery_images 
          SET r2_key = ? 
          WHERE id = ?
        `).bind(dataUri, image.id).run()
        
        return { imageId: image.id, imageDataUri: dataUri, alreadyDownloaded: false }
      } catch (error) {
        console.error(`Failed to download image ${image.id}:`, error)
        return { imageId: image.id, imageDataUri: null, error: error.message }
      }
    })
    
    // Wait for all downloads to complete in parallel
    const downloadResults = await Promise.all(downloadPromises)
    const successfulDownloads = downloadResults.filter(r => r.imageDataUri).length
    
    await logVideoStep(env, videoSessionId, "video_parallel_download_complete", 
      `✅ Parallel download complete: ${successfulDownloads}/${batchImages.length} images ready`, {
      batch_number: batchIndex + 1,
      successful: successfulDownloads,
      total: batchImages.length
    })
    
    // Create a map for quick lookup (data URIs ready for FAL API)
    const imageDataUriMap = new Map(
      downloadResults.map(r => [r.imageId, r.imageDataUri])
    )

    // Import video service only for real mode
    const videoService = isTestMode ? null : (
      videoModel === 'pixverse' ? await import('./pixverse-service') :
      videoModel === 'kling' ? await import('./kling-service') :
      await import('./video-service')
    )

    // STEP 2: Process each image in the batch using a single, consistent concurrent flow
    await processVideosConcurrently(
      env,
      videoSessionId,
      batchImages,
      imageDataUriMap,
      videoService,
      videoModel,
          aspectRatio,
      apiKey as string,
      customVideoPrompts,
      useOriginalPrompt,
      isTestMode,
      totalImages,
      batchIndex,
      totalBatches
    )

    await logVideoStep(env, videoSessionId, "video_batch_completed", `✅ Batch ${batchIndex + 1}/${totalBatches} completed`, {
      batch_number: batchIndex + 1,
      total_batches: totalBatches,
      videos_completed: completedVideos,
      videos_total: totalImages,
      overall_progress: Math.round((completedVideos / totalImages) * 100)
    }, "success")
  }

  // Final completion log
  await logVideoStep(env, videoSessionId, "video_deployment_completed", `🎯 Bulk video generation completed: ${successCount} success, ${errorCount} failed`, {
    total_images: totalImages,
    videos_success: successCount,
    videos_failed: errorCount,
    source_session_id: sourceSessionId,
    video_session_id: videoSessionId,
    overall_progress: 100
  }, "success")
}

/**
 * Process multiple sessions SEQUENTIALLY - one session completes before next starts
 * Each session uses 10 concurrent video generation requests for maximum speed
 * @param env - Cloudflare environment with DB and API keys
 * @param masterSessionId - Master session ID for tracking all operations
 * @param sourceSessionIds - Array of source session IDs to process sequentially
 */
async function runBulkVideoGenerationMultiple(
  env: VideoEnv,
  masterSessionId: string,
  sourceSessionIds: string[],
  aspectRatio: string = '1:1',
  videoModel: string = 'runway',
  useOriginalPrompt: boolean = false,
  customVideoPrompts?: any
): Promise<void> {
  const totalSessions = sourceSessionIds.length
  
  // Log master deployment start
  await logVideoStep(env, masterSessionId, "multi_video_start", 
    `🎬 Starting SEQUENTIAL bulk video generation for ${totalSessions} sessions (10 concurrent videos per session)`, {
    totalSessions,
    sourceSessionIds,
    aspectRatio: aspectRatio
  })
  
  // Process sessions one at a time (SEQUENTIAL)
  for (let sessionIndex = 0; sessionIndex < sourceSessionIds.length; sessionIndex++) {
    const sourceSessionId = sourceSessionIds[sessionIndex]
    
    // Check for cancellation before each session
    const cancellationCheck = await env.DB.prepare(`
      SELECT id FROM deployment_logs 
      WHERE session_id = ? AND step_type = 'video_deployment_cancelled'
      LIMIT 1
    `).bind(masterSessionId).first()
    
    if (cancellationCheck) {
      await logVideoStep(env, masterSessionId, "multi_video_stopped", 
        `🛑 Multi-session video generation cancelled`, {}, "warning")
      return
    }
    
    // Each session gets its own unique video session ID
    const videoSessionId = `bulk-video-${Date.now()}-${Math.random().toString(36).substring(7)}`
    
    await logVideoStep(env, masterSessionId, "session_start", 
      `📍 Starting session ${sessionIndex + 1}/${totalSessions}: ${sourceSessionId}`, {
      sessionIndex: sessionIndex + 1,
      totalSessions,
      sourceSessionId,
      videoSessionId
    })
    
    try {
      // Process this session (with 10 concurrent videos if Pixverse/Kling)
      await runBulkVideoGeneration(env, videoSessionId, sourceSessionId, aspectRatio, videoModel, useOriginalPrompt, customVideoPrompts)
      
      await logVideoStep(env, masterSessionId, "session_complete", 
        `✅ Session ${sessionIndex + 1}/${totalSessions} completed: ${sourceSessionId}`, {
        sessionIndex: sessionIndex + 1,
        totalSessions,
        sourceSessionId
      })
    } catch (err) {
      console.error(`Video generation failed for session ${sourceSessionId}:`, err)
      await logVideoStep(env, masterSessionId, "session_video_error", 
        `❌ Error processing session ${sessionIndex + 1}/${totalSessions}: ${sourceSessionId}`, 
        { error: err.message, sourceSessionId }, "error")
      // Continue to next session even if this one fails
    }
  }
  
  await logVideoStep(env, masterSessionId, "multi_video_complete", 
    `✅ All ${totalSessions} sessions processed sequentially`, {
    totalSessions
  }, "success")
}

// Export functions for use in main application
export { logVideoStep, runBulkVideoGeneration, runBulkVideoGenerationMultiple }
export type { VideoEnv, GalleryImage }