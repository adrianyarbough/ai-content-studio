/**
 * Nano Banana Service - FAL AI Image Editing
 * Uses fal-ai/nano-banana/edit endpoint
 */

export interface NanoBananaRequest {
  prompt: string
  imageUrl: string // Can be URL or base64 data URI
  apiKey: string
}

export interface NanoBananaResponse {
  images: Array<{
    url: string
    content_type?: string
    file_name?: string
    file_size?: number
  }>
  description: string
}

const NANO_BANANA_ENDPOINT = 'fal-ai/nano-banana/edit'

/**
 * Generate edited image using Nano Banana
 */
export async function generateImage(request: NanoBananaRequest): Promise<NanoBananaResponse> {
  const { prompt, imageUrl, apiKey } = request

  console.log(`🍌 Submitting Nano Banana request...`)
  console.log(`   Image URL: ${imageUrl}`)
  console.log(`   Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`)

  // Submit request to FAL
  const submitResponse = await fetch(`https://queue.fal.run/${NANO_BANANA_ENDPOINT}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: prompt,
      image_urls: [imageUrl], // Array with single reference image
      aspect_ratio: '9:16', // Hardcoded as requested
      num_images: 1,
      output_format: 'jpeg'
    })
  })

  if (!submitResponse.ok) {
    const errorData = await submitResponse.text()
    throw new Error(`Nano Banana submission failed: ${errorData}`)
  }

  const submitData = await submitResponse.json()
  console.log(`✅ Request submitted: ${submitData.request_id}`)

  // Poll for completion
  const result = await pollForResult(
    submitData.request_id,
    submitData.status_url,
    submitData.response_url,
    apiKey
  )

  return result
}

/**
 * Poll FAL for result
 */
async function pollForResult(
  requestId: string,
  statusUrl: string,
  resultUrl: string,
  apiKey: string
): Promise<NanoBananaResponse> {
  console.log(`⏳ Polling for Nano Banana result: ${requestId}`)

  const maxAttempts = 120 // 2 minutes max (120 * 1 second)
  let attempts = 0

  while (attempts < maxAttempts) {
    attempts++
    await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second

    // Check status
    const statusResponse = await fetch(statusUrl, {
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!statusResponse.ok) {
      throw new Error(`Status check failed: ${statusResponse.status}`)
    }

    const statusData = await statusResponse.json()

    if (statusData.status === 'COMPLETED') {
      console.log(`✅ Nano Banana generation completed!`)

      // Fetch result
      const resultResponse = await fetch(resultUrl, {
        headers: {
          'Authorization': `Key ${apiKey}`,
          'Content-Type': 'application/json'
        }
      })

      if (!resultResponse.ok) {
        throw new Error(`Result fetch failed: ${resultResponse.status}`)
      }

      const result = await resultResponse.json()

      if (!result.images || result.images.length === 0) {
        throw new Error('No images in result')
      }

      return result

    } else if (statusData.status === 'FAILED') {
      throw new Error(`Nano Banana generation failed: ${JSON.stringify(statusData)}`)
    }

    // Still processing, continue polling
  }

  throw new Error(`Nano Banana generation timed out after ${maxAttempts} attempts`)
}

