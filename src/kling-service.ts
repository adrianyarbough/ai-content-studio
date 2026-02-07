import { fal } from '@fal-ai/client'

const KLING_ENDPOINT = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video'

export interface KlingVideoRequest {
  imageUrl: string
  prompt: string
  duration?: number
  negativePrompt?: string
  cfgScale?: number
  apiKey: string
}

export interface KlingVideoResponse {
  video: {
    url: string
    content_type?: string
    file_name?: string
    file_size?: number
  }
}

export async function generateVideo(request: KlingVideoRequest): Promise<KlingVideoResponse> {
  const { imageUrl, prompt, duration = 5, negativePrompt = 'blur, distort, and low quality', cfgScale = 0.5, apiKey } = request

  console.log(`🎬 Generating Kling video...`)
  console.log(`   Image: ${imageUrl.substring(0, 50)}...`)
  console.log(`   Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`)

  // Set API key
  fal.config({
    credentials: apiKey
  })

  try {
    const result = await fal.subscribe(KLING_ENDPOINT, {
      input: {
        prompt: prompt,
        image_url: imageUrl,
        duration: duration.toString(),
        negative_prompt: negativePrompt,
        cfg_scale: cfgScale
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          update.logs?.map((log) => log.message).forEach(console.log)
        }
      }
    })

    console.log(`✅ Kling video generated successfully!`)
    return result.data
  } catch (error) {
    console.error(`❌ Kling video generation failed:`, error)
    throw new Error(`Kling video generation failed: ${error.message}`)
  }
}

export async function submitVideo(request: KlingVideoRequest): Promise<{ requestId: string, statusUrl: string, resultUrl: string }> {
  const { imageUrl, prompt, duration = 5, negativePrompt = 'blur, distort, and low quality', cfgScale = 0.5, apiKey } = request

  console.log(`🎬 Submitting Kling video request...`)
  console.log(`   Image: ${imageUrl.substring(0, 50)}...`)
  console.log(`   Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`)

  // Set API key
  fal.config({
    credentials: apiKey
  })

  try {
    const requestBody = {
      prompt: prompt,
      image_url: imageUrl,
      duration: duration.toString(),
      negative_prompt: negativePrompt,
      cfg_scale: cfgScale
    }
    
    console.log(`🎬 KLING REQUEST DEBUG:`)
    console.log(`   Endpoint: ${KLING_ENDPOINT}`)
    console.log(`   Request Body:`, JSON.stringify(requestBody, null, 2))
    console.log(`   API Key: ${apiKey ? `${apiKey.substring(0, 10)}...` : 'MISSING'}`)
    
    const { request_id } = await fal.queue.submit(KLING_ENDPOINT, {
      input: requestBody
    })

    console.log(`✅ Kling video request submitted: ${request_id}`)
    return {
      requestId: request_id,
      statusUrl: `https://queue.fal.run/${KLING_ENDPOINT}/requests/${request_id}/status`,
      resultUrl: `https://queue.fal.run/${KLING_ENDPOINT}/requests/${request_id}/result`
    }
  } catch (error) {
    console.error(`❌ Kling video submission failed:`, error)
    console.error(`   Error details:`, JSON.stringify(error, null, 2))
    throw new Error(`Kling video submission failed: ${error.message}`)
  }
}

export async function pollVideo(requestId: string, statusUrl: string, resultUrl: string, apiKey: string): Promise<KlingVideoResponse> {
  console.log(`⏳ Polling Kling video: ${requestId}`)

  // Set API key
  fal.config({
    credentials: apiKey
  })

  const MAX_POLLING_ATTEMPTS = 60 // 60 attempts * 5 seconds = 5 minutes max
  let attempts = 0

  while (attempts < MAX_POLLING_ATTEMPTS) {
    await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds between checks
    attempts++

    try {
      console.log(`⏳ Checking Kling status: ${requestId} (attempt ${attempts}/${MAX_POLLING_ATTEMPTS})`)
      
      // First check status
      const status = await fal.queue.status(KLING_ENDPOINT, {
        requestId: requestId,
        logs: true
      })

      console.log(`   Status: ${status.status}`)

      if (status.status === 'COMPLETED') {
        // Now fetch the result
        const result = await fal.queue.result(KLING_ENDPOINT, {
          requestId: requestId
        })

        console.log(`✅ Kling video polling completed!`)
        console.log(`   Response:`, JSON.stringify(result.data, null, 2))
        return result.data
      } else if (status.status === 'FAILED') {
        throw new Error(`Kling generation failed: ${JSON.stringify(status)}`)
      }
      // If IN_PROGRESS or IN_QUEUE, continue polling
      
    } catch (error) {
      console.error(`❌ Kling polling attempt ${attempts} failed:`, error)
      // Continue trying unless we've exhausted attempts
      if (attempts >= MAX_POLLING_ATTEMPTS) {
        console.error(`   Final error details:`, JSON.stringify(error, null, 2))
        throw new Error(`Kling video polling failed after ${MAX_POLLING_ATTEMPTS} attempts: ${error.message}`)
      }
    }
  }

  throw new Error(`Kling video generation timed out after ${MAX_POLLING_ATTEMPTS * 5} seconds`)
}

// NEW: Cancel video generation request
export async function cancelVideo(requestId: string, apiKey: string): Promise<{ success: boolean, status: string, message?: string }> {
  try {
    console.log(`🛑 Attempting to cancel Kling request: ${requestId}`)
    
    const cancelResponse = await fetch(
      `https://queue.fal.run/${KLING_ENDPOINT}/requests/${requestId}/cancel`,
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
      console.log(`✅ Cancel Kling request ${requestId}: ${data.status}`)
      return { success: true, status: data.status }
    } else if (cancelResponse.status === 400) {
      // Already completed or in progress
      const data = await cancelResponse.json()
      console.log(`⚠️ Cannot cancel Kling ${requestId}: ${data.status || 'ALREADY_COMPLETED'}`)
      return { success: false, status: data.status || 'ALREADY_COMPLETED' }
    } else {
      const errorText = await cancelResponse.text()
      console.log(`❌ Cancel Kling failed ${requestId}: ${errorText}`)
      return { success: false, status: 'CANCEL_FAILED', message: errorText }
    }
  } catch (error) {
    console.error(`❌ Cancel Kling error for ${requestId}:`, error)
    return { success: false, status: 'CANCEL_ERROR', message: error.message }
  }
}
