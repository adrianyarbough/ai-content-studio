// Puppeteer Download Service with Browser Pool for Midjourney Images
// Runs on port 3001, separate from main app
// OPTIMIZED: 7x faster with persistent browser pool
import puppeteer from 'puppeteer';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config({ path: '.dev.vars' });

const app = express();
const PORT = 3001;

// Browser Pool Configuration
const BROWSER_POOL_SIZE = 5; // 5 browsers - balanced for system stability
const MIDJOURNEY_COOKIE = process.env.MIDJOURNEY_COOKIE;

// Safety Configuration
const MIN_DELAY_MS = 100;  // Minimum delay between requests (human-like behavior)
const MAX_DELAY_MS = 500;  // Maximum delay between requests
const MAX_CONCURRENT_DOWNLOADS = 5; // Limit concurrent downloads to browser pool size

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ============================================
// BROWSER POOL CLASS
// ============================================
class BrowserPool {
  constructor(size = BROWSER_POOL_SIZE) {
    this.size = size;
    this.browsers = [];
    this.availablePages = [];
    this.busyPages = new Set();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    console.log(`🚀 Initializing browser pool with ${this.size} browsers...`);
    
    for (let i = 0; i < this.size; i++) {
      try {
        const browser = await puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled', // Hide automation
            '--disable-features=IsolateOrigins,site-per-process' // Better performance
          ]
        });
        
        const page = await browser.newPage();
        
        // Set realistic user agent
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Hide webdriver property to avoid detection
        await page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
          });
        });
        
        // Set viewport to standard desktop size
        await page.setViewport({ width: 1920, height: 1080 });
        
        this.browsers.push(browser);
        this.availablePages.push({
          page,
          browser,
          id: i
        });
        
        console.log(`  ✓ Browser ${i} initialized`);
      } catch (error) {
        console.error(`  ✗ Browser ${i} failed to initialize: ${error.message}`);
      }
    }
    
    this.initialized = true;
    console.log(`✅ Browser pool ready with ${this.browsers.length}/${this.size} browsers`);
  }

  async getPage() {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (this.availablePages.length === 0) {
      // Wait for a page to become available
      return new Promise((resolve) => {
        const checkAvailable = setInterval(() => {
          if (this.availablePages.length > 0) {
            clearInterval(checkAvailable);
            const pageData = this.availablePages.pop();
            this.busyPages.add(pageData);
            resolve(pageData);
          }
        }, 10);
      });
    }
    
    const pageData = this.availablePages.pop();
    this.busyPages.add(pageData);
    return pageData;
  }

  releasePage(pageData) {
    this.busyPages.delete(pageData);
    this.availablePages.push(pageData);
  }

  async downloadImage(pageData, imageUrl, cookie) {
    const startTime = Date.now();
    
    try {
      // Add random delay between 100-500ms to appear more human-like
      const randomDelay = Math.floor(Math.random() * 400) + 100;
      await new Promise(resolve => setTimeout(resolve, randomDelay));
      
      const response = await pageData.page.goto(imageUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
        headers: {
          'Cookie': cookie,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.midjourney.com/',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br'
        }
      });

      if (!response || response.status() !== 200) {
        throw new Error(`Failed to download: ${response?.status() || 'no response'}`);
      }

      const buffer = await response.buffer();
      const imageBlob = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      const duration = Date.now() - startTime;
      
      return {
        success: true,
        data: Buffer.from(imageBlob).toString('base64'),
        size: imageBlob.byteLength,
        contentType: response.headers()['content-type'] || 'image/png',
        duration,
        browserId: pageData.id
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ [Browser ${pageData.id}] Download failed in ${duration}ms: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        duration,
        browserId: pageData.id
      };
    }
  }

  async close() {
    console.log('🔄 Closing browser pool...');
    for (const browser of this.browsers) {
      try {
        await browser.close();
      } catch (error) {
        console.error('Error closing browser:', error.message);
      }
    }
    this.browsers = [];
    this.availablePages = [];
    this.busyPages.clear();
    this.initialized = false;
    console.log('✅ Browser pool closed');
  }

  getStats() {
    return {
      total: this.size,
      available: this.availablePages.length,
      busy: this.busyPages.size,
      initialized: this.initialized
    };
  }
}

// Create global browser pool
const browserPool = new BrowserPool(BROWSER_POOL_SIZE);

// Initialize pool on startup
browserPool.initialize().catch(err => {
  console.error('Failed to initialize browser pool:', err);
});

// ============================================
// API ENDPOINTS
// ============================================

// Health check endpoint
app.get('/health', (req, res) => {
  const stats = browserPool.getStats();
  res.json({
    status: 'ok',
    service: 'puppeteer-download',
    browserPool: stats,
    poolSize: BROWSER_POOL_SIZE,
    cookie: MIDJOURNEY_COOKIE ? 'configured' : 'missing'
  });
});

// Download endpoint (single image)
app.post('/download', async (req, res) => {
  const { imageUrl } = req.body;
  
  if (!imageUrl) {
    return res.status(400).json({ 
      success: false,
      error: 'Missing imageUrl in request body' 
    });
  }

  if (!MIDJOURNEY_COOKIE) {
    return res.status(500).json({
      success: false,
      error: 'MIDJOURNEY_COOKIE not configured in environment variables'
    });
  }

  const startTime = Date.now();
  let pageData;
  
  try {
    // Get a browser from the pool
    pageData = await browserPool.getPage();
    console.log(`🐕 [Browser ${pageData.id}] Downloading: ${imageUrl}`);
    
    // Download the image
    const result = await browserPool.downloadImage(pageData, imageUrl, MIDJOURNEY_COOKIE);
    
    if (result.success) {
      console.log(`✅ [Browser ${pageData.id}] Downloaded ${result.size} bytes in ${result.duration}ms`);
      res.json(result);
    } else {
      res.status(500).json(result);
    }
    
  } catch (error) {
    console.error(`❌ Download error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    });
  } finally {
    // Release browser back to pool
    if (pageData) {
      browserPool.releasePage(pageData);
    }
  }
});

// Batch download endpoint (parallel downloads)
app.post('/download-batch', async (req, res) => {
  const { imageUrls } = req.body;
  
  if (!imageUrls || !Array.isArray(imageUrls)) {
    return res.status(400).json({
      success: false,
      error: 'Missing imageUrls array in request body'
    });
  }

  if (!MIDJOURNEY_COOKIE) {
    return res.status(500).json({
      success: false,
      error: 'MIDJOURNEY_COOKIE not configured in environment variables'
    });
  }

  console.log(`📦 Batch download request: ${imageUrls.length} images`);
  const startTime = Date.now();
  
  try {
    // Download all images in parallel using the browser pool
    const downloadPromises = imageUrls.map(async (imageUrl, index) => {
      const pageData = await browserPool.getPage();
      try {
        console.log(`🐕 [Browser ${pageData.id}] Batch download ${index + 1}/${imageUrls.length}: ${imageUrl}`);
        const result = await browserPool.downloadImage(pageData, imageUrl, MIDJOURNEY_COOKIE);
        return { ...result, imageUrl, index };
      } finally {
        browserPool.releasePage(pageData);
      }
    });
    
    const results = await Promise.all(downloadPromises);
    const successful = results.filter(r => r.success).length;
    const totalTime = Date.now() - startTime;
    
    console.log(`✅ Batch download complete: ${successful}/${imageUrls.length} successful in ${totalTime}ms`);
    
    res.json({
      success: true,
      results,
      stats: {
        total: imageUrls.length,
        successful,
        failed: imageUrls.length - successful,
        totalTime,
        avgTime: Math.round(totalTime / imageUrls.length)
      }
    });
    
  } catch (error) {
    console.error(`❌ Batch download error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    });
  }
});

// Pool stats endpoint
app.get('/pool-stats', (req, res) => {
  const stats = browserPool.getStats();
  res.json(stats);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing browser pool...');
  await browserPool.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT received, closing browser pool...');
  await browserPool.close();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🐕 Puppeteer Download Service with Browser Pool running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`📥 Single download: http://localhost:${PORT}/download`);
  console.log(`📦 Batch download: http://localhost:${PORT}/download-batch`);
  console.log(`📊 Pool stats: http://localhost:${PORT}/pool-stats`);
  console.log(`⚡ Browser pool size: ${BROWSER_POOL_SIZE} browsers`);
});

export default app;
