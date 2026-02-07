// Image Generation Service - ONLY SEED_DREAM and IMAGEN_4
export interface ImageGenerationRequest {
  prompt: string
  model: string
  apiKey?: string
}

export interface ImageGenerationResponse {
  url: string
  model: string
  prompt: string
  requestId?: string // Added for request tracking
}

// ONLY the two models you requested - using exact FAL AI model IDs
export const MODEL_MAPPINGS = {
  'SEED_DREAM': 'fal-ai/bytedance/seedream/v4/text-to-image',
  'IMAGEN_4': 'fal-ai/imagen4/preview'
}

export async function generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
  const { prompt, model, apiKey } = request
  
  // Map the model name to the actual API model
  const actualModel = MODEL_MAPPINGS[model] || model
  
  try {
    if (model === 'SEED_DREAM') {
      // Use Fal.ai for SEED_DREAM
      return await generateWithFalAI(prompt, actualModel, apiKey)
    } else if (model === 'IMAGEN_4') {
      // Use Fal.ai for IMAGEN_4 as well
      return await generateWithImagen4(prompt, apiKey)
    } else {
      throw new Error(`Unsupported model: ${model}`)
    }
  } catch (error) {
    console.error('Image generation error:', error)
    throw error
  }
}

async function generateWithFalAI(prompt: string, model: string, apiKey: string): Promise<ImageGenerationResponse> {
  // FAL AI endpoint for SEED_DREAM
  // Based on documentation: https://fal.ai/models/fal-ai/bytedance/seedream/v4/text-to-image/api
  const submitUrl = `https://queue.fal.run/${model}`
  
  console.log(`Submitting to FAL AI: ${model}`)
  
  // Step 1: Submit the request
  const submitResponse = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: prompt,
      image_size: 'square_hd', // Options: square_hd, square, portrait_4_3, portrait_16_9, landscape_4_3, landscape_16_9
      num_images: 1,
      enable_safety_checker: false
    })
  })
  
  if (!submitResponse.ok) {
    const error = await submitResponse.text()
    console.error(`Submit failed: ${submitResponse.status} - ${error}`)
    throw new Error(`Fal.ai submit error: ${submitResponse.statusText} - ${error}`)
  }
  
  const submitData = await submitResponse.json()
  console.log('Submit response:', JSON.stringify(submitData))
  const requestId = submitData.request_id
  console.log(`Request submitted, ID: ${requestId}`)
  
  // Step 2: Use the URLs provided by FAL AI in the response
  const resultUrl = submitData.response_url || `https://queue.fal.run/${model}/requests/${requestId}`
  const statusUrl = submitData.status_url
  
  console.log(`Using result URL: ${resultUrl}`);
  console.log(`Using status URL: ${statusUrl}`);
  
  let attempts = 0
  const maxAttempts = 60 // 120 seconds timeout (60 * 2 seconds)
  
  // Wait a bit before first poll
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  while (attempts < maxAttempts) {
    attempts++
    
    try {
      // Use the URL provided by FAL AI
      console.log(`Attempt ${attempts}: Checking ${resultUrl}`)
      
      const resultResponse = await fetch(resultUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Key ${apiKey}`
        }
      })
      
      console.log(`Response status: ${resultResponse.status}`)
      
      if (resultResponse.ok) {
        const resultData = await resultResponse.json()
        console.log(`Result data:`, JSON.stringify(resultData).substring(0, 200))
        
        // Check various possible response structures
        if (resultData.status === 'COMPLETED' || resultData.images || resultData.output) {
          const imageUrl = resultData.images?.[0]?.url || 
                         resultData.output?.images?.[0]?.url ||
                         resultData.image?.url
          
          if (imageUrl) {
            console.log('Image generation completed!')
            return {
              url: imageUrl,
              model: 'SEED_DREAM',
              prompt,
              requestId
            }
          }
        } else if (resultData.status === 'IN_PROGRESS' || resultData.status === 'PENDING') {
          console.log(`Status: ${resultData.status}, continuing to poll...`)
        } else if (resultData.status === 'FAILED' || resultData.status === 'ERROR') {
          throw new Error(`Generation failed: ${resultData.error || JSON.stringify(resultData)}`)
        }
      } else if (resultResponse.status === 404) {
        console.log('Request not found yet, waiting...')
      } else if (resultResponse.status === 400) {
        const errorText = await resultResponse.text()
        // Check if it's just "still in progress" which is not really an error
        if (errorText.includes('Request is still in progress')) {
          console.log('Request still processing, continuing to poll...')
        } else {
          console.error(`Error response: ${resultResponse.status} - ${errorText}`)
        }
      } else {
        const errorText = await resultResponse.text()
        console.error(`Error response: ${resultResponse.status} - ${errorText}`)
      }
    } catch (error) {
      console.error(`Poll error: ${error}`)
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  
  throw new Error('Timeout waiting for image generation')
}

async function generateWithImagen4(prompt: string, apiKey: string): Promise<ImageGenerationResponse> {
  // IMAGEN_4 implementation using FAL AI
  // Based on documentation: https://fal.ai/models/fal-ai/imagen4/preview/api
  const submitUrl = `https://queue.fal.run/${MODEL_MAPPINGS['IMAGEN_4']}`
  
  console.log(`Submitting to Imagen4: ${MODEL_MAPPINGS['IMAGEN_4']}`)
  
  // Step 1: Submit the request
  const submitResponse = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: prompt,
      aspect_ratio: '1:1', // Options: 1:1, 16:9, 9:16, 3:4, 4:3
      num_images: 1,
      resolution: '1K', // Options: 1K, 2K
      seed: Math.floor(Math.random() * 1000000)
    })
  })
  
  if (!submitResponse.ok) {
    const error = await submitResponse.text()
    console.error(`Submit failed: ${submitResponse.status} - ${error}`)
    throw new Error(`Imagen4 submit error: ${submitResponse.statusText} - ${error}`)
  }
  
  const submitData = await submitResponse.json()
  console.log('Submit response:', JSON.stringify(submitData))
  const requestId = submitData.request_id
  console.log(`Request submitted, ID: ${requestId}`)
  
  // Step 2: Use the URLs provided by FAL AI in the response
  const resultUrl = submitData.response_url || `https://queue.fal.run/${MODEL_MAPPINGS['IMAGEN_4']}/requests/${requestId}`
  const statusUrl = submitData.status_url
  
  console.log(`Using result URL: ${resultUrl}`);
  console.log(`Using status URL: ${statusUrl}`);
  
  let attempts = 0
  const maxAttempts = 60 // 120 seconds timeout (60 * 2 seconds)
  
  // Wait a bit before first poll
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  while (attempts < maxAttempts) {
    attempts++
    
    try {
      // Use the URL provided by FAL AI
      console.log(`Attempt ${attempts}: Checking ${resultUrl}`)
      
      const resultResponse = await fetch(resultUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Key ${apiKey}`
        }
      })
      
      console.log(`Response status: ${resultResponse.status}`)
      
      if (resultResponse.ok) {
        const resultData = await resultResponse.json()
        console.log(`Result data:`, JSON.stringify(resultData).substring(0, 200))
        
        // Check various possible response structures
        if (resultData.status === 'COMPLETED' || resultData.images || resultData.output) {
          const imageUrl = resultData.images?.[0]?.url || 
                         resultData.output?.images?.[0]?.url ||
                         resultData.image?.url
          
          if (imageUrl) {
            console.log('Imagen4 generation completed!')
            return {
              url: imageUrl,
              model: 'IMAGEN_4',
              prompt,
              requestId
            }
          }
        } else if (resultData.status === 'IN_PROGRESS' || resultData.status === 'PENDING') {
          console.log(`Status: ${resultData.status}, continuing to poll...`)
        } else if (resultData.status === 'FAILED' || resultData.status === 'ERROR') {
          throw new Error(`Generation failed: ${resultData.error || JSON.stringify(resultData)}`)
        }
      } else if (resultResponse.status === 404) {
        console.log('Request not found yet, waiting...')
      } else if (resultResponse.status === 400) {
        const errorText = await resultResponse.text()
        // Check if it's just "still in progress" which is not really an error
        if (errorText.includes('Request is still in progress')) {
          console.log('Request still processing, continuing to poll...')
        } else {
          console.error(`Error response: ${resultResponse.status} - ${errorText}`)
        }
      } else {
        const errorText = await resultResponse.text()
        console.error(`Error response: ${resultResponse.status} - ${errorText}`)
      }
    } catch (error) {
      console.error(`Poll error: ${error}`)
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  
  throw new Error('Timeout waiting for image generation')
}

// Batch generation for multiple prompts
export async function generateImageBatch(
  prompts: string[],
  model: string,
  apiKey: string
): Promise<ImageGenerationResponse[]> {
  const results = []
  
  // Process in parallel with a limit
  const batchSize = 3 // Process 3 at a time to avoid rate limits
  
  for (let i = 0; i < prompts.length; i += batchSize) {
    const batch = prompts.slice(i, i + batchSize)
    const batchPromises = batch.map(prompt => 
      generateImage({ prompt, model, apiKey })
        .catch(error => ({
          url: null,
          model,
          prompt,
          error: error.message
        }))
    )
    
    const batchResults = await Promise.all(batchPromises)
    results.push(...batchResults)
  }
  
  return results
}