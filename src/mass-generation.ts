// Mass Generation Service for Floodify Prompt Engineer
// Handles batch processing with FAL AI's multi-image generation

export interface GenerationConfig {
  model: string
  totalImages: number
  imagesPerRequest: number
  concurrentLimit: number
}

export interface PricingInfo {
  model: string
  pricePerImage: number
  totalImages: number
  promptCost: number
  imageCost: number
  totalCost: number
  estimatedTime: string
}

// Pricing per image (in USD)
export const IMAGE_PRICING: Record<string, number> = {
  'SEED_DREAM': 0.03,      // $0.03 per image - ByteDance Seedream
  'IMAGEN_4': 0.04,         // $0.04 per image - Google Imagen 4
  'flux-pro': 0.05,         // Flux Pro
  'ideogram': 0.08,         // Ideogram
  'dall-e-3': 0.04,         // OpenAI DALL-E 3
}

// Model capabilities for multi-image generation
export const MODEL_CAPABILITIES: Record<string, number> = {
  'SEED_DREAM': 4,          // Can generate 4 images per request
  'IMAGEN_4': 4,            // Can generate 4 images per request
  'flux-pro': 1,            // Single image per request
  'ideogram': 1,            // Single image per request
  'dall-e-3': 1,            // Single image per request
}

export function calculateCost(model: string, totalImages: number): PricingInfo {
  const pricePerImage = IMAGE_PRICING[model] || 0.05
  const imagesPerRequest = MODEL_CAPABILITIES[model] || 1
  const totalRequests = Math.ceil(totalImages / imagesPerRequest)
  
  // Estimate time based on 10 concurrent requests
  // Assume 15-20 seconds per request on average
  const secondsPerBatch = 20
  const totalBatches = Math.ceil(totalRequests / 10)
  const totalSeconds = totalBatches * secondsPerBatch
  
  // Format time estimate
  let estimatedTime = ''
  if (totalSeconds < 60) {
    estimatedTime = `${totalSeconds} seconds`
  } else if (totalSeconds < 3600) {
    const minutes = Math.round(totalSeconds / 60)
    estimatedTime = `${minutes} minutes`
  } else {
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.round((totalSeconds % 3600) / 60)
    estimatedTime = `${hours}h ${minutes}m`
  }
  
  return {
    model,
    pricePerImage,
    totalImages,
    promptCost: totalImages * 0.0001,  // GPT-4o-mini cost per prompt
    imageCost: totalImages * pricePerImage,
    totalCost: (totalImages * pricePerImage) + (totalImages * 0.0001),
    estimatedTime
  }
}

export class GenerationQueue {
  private queue: Array<() => Promise<any>> = []
  private activeRequests = 0
  private concurrentLimit = 10
  private completed = 0
  private total = 0
  
  public onProgress?: (completed: number, total: number) => void
  public isPaused = false
  
  constructor(concurrentLimit = 10) {
    this.concurrentLimit = concurrentLimit
  }
  
  async add(task: () => Promise<any>): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task()
          this.completed++
          if (this.onProgress) {
            this.onProgress(this.completed, this.total)
          }
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })
      
      this.processQueue()
    })
  }
  
  private async processQueue() {
    if (this.isPaused) return
    
    while (this.queue.length > 0 && this.activeRequests < this.concurrentLimit) {
      const task = this.queue.shift()
      if (!task) break
      
      this.activeRequests++
      task().finally(() => {
        this.activeRequests--
        this.processQueue()
      })
    }
  }
  
  pause() {
    this.isPaused = true
  }
  
  resume() {
    this.isPaused = false
    this.processQueue()
  }
  
  getStatus() {
    return {
      completed: this.completed,
      total: this.total,
      activeRequests: this.activeRequests,
      queueLength: this.queue.length,
      isPaused: this.isPaused
    }
  }
  
  setTotal(total: number) {
    this.total = total
  }
}

// Format batch for multi-image generation
export function formatBatchRequest(prompts: string[], model: string) {
  const imagesPerRequest = MODEL_CAPABILITIES[model] || 1
  
  if (imagesPerRequest === 1) {
    // Single image models
    return prompts.map(prompt => ({
      prompt,
      num_images: 1
    }))
  } else {
    // Multi-image models - group prompts
    const batches = []
    for (let i = 0; i < prompts.length; i += imagesPerRequest) {
      const batch = prompts.slice(i, i + imagesPerRequest)
      if (batch.length === 1) {
        // If only one prompt left, still generate just one image
        batches.push({
          prompt: batch[0],
          num_images: 1
        })
      } else {
        // For SEED_DREAM and IMAGEN_4, we can send multiple prompts
        // but they need to be formatted differently
        batches.push({
          prompts: batch,
          num_images: batch.length
        })
      }
    }
    return batches
  }
}