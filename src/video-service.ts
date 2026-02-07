// Video Generation Service using Runway Gen4 Turbo
// Enhanced with detailed status fetching including logs, progress, and queue position
export interface VideoGenerationRequest {
  imageUrl: string
  aspectRatio: string  // '1:1' or '9:16'
  duration: number     // 3 seconds for Gen4 Turbo
  apiKey: string
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

// Runway Gen4 Turbo API endpoint
const RUNWAY_API = 'https://api.dev.runwayml.com/v1/image_to_video'

// Map user-friendly aspect ratios to Runway's pixel format
function mapAspectRatio(aspectRatio: string): string {
  if (aspectRatio === '1:1') {
    return '960:960'
  } else if (aspectRatio === '9:16') {
    return '720:1280'
  }
  return '960:960' // Default to square
}

export async function generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
  const { imageUrl, aspectRatio, duration, apiKey } = request
  
  console.log('Submitting video generation request to Runway Gen4 Turbo...')
  console.log('Image URL:', imageUrl)
  console.log('Settings: 3 seconds, aspect ratio:', aspectRatio)
  
  try {
    // Submit the video generation request
    const requestBody = {
      model: 'gen4_turbo',
      promptImage: imageUrl,
      ratio: mapAspectRatio(aspectRatio),
      duration: duration
    }
    
    console.log('Request body:', JSON.stringify(requestBody))
    console.log('🚀 Sending request to Runway API...')
    console.log('API Endpoint:', RUNWAY_API)
    console.log('API Key (first 20 chars):', apiKey.substring(0, 20) + '...')
    
    const submitResponse = await fetch(RUNWAY_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-Runway-Version': '2024-11-06',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })
    
    console.log('📥 Response status:', submitResponse.status, submitResponse.statusText)
    console.log('📥 Response headers:', JSON.stringify(Object.fromEntries(submitResponse.headers.entries())))
    
    if (!submitResponse.ok) {
      const errorData = await submitResponse.text()
      console.log('❌ Error response body:', errorData)
      throw new Error(`Runway submission failed: ${errorData}`)
    }
    
    const submitData = await submitResponse.json()
    console.log('✅ Success response body:', JSON.stringify(submitData))
    const taskId = submitData.id
    
    console.log(`✅ Video generation request submitted: ${taskId}`)
    
    // Poll for completion
    return await pollForVideoResult(taskId, apiKey)
    
  } catch (error) {
    console.error('Video generation error:', error)
    throw error
  }
}

async function pollForVideoResult(taskId: string, apiKey: string): Promise<VideoGenerationResponse> {
  const statusUrl = `https://api.dev.runwayml.com/v1/tasks/${taskId}`
  
  console.log(`Polling for video generation status: ${taskId}`)
  
  for (let attempt = 0; attempt < 60; attempt++) { // Max 5 minutes for video generation
    try {
      // Fetch task status
      const statusResponse = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'X-Runway-Version': '2024-11-06'
        }
      })
      
      console.log(`Poll attempt ${attempt + 1}: Status code ${statusResponse.status}`)
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json()
        console.log(`Status: ${statusData.status}`)
        
        // Log progress if available
        if (statusData.progress !== undefined) {
          console.log(`⏳ Progress: ${statusData.progress}%`)
        }
        
        // Check if completed
        if (statusData.status === 'SUCCEEDED') {
          const videoUrl = statusData.output?.[0]
          
          if (videoUrl) {
            console.log('Video generation completed!')
            return {
              url: videoUrl,
              requestId: taskId,
              status: 'completed'
            }
          }
        } else if (statusData.status === 'FAILED') {
          const errorMsg = statusData.failure || statusData.failureCode || 'Unknown error'
          throw new Error(`Video generation failed: ${errorMsg}`)
        } else if (statusData.status === 'PENDING' || statusData.status === 'RUNNING') {
          console.log('Still processing...')
        }
      } else {
        const errorText = await statusResponse.text()
        console.log(`Status check returned ${statusResponse.status}, continuing...`)
      }
    } catch (error) {
      console.error(`Poll attempt ${attempt} error:`, error)
    }
    
    // Wait 5 seconds before next poll
    console.log(`Poll attempt ${attempt + 1}/${60}, waiting 5 seconds...`)
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  
  throw new Error(`Video generation timeout after 5 minutes (60 attempts). The video service may be experiencing delays. Please try again later.`)
}

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
        duration: parseInt(request.settings.duration || '3'),
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
// Note: Runway Gen4 Turbo doesn't support transition videos, so this is kept for API compatibility
export async function createTransitionVideo(
  firstImageUrl: string,
  lastImageUrl: string, 
  prompt: string,
  settings: any,
  apiKey: string
): Promise<VideoGenerationResponse> {
  console.log('Transition videos not supported by Runway Gen4 Turbo, using first image only...')
  
  return generateVideo({
    imageUrl: firstImageUrl,
    aspectRatio: settings.aspectRatio || '1:1',
    duration: parseInt(settings.duration || '3'),
    apiKey: apiKey
  })
}
