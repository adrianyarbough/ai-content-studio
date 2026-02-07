// Bulk Deploy System - Isolated Module
// Handles bulk deployment of themes with OpenAI prompt generation and FAL.ai image generation
// All logging, deployment processing, and error handling contained here

type BulkTheme = {
  id: number
  category: string
  theme: string
  tier: string
  tags: string // JSON string
  model: string
  master_prompt: string
  created_at: string
}

type DeploymentEnv = {
  DB: D1Database
  OPENAI_API_KEY?: string
  FAL_API_KEY?: string
}

// Track active FAL API requests per session for cancellation
const activeSessionRequests = new Map<string, string[]>()

// Add request ID to session tracking
function trackFalRequest(sessionId: string, requestId: string): void {
  if (!activeSessionRequests.has(sessionId)) {
    activeSessionRequests.set(sessionId, [])
  }
  activeSessionRequests.get(sessionId)!.push(requestId)
  console.log(`🔍 Tracking FAL request ${requestId} for session ${sessionId}`)
}

// Remove request ID from session tracking (when completed/failed)
function untrackFalRequest(sessionId: string, requestId: string): void {
  const requests = activeSessionRequests.get(sessionId)
  if (requests) {
    const index = requests.indexOf(requestId)
    if (index > -1) {
      requests.splice(index, 1)
      console.log(`✅ Untracked FAL request ${requestId} for session ${sessionId}`)
    }
  }
}

// Get all active request IDs for a session
function getActiveRequests(sessionId: string): string[] {
  return activeSessionRequests.get(sessionId) || []
}

// Clear all requests for a session
function clearSessionRequests(sessionId: string): void {
  activeSessionRequests.delete(sessionId)
  console.log(`🧹 Cleared all request tracking for session ${sessionId}`)
}

/**
 * Cancel all active FAL API requests for a session using correct PUT method
 * Based on FAL documentation: PUT https://queue.fal.run/fal-ai/bytedance/seedream/v4/text-to-image/requests/{request_id}/cancel
 * @param sessionId - Session ID to cancel requests for
 * @param apiKey - FAL API key for authorization
 * @returns Object with cancellation results
 */
async function cancelSessionFalRequests(sessionId: string, apiKey: string): Promise<{
  total: number,
  cancelled: number,
  failed: number,
  results: Array<{requestId: string, status: string}>
}> {
  const activeRequests = getActiveRequests(sessionId)
  
  if (activeRequests.length === 0) {
    console.log(`🔍 No active FAL requests to cancel for session ${sessionId}`)
    return { total: 0, cancelled: 0, failed: 0, results: [] }
  }
  
  console.log(`🚫 Cancelling ${activeRequests.length} FAL requests for session ${sessionId}`)
  
  const results = []
  let cancelledCount = 0
  let failedCount = 0
  
  for (const requestId of activeRequests) {
    try {
      // Use correct PUT method and full model path from FAL documentation
      const cancelUrl = `https://queue.fal.run/fal-ai/bytedance/seedream/v4/text-to-image/requests/${requestId}/cancel`
      
      const response = await fetch(cancelUrl, {
        method: 'PUT', // Correct method per FAL documentation
        headers: {
          'Authorization': `Key ${apiKey}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        console.log(`✅ Cancelled FAL request ${requestId}`)
        untrackFalRequest(sessionId, requestId)
        cancelledCount++
        results.push({ requestId, status: 'cancelled' })
      } else {
        console.log(`❌ Failed to cancel FAL request ${requestId}: ${response.status}`)
        failedCount++
        results.push({ requestId, status: `failed_${response.status}` })
      }
      
    } catch (error) {
      console.error(`💥 Error cancelling FAL request ${requestId}:`, error)
      failedCount++
      results.push({ requestId, status: 'error' })
    }
    
    // Small delay between cancellations to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  
  console.log(`🎯 FAL cancellation complete for session ${sessionId}: ${cancelledCount} cancelled, ${failedCount} failed`)
  
  return {
    total: activeRequests.length,
    cancelled: cancelledCount,
    failed: failedCount,
    results
  }
}

// ============= DEPLOYMENT LOGGING SYSTEM =============

/**
 * Logs a deployment step to the database for real-time streaming
 * @param env - Cloudflare environment with DB access
 * @param sessionId - Unique session identifier for this deployment
 * @param stepType - Type of step ('deployment_start', 'theme_start', 'theme_completed', etc.)
 * @param message - Human-readable message for the UI
 * @param metadata - Optional additional data (theme info, stats, etc.)
 * @param logLevel - Log level ('info', 'warning', 'error', 'success')
 */
async function logDeploymentStep(
  env: DeploymentEnv,
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
      'info': '📋',
      'warning': '⚠️',
      'error': '❌',
      'success': '✅'
    }[logLevel] || '📋'
    
    console.log(`${logPrefix} [${timestamp}] [${sessionId}] ${stepType}: ${message}`)
    if (Object.keys(metadata).length > 0) {
      console.log(`   └── metadata:`, metadata)
    }
    
  } catch (error) {
    console.error(`Failed to log deployment step:`, error)
    console.error(`   └── sessionId: ${sessionId}, stepType: ${stepType}, message: ${message}`)
  }
}

/**
 * Retrieves deployment logs for a session, ordered by creation time
 * @param env - Cloudflare environment with DB access  
 * @param sessionId - Session identifier to fetch logs for
 * @param limit - Maximum number of logs to return (default 100)
 * @returns Array of log entries
 */
async function getDeploymentLogs(
  env: DeploymentEnv,
  sessionId: string,
  limit: number = 100
) {
  try {
    const logs = await env.DB.prepare(`
      SELECT * FROM deployment_logs 
      WHERE session_id = ? 
      ORDER BY created_at ASC 
      LIMIT ?
    `).bind(sessionId, limit).all()
    
    return {
      success: true,
      logs: logs.results?.map(log => ({
        ...log,
        metadata: log.metadata ? JSON.parse(log.metadata) : {}
      })) || []
    }
  } catch (error) {
    console.error('Failed to retrieve deployment logs:', error)
    return {
      success: false,
      error: error.message,
      logs: []
    }
  }
}

// ============= BULK DEPLOYMENT PROCESSING =============

/**
 * Process a single theme - extracted for parallel processing
 * @param env - Cloudflare environment with DB and API keys
 * @param sessionId - Unique session identifier
 * @param themeId - Theme ID to process
 * @param themeIndex - Index for display purposes
 * @param totalThemes - Total number of themes
 * @param totalPrompts - Total expected prompts across all themes
 * @param totalImages - Total expected images across all themes
 * @param counters - Shared counters object
 */
async function processOneTheme(
  env: DeploymentEnv,
  sessionId: string,
  themeId: number,
  themeIndex: number,
  totalThemes: number,
  totalPrompts: number,
  totalImages: number,
  counters: { completedThemes: number, totalCompletedPrompts: number, totalCompletedImages: number }
): Promise<void> {
  try {
    // Get theme profile
    const theme = await env.DB.prepare(`SELECT * FROM bulk_theme_profiles WHERE id = ?`)
      .bind(themeId)
      .first() as BulkTheme | null

    if (!theme) {
      await logDeploymentStep(env, sessionId, "theme_skip", `Theme ${themeId} not found`, {}, "warning")
      return
    }

    await logDeploymentStep(env, sessionId, "theme_start", `▶️ Starting theme ${themeIndex + 1}/${totalThemes}: ${theme.theme}`, { 
      theme,
      theme_number: themeIndex + 1,
      total_themes: totalThemes,
      overall_progress: Math.round((counters.completedThemes / totalThemes) * 100)
    })

    // Step 1: Generate prompts using OpenAI
    await logDeploymentStep(env, sessionId, "prompts_generating", `Generating 200 variations for ${theme.theme}...`, {
      theme_number: themeIndex + 1,
      total_themes: totalThemes
    })
    const variations = await generateVariations(env, theme)
    counters.totalCompletedPrompts += variations.length
    
    await logDeploymentStep(env, sessionId, "prompts_completed", `✅ Generated ${variations.length} variations`, { 
      count: variations.length,
      total_prompts_completed: counters.totalCompletedPrompts,
      total_prompts: totalPrompts,
      prompts_progress: Math.round((counters.totalCompletedPrompts / totalPrompts) * 100)
    }, "success")

    // Step 2: Generate images + save to gallery
    await logDeploymentStep(env, sessionId, "images_generating", `Generating ${variations.length} images...`)
    let successCount = 0
    let errorCount = 0
    
    for (let i = 0; i < variations.length; i++) {
      const variation = variations[i]
      
      try {
        const imageUrl = await generateImage(env, sessionId, theme.model, variation)
        
        // Save to gallery_images with proper metadata (image_url can now be null)
        await env.DB.prepare(`
          INSERT INTO gallery_images (
            batch_id, theme_id, theme_name, model, prompt, image_url, 
            tags, bulk_theme_profile_id, session_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          `bulk-deploy-${sessionId}-${themeId}`,
          themeId.toString(),
          `${theme.category} - ${theme.theme}`,
          theme.model,
          variation,
          imageUrl, // Can be null now - that's OK!
          theme.tags, // Already JSON string
          themeId,
          sessionId // ✅ Link to deploy session for Gallery Sessions feature
        ).run()
        
        if (imageUrl) {
          successCount++
        } else {
          errorCount++
        }
        
        // Update total progress
        if (imageUrl) {
          counters.totalCompletedImages++
        }
        
        // Log progress every 25 images with accurate overall progress
        if ((i + 1) % 25 === 0) {
          const currentThemeProgress = Math.round(((i + 1) / variations.length) * 100)
          const overallImageProgress = Math.round((counters.totalCompletedImages / totalImages) * 100)
          
          await logDeploymentStep(env, sessionId, "images_progress", 
            `Theme ${themeIndex + 1}/${totalThemes} - Images ${i + 1}/${variations.length} (${currentThemeProgress}%)`, {
              theme_number: themeIndex + 1,
              total_themes: totalThemes,
              theme_images_completed: i + 1,
              theme_images_total: variations.length,
              theme_progress: currentThemeProgress,
              total_images_completed: counters.totalCompletedImages,
              total_images: totalImages,
              overall_progress: overallImageProgress
            })
        }
        
      } catch (imageError) {
        console.error(`Failed to save image ${i + 1}:`, imageError)
        
        // Still try to save the prompt even if there was a database error
        try {
          await env.DB.prepare(`
            INSERT INTO gallery_images (
              batch_id, theme_id, theme_name, model, prompt, image_url, 
              tags, bulk_theme_profile_id, session_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `).bind(
            `bulk-deploy-${sessionId}-${themeId}`,
            themeId.toString(),
            `${theme.category} - ${theme.theme}`,
            theme.model,
            variation,
            null, // No image URL if there was an error
            theme.tags,
            themeId,
            sessionId // ✅ Link to deploy session
          ).run()
        } catch (dbError) {
          console.error(`Failed to save prompt to database:`, dbError)
        }
        
        errorCount++
      }
    }
    
    counters.completedThemes++
    const overallProgress = Math.round((counters.completedThemes / totalThemes) * 100)
    
    await logDeploymentStep(env, sessionId, "theme_completed", `✅ Theme ${themeIndex + 1}/${totalThemes} completed: ${theme.theme}`, {
      theme_number: themeIndex + 1,
      total_themes: totalThemes,
      themes_completed: counters.completedThemes,
      prompts: variations.length,
      images_success: successCount,
      images_failed: errorCount,
      total_images_completed: counters.totalCompletedImages,
      total_images: totalImages,
      overall_progress: overallProgress
    }, "success")

  } catch (error) {
    await logDeploymentStep(env, sessionId, "theme_error", `❌ ${themeId} failed`, { error: error.message }, "error")
  }
}

/**
 * Main bulk deployment processor - runs themes in PARALLEL batches of up to 10
 * @param env - Cloudflare environment with DB and API keys
 * @param sessionId - Unique session identifier
 * @param themeIds - Array of bulk theme profile IDs to deploy
 */
async function runBulkDeploy(
  env: DeploymentEnv,
  sessionId: string,
  themeIds: number[]
): Promise<void> {
  // Calculate total work for accurate progress tracking
  const totalThemes = themeIds.length
  const promptsPerTheme = 200 // Fixed: 200 prompts per theme
  const totalPrompts = totalThemes * promptsPerTheme
  const totalImages = totalPrompts // 1 image per prompt
  
  await logDeploymentStep(env, sessionId, "deployment_start", `🚀 Bulk deploy for ${totalThemes} themes (${totalImages} total images)`, { 
    totalThemes, 
    totalPrompts, 
    totalImages,
    themeIds 
  })
  
  // Shared counters for all parallel themes
  const counters = {
    completedThemes: 0,
    totalCompletedPrompts: 0,
    totalCompletedImages: 0
  }
  
  // Process themes in parallel batches of up to 10
  const PARALLEL_LIMIT = 10
  
  for (let batchStart = 0; batchStart < themeIds.length; batchStart += PARALLEL_LIMIT) {
    const batchEnd = Math.min(batchStart + PARALLEL_LIMIT, themeIds.length)
    const batchThemeIds = themeIds.slice(batchStart, batchEnd)
    
    // Check for cancellation before processing each batch
    const cancellationCheck = await env.DB.prepare(`
      SELECT id FROM deployment_logs 
      WHERE session_id = ? AND step_type = 'deployment_cancelled'
      LIMIT 1
    `).bind(sessionId).first()
    
    if (cancellationCheck) {
      await logDeploymentStep(env, sessionId, "deployment_stopped", `🛑 Deployment cancelled by user`, {
        themes_completed: counters.completedThemes,
        themes_total: totalThemes,
        overall_progress: Math.round((counters.completedThemes / totalThemes) * 100)
      }, "warning")
      return
    }
    
    // Process batch of themes in parallel
    const batchPromises = batchThemeIds.map((themeId, indexInBatch) => {
      const globalThemeIndex = batchStart + indexInBatch
      // Generate unique session ID for each theme (still parallel but independent)
      const themeSessionId = `bulk-${Date.now()}-theme${themeId}-${Math.random().toString(36).substring(7)}`
      return processOneTheme(
        env,
        themeSessionId,  // Use unique session ID per theme instead of shared sessionId
        themeId,
        globalThemeIndex,
        totalThemes,
        totalPrompts,
        totalImages,
        counters
      )
    })
    
    // Wait for all themes in this batch to complete
    // Using allSettled so one failure doesn't stop others
    await Promise.allSettled(batchPromises)
  }

  // Final completion log with accurate totals
  await logDeploymentStep(env, sessionId, "deployment_completed", `🎯 Bulk deploy completed: ${counters.completedThemes}/${totalThemes} themes`, {
    total_themes: totalThemes,
    completed_themes: counters.completedThemes,
    total_prompts: totalPrompts,
    total_images: totalImages,
    total_completed_images: counters.totalCompletedImages,
    overall_progress: 100
  }, "success")
}

/**
 * Generates 200 prompt variations using OpenAI with BATCHED approach and strict validation
 * @param env - Environment with OPENAI_API_KEY
 * @param theme - Theme profile to generate variations for
 * @returns Array of exactly 200 prompt variations
 */
async function generateVariations(env: DeploymentEnv, theme: BulkTheme): Promise<string[]> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured')
  }

  // Handle tags parsing (same as in generate-variations endpoint)
  let tagsArray = []
  try {
    if (theme.tags && typeof theme.tags === 'string') {
      if (theme.tags.startsWith('"[') && theme.tags.endsWith(']"') && theme.tags.includes('\\"')) {
        const unescaped = JSON.parse(theme.tags)
        tagsArray = JSON.parse(unescaped)
      } else if (theme.tags.startsWith('[') && theme.tags.endsWith(']')) {
        tagsArray = JSON.parse(theme.tags)
      } else {
        tagsArray = theme.tags.split(',').map(tag => tag.trim()).filter(tag => tag)
      }
    } else if (Array.isArray(theme.tags)) {
      tagsArray = theme.tags
    }
  } catch (e) {
    console.warn(`Failed to parse tags for theme ${theme.id}:`, theme.tags)
    if (theme.tags && typeof theme.tags === 'string') {
      tagsArray = theme.tags.split(',').map(tag => tag.trim()).filter(tag => tag)
    }
  }
  
  const tagsString = tagsArray.join(', ')
  const lockedPrefix = `${theme.master_prompt}, ${theme.theme}, ${tagsString}`
  
  console.log(`🔒 LOCKED PREFIX: "${lockedPrefix}"`)
  
  // BATCHED APPROACH: Generate 8 batches of 25 prompts each (same as generate-variations endpoint)
  const BATCH_SIZE = 25
  const TOTAL_COUNT = 200
  const TOTAL_BATCHES = Math.ceil(TOTAL_COUNT / BATCH_SIZE)
  const allPrompts: string[] = []
  
  console.log(`🔄 Starting batched generation: ${TOTAL_BATCHES} batches of ${BATCH_SIZE} prompts each`)
  
  for (let batchIndex = 0; batchIndex < TOTAL_BATCHES; batchIndex++) {
    const currentBatch = batchIndex + 1
    const isLastBatch = currentBatch === TOTAL_BATCHES
    const promptsInThisBatch = isLastBatch ? (TOTAL_COUNT - (batchIndex * BATCH_SIZE)) : BATCH_SIZE
    
    console.log(`📦 Batch ${currentBatch}/${TOTAL_BATCHES}: Generating ${promptsInThisBatch} prompts`)
    
    const systemPrompt = `
You are generating safe, creative prompt variations for image generation.
You must produce exactly ${promptsInThisBatch} variations.
Do not output numbering. One variation per line.

RULES:
1. Every variation MUST begin with this LOCKED prefix:
   "${lockedPrefix}"
2. After this prefix, add a unique subject + single clear action (object or person).
3. If the theme excludes people → 100% environments/props with actions.
4. If people allowed → at least 40% environment-only, at least 30% people.
5. No gore, violence, nudity, illegal content, or unsafe items.
6. Format: ${promptsInThisBatch} lines, each variation is one single descriptive line. No numbering or commentary.
7. Make each variation unique - avoid repeating concepts from previous batches.
8. If the locked prefix contains ANY text inside square brackets [anything], that is a placeholder. 
   REPLACE whatever is in the brackets with your generated content.
   The brackets and their contents should be replaced by what you generate.

Example output format:
${lockedPrefix}, a CRT monitor glowing with pixel art
${lockedPrefix}, a figure waiting in neon-lit doorway
${lockedPrefix}, holographic displays flickering in darkness
`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: systemPrompt }],
        temperature: 0.8,
        max_tokens: 1500
      })
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error in batch ${currentBatch}: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const content = data.choices[0].message.content
    const lines = content
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line)

    // VALIDATE this batch - Must be exactly the expected number
    if (lines.length !== promptsInThisBatch) {
      console.error(`❌ Batch ${currentBatch}: OpenAI returned ${lines.length} lines instead of ${promptsInThisBatch}`)
      throw new Error(`Batch ${currentBatch}: OpenAI returned ${lines.length} variations, expected exactly ${promptsInThisBatch}. Deployment stopped.`)
    }
    
    // Add to master collection
    allPrompts.push(...lines)
    
    console.log(`✅ Batch ${currentBatch}/${TOTAL_BATCHES} completed: ${lines.length} prompts added`)
    
    // Small delay between batches to be nice to OpenAI API
    if (currentBatch < TOTAL_BATCHES) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  
  console.log(`🎉 ALL BATCHES COMPLETED: Generated exactly ${allPrompts.length} variations total`)
  
  return allPrompts
}

/**
 * Generates image using FAL.ai Queue API with proper error handling and request tracking
 * @param env - Environment with FAL_API_KEY
 * @param sessionId - Session ID for tracking active requests
 * @param model - Model name (SEED_DREAM or IMAGEN_4) to use for generation
 * @param prompt - Image prompt
 * @returns Image URL or null if failed
 */
async function generateImage(env: DeploymentEnv, sessionId: string, model: string, prompt: string): Promise<string | null> {
  if (!env.FAL_API_KEY) {
    console.error('FAL_API_KEY not configured')
    return null
  }

  try {
    // Import and use the proper image service with Queue API
    const { generateImage: generateImageWithService } = await import('./image-service')
    
    const result = await generateImageWithService({
      prompt,
      model,
      apiKey: env.FAL_API_KEY
    })
    
    // Track the request ID for potential cancellation
    if (result.requestId) {
      trackFalRequest(sessionId, result.requestId)
      
      // Untrack when completed (whether success or failure)
      setTimeout(() => {
        untrackFalRequest(sessionId, result.requestId)
      }, 300000) // 5 minutes max (FAL timeout)
    }
    
    return result.url
    
  } catch (error) {
    console.error(`FAL.ai generation error for model ${model}:`, error)
    return null // Return null instead of placeholder
  }
}

// Export functions for use in main application
export { logDeploymentStep, getDeploymentLogs, runBulkDeploy, cancelSessionFalRequests }
export type { BulkTheme, DeploymentEnv }