// ULTRA SIMPLE VIDEO - EXPRESS VERSION with NATIVE CLOUDINARY SDK
// No Workers restrictions! Full Node.js power!

import { fal } from '@fal-ai/client'
import { v2 as cloudinary } from 'cloudinary'
import fetch from 'node-fetch'

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

// Download Midjourney image using Puppeteer service
async function downloadMidjourneyImage(imageUrl) {
  console.log(`📥 Downloading Midjourney image via Puppeteer...`)
  
  const response = await fetch('http://localhost:3001/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl })
  })
  
  if (!response.ok) {
    throw new Error(`Puppeteer download failed: ${response.status}`)
  }
  
  const result = await response.json()
  
  if (!result.success) {
    throw new Error(`Puppeteer download failed: ${result.error}`)
  }
  
  const base64Data = result.data
  const buffer = Buffer.from(base64Data, 'base64')
  
  console.log(`✅ Downloaded Midjourney image (${buffer.length} bytes)`)
  
  return buffer
}

// Upload to Cloudinary using NATIVE SDK (works in Node.js!)
async function uploadToCloudinary(imageBuffer) {
  console.log(`☁️  Uploading to Cloudinary (NATIVE SDK)...`)
  
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'video-generation',
        resource_type: 'image'
      },
      (error, result) => {
        if (error) {
          console.error(`❌ Cloudinary upload error:`, error)
          reject(new Error(`Cloudinary upload failed: ${error.message}`))
        } else {
          console.log(`✅ Uploaded to Cloudinary: ${result.secure_url}`)
          resolve(result.secure_url)
        }
      }
    )
    
    uploadStream.end(imageBuffer)
  })
}

// Send to FAL with Cloudinary URL
async function sendToFAL(cloudinaryUrl, apiKey, customPrompt = 'subtle') {
  console.log(``)
  console.log(`🚀 SENDING TO FAL - KLING 2.5 (STANDARD)`)
  console.log(`🔗 Image URL: ${cloudinaryUrl}`)
  console.log(`📝 Prompt: "${customPrompt}"`)
  console.log(`⏱️  Duration: 5 seconds`)
  
  const requestPayload = {
    prompt: customPrompt,
    image_url: cloudinaryUrl,
    duration: "5"
  }
  
  console.log(``)
  console.log(`📦 Request Payload:`)
  console.log(JSON.stringify(requestPayload, null, 2))
  console.log(``)
  
  fal.config({ credentials: apiKey })
  
  const result = await fal.subscribe('fal-ai/kling-video/v2.5-turbo/standard/image-to-video', {
    input: requestPayload,
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === 'IN_PROGRESS') {
        update.logs.map((log) => log.message).forEach(console.log)
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

// Main function - ULTRA SIMPLE with NATIVE SDK
export async function generateUltraSimpleVideos(env, request) {
  const { sessionIds, apiKey, videoSessionId: providedSessionId, customPrompt } = request
  const videoPrompt = customPrompt || 'subtle'
  
  console.log(``)
  console.log(`═══════════════════════════════════════════════════════════`)
  console.log(`🎬 ULTRA SIMPLE VIDEO - KLING 2.5 STANDARD`)
  console.log(`   Sessions: ${sessionIds.length}`)
  console.log(`   Method: Puppeteer → Cloudinary (Native SDK) → FAL`)
  console.log(`   Prompt: "${videoPrompt}"`)
  console.log(`   Model: Kling 2.5 Turbo Standard`)
  console.log(`   Duration: 5 seconds`)
  console.log(`═══════════════════════════════════════════════════════════`)
  console.log(``)
  
  // Use provided session ID (created by Express endpoint with placeholders already)
  const videoSessionId = providedSessionId || `ultra-simple-${Date.now()}-${Math.random().toString(36).substring(7)}`
  
  let totalImages = 0
  let videosGenerated = 0
  let videosFailed = 0
  
  console.log(`🔄 Processing videos for session: ${videoSessionId}`)
  
  try {
    // Now process each session and UPDATE the placeholder records
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
        console.log(`⚠️  No images in session ${sessionId}`)
        continue
      }
      
      console.log(`✅ Found ${images.length} images to process`)
      totalImages += images.length
      
      // Process 50 images at a time
      const batchSize = 50
      
      for (let i = 0; i < images.length; i += batchSize) {
        const batch = images.slice(i, Math.min(i + batchSize, images.length))
        
        console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} images)`)
        
        // Process batch in parallel
        const batchPromises = batch.map(async (image) => {
          try {
            console.log(`🎬 Processing image ${image.id}...`)
            
            // Get image URL (Cloudinary or direct)
            let imageUrl
            
            if (image.model === 'MIDJOURNEY' && image.image_url) {
              // Download with Puppeteer, upload to Cloudinary
              const imageBuffer = await downloadMidjourneyImage(image.image_url)
              imageUrl = await uploadToCloudinary(imageBuffer)
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
            
            // Send to FAL with image URL and custom prompt
            const falResult = await sendToFAL(imageUrl, apiKey, videoPrompt)
            
            // UPDATE the placeholder record with the real video URL
            await env.DB.prepare(`
              UPDATE gallery_videos 
              SET video_url = ?, fal_request_id = ?
              WHERE session_id = ? AND gallery_image_id = ? AND video_url = 'PROCESSING'
            `).bind(
              falResult.videoUrl,
              falResult.requestId,
              videoSessionId,
              image.id
            ).run()
            
            console.log(`✅ Video generated for image ${image.id} - updated placeholder with real URL`)
            return { success: true }
            
          } catch (error) {
            console.error(`❌ Failed for image ${image.id}:`, error)
            return { success: false }
          }
        })
        
        const batchResults = await Promise.all(batchPromises)
        
        const batchSuccess = batchResults.filter((r) => r.success).length
        const batchFailed = batchResults.filter((r) => !r.success).length
        
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

