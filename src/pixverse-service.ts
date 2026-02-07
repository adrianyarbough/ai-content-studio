// Video Generation Service using Pixverse v5 (FAL AI)
// Handles image-to-video generation through FAL AI's Pixverse v5 API

import { fal } from '@fal-ai/client'

export interface VideoGenerationRequest {
  imageUrl: string
  aspectRatio: string  // '1:1' or '9:16'
  duration: number     // 5 or 8 seconds for Pixverse
  apiKey: string
  prompt?: string      // Optional prompt for video guidance
}

export interface VideoGenerationResponse {
  url: string
  requestId: string
  status: string
}

export interface BatchVideoRequest {
  images: Array<{
    url: string
    prompt?: string
  }>
  settings: {
    aspectRatio?: string
    resolution?: string
    duration?: string
    style?: string
  }
  apiKey: string
}

// Pixverse v5 API endpoint (via FAL AI)
const PIXVERSE_ENDPOINT = 'fal-ai/pixverse/v5/image-to-video'

// Helper function to remove Midjourney-specific flags from prompts
// FAL AI doesn't understand --ar, --sref, --s, --c, --q, --v, etc.
function cleanMidjourneyPrompt(prompt: string): string {
  if (!prompt) return ''
  
  // Remove all Midjourney flags like --ar 9:16, --sref 2537726996, --s 750, etc.
  // Pattern matches: --flagname followed by space and value (numbers, letters, colons, etc.)
  return prompt.replace(/--\w+\s+[\w\d:\.]+/g, '').trim()
}

// LEGACY: Disabled. Use generateVideo() below.
export async function submitVideo(_request: VideoGenerationRequest): Promise<{ requestId: string, statusUrl: string, resultUrl: string }> {
  throw new Error('submitVideo is disabled. Use generateVideo() with the FAL SDK path.');
}

// NEW: Poll for video completion (separate from submit)
// Note: This function is now deprecated - use generateVideo() with FAL SDK instead
export async function pollVideo(requestId: string, statusUrl: string, resultUrl: string, apiKey: string): Promise<VideoGenerationResponse> {
  throw new Error('pollVideo is deprecated - use generateVideo() with FAL SDK instead')
}

// NEW: Cancel video generation request
export async function cancelVideo(requestId: string, apiKey: string): Promise<{ success: boolean, status: string, message?: string }> {
  try {
    console.log(`🛑 Attempting to cancel video request: ${requestId}`)
    
    const cancelResponse = await fetch(
      `https://queue.fal.run/${PIXVERSE_ENDPOINT}/requests/${requestId}/cancel`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Key ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    )
    
    if (cancelResponse.ok) {
      const data = await cancelResponse.json()
      console.log(`✅ Cancel request ${requestId}: ${data.status}`)
      return { success: true, status: data.status }
    } else if (cancelResponse.status === 400) {
      // Already completed or in progress
      const data = await cancelResponse.json()
      console.log(`⚠️ Cannot cancel ${requestId}: ${data.status || 'ALREADY_COMPLETED'}`)
      return { success: false, status: data.status || 'ALREADY_COMPLETED' }
    } else {
      const errorText = await cancelResponse.text()
      console.log(`❌ Cancel failed ${requestId}: ${errorText}`)
      return { success: false, status: 'CANCEL_FAILED', message: errorText }
    }
  } catch (error) {
    console.error(`❌ Cancel error for ${requestId}:`, error)
    return { success: false, status: 'CANCEL_ERROR', message: error.message }
  }
}

export async function generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
  const { imageUrl, aspectRatio, duration, apiKey, prompt } = request
  
  console.log('Submitting video generation request to Pixverse v5 using FAL SDK...')
  console.log('Image URL:', imageUrl)
  console.log('Settings:', duration, 'seconds, aspect ratio:', aspectRatio)
  
  try {
    // Minimal parameter validation to prevent malformed submissions
    if (!imageUrl || !aspectRatio || !duration || !apiKey) {
      throw new Error('Missing required parameters for Pixverse generateVideo()')
    }
    
    // Clean Midjourney flags from prompt before sending to FAL AI
    const cleanedPrompt = cleanMidjourneyPrompt(prompt || '')
    console.log('Original prompt:', prompt)
    console.log('Cleaned prompt:', cleanedPrompt)
    
    // Configure FAL client with API key
    fal.config({ credentials: apiKey })
    
    // Use FAL SDK subscribe method (same as successful test)
    const result = await fal.subscribe('fal-ai/pixverse/v5/image-to-video', {
      input: {
        prompt: cleanedPrompt,
        image_url: imageUrl,
        aspect_ratio: aspectRatio,
        resolution: '720p',
        duration: duration
      },
      logs: true
    })
    
    console.log('✅ Video generation completed using FAL SDK!')
    console.log('Video URL:', result.data.video.url)
    console.log('Request ID:', result.requestId)
    
    return {
      url: result.data.video.url,
      requestId: result.requestId,
      status: 'completed'
    }
    
  } catch (error) {
    console.error('Video generation error:', error)
    throw error
  }
}

// Note: Manual polling function removed - now using FAL SDK which handles queue automatically

// Generate videos for multiple images (batch processing)
export async function generateBatchVideos(request: BatchVideoRequest): Promise<Array<VideoGenerationResponse>> {
  const results = []
  const batchSize = 3 // Process 3 at a time to avoid rate limits
  
  for (let i = 0; i < request.images.length; i += batchSize) {
    const batch = request.images.slice(i, i + batchSize)
    const batchPromises = batch.map(image => 
      generateVideo({
        imageUrl: image.url,
        aspectRatio: request.settings.aspectRatio || '1:1',
        duration: parseInt(request.settings.duration || '5'),
        apiKey: request.apiKey
      }).catch(error => ({
        url: null,
        requestId: null,
        status: 'failed',
        error: error.message
      }))
    )
    
    const batchResults = await Promise.all(batchPromises)
    results.push(...batchResults)
    
    // Add delay between batches to avoid rate limiting
    if (i + batchSize < request.images.length) {
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
  
  return results
}

// Create transition video between two images
// Note: Pixverse v5 supports this through first_image_url and last_image_url
export async function createTransitionVideo(
  firstImageUrl: string,
  lastImageUrl: string, 
  prompt: string,
  settings: any,
  apiKey: string
): Promise<VideoGenerationResponse> {
  console.log('Transition video with Pixverse v5...')
  
  // Use first image only for now (transition feature can be added later)
  return generateVideo({
    imageUrl: firstImageUrl,
    aspectRatio: settings.aspectRatio || '1:1',
    duration: parseInt(settings.duration || '5'),
    apiKey: apiKey
  })
}
