// Enhanced Multi-Select Video Generation
// Takes multiple image sessions → generates videos with selected aspect ratio + prompt
// Supports Midjourney image downloading, sequential session processing, and 10 concurrent requests per session

import { fal } from '@fal-ai/client'

export interface MultiselectVideoRequest {
  sessionIds: string[]
  aspectRatio: string
  prompt: string
  videoModel: 'pixverse'
  apiKey: string
}

export interface MultiselectVideoResponse {
  success: boolean
  videoSessionId: string
  totalImages: number
  videosGenerated: number
  videosFailed: number
  message: string
}

export interface VideoEnv {
  DB: D1Database
  FAL_API_KEY: string
}

// ============= PUPPETEER DOWNLOAD HELPER =============

/**
 * Download image from URL and convert to base64 data URI for FAL API
 * @param imageUrl - Source image URL (Midjourney CDN)
 * @returns Base64 data URI ready for FAL API
 */
async function downloadImageToBase64(imageUrl: string): Promise<{ dataUri: string }> {
  console.log(`📥 Downloading image from ${imageUrl} using Puppeteer service`)
  
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
  
  // Create data URI for FAL API
  const dataUri = `data:${contentType};base64,${base64Data}`
  
  return { dataUri }
}

// ============= MAIN VIDEO GENERATION FUNCTION =============

/**
 * Enhanced multiselect video generation with sequential session processing
 * Processes multiple sessions one at a time, 10 concurrent videos per session
 */
export async function generateMultiselectVideos(
  env: VideoEnv,
  request: MultiselectVideoRequest
): Promise<MultiselectVideoResponse> {
  const { sessionIds, aspectRatio, prompt, videoModel, apiKey } = request
  
  console.log(`🎬 Starting enhanced multiselect video generation:`)
  console.log(`   Sessions: ${sessionIds.length}`)
  console.log(`   Aspect Ratio: ${aspectRatio}`)
  console.log(`   Prompt: ${prompt}`)
  console.log(`   Model: ${videoModel}`)
  
  // Create new video session ID
  const videoSessionId = `bulk-video-${Date.now()}-${Math.random().toString(36).substring(7)}`
  
  let totalImages = 0
  let totalVideosGenerated = 0
  let totalVideosFailed = 0
  
  try {
    // Process each session sequentially
    for (let sessionIndex = 0; sessionIndex < sessionIds.length; sessionIndex++) {
      const sourceSessionId = sessionIds[sessionIndex]
      
      console.log(`📋 Processing session ${sessionIndex + 1}/${sessionIds.length}: ${sourceSessionId}`)
      
      // Get all images from current session
      const imagesResult = await env.DB.prepare(`
        SELECT id, image_url, r2_key, model, prompt as original_prompt
        FROM gallery_images 
        WHERE session_id = ? AND (image_url IS NOT NULL OR r2_key IS NOT NULL)
      `).bind(sourceSessionId).all()
      
      const images = imagesResult.results || []
      
      if (!images || images.length === 0) {
        console.log(`⚠️ No images found in session ${sourceSessionId}`)
        continue
      }
      
      console.log(`✅ Found ${images.length} images in session ${sourceSessionId}`)
      totalImages += images.length
      
      // Process images in batches of 10 concurrent requests
      const batchSize = 10
      const totalBatches = Math.ceil(images.length / batchSize)
      
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIndex = batchIndex * batchSize
        const endIndex = Math.min(startIndex + batchSize, images.length)
        const batchImages = images.slice(startIndex, endIndex)
        
        console.log(`📦 Processing batch ${batchIndex + 1}/${totalBatches} (${batchImages.length} videos)`)
        
        // Process batch concurrently
        const batchPromises = batchImages.map(async (image) => {
          try {
            console.log(`🎬 Processing image ${image.id}...`)
            
            // Determine image URL and download if needed
            let imageUrl: string
            
            if (image.model === 'MIDJOURNEY' && image.image_url) {
              // Download Midjourney image with Puppeteer
              const { dataUri } = await downloadImageToBase64(image.image_url)
              imageUrl = dataUri
            } else {
              // Use direct URL for other images
              imageUrl = image.image_url || image.r2_key
            }
            
            if (!imageUrl) {
              throw new Error(`No image URL for image ${image.id}`)
            }
            
            // Generate video with Pixverse
            const result = await generatePixverseVideo(imageUrl, aspectRatio, prompt, apiKey)
            
            // Save video to database
            await env.DB.prepare(`
              INSERT INTO gallery_videos (
                session_id, image_id, gallery_image_id, theme_id, video_url, prompt,
                model, aspect_ratio, resolution, duration, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `).bind(
              videoSessionId,
              image.id,
              image.id,
              null, // theme_id
              result.url,
              prompt,
              'pixverse-v5',
              aspectRatio,
              '720p',
              5
            ).run()
            
            console.log(`✅ Video generated for image ${image.id}: ${result.url}`)
            return { success: true, imageId: image.id }
            
          } catch (error) {
            console.error(`❌ Failed to generate video for image ${image.id}:`, error)
            return { success: false, imageId: image.id, error: error.message }
          }
        })
        
        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises)
        
        // Count results
        const batchGenerated = batchResults.filter(r => r.success).length
        const batchFailed = batchResults.filter(r => !r.success).length
        
        totalVideosGenerated += batchGenerated
        totalVideosFailed += batchFailed
        
        console.log(`✅ Batch ${batchIndex + 1} completed: ${batchGenerated} generated, ${batchFailed} failed`)
      }
      
      console.log(`✅ Session ${sourceSessionId} completed: ${totalVideosGenerated} total generated, ${totalVideosFailed} total failed`)
    }
    
    console.log(`🎯 Enhanced multiselect video generation completed:`)
    console.log(`   Total Images: ${totalImages}`)
    console.log(`   Videos Generated: ${totalVideosGenerated}`)
    console.log(`   Videos Failed: ${totalVideosFailed}`)
    console.log(`   Video Session ID: ${videoSessionId}`)
    
    return {
      success: totalVideosGenerated > 0,
      videoSessionId,
      totalImages,
      videosGenerated: totalVideosGenerated,
      videosFailed: totalVideosFailed,
      message: `Generated ${totalVideosGenerated} videos from ${totalImages} images across ${sessionIds.length} sessions`
    }
    
  } catch (error) {
    console.error(`❌ Enhanced multiselect video generation failed:`, error)
    throw error
  }
}

// ============= PIXVERSE VIDEO GENERATION =============

/**
 * Generate video using Pixverse v5 via FAL AI
 * @param imageUrl - Image URL or base64 data URI
 * @param aspectRatio - Video aspect ratio (1:1, 9:16, etc.)
 * @param prompt - Video prompt (always "subtle")
 * @param apiKey - FAL API key
 * @returns Video URL and request ID
 */
async function generatePixverseVideo(
  imageUrl: string, 
  aspectRatio: string, 
  prompt: string, 
  apiKey: string
): Promise<{ url: string, requestId: string }> {
  
  // BULLETPROOF LOGGING - Log EVERYTHING before sending to FAL
  console.log(``)
  console.log(`═══════════════════════════════════════════════════════════`)
  console.log(`🔍 BULLETPROOF DEBUG - EXACTLY WHAT IS BEING SENT TO FAL:`)
  console.log(`═══════════════════════════════════════════════════════════`)
  console.log(`   prompt parameter received: "${prompt}"`)
  console.log(`   prompt type: ${typeof prompt}`)
  console.log(`   prompt is undefined: ${prompt === undefined}`)
  console.log(`   prompt is null: ${prompt === null}`)
  console.log(`   prompt is empty string: ${prompt === ''}`)
  console.log(`   prompt length: ${prompt?.length}`)
  console.log(`   aspectRatio: ${aspectRatio}`)
  console.log(`   imageUrl length: ${imageUrl?.length}`)
  console.log(`   apiKey present: ${!!apiKey}`)
  
  // Create the EXACT input object that will be sent to FAL
  const falInput = {
    prompt: prompt,
    image_url: imageUrl,
    aspect_ratio: aspectRatio,
    resolution: '720p',
    duration: '5'
  }
  
  console.log(``)
  console.log(`📦 EXACT FAL INPUT OBJECT:`)
  console.log(JSON.stringify(falInput, null, 2))
  console.log(`═══════════════════════════════════════════════════════════`)
  console.log(``)
  
  fal.config({ credentials: apiKey })
  
  const result = await fal.subscribe('fal-ai/pixverse/v5/image-to-video', {
    input: falInput,
    logs: true
  })
  
  console.log(`✅ FAL Response received!`)
  console.log(`   Video URL: ${result.data.video.url}`)
  console.log(`   Request ID: ${result.requestId}`)
  
  return {
    url: result.data.video.url,
    requestId: result.requestId
  }
}
