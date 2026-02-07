// ULTRA SIMPLE VIDEO GENERATION - BRAND NEW, ZERO COMPLEXITY
// Just send "subtle" + image + 9:16 to FAL Pixverse
// No shared code, no complexity, no bugs

import { fal } from '@fal-ai/client'

// Cloudflare D1 type
type D1Database = any

export interface UltraSimpleVideoRequest {
  sessionIds: string[]
  apiKey: string
}

export interface UltraSimpleVideoResponse {
  success: boolean
  videoSessionId: string
  totalImages: number
  videosGenerated: number
  videosFailed: number
}

interface VideoEnv {
  DB: D1Database
  FAL_API_KEY: string
  CLOUDINARY_CLOUD_NAME: string
  CLOUDINARY_API_KEY: string
  CLOUDINARY_API_SECRET: string
}

// Download Midjourney image using Puppeteer and return as buffer
async function downloadMidjourneyImage(imageUrl: string): Promise<Buffer> {
  console.log(`📥 Downloading Midjourney image via Puppeteer...`)
  
  const response = await fetch('http://localhost:3001/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl })
  })
  
  if (!response.ok) {
    throw new Error(`Puppeteer download failed: ${response.status}`)
  }
  
  const result = await response.json() as any
  
  if (!result.success) {
    throw new Error(`Puppeteer download failed: ${result.error}`)
  }
  
  const base64Data = result.data as string
  const buffer = Buffer.from(base64Data, 'base64')
  
  console.log(`✅ Downloaded Midjourney image (${buffer.length} bytes)`)
  
  return buffer
}

// Generate SHA-1 signature for Cloudinary
async function generateCloudinarySignature(paramsToSign: string, apiSecret: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(paramsToSign)
  const hashBuffer = await crypto.subtle.digest('SHA-1', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Upload image to Cloudinary using signed upload (Works in Cloudflare Workers!)
async function uploadToCloudinary(imageBuffer: Buffer, env: VideoEnv): Promise<string> {
  console.log(`☁️  Uploading to Cloudinary (signed upload)...`)
  
  const timestamp = Math.floor(Date.now() / 1000)
  const paramsToSign = `timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`
  const signature = await generateCloudinarySignature(paramsToSign, env.CLOUDINARY_API_SECRET)
  
  // Create FormData with signed parameters
  const formData = new FormData()
  formData.append('file', new Blob([imageBuffer], { type: 'image/png' }), 'image.png')
  formData.append('timestamp', timestamp.toString())
  formData.append('api_key', env.CLOUDINARY_API_KEY)
  formData.append('signature', signature)
  
  const uploadUrl = `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`
  
  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Cloudinary upload failed: ${response.status} - ${error}`)
  }
  
  const result = await response.json() as any
  const cloudinaryUrl = result.secure_url
  
  console.log(`✅ Uploaded to Cloudinary: ${cloudinaryUrl}`)
  
  return cloudinaryUrl
}

// Send to FAL Pixverse with Cloudinary URL
async function sendToFAL(cloudinaryUrl: string, apiKey: string): Promise<{videoUrl: string, requestId: string}> {
  console.log(``)
  console.log(`🚀 SENDING TO FAL - CLOUDINARY URL`)
  console.log(`🔗 Image URL: ${cloudinaryUrl}`)
  console.log(`📝 Prompt: "subtle"`)
  console.log(`📐 Aspect Ratio: 9:16`)
  console.log(`📺 Resolution: 720p`)
  
  // Use PROVEN format: Cloudinary URL + minimal payload
  const requestPayload = {
    prompt: 'subtle',
    image_url: cloudinaryUrl,
    aspect_ratio: '9:16',
    resolution: '720p'
  }
  
  console.log(``)
  console.log(`📦 Request Payload:`)
  console.log(JSON.stringify(requestPayload, null, 2))
  console.log(``)
  
  fal.config({ credentials: apiKey })
  
  const result = await fal.subscribe('fal-ai/pixverse/v5/image-to-video', {
    input: requestPayload,
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === 'IN_PROGRESS') {
        update.logs.map((log) => log.message).forEach(console.log);
      }
    }
  })
  
  console.log(`✅ FAL returned video: ${result.data.video.url}`)
  console.log(`🆔 FAL Request ID: ${result.requestId}`)
  
  return {
    videoUrl: result.data.video.url,
    requestId: result.requestId
  }
}

// Main function - ULTRA SIMPLE
export async function generateUltraSimpleVideos(
  env: VideoEnv,
  request: UltraSimpleVideoRequest
): Promise<UltraSimpleVideoResponse> {
  const { sessionIds, apiKey } = request
  
  console.log(``)
  console.log(`═══════════════════════════════════════════════════════════`)
  console.log(`🎬 ULTRA SIMPLE VIDEO GENERATION - CLOUDINARY + FAL`)
  console.log(`   Sessions: ${sessionIds.length}`)
  console.log(`   Method: Puppeteer → Cloudinary → FAL`)
  console.log(`   Prompt: "subtle" (hardcoded)`)
  console.log(`   Aspect Ratio: 9:16`)
  console.log(`   Resolution: 720p`)
  console.log(`═══════════════════════════════════════════════════════════`)
  console.log(``)
  
  // Create new video session
  const videoSessionId = `ultra-simple-${Date.now()}-${Math.random().toString(36).substring(7)}`
  
  let totalImages = 0
  let videosGenerated = 0
  let videosFailed = 0
  let sessionStartTime = Date.now()
  
  try {
    // Process each session one at a time
    for (const sessionId of sessionIds) {
      console.log(`📋 Processing session: ${sessionId}`)
      
      // Get all images from session
      const imagesResult = await env.DB.prepare(`
        SELECT id, image_url, r2_key, model
        FROM gallery_images
        WHERE session_id = ? AND (image_url IS NOT NULL OR r2_key IS NOT NULL)
      `).bind(sessionId).all()
      
      const images = imagesResult.results || []
      
      if (images.length === 0) {
        console.log(`⚠️ No images in session ${sessionId}`)
        continue
      }
      
      // LIMIT TO 4 IMAGES FOR TESTING
      const limitedImages = images.slice(0, 4)
      
      console.log(`✅ Found ${images.length} images, processing ONLY 4 for testing`)
      totalImages += limitedImages.length
      
      // Process 10 images at a time
      const batchSize = 10
      
      for (let i = 0; i < limitedImages.length; i += batchSize) {
        const batch = limitedImages.slice(i, Math.min(i + batchSize, limitedImages.length))
        
        console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} images)`)
        
        // Process batch in parallel
        const batchPromises = batch.map(async (image: any) => {
          try {
            console.log(`🎬 Processing image ${image.id}...`)
            
            // Get image URL (Cloudinary or direct)
            let imageUrl: string
            
            if (image.model === 'MIDJOURNEY' && image.image_url) {
              // Download with Puppeteer, upload to Cloudinary
              const imageBuffer = await downloadMidjourneyImage(image.image_url)
              imageUrl = await uploadToCloudinary(imageBuffer, env)
            } else {
              // For non-Midjourney images, use direct URL
              if (image.image_url && image.image_url.startsWith('http')) {
                imageUrl = image.image_url
              } else {
                throw new Error(`Cannot process image ${image.id}: No valid URL`)
              }
            }
            
            if (!imageUrl) {
              throw new Error(`No image URL for image ${image.id}`)
            }
            
            // Send to FAL with image URL
            const falResult = await sendToFAL(imageUrl, apiKey)
            
            // Save to database
            await env.DB.prepare(`
              INSERT INTO gallery_videos (
                session_id, image_id, gallery_image_id, video_url, prompt,
                model, aspect_ratio, resolution, duration, fal_request_id, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `).bind(
              videoSessionId,
              image.id,
              image.id,
              falResult.videoUrl,
              'subtle',
              'pixverse-v5',
              '9:16',
              '720p',
              5,
              falResult.requestId
            ).run()
            
            console.log(`✅ Video generated for image ${image.id}`)
            return { success: true }
            
          } catch (error) {
            console.error(`❌ Failed for image ${image.id}:`, error)
            return { success: false }
          }
        })
        
        const batchResults = await Promise.all(batchPromises)
        
        const batchSuccess = batchResults.filter((r: any) => r.success).length
        const batchFailed = batchResults.filter((r: any) => !r.success).length
        
        videosGenerated += batchSuccess
        videosFailed += batchFailed
        
        console.log(`✅ Batch complete: ${batchSuccess} generated, ${batchFailed} failed`)
      }
      
      console.log(`✅ Session ${sessionId} complete`)
    }
    
    console.log(``)
    console.log(`═══════════════════════════════════════════════════════════`)
    console.log(`🎯 ULTRA SIMPLE VIDEO GENERATION COMPLETE`)
    console.log(`   Total Images: ${totalImages}`)
    console.log(`   Videos Generated: ${videosGenerated}`)
    console.log(`   Videos Failed: ${videosFailed}`)
    console.log(`   Video Session ID: ${videoSessionId}`)
    console.log(`═══════════════════════════════════════════════════════════`)
    console.log(``)
    
    return {
      success: videosGenerated > 0,
      videoSessionId,
      totalImages,
      videosGenerated,
      videosFailed
    }
    
  } catch (error) {
    console.error(`❌ Ultra simple video generation failed:`, error)
    throw error
  }
}

