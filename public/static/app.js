// Floodify Prompt Engineer - Complete UI with Loading States and Prompts
window.FloodifyPromptEngineer = class FloodifyPromptEngineer {
  constructor() {
    this.currentView = 'dashboard'
    this.currentTheme = null
    this.currentBatch = []
    this.testResults = []
    this.roundNumber = 1
    this.styles = []
    this.models = [
      { id: 'SEED_DREAM', name: 'SEED_DREAM' },
      { id: 'IMAGEN_4', name: 'IMAGEN_4' }
    ]
    this.isLoading = false
    this.generatedImages = {}
    this.verifiedThemes = null  // Cache for verified CSV themes
    this.selectedTestingMode = 'boundary' // Default to boundary mapping
    this.allThemes = [] // Store all themes for filtering
    this.selectedVideoSessions = new Set() // Initialize for video session selection
    this.viewingSessionId = null  // Track if we're viewing a specific session
    this.init()
    
    // Make loadGalleryPage globally accessible for onclick handlers
    window.loadGalleryPage = this.loadGalleryPage.bind(this)
    
    // Make video status updater globally accessible
    window.updateVideoStatus = this.updateVideoStatus.bind(this)
  }

  async init() {
    await this.loadStyles()
    this.showDashboard()
  }

  // ==================== UTILITIES ====================
  escapeHtml(value) {
    if (value === null || value === undefined) return ''
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  sanitizeObjectStrings(obj) {
    if (!obj || typeof obj !== 'object') return obj
    const out = Array.isArray(obj) ? [...obj] : { ...obj }
    Object.keys(out).forEach((key) => {
      if (typeof out[key] === 'string') {
        out[key] = this.escapeHtml(out[key])
      }
    })
    return out
  }

  sanitizeArray(arr) {
    return (arr || []).map((item) => this.sanitizeObjectStrings(item))
  }

  showLoading(message = 'Loading...') {
    const loadingHtml = `
      <div id="loadingOverlay" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-gray-800 rounded-lg p-6 flex flex-col items-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mb-4"></div>
          <p class="text-white">${message}</p>
        </div>
      </div>
    `
    
    // Add loading overlay if not exists
    if (!document.getElementById('loadingOverlay')) {
      document.body.insertAdjacentHTML('beforeend', loadingHtml)
    }
  }

  hideLoading() {
    const overlay = document.getElementById('loadingOverlay')
    if (overlay) {
      overlay.remove()
    }
  }

  async loadStyles() {
    try {
      const response = await axios.get('/api/styles')
      this.styles = response.data.styles || []
    } catch (error) {
      console.error('Error loading styles:', error)
    }
  }

  // ==================== GALLERY ====================
  async showGallery() {
    console.log('Gallery button clicked!')
    this.currentView = 'gallery'
    this.viewingSessionId = null  // Clear session viewing flag when showing main gallery
    
    try {
      // Get gallery stats
      const statsResponse = await axios.get('/api/gallery/stats')
      const stats = statsResponse.data.stats || {}
      const popularThemes = this.sanitizeArray(statsResponse.data.popular_themes || [])
      
      // Initial search (now includes both images and videos)
      const mediaResponse = await axios.get('/api/gallery/search?limit=50&sort=newest')
      const items = this.sanitizeArray(mediaResponse.data.items || [])
      const images = this.sanitizeArray(mediaResponse.data.images || [])
      const videos = this.sanitizeArray(mediaResponse.data.videos || [])
      const pagination = mediaResponse.data.pagination || {}
      
      const content = document.getElementById('app')
      if (!content) {
        console.error('Gallery error: #app element not found in DOM')
        alert('Error: Unable to find app container. Please refresh the page.')
        return
      }
      content.innerHTML = `
        <div class="max-w-7xl mx-auto animate-fadeIn">
          <!-- Gallery Header -->
          <div class="mb-6">
            <div class="flex justify-between items-center mb-4">
              <h1 class="text-3xl font-bold">
                <i class="fas fa-images mr-2 text-purple-500"></i>
                Production Gallery
              </h1>
              <button onclick="app.showDashboard()" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg">
                <i class="fas fa-arrow-left mr-2"></i>Back to Dashboard
              </button>
            </div>
            
            <!-- Stats Bar -->
            <div class="grid grid-cols-5 gap-4 mb-6">
              <div class="bg-gray-800 rounded-lg p-4 text-center">
                <p class="text-2xl font-bold text-blue-400">${stats.total_images || 0}</p>
                <p class="text-sm text-gray-400">Images</p>
              </div>
              <div class="bg-gray-800 rounded-lg p-4 text-center">
                <p class="text-2xl font-bold text-red-400">${stats.total_videos || 0}</p>
                <p class="text-sm text-gray-400">Videos</p>
              </div>
              <div class="bg-gray-800 rounded-lg p-4 text-center">
                <p class="text-2xl font-bold text-green-400">${stats.total_themes || 0}</p>
                <p class="text-sm text-gray-400">Themes</p>
              </div>
              <div class="bg-gray-800 rounded-lg p-4 text-center">
                <p class="text-2xl font-bold text-purple-400">${stats.total_batches || 0}</p>
                <p class="text-sm text-gray-400">Batches</p>
              </div>
              <div class="bg-gray-800 rounded-lg p-4 text-center">
                <p class="text-2xl font-bold text-orange-400">${stats.total_models || 0}</p>
                <p class="text-sm text-gray-400">Models</p>
              </div>
            </div>
            
            <!-- Search and Filters -->
            <div class="bg-gray-800 rounded-lg p-4 mb-6">
              <div class="flex gap-4 mb-4">
                <input type="text" 
                       id="gallerySearch" 
                       placeholder="Search prompts or themes..."
                       class="flex-1 px-4 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-blue-500">
                <select id="galleryThemeFilter" class="px-4 py-2 bg-gray-700 rounded-lg border border-gray-600" onchange="app.searchGallery(); app.updateThemeManagement()">
                  <option value="">All Themes</option>
                  ${popularThemes.map(t => 
                    `<option value="${t.theme_name}">${t.theme_name} (${t.count})</option>`
                  ).join('') || ''}
                </select>
                <select id="galleryModelFilter" class="px-4 py-2 bg-gray-700 rounded-lg border border-gray-600" onchange="app.searchGallery()">
                  <option value="">All Models</option>
                  <option value="SEED_DREAM">SEED_DREAM</option>
                  <option value="IMAGEN_4">IMAGEN_4</option>
                </select>
                <select id="galleryTypeFilter" class="px-4 py-2 bg-gray-700 rounded-lg border border-gray-600" onchange="app.searchGallery()">
                  <option value="all">All Media</option>
                  <option value="images">Images Only</option>
                  <option value="videos">Videos Only</option>
                </select>
                <select id="gallerySortFilter" class="px-4 py-2 bg-gray-700 rounded-lg border border-gray-600" onchange="app.searchGallery()">
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="random">Random</option>
                </select>
                <button onclick="app.searchGallery()" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium">
                  <i class="fas fa-search mr-2"></i>Search
                </button>
              </div>
              
              <!-- Browse Mode Toggle -->
              <div class="flex gap-4 items-center">
                <div class="flex gap-2">
                  <button id="browseByTheme" onclick="app.viewGalleryByTheme()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium">
                    <i class="fas fa-tags mr-2"></i>By Theme
                  </button>
                  <button id="browseBySession" onclick="app.viewGalleryBySession()" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium">
                    <i class="fas fa-clock mr-2"></i>By Session
                  </button>
                </div>
                
                <!-- View Mode Toggle -->
                <div class="flex gap-2">
                  <button onclick="app.setGalleryView('grid')" class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded">
                    <i class="fas fa-th"></i> Grid
                  </button>
                  <button onclick="app.setGalleryView('list')" class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded">
                    <i class="fas fa-list"></i> List
                  </button>
                  <button onclick="app.setGalleryView('masonry')" class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded">
                    <i class="fas fa-layer-group"></i> Masonry
                  </button>
                </div>
                
                <!-- Theme Management - Show when filtering by specific theme -->
                <div id="themeManagement" class="hidden">
                  <button onclick="app.deleteAllThemeImages()" class="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium">
                    <i class="fas fa-trash mr-2"></i>Delete All Images
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Gallery Grid -->
            <div id="galleryGrid" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              ${items.map((item, idx) => {
                const isVideo = item.media_type === 'video'
                const displayUrl = isVideo ? (item.thumbnail_url || item.video_url) : item.image_url
                const prompt = isVideo ? (item.video_prompt || item.prompt) : item.prompt
                
                return `
                <div class="group relative bg-gray-800 rounded-lg overflow-hidden animate-fadeIn" 
                     style="animation-delay: ${Math.min(idx * 0.05, 1)}s">
                  
                  ${isVideo ? `
                    <!-- Video Thumbnail with Play Button -->
                    <div class="relative w-full h-48 bg-gray-900 cursor-pointer"
                         onclick="window.app.showGalleryVideo('${item.video_url}', \`${prompt?.replace(/`/g, '\\`')}\`)">
                      ${item.thumbnail_url ? `
                        <img src="${item.thumbnail_url}" 
                             alt="${prompt?.substring(0, 50)}..."
                             class="w-full h-48 object-cover">
                      ` : `
                        <div class="w-full h-48 flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                          <i class="fas fa-video text-4xl text-gray-600"></i>
                        </div>
                      `}
                      <!-- Video Play Button Overlay -->
                      <div class="absolute inset-0 flex items-center justify-center">
                        <div class="bg-black bg-opacity-50 rounded-full p-3">
                          <i class="fas fa-play text-white text-xl ml-1"></i>
                        </div>
                      </div>
                      <!-- Video Badge -->
                      <div class="absolute top-2 left-2">
                        <span class="px-2 py-1 bg-red-600 text-white text-xs rounded-lg">
                          <i class="fas fa-video mr-1"></i>VIDEO
                        </span>
                      </div>
                    </div>
                  ` : `
                    <!-- Image -->
                    <img src="${displayUrl}" 
                         alt="${prompt?.substring(0, 50)}..."
                         class="w-full h-48 object-cover cursor-pointer"
                         onclick="window.app.showGalleryImage(${item.id}, '${item.image_url}', \`${prompt?.replace(/`/g, '\\`')}\`)">
                    <!-- Image Badge -->
                    <div class="absolute top-2 left-2">
                      <span class="px-2 py-1 bg-blue-600 text-white text-xs rounded-lg">
                        <i class="fas fa-image mr-1"></i>IMAGE
                      </span>
                    </div>
                  `}
                  
                  <!-- Hover Overlay -->
                  <div class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <div class="absolute bottom-0 left-0 right-0 p-3">
                      <p class="text-xs text-gray-300 line-clamp-2">${prompt?.substring(0, 100)}...</p>
                      <div class="flex gap-1 mt-1 flex-wrap">
                        <span class="text-xs px-2 py-1 bg-blue-600 bg-opacity-50 rounded">${item.model}</span>
                        <span class="text-xs px-2 py-1 bg-purple-600 bg-opacity-50 rounded">${item.theme_name}</span>
                        ${isVideo ? `<span class="text-xs px-2 py-1 bg-red-600 bg-opacity-50 rounded">Video</span>` : ''}
                      </div>
                    </div>
                  </div>
                  
                  <!-- Action Buttons -->
                  <div class="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="app.favoriteItem(${item.id}, '${isVideo ? 'video' : 'image'}'); event.stopPropagation();" 
                            class="p-2 bg-gray-900 bg-opacity-75 rounded-lg hover:bg-opacity-100">
                      <i class="fas fa-heart text-red-400"></i>
                    </button>
                    <button onclick="app.downloadItem('${isVideo ? item.video_url : item.image_url}', '${item.id}', '${isVideo ? 'video' : 'image'}'); event.stopPropagation();" 
                            class="p-2 bg-gray-900 bg-opacity-75 rounded-lg hover:bg-opacity-100">
                      <i class="fas fa-download text-blue-400"></i>
                    </button>
                    <button onclick="window.app.deleteGalleryImage(${item.id}); event.stopPropagation();" 
                            class="p-2 bg-red-600 bg-opacity-75 rounded-lg hover:bg-red-700 hover:bg-opacity-100"
                            title="Delete ${isVideo ? 'video' : 'image'}">
                      <i class="fas fa-trash text-white"></i>
                    </button>
                  </div>
                </div>
                `
              }).join('')}
            </div>
            
            <!-- Pagination -->
            ${pagination.pages > 1 ? `
            <div class="flex justify-center gap-2 mt-8">
              ${pagination.page > 1 ? `
                <button id="initial-prev-page-btn" data-page="${pagination.page - 1}" 
                        class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg">
                  <i class="fas fa-chevron-left"></i>
                </button>
              ` : ''}
              
              <span class="px-4 py-2 bg-gray-800 rounded-lg">
                Page ${pagination.page} of ${pagination.pages}
              </span>
              
              ${pagination.page < pagination.pages ? `
                <button id="initial-next-page-btn" data-page="${pagination.page + 1}" 
                        class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg">
                  <i class="fas fa-chevron-right"></i>
                </button>
              ` : ''}
            </div>
            ` : ''}
            
            <!-- Empty State -->
            ${items.length === 0 ? `
            <div class="text-center py-12">
              <i class="fas fa-photo-video text-6xl text-gray-600 mb-4"></i>
              <p class="text-xl text-gray-400">No media in gallery yet</p>
              <p class="text-sm text-gray-500 mt-2">Generate some images and videos in production to see them here!</p>
            </div>
            ` : ''}
          </div>

          <!-- Video Generation Modal -->
          <div id="modal" class="hidden fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <!-- Modal content will be dynamically inserted here -->
          </div>
        </div>
      `
      
      // Add event listeners for initial pagination buttons
      const initialPrevBtn = document.getElementById('initial-prev-page-btn')
      const initialNextBtn = document.getElementById('initial-next-page-btn')
      
      if (initialPrevBtn) {
        initialPrevBtn.addEventListener('click', () => {
          const targetPage = parseInt(initialPrevBtn.getAttribute('data-page'))
          console.log(`Initial prev button clicked, going to page ${targetPage}`)
          this.loadGalleryPage(targetPage)
        })
      }
      
      if (initialNextBtn) {
        initialNextBtn.addEventListener('click', () => {
          const targetPage = parseInt(initialNextBtn.getAttribute('data-page'))
          console.log(`Initial next button clicked, going to page ${targetPage}`)
          this.loadGalleryPage(targetPage)
        })
      }
    } catch (error) {
      console.error('Error loading gallery:', error)
      const content = document.getElementById('app')
      if (content) {
        content.innerHTML = `
          <div class="max-w-7xl mx-auto p-6">
            <div class="bg-red-600 bg-opacity-20 border border-red-600 rounded-lg p-6 text-center">
              <i class="fas fa-exclamation-triangle text-4xl text-red-500 mb-4"></i>
              <h2 class="text-xl font-bold mb-2">Error Loading Gallery</h2>
              <p class="text-gray-300 mb-4">${this.escapeHtml(error.message || 'Unable to load gallery data')}</p>
              <button onclick="app.showDashboard()" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg">
                <i class="fas fa-arrow-left mr-2"></i>Back to Dashboard
              </button>
            </div>
          </div>
        `
      }
    }
  }
  
  async searchGallery() {
    // Block searchGallery if we're viewing a specific session
    if (this.viewingSessionId) {
      console.log('Blocked searchGallery - currently viewing session:', this.viewingSessionId)
      return
    }
    
    const search = document.getElementById('gallerySearch').value
    const theme = document.getElementById('galleryThemeFilter').value
    const model = document.getElementById('galleryModelFilter').value
    const sort = document.getElementById('gallerySortFilter').value
    const type = document.getElementById('galleryTypeFilter').value || 'all'
    
    const params = new URLSearchParams({
      limit: 50,
      sort,
      type,
      ...(search && { search }),
      ...(theme && { theme }),
      ...(model && { model })
    })
    
    try {
      console.log('🔍 searchGallery API call:', `/api/gallery/search?${params}`)
      const response = await axios.get(`/api/gallery/search?${params}`)
      const items = this.sanitizeArray(response.data.items || [])
      const pagination = response.data.pagination || null
      
      console.log('🔍 searchGallery received:', items.length, 'items, pagination:', pagination)
      
      // 🔧 FIX: Use unified rendering with pagination handling
      this.renderGalleryResults(items, pagination)
      
      // Update theme management buttons after search
      this.updateThemeManagement()
      
      // Check if search is for a specific session and add session delete button
      this.updateSessionManagement(search, items)
      
    } catch (error) {
      console.error('Gallery search error:', error)
    }
  }
  
  // 🔧 FIX: Unified gallery results rendering with consistent pagination
  renderGalleryResults(items, pagination = null) {
    console.log('🔍 renderGalleryResults called with', items.length, 'items and pagination:', pagination)
    
    const grid = document.getElementById('galleryGrid')
    if (!grid) {
      console.error('🔍 Gallery grid not found')
      return
    }
    
    // Render gallery items
    grid.innerHTML = items.map((item, idx) => {
      if (item.media_type === 'video') {
        const prompt = item.video_prompt || item.prompt || 'Video'
        const thumbnailUrl = item.thumbnail_url || item.image_url || '/static/video-placeholder.png'
        
        return `
          <div class="group relative bg-gray-800 rounded-lg overflow-hidden animate-fadeIn" 
               style="animation-delay: ${Math.min(idx * 0.05, 1)}s">
            
            <!-- Video Thumbnail with Play Icon -->
            <div class="relative cursor-pointer" onclick="window.app.showGalleryVideo('${item.video_url}', \`${prompt.replace(/`/g, '\\`')}\`)">
              <img src="${thumbnailUrl}" 
                   alt="${prompt?.substring(0, 50)}..."
                   class="w-full h-48 object-cover">
              
              <!-- Video Play Icon Overlay -->
              <div class="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
                <div class="bg-white bg-opacity-90 rounded-full p-3 hover:bg-opacity-100 transition-all">
                  <i class="fas fa-play text-black text-xl ml-1"></i>
                </div>
              </div>
              
              <!-- Video Badge -->
              <div class="absolute top-2 left-2">
                <span class="text-xs px-2 py-1 bg-red-600 bg-opacity-90 text-white rounded">
                  <i class="fas fa-video mr-1"></i>VIDEO
                </span>
              </div>
            </div>
            
            <!-- Action Buttons -->
            <div class="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onclick="app.favoriteItem(${item.id}, 'video'); event.stopPropagation();" 
                      class="p-2 bg-gray-900 bg-opacity-75 rounded-lg hover:bg-opacity-100">
                <i class="fas fa-heart text-red-400"></i>
              </button>
              <button onclick="app.downloadItem('${item.video_url}', '${item.id}', 'video'); event.stopPropagation();" 
                      class="p-2 bg-gray-900 bg-opacity-75 rounded-lg hover:bg-opacity-100">
                <i class="fas fa-download text-blue-400"></i>
              </button>
              <button onclick="window.app.deleteGalleryImage(${item.id}); event.stopPropagation();" 
                      class="p-2 bg-red-600 bg-opacity-75 rounded-lg hover:bg-red-700 hover:bg-opacity-100"
                      title="Delete video">
                <i class="fas fa-trash text-white"></i>
              </button>
            </div>
            
            <div class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div class="absolute bottom-0 left-0 right-0 p-3">
                <p class="text-xs text-gray-300 line-clamp-2">${prompt?.substring(0, 100)}...</p>
                <div class="flex gap-1 mt-1">
                  <span class="text-xs px-2 py-1 bg-red-600 bg-opacity-50 rounded">${item.model || 'Video'}</span>
                  <span class="text-xs px-2 py-1 bg-purple-600 bg-opacity-50 rounded">${item.theme_name || 'Unknown'}</span>
                </div>
              </div>
            </div>
          </div>
        `
      } else {
        // Image item
        return `
          <div class="group relative bg-gray-800 rounded-lg overflow-hidden animate-fadeIn" 
               style="animation-delay: ${Math.min(idx * 0.05, 1)}s">
            <img src="${item.image_url}" 
                 alt="${item.prompt?.substring(0, 50)}..."
                 class="w-full h-48 object-cover cursor-pointer"
                 onclick="window.app.showGalleryImage(${item.id}, '${item.image_url}', \`${item.prompt?.replace(/`/g, '\\`')}\`)">
            
            <!-- Action Buttons -->
            <div class="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onclick="app.favoriteItem(${item.id}, 'image'); event.stopPropagation();" 
                      class="p-2 bg-gray-900 bg-opacity-75 rounded-lg hover:bg-opacity-100">
                <i class="fas fa-heart text-red-400"></i>
              </button>
              <button onclick="app.downloadItem('${item.image_url}', '${item.id}', 'image'); event.stopPropagation();" 
                      class="p-2 bg-gray-900 bg-opacity-75 rounded-lg hover:bg-opacity-100">
                <i class="fas fa-download text-blue-400"></i>
              </button>
              <button onclick="window.app.deleteGalleryImage(${item.id}); event.stopPropagation();" 
                      class="p-2 bg-red-600 bg-opacity-75 rounded-lg hover:bg-red-700 hover:bg-opacity-100"
                      title="Delete image">
                <i class="fas fa-trash text-white"></i>
              </button>
            </div>
            
            <div class="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div class="absolute bottom-0 left-0 right-0 p-3">
                <p class="text-xs text-gray-300 line-clamp-2">${item.prompt?.substring(0, 100)}...</p>
                <div class="flex gap-1 mt-1">
                  <span class="text-xs px-2 py-1 bg-blue-600 bg-opacity-50 rounded">${item.model}</span>
                  <span class="text-xs px-2 py-1 bg-purple-600 bg-opacity-50 rounded">${item.theme_name}</span>
                </div>
              </div>
            </div>
          </div>
        `
      }
    }).join('')
    
    // Handle empty state
    if (items.length === 0) {
      const type = document.getElementById('galleryTypeFilter')?.value || 'all'
      const mediaType = type === 'all' ? 'items' : type === 'images' ? 'images' : 'videos'
      grid.innerHTML = `
        <div class="col-span-full text-center py-12">
          <i class="fas fa-search text-4xl text-gray-600 mb-2"></i>
          <p class="text-gray-400">No ${mediaType} found matching your search</p>
        </div>
      `
    }
    
    // 🔧 FIX: Unified pagination handling
    if (pagination) {
      const galleryContainer = grid.parentElement
      let paginationDiv = galleryContainer.querySelector('.flex.justify-center.gap-2')
      
      // Remove existing pagination
      if (paginationDiv) {
        paginationDiv.remove()
      }
      
      // Create new pagination if needed
      if (pagination.pages > 1) {
        paginationDiv = document.createElement('div')
        paginationDiv.className = 'flex justify-center gap-2 mt-8'
        
        paginationDiv.innerHTML = `
          ${pagination.page > 1 ? `
            <button id="prev-page-btn" data-page="${pagination.page - 1}" 
                    class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg">
              <i class="fas fa-chevron-left"></i>
            </button>
          ` : ''}
          
          <span class="px-4 py-2 bg-gray-800 rounded-lg">
            Page ${pagination.page} of ${pagination.pages}
          </span>
          
          ${pagination.page < pagination.pages ? `
            <button id="next-page-btn" data-page="${pagination.page + 1}" 
                    class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg">
              <i class="fas fa-chevron-right"></i>
            </button>
          ` : ''}
        `
        
        galleryContainer.appendChild(paginationDiv)
        
        // Add event listeners for pagination buttons
        const prevBtn = document.getElementById('prev-page-btn')
        const nextBtn = document.getElementById('next-page-btn')
        
        if (prevBtn) {
          prevBtn.addEventListener('click', () => {
            const targetPage = parseInt(prevBtn.getAttribute('data-page'))
            console.log(`🔍 Prev button clicked, going to page ${targetPage}`)
            this.loadGalleryPage(targetPage)
          })
        }
        
        if (nextBtn) {
          nextBtn.addEventListener('click', () => {
            const targetPage = parseInt(nextBtn.getAttribute('data-page'))
            console.log(`🔍 Next button clicked, going to page ${targetPage}`)
            this.loadGalleryPage(targetPage)
          })
        }
      }
      
      console.log(`🔍 Pagination updated: ${pagination.page}/${pagination.pages}`)
    }
  }
  
  async deleteGalleryImage(itemId) {
    console.log("DEBUG - Attempting to delete gallery item ID:", itemId)
    
    if (!confirm('Are you sure you want to delete this item?')) {
      return
    }
    
    try {
      const response = await axios.delete(`/api/gallery/${itemId}`)
      
      if (response.data.success) {
        console.log("DEBUG - Successfully deleted item ID:", itemId, "Message:", response.data.message)
        
        // Remove item from the DOM immediately - look for both image and video elements
        let itemElement = document.querySelector(`[onclick*="showGalleryImage(${itemId}"]`)
        if (!itemElement) {
          // Try finding a video element that might contain this ID
          itemElement = document.querySelector(`[onclick*="${itemId}"]`)
        }
        
        if (itemElement) {
          const itemContainer = itemElement.closest('.group.relative')
          if (itemContainer) {
            itemContainer.remove()
          }
        } else {
          console.log("DEBUG - Could not find DOM element for item ID:", itemId, "- refreshing gallery")
          // If we can't find the element, refresh the gallery view
          setTimeout(() => {
            if (this.currentView === 'gallery' && !this.viewingSessionId) {
              this.searchGallery()
            }
          }, 500)
        }
        
        // Show success message
        alert(`✅ ${response.data.message}`)
      } else {
        alert('❌ Failed to delete item: ' + (response.data.message || 'Unknown error'))
      }
    } catch (error) {
      console.error('Delete item error:', error)
      alert('❌ Failed to delete item: ' + (error.response?.data?.message || error.message))
    }
  }
  
  async loadGalleryPage(page) {
    // Block loadGalleryPage if we're viewing a specific session
    if (this.viewingSessionId) {
      console.log('Blocked loadGalleryPage - currently viewing session:', this.viewingSessionId)
      return
    }
    
    console.log(`Loading gallery page: ${page}`)
    
    // Make sure we have app context
    const app = window.app || this
    
    // Check if we're in gallery view - if not, switch to gallery first
    const galleryGrid = document.getElementById('galleryGrid')
    if (!galleryGrid) {
      console.log('Gallery grid not found, switching to gallery view first...')
      await this.showGallery()
      // After showGallery completes, we'll manually load the specific page
      setTimeout(() => this.loadGalleryPage(page), 100)
      return
    }
    
    const search = document.getElementById('gallerySearch')?.value || ''
    const theme = document.getElementById('galleryThemeFilter')?.value || ''
    const model = document.getElementById('galleryModelFilter')?.value || ''
    const sort = document.getElementById('gallerySortFilter')?.value || 'newest'
    const type = document.getElementById('galleryTypeFilter')?.value || 'all'
    
    const params = new URLSearchParams({
      limit: 50,
      page: page.toString(),
      sort,
      type,
      ...(search && { search }),
      ...(theme && { theme }),
      ...(model && { model })
    })
    
    console.log(`Gallery API call: /api/gallery/search?${params}`)
    
    try {
      const response = await axios.get(`/api/gallery/search?${params}`)
      const items = this.sanitizeArray(response.data.items || [])
      const pagination = response.data.pagination || {}
      
      console.log(`Loaded ${items.length} items, page ${pagination.page} of ${pagination.pages}`)
      
      // Scroll to top of gallery
      const gallerySection = document.getElementById('galleryGrid')
      if (gallerySection) {
        gallerySection.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      
      // 🔧 FIX: Use unified rendering with consistent pagination handling
      console.log('🔍 loadGalleryPage using unified renderer for', items.length, 'items')
      this.renderGalleryResults(items, pagination)
    } catch (error) {
      console.error('Gallery pagination error:', error)
    }
  }
  
  // Real-time video status updater for UI
  updateVideoStatus(statusData) {
    const statusText = document.getElementById('videoStatusText')
    const progressText = document.getElementById('videoProgressText') 
    const queueText = document.getElementById('videoQueueText')
    const pollText = document.getElementById('videoPollText')
    const logsContainer = document.getElementById('videoLogs')
    
    // Update status
    if (statusText && statusData.status) {
      statusText.textContent = statusData.status
      statusText.className = statusData.status === 'COMPLETED' ? 'text-green-400' :
                             statusData.status === 'FAILED' ? 'text-red-400' :
                             statusData.status === 'IN_PROGRESS' ? 'text-yellow-400' : 'text-blue-400'
    }
    
    // Update progress
    if (progressText && statusData.progress !== undefined) {
      progressText.textContent = `${statusData.progress}%`
      progressText.className = 'text-green-400'
    } else if (progressText && statusData.status) {
      progressText.textContent = statusData.status === 'IN_PROGRESS' ? 'Processing...' : 
                                statusData.status === 'COMPLETED' ? '100%' : 'Waiting...'
    }
    
    // Update queue position
    if (queueText && statusData.queue_position !== undefined) {
      queueText.textContent = `Position ${statusData.queue_position}`
      queueText.className = statusData.queue_position === 0 ? 'text-green-400' : 'text-orange-400'
    } else if (queueText) {
      queueText.textContent = statusData.status === 'IN_PROGRESS' ? 'Processing' : 'Unknown'
    }
    
    // Update poll count
    if (pollText && statusData.attempt && statusData.maxAttempts) {
      pollText.textContent = `${statusData.attempt}/${statusData.maxAttempts}`
    }
    
    // Update logs
    if (logsContainer && statusData.logs && statusData.logs.length > 0) {
      const newLogs = statusData.logs.map(log => `<div>• ${log.message || log}</div>`).join('')
      logsContainer.innerHTML = newLogs
    } else if (logsContainer && statusData.statusMessage) {
      const currentTime = new Date().toLocaleTimeString()
      logsContainer.innerHTML += `<div>• [${currentTime}] ${statusData.statusMessage}</div>`
      logsContainer.scrollTop = logsContainer.scrollHeight
    }
  }
  
  showGalleryImage(id, url, prompt) {
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4'
    modal.onclick = (e) => { if (e.target === modal) modal.remove() }
    modal.innerHTML = `
      <div class="max-w-4xl w-full bg-gray-800 rounded-lg overflow-hidden">
        <img src="${url}" alt="Gallery Image" class="w-full h-auto">
        <div class="p-4">
          <p class="text-sm text-gray-300 mb-3">${prompt}</p>
          <div class="flex gap-3">
            <button onclick="app.downloadImage('${url}', '${id}')" 
                    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg">
              <i class="fas fa-download mr-2"></i>Download
            </button>
            <button onclick="app.generateVideoFromImage('${url}', '${id}')" 
                    class="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg">
              <i class="fas fa-video mr-2"></i>Generate Video
            </button>
            <button onclick="this.closest('.fixed').remove()" 
                    class="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg">
              Close
            </button>
          </div>
        </div>
      </div>
    `
    document.body.appendChild(modal)
  }
  
  showGalleryVideo(videoUrl, prompt) {
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4'
    modal.onclick = (e) => { if (e.target === modal) modal.remove() }
    modal.innerHTML = `
      <div class="max-w-4xl w-full bg-gray-800 rounded-lg overflow-hidden">
        <video controls autoplay class="w-full h-auto max-h-96" style="background: #000;">
          <source src="${videoUrl}" type="video/mp4">
          Your browser does not support the video tag.
        </video>
        <div class="p-4">
          <p class="text-sm text-gray-300 mb-3">${prompt}</p>
          <div class="flex gap-3">
            <button onclick="app.downloadVideo('${videoUrl}')" 
                    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg">
              <i class="fas fa-download mr-2"></i>Download Video
            </button>
            <button onclick="window.open('${videoUrl}', '_blank')" 
                    class="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg">
              <i class="fas fa-external-link-alt mr-2"></i>Open in New Tab
            </button>
            <button onclick="this.closest('.fixed').remove()" 
                    class="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg">
              Close
            </button>
          </div>
        </div>
      </div>
    `
    document.body.appendChild(modal)
  }
  
  downloadVideo(url) {
    const a = document.createElement('a')
    a.href = url
    a.download = `gallery_video_${Date.now()}.mp4`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
  
  downloadImage(url, filename) {
    const a = document.createElement('a')
    a.href = url
    a.download = `gallery_${filename}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
  
  // Favorite/unfavorite an item (image or video)
  async favoriteItem(id, type) {
    try {
      console.log(`Favoriting ${type} with id: ${id}`)
      // For now, just show a notification - you can implement actual favoriting later
      this.showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} added to favorites!`, 'success')
    } catch (error) {
      console.error('Favorite error:', error)
      this.showNotification('Failed to favorite item', 'error')
    }
  }
  
  // Download any media item (image or video)
  async downloadItem(url, id, type) {
    try {
      const a = document.createElement('a')
      a.href = url
      a.download = `gallery_${type}_${id}.${type === 'video' ? 'mp4' : 'png'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      this.showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} download started`, 'success')
    } catch (error) {
      console.error('Download error:', error)
      this.showNotification('Failed to download item', 'error')
    }
  }
  
  async generateVideosFromProduction(images) {
    // Always use the same settings as requested
    const duration = '5'
    const resolution = '720p'
    
    // Create progress modal
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4'
    modal.innerHTML = `
      <div class="bg-gray-800 rounded-lg max-w-2xl w-full p-6">
        <h2 class="text-2xl font-bold mb-4">
          <i class="fas fa-video mr-2 text-purple-500"></i>
          Generating Videos with Pixverse
        </h2>
        
        <div class="mb-4">
          <div class="flex justify-between text-sm mb-2">
            <span>Progress</span>
            <span id="videoProgress">0 / ${images.length}</span>
          </div>
          <div class="w-full bg-gray-700 rounded-full h-4">
            <div id="videoProgressBar" class="bg-gradient-to-r from-purple-600 to-blue-600 h-4 rounded-full transition-all" style="width: 0%"></div>
          </div>
        </div>
        
        <div id="videoStatus" class="text-center py-4">
          <div class="text-yellow-400">
            <i class="fas fa-spinner fa-spin text-3xl mb-2"></i>
            <p>Starting video generation...</p>
            <p class="text-sm text-gray-400 mt-2">This may take 3-5 minutes per video</p>
          </div>
        </div>
        
        <div id="generatedVideos" class="hidden mt-4 max-h-60 overflow-y-auto"></div>
        
        <button onclick="this.closest('.fixed').remove()" class="mt-4 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg w-full">
          Close (Generation continues in background)
        </button>
      </div>
    `
    document.body.appendChild(modal)
    
    try {
      // Get theme info - currentTheme might not be set in production view
      const themeInfo = this.currentTheme || this.allThemes?.[0] || {}
      
      console.log('Generating batch videos with theme:', themeInfo.theme)
      
      // Generate videos in batch
      const response = await axios.post('/api/video/batch-generate', {
        images: images.map(img => ({
          id: img.id,
          url: img.image_url,
          prompt: 'subtle'  // Always use "subtle"
        })),
        settings: {
          aspect_ratio: '16:9',
          resolution: '720p',   // Always 720p
          duration: '5'         // Always 5 seconds
        },
        theme_id: themeInfo.theme_id,
        theme_name: themeInfo.theme,
        model: themeInfo.model
      })
      
      if (response.data.success) {
        document.getElementById('videoStatus').innerHTML = `
          <div class="text-green-400">
            <i class="fas fa-check-circle text-3xl mb-2"></i>
            <p class="text-xl font-bold">Videos Generated!</p>
            <p class="mt-2">${response.data.successful} successful, ${response.data.failed} failed</p>
          </div>
        `
        
        // Show generated videos
        if (response.data.videos && response.data.videos.length > 0) {
          const videosDiv = document.getElementById('generatedVideos')
          videosDiv.classList.remove('hidden')
          videosDiv.innerHTML = `
            <h3 class="font-bold mb-2">Generated Videos:</h3>
            <div class="space-y-2">
              ${response.data.videos.map(v => `
                <div class="flex items-center justify-between p-2 bg-gray-700 rounded">
                  <span class="text-sm truncate flex-1">${v.prompt?.substring(0, 50)}...</span>
                  <a href="${v.video_url}" target="_blank" class="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm">
                    <i class="fas fa-play mr-1"></i>Play
                  </a>
                </div>
              `).join('')}
            </div>
          `
        }
      }
    } catch (error) {
      console.error('Video generation error:', error)
      document.getElementById('videoStatus').innerHTML = `
        <div class="text-red-400">
          <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
          <p>Error generating videos</p>
          <p class="text-sm mt-2">${error.message}</p>
        </div>
      `
    }
  }
  
  skipVideoGeneration() {
    // Close the modal and go to dashboard
    document.querySelector('.fixed').remove()
    this.showDashboard()
  }
  
  async generateVideoFromImage(imageUrl, imageId) {
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4'
    modal.innerHTML = `
      <div class="bg-gray-800 rounded-lg max-w-md w-full p-6">
        <h3 class="text-xl font-bold mb-4">
          <i class="fas fa-video text-purple-500 mr-2"></i>
          Generate Video from Image
        </h3>
        
        <div class="mb-4">
          <label class="text-sm text-gray-400 block mb-1">Video Prompt (optional)</label>
          <textarea id="videoPrompt" 
                    placeholder="Describe the motion or action for the video..."
                    class="w-full px-3 py-2 bg-gray-700 rounded-lg h-20"></textarea>
        </div>
        
        <div class="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label class="text-sm text-gray-400 block mb-1">Duration</label>
            <select id="singleVideoDuration" class="w-full px-3 py-2 bg-gray-700 rounded">
              <option value="5">5 seconds</option>
              <option value="8">8 seconds</option>
            </select>
          </div>
          <div>
            <label class="text-sm text-gray-400 block mb-1">Resolution</label>
            <select id="singleVideoResolution" class="w-full px-3 py-2 bg-gray-700 rounded">
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </div>
        </div>
        
        <div class="flex gap-3">
          <button onclick="app.submitVideoGeneration('${imageUrl}', ${imageId})" 
                  class="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-bold">
            <i class="fas fa-magic mr-2"></i>Generate Video
          </button>
          <button onclick="this.closest('.fixed').remove()" 
                  class="px-4 py-3 bg-gray-600 hover:bg-gray-700 rounded-lg">
            Cancel
          </button>
        </div>
      </div>
    `
    document.body.appendChild(modal)
  }
  
  async submitVideoGeneration(imageUrl, imageId) {
    // Always use the same settings as requested
    const prompt = 'subtle'
    const duration = '5'
    const resolution = '720p'
    
    // Replace modal content with progress
    const modal = document.querySelector('.fixed')
    modal.querySelector('.bg-gray-800').innerHTML = `
      <div class="p-6">
        <h3 class="text-xl font-bold mb-4">
          <i class="fas fa-video text-purple-500 mr-2"></i>
          Generating Video...
        </h3>
        
        <!-- Real-time Status Display -->
        <div class="bg-gray-700 rounded-lg p-4 mb-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm text-gray-300">Status:</span>
            <span id="videoStatusText" class="text-yellow-400">Initializing...</span>
          </div>
          
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm text-gray-300">Progress:</span>
            <span id="videoProgressText" class="text-blue-400">Waiting...</span>
          </div>
          
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm text-gray-300">Queue:</span>
            <span id="videoQueueText" class="text-purple-400">Checking...</span>
          </div>
          
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-300">Poll:</span>
            <span id="videoPollText" class="text-gray-400">0/60</span>
          </div>
        </div>
        
        <!-- Status Logs -->
        <div class="bg-gray-900 rounded-lg p-3 mb-4 max-h-32 overflow-y-auto">
          <div class="text-xs text-gray-400 mb-2">📋 Generation Logs:</div>
          <div id="videoLogs" class="text-xs text-gray-300 space-y-1">
            <div>• Starting video generation...</div>
          </div>
        </div>
        
        <div class="text-center py-4">
          <i class="fas fa-spinner fa-spin text-4xl text-purple-400 mb-4"></i>
          <p class="text-gray-300">Processing with Pixverse V5</p>
          <p class="text-sm text-gray-400 mt-2">This may take up to 5 minutes...</p>
        </div>
      </div>
    `
    
    try {
      // Get theme info if available
      const themeInfo = this.currentTheme || this.allThemes?.[0] || {}
      
      // Start status simulation while generating
      let pollCount = 0
      const statusSimulation = setInterval(() => {
        pollCount++
        
        // Simulate status updates
        const statusUpdates = [
          { status: 'QUEUED', statusMessage: 'Request submitted to Pixverse V5', attempt: pollCount, maxAttempts: 60 },
          { status: 'IN_PROGRESS', statusMessage: 'Video generation started', attempt: pollCount, maxAttempts: 60, queue_position: 0 },
          { status: 'IN_PROGRESS', statusMessage: 'Processing image input', attempt: pollCount, maxAttempts: 60, progress: 15 },
          { status: 'IN_PROGRESS', statusMessage: 'Generating video frames', attempt: pollCount, maxAttempts: 60, progress: 35 },
          { status: 'IN_PROGRESS', statusMessage: 'Rendering video sequence', attempt: pollCount, maxAttempts: 60, progress: 60 },
          { status: 'IN_PROGRESS', statusMessage: 'Finalizing video output', attempt: pollCount, maxAttempts: 60, progress: 85 }
        ]
        
        const statusIndex = Math.min(pollCount - 1, statusUpdates.length - 1)
        this.updateVideoStatus(statusUpdates[statusIndex])
        
        // Stop simulation after 30 attempts (2.5 minutes) or when done
        if (pollCount >= 30) {
          clearInterval(statusSimulation)
        }
      }, 5000) // Update every 5 seconds
      
      const response = await axios.post('/api/video/generate', {
        image_url: imageUrl,
        prompt: 'subtle',     // Always use "subtle"
        duration: '5',        // Always 5 seconds
        resolution: '720p',   // Always 720p
        aspect_ratio: '16:9', // Always 16:9
        gallery_image_id: imageId,
        theme_id: themeInfo.theme_id,
        theme_name: themeInfo.theme,
        model: themeInfo.model
      })
      
      // Clear the simulation when done
      clearInterval(statusSimulation)
      
      if (response.data.success) {
        // Show completion status
        this.updateVideoStatus({ 
          status: 'COMPLETED', 
          statusMessage: 'Video generation completed successfully!', 
          progress: 100,
          attempt: pollCount,
          maxAttempts: 60
        })
        modal.querySelector('.bg-gray-800').innerHTML = `
          <div class="p-6">
            <h3 class="text-xl font-bold mb-4">
              <i class="fas fa-check-circle text-green-500 mr-2"></i>
              Video Generated!
            </h3>
            <video controls class="w-full rounded-lg mb-4">
              <source src="${response.data.video_url}" type="video/mp4">
            </video>
            <div class="flex gap-3">
              <a href="${response.data.video_url}" target="_blank" 
                 class="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-center">
                <i class="fas fa-external-link-alt mr-2"></i>Open Full Size
              </a>
              <button onclick="this.closest('.fixed').remove()" 
                      class="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg">
                Close
              </button>
            </div>
          </div>
        `
      }
    } catch (error) {
      // Clear the simulation when error occurs  
      clearInterval(statusSimulation)
      
      // Show error status
      this.updateVideoStatus({ 
        status: 'FAILED', 
        statusMessage: `Error: ${error.message}`, 
        attempt: pollCount,
        maxAttempts: 60
      })
      
      console.error('Video generation error:', error)
      modal.querySelector('.bg-gray-800').innerHTML = `
        <div class="p-6">
          <h3 class="text-xl font-bold mb-4 text-red-400">
            <i class="fas fa-exclamation-triangle mr-2"></i>
            Generation Failed
          </h3>
          <p class="text-gray-300 mb-4">${error.message}</p>
          <button onclick="this.closest('.fixed').remove()" 
                  class="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg">
            Close
          </button>
        </div>
      `
    }
  }
  
  showDashboard() {
    this.currentView = 'dashboard'
    this.viewingSessionId = null  // Clear session viewing flag when showing dashboard
    const app = document.getElementById('app')
    
    app.innerHTML = `
      <div class="min-h-screen bg-gray-900 text-white">
        <div class="container mx-auto p-6 max-w-7xl">
          <!-- Header -->
          <div class="mb-8">
            <h1 class="text-4xl font-bold mb-2 flex items-center justify-between">
              <span>
                <i class="fas fa-brain mr-3 text-purple-500"></i>
                Prompt Engineer
              </span>
              <div class="flex gap-3 flex-wrap">
                <button onclick="app.showThemeCreation()" class="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg text-lg font-medium transition-all">
                  <i class="fas fa-plus mr-2"></i>Create New Theme
                </button>
                <button onclick="app.showBulkUpload()" class="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg text-lg font-medium transition-all">
                  <i class="fas fa-upload mr-2"></i>Bulk Upload
                </button>
                <button onclick="app.showBulkDeploy()" class="px-6 py-3 bg-orange-600 hover:bg-orange-700 rounded-lg text-lg font-medium transition-all">
                  <i class="fas fa-rocket mr-2"></i>Bulk Deploy
                </button>
                <button onclick="app.showMidjourneyImport()" class="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg text-lg font-medium transition-all">
                  <i class="fas fa-wand-magic-sparkles mr-2"></i>Midjourney Import
                </button>
                <button onclick="app.showNanoBanana()" class="px-6 py-3 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-lg font-medium transition-all">
                  <i class="fas fa-image mr-2"></i>Nano Banana
                </button>
                <button id="galleryBtn" onclick="window.safeShowGallery()" class="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg text-lg font-medium transition-all">
                  <i class="fas fa-images mr-2"></i>Gallery
                </button>
              </div>
            </h1>
            <p class="text-gray-400">Test once, learn forever, scale intelligently</p>
          </div>

          <!-- Theme Management Section -->
          <div class="mb-8">
            <h2 class="text-2xl font-bold mb-6">
              <i class="fas fa-folder-open mr-2"></i>Theme Management
            </h2>
            
            <!-- Search and Filter Bar -->
            <div class="mb-6 space-y-4">
              <div class="flex gap-4">
                <div class="flex-1">
                  <input type="text" 
                         id="themeSearch"
                         placeholder="Search themes..."
                         oninput="app.filterThemes()"
                         class="w-full px-4 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-purple-500 transition-all">
                </div>
                <select id="themeFilter" 
                        onchange="app.filterThemes()"
                        class="px-4 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-purple-500 transition-all">
                  <option value="all">All Themes</option>
                  <option value="complete">Completed</option>
                  <option value="in-progress">In Progress</option>
                  <option value="outlier">Outliers</option>
                  <option value="can-generate">Ready for Production</option>
                </select>
              </div>
              
              <!-- Theme Dropdown Selector -->
              <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <label class="block text-sm font-medium mb-2 text-gray-400">Select Theme to View/Manage</label>
                <select id="themeSelector" 
                        onchange="app.selectTheme(this.value)"
                        class="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-purple-500 transition-all text-white">
                  <option value="">-- Select a Theme --</option>
                </select>
              </div>
            </div>
            
            <!-- Selected Theme Display -->
            <div id="selectedThemeContainer" class="hidden">
              <!-- Theme card will appear here -->
            </div>
            
            <!-- Empty State -->
            <div id="emptyState" class="hidden">
              <div class="bg-gray-800 rounded-lg p-8 text-center animate-fadeIn">
                <i class="fas fa-inbox text-5xl mb-4 text-gray-600"></i>
                <p class="text-xl text-gray-400">No themes created yet</p>
                <p class="text-gray-500 mt-2">Click "Create New Theme" to get started</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
    
    // Gallery button now uses onclick attribute for consistency
    
    this.loadThemes()
  }

  async loadThemes() {
    try {
      const response = await axios.get('/api/themes')
      this.allThemes = response.data.themes || []
      
      if (this.allThemes.length === 0) {
        document.getElementById('emptyState').classList.remove('hidden')
        document.getElementById('selectedThemeContainer').classList.add('hidden')
        return
      }
      
      document.getElementById('emptyState').classList.add('hidden')
      this.populateThemeSelector()
    } catch (error) {
      console.error('Error loading themes:', error)
    }
  }
  
  populateThemeSelector() {
    const selector = document.getElementById('themeSelector')
    const themes = this.getFilteredThemes()
    
    selector.innerHTML = '<option value="">-- Select a Theme --</option>' +
      themes.map(theme => {
        const passRate = theme.pass_rate || 0
        const status = theme.total_tested === theme.total_elements ? 'Complete' : 
                      theme.total_tested > 0 ? 'In Progress' : 'New'
        const isOutlier = theme.testing_strategy === 'outlier_exploration' ? ' (Outlier)' : ''
        return `<option value="${theme.theme_id}">${theme.theme} - ${theme.model} (${passRate}% pass) - ${status}${isOutlier}</option>`
      }).join('')
  }
  
  getFilteredThemes() {
    const searchTerm = document.getElementById('themeSearch')?.value?.toLowerCase() || ''
    const filterType = document.getElementById('themeFilter')?.value || 'all'
    
    return this.allThemes.filter(theme => {
      // Search filter
      if (searchTerm && !theme.theme.toLowerCase().includes(searchTerm) && 
          !theme.model.toLowerCase().includes(searchTerm)) {
        return false
      }
      
      // Type filter
      if (filterType === 'complete' && theme.total_tested !== theme.total_elements) return false
      if (filterType === 'in-progress' && (theme.total_tested === 0 || theme.total_tested === theme.total_elements)) return false
      if (filterType === 'outlier' && theme.testing_strategy !== 'outlier_exploration') return false
      if (filterType === 'can-generate' && !theme.can_generate) return false
      
      return true
    })
  }
  
  filterThemes() {
    this.populateThemeSelector()
  }
  
  selectTheme(themeId) {
    if (!themeId) {
      document.getElementById('selectedThemeContainer').classList.add('hidden')
      return
    }
    
    const theme = this.allThemes.find(t => t.theme_id === themeId)
    if (!theme) return
    
    this.displaySelectedTheme(theme)
  }
  
  displaySelectedTheme(theme) {
    const container = document.getElementById('selectedThemeContainer')
    container.classList.remove('hidden')
    
    const progress = theme.total_elements > 0 
      ? Math.round((theme.total_tested / theme.total_elements) * 100)
      : 0
    
    const scalingPool = Math.pow(theme.approved_count || 0, 2) * 100

    container.innerHTML = `
          <div class="bg-gray-800 rounded-lg p-6 border border-gray-700 transition-all animate-fadeIn">
            <div class="flex justify-between items-start mb-4">
              <div class="flex-1">
                <h3 class="text-xl font-bold">${theme.theme} + ${theme.model} ${theme.style || ''}</h3>
                <p class="text-gray-400 text-sm mt-1">${theme.description || 'No description'}</p>
                ${theme.testing_strategy === 'outlier_exploration' ? 
                  '<span class="inline-block mt-2 px-2 py-1 bg-purple-600 rounded text-xs">🚀 Outlier Test</span>' : ''}
              </div>
              <div class="flex items-start gap-2">
                ${theme.can_generate 
                  ? '<span class="px-3 py-1 bg-green-600 rounded-full text-sm animate-pulse">Ready</span>'
                  : theme.total_tested > 0 
                    ? '<span class="px-3 py-1 bg-yellow-600 rounded-full text-sm">Testing</span>'
                    : '<span class="px-3 py-1 bg-gray-600 rounded-full text-sm">New</span>'
                }
                <button onclick="console.log('Delete clicked for:', '${theme.theme_id}'); if(window.app && window.app.deleteTheme) { window.app.deleteTheme('${theme.theme_id}'); } else { alert('Delete function not available. Please refresh the page.'); }" 
                        class="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm transition-all"
                        title="Delete Theme">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </div>
            
            <div class="grid grid-cols-4 gap-4 mb-4">
              <div>
                <p class="text-gray-400 text-sm">Progress</p>
                <p class="text-2xl font-bold">${progress}%</p>
                <p class="text-xs text-gray-500">(${theme.total_tested}/${theme.total_elements} tested)</p>
              </div>
              <div>
                <p class="text-gray-400 text-sm">✅ Approved</p>
                <p class="text-2xl font-bold text-green-500">${theme.approved_count || 0}</p>
              </div>
              <div>
                <p class="text-gray-400 text-sm">❌ Failed</p>
                <p class="text-2xl font-bold text-red-500">${theme.failed_count || 0}</p>
              </div>
              <div>
                <p class="text-gray-400 text-sm">Scaling Pool</p>
                <p class="text-2xl font-bold text-purple-500">~${scalingPool.toLocaleString()}</p>
                <p class="text-xs text-gray-500">variations</p>
              </div>
            </div>
            
            <div class="w-full bg-gray-700 rounded-full h-2 mb-4">
              <div class="bg-gradient-to-r from-purple-600 to-blue-600 h-2 rounded-full transition-all duration-500"
                   style="width: ${progress}%"></div>
            </div>
            
            <div class="text-sm text-gray-400 mb-4">
              <i class="fas fa-clock mr-1"></i>
              Last Updated: ${theme.last_tested ? new Date(theme.last_tested).toLocaleDateString() : 'Never'}
            </div>
            
            <div class="flex gap-2 flex-wrap">
              <button onclick="app.loadTheme('${theme.theme_id}')" 
                      class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium transition-all">
                <i class="fas fa-vials mr-2"></i>${theme.total_tested > 0 ? 'Continue Testing' : 'Start Testing'}
              </button>
              
              <button onclick="app.showScalingMode('${theme.theme_id}')"
                      class="px-4 py-2 ${theme.approved_count >= 5 
                        ? 'bg-purple-600 hover:bg-purple-700' 
                        : theme.approved_count > 0 
                          ? 'bg-purple-600 hover:bg-purple-700 opacity-80'
                          : 'bg-gray-600 hover:bg-gray-700'
                      } rounded font-medium transition-all"
                      title="${theme.approved_count < 5 
                        ? theme.approved_count === 0 
                          ? 'No tested prompts yet - will use free-form generation'
                          : `Only ${theme.approved_count} approved - results may be limited`
                        : 'Ready for full production'
                      }">
                <i class="fas fa-rocket mr-2"></i>
                ${theme.approved_count >= 5 ? 'Production Ready' : 
                  theme.approved_count > 0 ? `Production (${theme.approved_count} approved)` : 
                  'Free-form Production'}
              </button>
              
              <button onclick="app.viewHistory('${theme.theme_id}')"
                      class="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded font-medium transition-all">
                <i class="fas fa-history mr-2"></i>History
              </button>
            </div>
          </div>
        `
  }

  // ==================== THEME CREATION ====================
  showThemeCreation() {
    this.currentView = 'creation'
    const app = document.getElementById('app')
    
    app.innerHTML = `
      <div class="min-h-screen bg-gray-900 text-white">
        <div class="container mx-auto p-6 max-w-4xl">
          <!-- Back button -->
          <button onclick="app.showDashboard()" class="mb-6 text-gray-400 hover:text-white transition-all">
            <i class="fas fa-arrow-left mr-2"></i>Back to Dashboard
          </button>

          <!-- Theme Creation Form -->
          <div class="bg-gray-800 rounded-lg p-8 border border-gray-700 animate-fadeIn">
            <h2 class="text-3xl font-bold mb-6">
              <i class="fas fa-plus-circle mr-3 text-purple-500"></i>
              Create New Theme
            </h2>
            
            <div class="space-y-6">
              <!-- Model Selection -->
              <div>
                <label class="block text-sm font-medium mb-2">Model</label>
                <select id="modelSelect" onchange="app.updateStyleOptions()" 
                        class="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-purple-500 transition-all">
                  <option value="">Select a model...</option>
                  ${this.models.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
                </select>
              </div>

              <!-- Style / Master Prompt -->
              <div>
                <label class="block text-sm font-medium mb-2">Style / Master Prompt</label>
                <select id="styleSelect" onchange="app.showMasterPromptPreview()"
                        class="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-purple-500 transition-all">
                  <option value="">Select model first...</option>
                </select>
                <button onclick="app.showAddStyleModal()" class="mt-2 text-sm text-purple-400 hover:text-purple-300 transition-all">
                  <i class="fas fa-plus mr-1"></i>Add Custom Style
                </button>
                
                <!-- Master Prompt Preview -->
                <div id="masterPromptPreview" class="hidden mt-3 p-3 bg-gray-900 rounded border border-gray-700">
                  <p class="text-xs text-gray-400 mb-1">Master Prompt Template:</p>
                  <code class="text-sm text-green-400"></code>
                </div>
              </div>

              <!-- Theme Name -->
              <div>
                <label class="block text-sm font-medium mb-2">Theme Name</label>
                <input type="text" id="themeName" placeholder="Example: SpongeBob World"
                       class="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-purple-500 transition-all">
                <p class="text-xs text-gray-500 mt-1">This will be the main subject of your testing</p>
              </div>

              <!-- Testing Mode Toggle -->
              <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Testing Mode</label>
                <div class="grid grid-cols-2 gap-2">
                  <button id="boundaryModeBtn" onclick="app.setTestingMode('boundary')" 
                          class="px-3 py-3 bg-blue-600 text-white rounded-lg transition-all">
                    <i class="fas fa-map-marked-alt mr-1"></i>
                    <span class="font-semibold text-sm">Boundary Mapping</span>
                    <p class="text-xs mt-1 opacity-80">Discover boundaries</p>
                  </button>
                  <button id="outlierModeBtn" onclick="app.setTestingMode('outlier')" 
                          class="px-3 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 transition-all">
                    <i class="fas fa-rocket mr-1"></i>
                    <span class="font-semibold text-sm">Outlier Mode</span>
                    <p class="text-xs mt-1 opacity-80">Unusual crossovers</p>
                  </button>
                  <button id="expansionModeBtn" onclick="app.setTestingMode('expansion')" 
                          class="px-3 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 transition-all">
                    <i class="fas fa-expand-arrows-alt mr-1"></i>
                    <span class="font-semibold text-sm">Progressive Expansion</span>
                    <p class="text-xs mt-1 opacity-80">5 rounds: safe → wild</p>
                  </button>
                  <button id="convergenceModeBtn" onclick="app.setTestingMode('convergence')" 
                          class="px-3 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 transition-all">
                    <i class="fas fa-compress-arrows-alt mr-1"></i>
                    <span class="font-semibold text-sm">AI Convergence</span>
                    <p class="text-xs mt-1 opacity-80">Learn from approvals</p>
                  </button>
                </div>
                <p id="modeHelp" class="text-xs mt-2 text-blue-400">
                  <i class="fas fa-info-circle mr-1"></i>
                  Boundary Mapping: Tests what naturally works within the theme's conceptual space
                </p>
              </div>

              <!-- Theme Description -->
              <div>
                <label class="block text-sm font-medium mb-2">
                  Theme Description (Optional)
                </label>
                <textarea id="themeDescription" rows="3" 
                          placeholder="Add any notes, context, or specific things you want to test. For outliers, describe the unusual combination (e.g., 'SpongeBob in New York' or 'Patrick as a CEO')"
                          class="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-purple-500 transition-all"></textarea>
              </div>



              <!-- Submit Button -->
              <button onclick="app.createTheme()" 
                      class="w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-lg font-bold text-lg transition-all transform hover:scale-105">
                <i class="fas fa-rocket mr-2"></i>Start Stress Test
              </button>
            </div>
          </div>

          <!-- Info Box -->
          <div class="mt-6 bg-blue-900 bg-opacity-20 border border-blue-700 rounded-lg p-4 animate-fadeIn">
            <p class="text-sm text-blue-300">
              <i class="fas fa-info-circle mr-2"></i>
              When you start, the system will create a queue of untested elements and begin progressive testing.
            </p>
          </div>
        </div>
      </div>

      <!-- Add Style Modal (hidden by default) -->
      <div id="addStyleModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4 animate-scaleIn">
          <h3 class="text-xl font-bold mb-4">Add Custom Style</h3>
          <input type="text" id="newStyleName" placeholder="Style name" 
                 class="w-full px-4 py-2 bg-gray-700 rounded mb-3">
          <textarea id="newStylePrompt" placeholder="Master prompt template (use [subject], [action], [location])"
                    class="w-full px-4 py-2 bg-gray-700 rounded mb-3" rows="3"></textarea>
          <div class="flex gap-2">
            <button onclick="app.addCustomStyle()" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded transition-all">Add Style</button>
            <button onclick="app.hideAddStyleModal()" class="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded transition-all">Cancel</button>
          </div>
        </div>
      </div>
    `
  }

  updateStyleOptions() {
    const modelSelect = document.getElementById('modelSelect')
    const styleSelect = document.getElementById('styleSelect')
    const selectedModel = modelSelect.value
    
    if (!selectedModel) {
      styleSelect.innerHTML = '<option value="">Select model first...</option>'
      document.getElementById('masterPromptPreview').classList.add('hidden')
      return
    }
    
    const modelStyles = this.styles.filter(s => s.model === selectedModel)
    styleSelect.innerHTML = `
      <option value="">Select a style...</option>
      ${modelStyles.map(s => `<option value="${s.id}" data-prompt="${s.master_prompt}">${s.name}</option>`).join('')}
    `
  }

  showMasterPromptPreview() {
    const styleSelect = document.getElementById('styleSelect')
    const preview = document.getElementById('masterPromptPreview')
    const selectedOption = styleSelect.options[styleSelect.selectedIndex]
    
    if (selectedOption && selectedOption.dataset.prompt) {
      preview.classList.remove('hidden')
      preview.querySelector('code').textContent = selectedOption.dataset.prompt
    } else {
      preview.classList.add('hidden')
    }
  }

  showAddStyleModal() {
    document.getElementById('addStyleModal').classList.remove('hidden')
  }

  hideAddStyleModal() {
    document.getElementById('addStyleModal').classList.add('hidden')
  }

  async addCustomStyle() {
    const model = document.getElementById('modelSelect').value
    const name = document.getElementById('newStyleName').value
    const prompt = document.getElementById('newStylePrompt').value
    
    if (!model || !name || !prompt) {
      alert('Please fill all fields')
      return
    }
    
    this.showLoading('Adding custom style...')
    
    try {
      await axios.post('/api/styles', {
        name,
        model,
        masterPrompt: prompt,
        isCustom: true
      })
      
      await this.loadStyles()
      this.updateStyleOptions()
      this.hideAddStyleModal()
    } catch (error) {
      console.error('Error adding style:', error)
      alert('Error adding custom style')
    } finally {
      this.hideLoading()
    }
  }

  setTestingMode(mode) {
    this.selectedTestingMode = mode
    
    const boundaryBtn = document.getElementById('boundaryModeBtn')
    const outlierBtn = document.getElementById('outlierModeBtn')
    const expansionBtn = document.getElementById('expansionModeBtn')
    const convergenceBtn = document.getElementById('convergenceModeBtn')
    const modeHelp = document.getElementById('modeHelp')
    
    // Reset all buttons
    const inactiveClass = 'px-3 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 transition-all opacity-60'
    const activeClass = 'px-3 py-3 text-white rounded-lg transition-all ring-2'
    
    boundaryBtn.className = inactiveClass
    outlierBtn.className = inactiveClass
    expansionBtn.className = inactiveClass
    convergenceBtn.className = inactiveClass
    
    // Activate selected mode
    switch(mode) {
      case 'outlier':
        outlierBtn.className = activeClass + ' bg-purple-600 ring-purple-400'
        modeHelp.innerHTML = '<i class="fas fa-rocket mr-1"></i>Outlier Mode: Tests unusual combinations, crossovers, and pushes boundaries'
        modeHelp.className = 'text-xs mt-2 text-purple-400'
        break
      
      case 'expansion':
        expansionBtn.className = activeClass + ' bg-orange-600 ring-orange-400'
        modeHelp.innerHTML = '<i class="fas fa-expand-arrows-alt mr-1"></i>Progressive Expansion: 5 rounds starting safe, gradually pushing limits wider each round'
        modeHelp.className = 'text-xs mt-2 text-orange-400'
        break
      
      case 'convergence':
        convergenceBtn.className = activeClass + ' bg-green-600 ring-green-400'
        modeHelp.innerHTML = '<i class="fas fa-compress-arrows-alt mr-1"></i>AI Convergence: AI analyzes your approvals in real-time to get closer to your perfect sweet spot'
        modeHelp.className = 'text-xs mt-2 text-green-400'
        break
      
      case 'boundary':
      default:
        boundaryBtn.className = activeClass + ' bg-blue-600 ring-blue-400'
        modeHelp.innerHTML = '<i class="fas fa-info-circle mr-1"></i>Boundary Mapping: Tests what naturally works within the theme\'s conceptual space'
        modeHelp.className = 'text-xs mt-2 text-blue-400'
        break
    }
  }
  
  async createTheme() {
    const model = document.getElementById('modelSelect').value
    const styleId = document.getElementById('styleSelect').value
    const themeName = document.getElementById('themeName').value
    let description = document.getElementById('themeDescription').value
    
    // Add testing mode indicator to description
    let testingStrategy = 'boundary_mapping'
    if (this.selectedTestingMode === 'outlier') {
      description = `[OUTLIER TEST] ${description || 'Testing unusual combinations and crossovers'}`
      testingStrategy = 'outlier_exploration'
    } else if (this.selectedTestingMode === 'expansion') {
      description = `[PROGRESSIVE EXPANSION] ${description || 'Progressive boundary expansion over 5 rounds'}`
      testingStrategy = 'progressive_expansion'
    } else if (this.selectedTestingMode === 'convergence') {
      description = `[AI CONVERGENCE] ${description || 'AI learns from approvals to converge on sweet spot'}`
      testingStrategy = 'ai_convergence'
    }
    
    if (!model || !styleId || !themeName) {
      alert('Please fill all required fields')
      return
    }
    
    // Elements will be generated by OpenAI
    const elements = []
    
    this.showLoading('Creating theme and preparing test elements...')
    
    try {
      const style = this.styles.find(s => s.id == styleId)
      const response = await axios.post('/api/themes', {
        theme: themeName,
        model,
        style: style.name,
        styleId,
        masterPrompt: style.master_prompt,
        description,
        elements,
        testingStrategy
      })
      
      if (response.data.success) {
        await this.loadTheme(response.data.themeId)
      }
    } catch (error) {
      console.error('Error creating theme:', error)
      alert('Error creating theme')
      this.hideLoading()
    }
  }

  // ==================== STRESS TEST ROUNDS ====================
  async loadTheme(themeId) {
    this.showLoading('Loading theme and preparing test batch...')
    
    try {
      const response = await axios.get(`/api/themes/${themeId}/next-batch`)
      if (response.data.success) {
        this.currentTheme = response.data.theme
        this.currentBatch = response.data.elements
        this.roundNumber = (response.data.theme.rounds_completed || 0) + 1
        
        this.hideLoading()
        
        if (this.currentBatch.length > 0) {
          // Generate images for the batch
          await this.generateTestImages()
          this.showStressTestRound(response.data)
        } else {
          // No more elements to test, offer production mode
          if (confirm(`No more elements to test.\n\nYou have ${response.data.stats.passed} approved prompts.\n\nDo you want to start production mode?`)) {
            this.showScalingMode(themeId, true)
          } else {
            this.showDashboard()
          }
        }
      }
    } catch (error) {
      console.error('Error loading theme:', error)
      this.hideLoading()
    }
  }

  async generateTestImages() {
    const modelName = this.currentTheme.model
    
    // First check if we have saved images for these elements
    const needsGeneration = []
    this.currentBatch.forEach(el => {
      if (el.saved_image_url) {
        // Use saved image
        this.generatedImages[el.element] = el.saved_image_url
        console.log(`Using saved image for: ${el.element}`)
      } else {
        // Need to generate
        needsGeneration.push(el)
      }
    })
    
    // If all images are saved, we're done
    if (needsGeneration.length === 0) {
      this.showNotification('Using saved test images', 'info')
      return
    }
      
    this.showLoading(`Generating ${needsGeneration.length} new test images with ${modelName}...`)
    
    try {
      const prompts = needsGeneration.map(el => el.generated_prompt)
      console.log('Generating images for prompts:', prompts)
      console.log('Using model:', this.currentTheme.model)
      
      const response = await axios.post('/api/images/generate', {
        prompts,
        model: this.currentTheme.model,
        style: this.currentTheme.style
      })
      
      console.log('Image generation response:', response.data)
      
      if (response.data.success) {
        if (response.data.using_placeholder) {
          console.warn('Using placeholder images (API keys not configured)')
          this.showNotification('Using placeholder images. Configure API keys for real generation.', 'warning')
        } else if (response.data.using_real_api) {
          console.log('Using real AI image generation!')
          this.showNotification(`Generated ${needsGeneration.length} new images with ${response.data.model_used}`, 'success')
        }
        
        // Save generated images
        const imagesToSave = []
        response.data.images.forEach((img, idx) => {
          const element = needsGeneration[idx]
          this.generatedImages[element.element] = img.image_url
          
          imagesToSave.push({
            element: element.element,
            prompt: element.generated_prompt,
            image_url: img.image_url,
            round_number: this.roundNumber
          })
        })
        
        // Save images to database for persistence
        await this.saveTestImages(imagesToSave)
      }
    } catch (error) {
      console.error('Error generating images:', error)
      this.showNotification('Error generating images, using placeholders', 'error')
      // Use placeholder images as fallback
      needsGeneration.forEach(el => {
        this.generatedImages[el.element] = `https://via.placeholder.com/512x512/1F2937/9CA3AF?text=${encodeURIComponent(el.element)}`
      })
    } finally {
      this.hideLoading()
    }
  }
  
  async saveTestImages(images) {
    try {
      await axios.post(`/api/themes/${this.currentTheme.theme_id}/save-test-images`, {
        images
      })
      console.log('Test images saved successfully')
    } catch (error) {
      console.error('Error saving test images:', error)
    }
  }
  
  async massGenerateWithProgress(prompts, model, themeId) {
    // Create progress modal
    const progressModal = document.createElement('div')
    progressModal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4'
    progressModal.innerHTML = `
      <div class="bg-gray-800 rounded-lg max-w-2xl w-full p-6">
        <h2 class="text-2xl font-bold mb-4">
          <i class="fas fa-rocket mr-2 text-purple-500"></i>
          Mass Generation in Progress
        </h2>
        
        <div class="mb-6">
          <div class="flex justify-between text-sm mb-2">
            <span>Progress</span>
            <span id="progressText">0 / ${prompts.length}</span>
          </div>
          <div class="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
            <div id="progressBar" class="bg-gradient-to-r from-purple-600 to-blue-600 h-4 rounded-full transition-all duration-500" 
                 style="width: 0%"></div>
          </div>
        </div>
        
        <div class="grid grid-cols-3 gap-4 mb-6">
          <div class="bg-gray-900 rounded-lg p-3 text-center">
            <p class="text-gray-400 text-sm">Status</p>
            <p id="statusText" class="text-xl font-bold text-green-400">Generating</p>
          </div>
          <div class="bg-gray-900 rounded-lg p-3 text-center">
            <p class="text-gray-400 text-sm">Time Elapsed</p>
            <p id="timeElapsed" class="text-xl font-bold">0:00</p>
          </div>
          <div class="bg-gray-900 rounded-lg p-3 text-center">
            <p class="text-gray-400 text-sm">Est. Remaining</p>
            <p id="timeRemaining" class="text-xl font-bold">Calculating...</p>
          </div>
        </div>
        
        <div class="mb-6">
          <h3 class="text-lg font-bold mb-2">Preview Images (First 10)</h3>
          <div id="previewGrid" class="grid grid-cols-5 gap-2">
            ${Array(10).fill(0).map((_, i) => `
              <div class="aspect-square bg-gray-700 rounded-lg overflow-hidden">
                <div id="preview-${i}" class="w-full h-full flex items-center justify-center text-gray-500">
                  <i class="fas fa-image text-2xl"></i>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        
        <div class="flex gap-3">
          <button id="pauseBtn" onclick="app.togglePauseGeneration()" 
                  class="flex-1 px-4 py-3 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-bold transition-all">
            <i class="fas fa-pause mr-2"></i>Pause
          </button>
          <button onclick="app.cancelGeneration()" 
                  class="px-4 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-bold transition-all">
            <i class="fas fa-stop mr-2"></i>Cancel
          </button>
        </div>
      </div>
    `
    document.body.appendChild(progressModal)
    
    // Start timer
    const startTime = Date.now()
    const timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      const minutes = Math.floor(elapsed / 60)
      const seconds = elapsed % 60
      document.getElementById('timeElapsed').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`
    }, 1000)
    
    let progressInterval = null
    
    try {
      // Simulate progress for better UX
      let progress = 0
      progressInterval = setInterval(() => {
        progress = Math.min(progress + 10, 90)
        document.getElementById('progressBar').style.width = `${progress}%`
        document.getElementById('progressText').textContent = `${Math.floor(prompts.length * progress / 100)} / ${prompts.length}`
      }, 500)
      
      // Call mass generation endpoint
      const response = await axios.post(`/api/themes/${themeId}/mass-generate`, {
        prompts,
        model,
        generateImages: true
      })
      
      clearInterval(progressInterval)
      
      if (response.data.success) {
        // Update progress to 100%
        document.getElementById('progressBar').style.width = '100%'
        document.getElementById('progressText').textContent = `${prompts.length} / ${prompts.length}`
        document.getElementById('statusText').textContent = 'Complete!'
        document.getElementById('statusText').className = 'text-xl font-bold text-green-400'
        
        // Update the preview grid with actual images
        let imagesShown = 0
        const previewGrid = document.getElementById('previewGrid')
        
        if (response.data.prompts && response.data.prompts.length > 0) {
          // Clear and rebuild preview grid with actual results
          previewGrid.innerHTML = response.data.prompts.slice(0, 10).map((item, idx) => `
            <div class="aspect-square bg-gray-700 rounded-lg overflow-hidden">
              ${item.image_url ? `
                <img src="${item.image_url}" 
                     class="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-all"
                     onclick="app.showEnlargedImage('Generated ${idx + 1}', '${item.image_url}')"
                     alt="Generated ${idx + 1}"
                     title="Click to enlarge">
              ` : `
                <div class="w-full h-full flex items-center justify-center text-gray-500">
                  <div class="text-center">
                    <i class="fas fa-image text-2xl mb-1"></i>
                    <p class="text-xs">${idx + 1}</p>
                  </div>
                </div>
              `}
            </div>
          `).join('')
          
          // Count how many images were actually generated
          imagesShown = response.data.prompts.slice(0, 10).filter(p => p.image_url).length
        }
        
        // If no images were generated but they were requested, show message
        if (imagesShown === 0 && response.data.generated_images) {
          const messageEl = document.createElement('div')
          messageEl.className = 'mt-2 text-center text-yellow-400 text-sm'
          messageEl.innerHTML = '<i class="fas fa-info-circle mr-1"></i>Images will appear when FAL API is configured'
          previewGrid.parentElement.appendChild(messageEl)
        }
        
        // DON'T close the modal - show results right here!
        clearInterval(timerInterval)
        this.hideLoading()
        
        // Transform the modal to show results
        const modalContent = progressModal.querySelector('.bg-gray-800')
        
        // Add a results section
        const resultsHTML = `
          <div class="mt-6 border-t border-gray-700 pt-6">
            <h3 class="text-lg font-bold mb-4">
              <i class="fas fa-check-circle text-green-500 mr-2"></i>
              Generation Complete! ${response.data.prompts.length} items generated
            </h3>
            
            <!-- Video Generation Options -->
            <div class="mb-4 p-4 bg-purple-900 bg-opacity-20 rounded-lg border border-purple-700">
              <h4 class="font-bold mb-3">
                <i class="fas fa-video text-purple-400 mr-2"></i>
                Generate Videos from Images
              </h4>
              <div class="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <label class="text-sm text-gray-400 block mb-1">Duration</label>
                  <select id="videoDuration" class="w-full px-3 py-2 bg-gray-700 rounded">
                    <option value="5">5 seconds</option>
                    <option value="8">8 seconds (2x cost)</option>
                  </select>
                </div>
                <div>
                  <label class="text-sm text-gray-400 block mb-1">Resolution</label>
                  <select id="videoResolution" class="w-full px-3 py-2 bg-gray-700 rounded">
                    <option value="720p">720p (Recommended)</option>
                    <option value="1080p">1080p (5s only)</option>
                    <option value="540p">540p (Faster)</option>
                  </select>
                </div>
              </div>
              <div class="flex gap-3">
                <button onclick="app.generateVideosFromProduction(${JSON.stringify(response.data.prompts.filter(p => p.image_url).slice(0, 10)).replace(/"/g, '&quot;')})" 
                        class="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-bold">
                  <i class="fas fa-magic mr-2"></i>Generate Videos (First 10)
                </button>
                <button onclick="app.skipVideoGeneration()" 
                        class="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg">
                  Skip for Now
                </button>
              </div>
              <p class="text-xs text-gray-400 mt-2">
                Videos can also be generated later from the Gallery
              </p>
            </div>
            
            <div class="mb-4">
              <p class="text-sm text-gray-400 mb-2">Generated Images (Preview):</p>
              <div class="grid grid-cols-5 gap-2 mb-4">
                ${response.data.prompts.slice(0, 10).map((item, idx) => `
                  <div class="aspect-square bg-gray-700 rounded-lg overflow-hidden">
                    ${item.image_url ? `
                      <img src="${item.image_url}" 
                           class="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-all"
                           onclick="app.showEnlargedImage('Generated ${idx + 1}', '${item.image_url}')"
                           alt="Generated ${idx + 1}"
                           title="Click to enlarge">
                    ` : `
                      <div class="w-full h-full flex items-center justify-center text-gray-500">
                        <i class="fas fa-image text-xl"></i>
                      </div>
                    `}
                  </div>
                `).join('')}
              </div>
            </div>
            
            <div class="mb-4 max-h-60 overflow-y-auto bg-gray-900 rounded-lg p-4">
              <p class="text-sm text-gray-400 mb-2">All Prompts (${response.data.prompts.length}):</p>
              <div class="space-y-2">
                ${response.data.prompts.map((item, idx) => `
                  <div class="flex items-start gap-2 text-sm">
                    <span class="text-gray-500 font-mono">${(idx + 1).toString().padStart(3, '0')}.</span>
                    <span class="text-gray-300 flex-1">${item.prompt}</span>
                    ${item.image_url ? '<i class="fas fa-image text-green-400" title="Image generated"></i>' : ''}
                  </div>
                `).join('')}
              </div>
            </div>
            
            <div class="flex gap-3">
              <button onclick="app.downloadPrompts(${JSON.stringify(response.data.prompts).replace(/"/g, '&quot;')})" 
                      class="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold transition-all">
                <i class="fas fa-download mr-2"></i>Download Prompts (CSV)
              </button>
              <button onclick="app.copyAllPrompts(${JSON.stringify(response.data.prompts.map(p => p.prompt)).replace(/"/g, '&quot;')})" 
                      class="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-bold transition-all">
                <i class="fas fa-copy mr-2"></i>Copy All Prompts
              </button>
              <button onclick="this.closest('.fixed').remove(); app.showDashboard()" 
                      class="px-4 py-3 bg-gray-600 hover:bg-gray-700 rounded-lg font-bold transition-all">
                <i class="fas fa-times mr-2"></i>Close
              </button>
            </div>
          </div>
        `
        
        // Add results to modal
        const existingResults = modalContent.querySelector('.border-t.border-gray-700')
        if (existingResults) {
          existingResults.remove()
        }
        modalContent.insertAdjacentHTML('beforeend', resultsHTML)
        
        // Update the pause/cancel buttons to just close
        const buttonContainer = modalContent.querySelector('.flex.gap-3')
        if (buttonContainer && !buttonContainer.querySelector('.border-t')) {
          buttonContainer.style.display = 'none'
        }
      } else {
        throw new Error(response.data.error || 'Generation failed')
      }
    } catch (error) {
      console.error('Mass generation error:', error)
      clearInterval(timerInterval)
      if (progressInterval) clearInterval(progressInterval)
      this.hideLoading()
      
      // Update modal to show error
      if (document.getElementById('statusText')) {
        document.getElementById('statusText').textContent = 'Error!'
        document.getElementById('statusText').className = 'text-xl font-bold text-red-400'
      }
      
      // Show error message and close after delay
      setTimeout(() => {
        progressModal.remove()
        alert('Error during generation: ' + (error.message || 'Unknown error'))
      }, 2000)
    }
  }
  
  togglePauseGeneration() {
    const btn = document.getElementById('pauseBtn')
    if (btn.innerHTML.includes('Pause')) {
      btn.innerHTML = '<i class="fas fa-play mr-2"></i>Resume'
      document.getElementById('statusText').textContent = 'Paused'
      document.getElementById('statusText').className = 'text-xl font-bold text-yellow-400'
    } else {
      btn.innerHTML = '<i class="fas fa-pause mr-2"></i>Pause'
      document.getElementById('statusText').textContent = 'Generating'
      document.getElementById('statusText').className = 'text-xl font-bold text-green-400'
    }
  }
  
  cancelGeneration() {
    if (confirm('Are you sure you want to cancel generation? Progress will be lost.')) {
      document.querySelector('.fixed').remove()
      this.showDashboard()
    }
  }
  
  downloadPrompts(prompts) {
    // Create CSV content
    let csv = 'ID,Prompt,Image URL\n'
    prompts.forEach((item, idx) => {
      const prompt = item.prompt.replace(/"/g, '""') // Escape quotes for CSV
      const imageUrl = item.image_url || 'N/A'
      csv += `${idx + 1},"${prompt}","${imageUrl}"\n`
    })
    
    // Create download link
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `prompts_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
    
    this.showNotification('Prompts downloaded as CSV!', 'success')
  }
  
  copyAllPrompts(prompts) {
    const text = prompts.join('\n\n')
    navigator.clipboard.writeText(text).then(() => {
      this.showNotification(`Copied ${prompts.length} prompts to clipboard!`, 'success')
    }).catch(err => {
      alert('Failed to copy prompts: ' + err)
    })
  }
  
  showNotification(message, type = 'info') {
    const colors = {
      success: 'bg-green-600',
      warning: 'bg-yellow-600',
      error: 'bg-red-600',
      info: 'bg-blue-600'
    }
    
    const notification = document.createElement('div')
    notification.className = `fixed top-4 right-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg animate-slideIn z-50`
    notification.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check' : type === 'warning' ? 'exclamation-triangle' : type === 'error' ? 'times-circle' : 'info-circle'} mr-2"></i>
      ${message}
    `
    document.body.appendChild(notification)
    
    setTimeout(() => notification.remove(), 4000)
  }

  showStressTestRound(data) {
    this.currentView = 'testing'
    this.testResults = this.currentBatch.map(el => ({ 
      element: el.element, 
      passed: null 
    }))
    
    const app = document.getElementById('app')
    const progress = data.stats.total > 0 
      ? Math.round((data.stats.tested / data.stats.total) * 100)
      : 0
    const passRate = data.stats.tested > 0
      ? Math.round((data.stats.passed / data.stats.tested) * 100)
      : 0

    app.innerHTML = `
      <div class="min-h-screen bg-gray-900 text-white">
        <div class="container mx-auto p-6 max-w-7xl">
          <!-- Back button -->
          <button onclick="app.showDashboard()" class="mb-6 text-gray-400 hover:text-white transition-all">
            <i class="fas fa-arrow-left mr-2"></i>Back to Dashboard
          </button>

          <!-- Theme Context Header -->
          <div class="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700 animate-fadeIn">
            <div class="flex justify-between items-center">
              <div>
                <h2 class="text-2xl font-bold">${data.theme.theme}</h2>
                <p class="text-gray-400">Model: ${data.theme.model} | Style: ${data.theme.style}</p>
              </div>
              <div class="text-right">
                <p class="text-3xl font-bold">${progress}%</p>
                <p class="text-sm text-gray-400">Complete</p>
              </div>
            </div>
            
            <div class="mt-4 pt-4 border-t border-gray-700">
              <p class="text-lg">
                <span class="text-gray-400">Progress:</span> 
                <span class="font-bold">${data.stats.tested}/${data.stats.total} Tested</span>
                <span class="mx-3 text-gray-600">|</span>
                <span class="text-gray-400">Pass Rate:</span>
                <span class="font-bold ${passRate >= 70 ? 'text-green-500' : passRate >= 50 ? 'text-yellow-500' : 'text-red-500'}">${passRate}%</span>
              </p>
            </div>
            
            <div class="mt-3 p-3 bg-gray-900 rounded">
              <p class="text-xs text-gray-400 mb-1">Master Prompt:</p>
              <code class="text-sm text-blue-400">${data.theme.master_prompt}</code>
              <p class="text-xs text-gray-400 mt-2">Image Model: <span class="text-purple-400 font-medium">${data.theme.model}</span></p>
            </div>
          </div>

          <!-- Testing Round -->
          <div class="bg-gray-800 rounded-lg p-6 border border-gray-700 animate-fadeIn">
            <h3 class="text-xl font-bold mb-4">
              <i class="fas fa-vials mr-2"></i>
              Round ${this.roundNumber} 
              <span class="text-sm font-normal text-gray-400">
                (Items ${(this.roundNumber - 1) * 5 + 1}–${(this.roundNumber - 1) * 5 + this.currentBatch.length})
              </span>
            </h3>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
              ${this.currentBatch.map((el, idx) => `
                <div class="bg-gray-700 rounded-lg overflow-hidden animate-fadeIn hover:shadow-xl transition-all flex flex-col" style="animation-delay: ${idx * 0.1}s">
                  <!-- Image Section -->
                  <div class="aspect-square bg-gray-600 overflow-hidden relative group cursor-pointer"
                       onclick="app.showEnlargedImage('${el.element.replace(/'/g, "\\'")}', '${(this.generatedImages[el.element] || 'https://via.placeholder.com/400').replace(/'/g, "\\'")}')">
                    <img src="${this.generatedImages[el.element] || 'https://via.placeholder.com/400'}" 
                         alt="${el.element}"
                         class="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
                         onerror="this.src='https://via.placeholder.com/400x400/1F2937/9CA3AF?text=Error'">
                    <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center">
                      <span class="opacity-0 group-hover:opacity-100 text-white font-medium">
                        <i class="fas fa-search-plus text-3xl"></i>
                      </span>
                    </div>
                  </div>
                  
                  <!-- Content Section -->
                  <div class="p-4 flex-1 flex flex-col">
                    <!-- Element Name -->
                    <h4 class="font-bold text-lg text-center mb-3">${el.element}</h4>
                    
                    <!-- Prompt Preview Box -->
                    <div class="bg-gray-800 rounded-lg p-3 mb-4 flex-1 cursor-pointer hover:bg-gray-750 transition-all border border-gray-600 hover:border-purple-500" 
                         onclick="app.showPromptModal('${el.element.replace(/'/g, "\\'")}')"
                         title="Click to see full prompt">
                      <div class="flex justify-between items-start mb-2">
                        <p class="text-xs font-semibold text-purple-400">GENERATED PROMPT:</p>
                        <i class="fas fa-expand-alt text-gray-500 text-xs"></i>
                      </div>
                      <p class="text-sm text-green-400 leading-relaxed line-clamp-3">${el.generated_prompt}</p>
                      <p class="text-xs text-gray-500 mt-2 text-center border-t border-gray-700 pt-2">
                        <i class="fas fa-mouse-pointer mr-1"></i>Click to read full prompt
                      </p>
                    </div>
                    
                    <!-- Action Buttons -->
                    <div class="flex gap-2 justify-center">
                      <button onclick="app.markTest(${idx}, true)" 
                              id="pass-btn-${idx}"
                              class="flex-1 px-4 py-2 rounded-lg transition-all transform hover:scale-105 font-medium ${
                                this.testResults[idx]?.passed === true 
                                  ? 'bg-green-600 scale-105 shadow-lg' 
                                  : 'bg-gray-600 hover:bg-green-600'
                              }">
                        ✅ Pass
                      </button>
                      <button onclick="app.markTest(${idx}, false)"
                              id="fail-btn-${idx}"
                              class="flex-1 px-4 py-2 rounded-lg transition-all transform hover:scale-105 font-medium ${
                                this.testResults[idx]?.passed === false 
                                  ? 'bg-red-600 scale-105 shadow-lg' 
                                  : 'bg-gray-600 hover:bg-red-600'
                              }">
                        ❌ Fail
                      </button>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
            
            <div class="flex gap-3">
              <button onclick="app.saveProgress()" 
                      id="saveProgressBtn"
                      class="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-all transform hover:scale-105">
                <i class="fas fa-save mr-2"></i>Save Progress
              </button>
              <button onclick="app.testFiveMore()" 
                      class="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-all transform hover:scale-105">
                <i class="fas fa-plus mr-2"></i>Test 5 More
              </button>
              ${data.stats.passed >= 5 ? `
                <button onclick="app.showScalingMode('${this.currentTheme.theme_id}')" 
                        class="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-all transform hover:scale-105">
                  <i class="fas fa-rocket mr-2"></i>Start Production
                </button>
              ` : ''}
            </div>
            
            <div class="mt-4 text-sm text-gray-400">
              <i class="fas fa-info-circle mr-1"></i>
              Progress is saved immediately. You can return anytime to continue from where you left off.
            </div>
          </div>
        </div>
      </div>
    `
  }

  showPromptModal(element) {
    const el = this.currentBatch.find(e => e.element === element)
    if (!el) return
    
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4'
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove()
    }
    
    modal.innerHTML = `
      <div class="bg-gray-800 rounded-lg max-w-4xl w-full animate-scaleIn max-h-[90vh] overflow-y-auto">
        <!-- Header -->
        <div class="sticky top-0 bg-gray-800 border-b border-gray-700 p-6 pb-4">
          <div class="flex justify-between items-start">
            <div>
              <h3 class="text-2xl font-bold mb-1">Prompt Analysis</h3>
              <p class="text-gray-400">Element: <span class="text-white font-medium">${element}</span></p>
            </div>
            <button onclick="this.closest('.fixed').remove()" 
                    class="text-gray-400 hover:text-white transition-all p-2">
              <i class="fas fa-times text-xl"></i>
            </button>
          </div>
        </div>
        
        <div class="p-6 pt-4">
          <!-- Master Prompt Template Section -->
          <div class="mb-6">
            <h4 class="text-sm font-semibold text-purple-400 mb-2 flex items-center">
              <i class="fas fa-code mr-2"></i>MASTER PROMPT TEMPLATE
            </h4>
            <div class="bg-gray-900 rounded-lg p-4 border border-purple-600 border-opacity-30">
              <code class="text-purple-300 text-base block">${this.currentTheme?.master_prompt || 'Not available'}</code>
            </div>
          </div>
          
          <!-- Generated Prompt Section -->
          <div class="mb-6">
            <h4 class="text-sm font-semibold text-green-400 mb-2 flex items-center">
              <i class="fas fa-magic mr-2"></i>GENERATED PROMPT
            </h4>
            <div class="bg-gray-900 rounded-lg p-4 border border-green-600 border-opacity-30">
              <code class="text-green-300 text-lg leading-relaxed block whitespace-pre-wrap break-words">${el.generated_prompt}</code>
            </div>
          </div>
          
          <!-- Prompt Breakdown -->
          <div class="mb-6">
            <h4 class="text-sm font-semibold text-blue-400 mb-2 flex items-center">
              <i class="fas fa-puzzle-piece mr-2"></i>PROMPT BREAKDOWN
            </h4>
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-gray-700 rounded-lg p-3">
                <p class="text-xs text-gray-400 mb-1">Subject (Element)</p>
                <p class="font-medium text-white">${element}</p>
              </div>
              <div class="bg-gray-700 rounded-lg p-3">
                <p class="text-xs text-gray-400 mb-1">Theme/World</p>
                <p class="font-medium text-white">${this.currentTheme?.theme || 'N/A'}</p>
              </div>
              <div class="bg-gray-700 rounded-lg p-3">
                <p class="text-xs text-gray-400 mb-1">Model</p>
                <p class="font-medium text-white">${this.currentTheme?.model || 'N/A'}</p>
              </div>
              <div class="bg-gray-700 rounded-lg p-3">
                <p class="text-xs text-gray-400 mb-1">Style</p>
                <p class="font-medium text-white">${this.currentTheme?.style || 'N/A'}</p>
              </div>
            </div>
          </div>
          
          <!-- Metadata -->
          <div class="mb-6">
            <h4 class="text-sm font-semibold text-yellow-400 mb-2 flex items-center">
              <i class="fas fa-info-circle mr-2"></i>METADATA
            </h4>
            <div class="grid grid-cols-3 gap-2 text-sm">
              <div class="bg-gray-700 rounded p-2">
                <p class="text-gray-400 text-xs">Test Type:</p>
                <p class="font-medium">${el.element_type || 'general'}</p>
              </div>
              <div class="bg-gray-700 rounded p-2">
                <p class="text-gray-400 text-xs">Test Order:</p>
                <p class="font-medium">#${el.test_order}</p>
              </div>
              <div class="bg-gray-700 rounded p-2">
                <p class="text-gray-400 text-xs">Round:</p>
                <p class="font-medium">${this.roundNumber}</p>
              </div>
            </div>
            ${el.vibe_tested ? `
            <div class="mt-2 bg-purple-900 bg-opacity-30 rounded p-2">
              <p class="text-purple-400 text-xs">Vibe/Pattern Testing:</p>
              <p class="text-white text-sm">${el.vibe_tested}</p>
            </div>
            ` : ''}
          </div>
          
          <!-- Actions -->
          <div class="flex gap-3 pt-4 border-t border-gray-700">
            <button onclick="app.copyPrompt('${el.generated_prompt.replace(/'/g, "\\'")}')" 
                    class="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-all transform hover:scale-105">
              <i class="fas fa-copy mr-2"></i>Copy Generated Prompt
            </button>
            <button onclick="app.copyPrompt('${(this.currentTheme?.master_prompt || '').replace(/'/g, "\\'")}')" 
                    class="px-4 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-all transform hover:scale-105">
              <i class="fas fa-copy mr-2"></i>Copy Template
            </button>
            <button onclick="this.closest('.fixed').remove()" 
                    class="px-4 py-3 bg-gray-600 hover:bg-gray-700 rounded-lg font-medium transition-all">
              Close
            </button>
          </div>
        </div>
      </div>
    `
    
    document.body.appendChild(modal)
  }
  
  copyPrompt(prompt) {
    navigator.clipboard.writeText(prompt).then(() => {
      // Show success message
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg animate-slideIn z-50'
      toast.innerHTML = '<i class="fas fa-check mr-2"></i>Prompt copied to clipboard!'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 2000)
    }).catch(err => {
      alert('Failed to copy prompt: ' + err)
    })
  }
  
  showEnlargedImage(element, imageUrl) {
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4'
    modal.onclick = () => modal.remove()
    
    modal.innerHTML = `
      <div class="relative max-w-5xl max-h-[90vh] animate-scaleIn">
        <!-- Close button -->
        <button onclick="this.closest('.fixed').remove()" 
                class="absolute -top-12 right-0 text-white hover:text-gray-300 transition-all">
          <i class="fas fa-times text-2xl"></i>
        </button>
        
        <!-- Element name -->
        <div class="absolute -top-12 left-0 text-white">
          <h3 class="text-xl font-bold">${element}</h3>
        </div>
        
        <!-- Image -->
        <img src="${imageUrl}" 
             alt="${element}"
             class="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
             onerror="this.src='https://via.placeholder.com/800x800/1F2937/9CA3AF?text=Error'">
        
        <!-- Controls -->
        <div class="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-3 bg-gray-900 bg-opacity-90 px-6 py-3 rounded-full">
          <button onclick="event.stopPropagation(); app.showPromptModal('${element.replace(/'/g, "\\'")}'); this.closest('.fixed').remove()" 
                  class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-all text-white">
            <i class="fas fa-code mr-2"></i>View Prompt
          </button>
          <button onclick="event.stopPropagation(); navigator.clipboard.writeText('${imageUrl}').then(() => app.showNotification('Image URL copied!', 'success'))" 
                  class="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg font-medium transition-all text-white">
            <i class="fas fa-copy mr-2"></i>Copy URL
          </button>
        </div>
      </div>
    `
    
    document.body.appendChild(modal)
  }

  markTest(index, passed) {
    this.testResults[index].passed = passed
    
    // Update button states with animation
    const passBtn = document.getElementById(`pass-btn-${index}`)
    const failBtn = document.getElementById(`fail-btn-${index}`)
    
    if (passed) {
      passBtn.classList.remove('bg-gray-600', 'hover:bg-green-600')
      passBtn.classList.add('bg-green-600', 'scale-105')
      failBtn.classList.remove('bg-red-600', 'scale-105')
      failBtn.classList.add('bg-gray-600', 'hover:bg-red-600')
    } else {
      failBtn.classList.remove('bg-gray-600', 'hover:bg-red-600')
      failBtn.classList.add('bg-red-600', 'scale-105')
      passBtn.classList.remove('bg-green-600', 'scale-105')
      passBtn.classList.add('bg-gray-600', 'hover:bg-green-600')
    }
  }

  async saveProgress() {
    const hasResults = this.testResults.some(r => r.passed !== null)
    if (!hasResults) {
      alert('Please mark at least one test result before saving')
      return
    }
    
    // Disable save button to prevent double-clicks
    const saveButton = document.querySelector('[onclick*="saveProgress"]')
    if (saveButton) {
      saveButton.disabled = true
    }
    
    this.showLoading('Saving progress...')
    
    try {
      // Save test results
      await axios.post(`/api/themes/${this.currentTheme.theme_id}/test-results`, {
        results: this.testResults.filter(r => r.passed !== null),
        roundNumber: this.roundNumber
      })
      
      // Save approved images to gallery
      const approvedImages = this.testResults.filter(r => r.passed === true)
      if (approvedImages.length > 0) {
        console.log(`Saving ${approvedImages.length} approved images to gallery...`)
        
        for (const result of approvedImages) {
          if (this.generatedImages[result.element]) {
            try {
              console.log("DEBUG - Attempting to save image:", this.generatedImages[result.element])
              
              // Save to gallery
              const response = await axios.post('/api/gallery/images', {
                prompt: result.element,
                image_url: this.generatedImages[result.element],
                theme_id: this.currentTheme.theme_id,
                theme_name: this.currentTheme.theme,
                model: this.currentTheme.model,
                style: this.currentTheme.style
              })
              
              if (response.data.success) {
                console.log("DEBUG - Save completed for image:", this.generatedImages[result.element])
                console.log(`Saved approved image to gallery: ${result.element}`)
              } else if (response.data.duplicate) {
                console.log("DEBUG - Duplicate image skipped:", this.generatedImages[result.element])
              }
            } catch (error) {
              console.error(`Failed to save image to gallery:`, error)
            }
          }
        }
        
        this.showNotification(`${approvedImages.length} approved images saved to gallery!`, 'success')
      }
      
      this.hideLoading()
      
      // Re-enable save button
      const saveButton = document.querySelector('[onclick*="saveProgress"]')
      if (saveButton) {
        saveButton.disabled = false
      }
      
      // Show success message
      const successMsg = document.createElement('div')
      successMsg.className = 'fixed top-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg animate-slideIn z-50'
      successMsg.innerHTML = '<i class="fas fa-check mr-2"></i>Progress saved successfully!'
      document.body.appendChild(successMsg)
      
      setTimeout(() => successMsg.remove(), 3000)
    } catch (error) {
      console.error('Error saving progress:', error)
      alert('Error saving progress')
      this.hideLoading()
      
      // Re-enable save button on error too
      const saveButton = document.querySelector('[onclick*="saveProgress"]')
      if (saveButton) {
        saveButton.disabled = false
      }
    }
  }

  async testFiveMore() {
    await this.saveProgress()
    await this.loadTheme(this.currentTheme.theme_id)
  }

  // ==================== SCALING PRODUCTION MODE ====================
  async showScalingMode(themeId, skipWarning = false) {
    this.currentView = 'scaling'
    this.showLoading('Loading production mode...')
    
    try {
      const [themeResponse, approvedResponse, statsResponse] = await Promise.all([
        axios.get(`/api/themes/${themeId}/details`),
        axios.get(`/api/themes/${themeId}/approved`),
        axios.get(`/api/themes/${themeId}/stats`)
      ])
      
      const theme = themeResponse.data.theme
      const approved = approvedResponse.data.elements
      const stats = statsResponse.data
      const estimatedVariations = approved.length > 0 ? Math.pow(approved.length, 2) * 100 : 100
      
      this.hideLoading()
      
      const app = document.getElementById('app')
      app.innerHTML = `
        <div class="min-h-screen bg-gray-900 text-white">
          <div class="container mx-auto p-6 max-w-6xl">
            <!-- Back button -->
            <button onclick="app.showDashboard()" class="mb-6 text-gray-400 hover:text-white transition-all">
              <i class="fas fa-arrow-left mr-2"></i>Back to Dashboard
            </button>

            <!-- Scaling Production Header -->
            <div class="bg-gradient-to-r from-purple-800 to-blue-800 rounded-lg p-6 mb-6 animate-fadeIn">
              <h2 class="text-3xl font-bold mb-2">
                <i class="fas fa-rocket mr-3"></i>Scaling Production Mode
              </h2>
              <p class="text-xl">${theme.theme}</p>
              
              ${approved.length < 5 && !skipWarning ? `
              <div class="mt-3 p-3 bg-yellow-600 bg-opacity-20 border border-yellow-600 rounded-lg">
                <i class="fas fa-exclamation-triangle mr-2 text-yellow-500"></i>
                <span class="text-yellow-300">
                  Warning: Only ${approved.length} approved prompt${approved.length === 1 ? '' : 's'}. 
                  ${approved.length === 0 ? 'Will use master template only for generation.' : 'Results may be limited. Consider testing more prompts for better variety.'}
                </span>
              </div>
              ` : ''}
              
              <div class="mt-4 grid grid-cols-4 gap-4">
                <div>
                  <p class="text-gray-300">Test Progress</p>
                  <p class="text-2xl font-bold">${stats.tested}/${stats.total}</p>
                </div>
                <div>
                  <p class="text-gray-300">Approved</p>
                  <p class="text-2xl font-bold text-green-400">${approved.length}</p>
                </div>
                <div>
                  <p class="text-gray-300">Pass Rate</p>
                  <p class="text-2xl font-bold ${theme.pass_rate >= 70 ? 'text-green-400' : theme.pass_rate >= 50 ? 'text-yellow-400' : 'text-red-400'}">${theme.pass_rate || 0}%</p>
                </div>
                <div>
                  <p class="text-gray-300">Est. Variations</p>
                  <p class="text-2xl font-bold">${estimatedVariations.toLocaleString()}+</p>
                </div>
              </div>
            </div>

            <!-- Master Prompt Display -->
            <div class="bg-gray-800 rounded-lg p-4 mb-6 border border-gray-700">
              <p class="text-sm text-gray-400 mb-2">Master Prompt Template:</p>
              <code class="text-lg text-green-400">${theme.master_prompt}</code>
            </div>

            <!-- Scaling Settings -->
            <div class="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700 animate-fadeIn">
              <h3 class="text-xl font-bold mb-4">📊 Scaling Settings</h3>
              
              <div class="space-y-6">
                <!-- Generation Mode -->
                <div>
                  <label class="block text-sm font-medium mb-2">Generation Mode</label>
                  <select id="generationMode" class="w-full px-4 py-2 bg-gray-700 rounded-lg border border-gray-600">
                    ${approved.length >= 5 ? '<option value="tested">Use Tested Elements (Recommended)</option>' : ''}
                    ${approved.length > 0 ? '<option value="partial">Use Partial Results + Exploration</option>' : ''}
                    <option value="freeform" ${approved.length === 0 ? 'selected' : ''}>Free-form (Master Template Only)</option>
                  </select>
                  <p class="text-xs text-gray-500 mt-1">
                    ${approved.length === 0 ? 'No approved prompts yet - will use master template only' : 
                      approved.length < 5 ? `Only ${approved.length} approved - consider "Partial Results" mode` :
                      'Sufficient approved prompts for full generation'}
                  </p>
                </div>

                <!-- Variety Level -->
                <div>
                  <label class="block text-sm font-medium mb-2">Variety Level</label>
                  <input type="range" id="varietyLevel" min="1" max="3" value="2" 
                         class="w-full" onchange="app.updateVarietyLabel()">
                  <div class="flex justify-between text-sm text-gray-400 mt-1">
                    <span>Low</span>
                    <span id="varietyLabel" class="text-purple-400 font-bold">Medium</span>
                    <span>High</span>
                  </div>
                  <p class="text-xs text-gray-500 mt-2">Controls how wild combinations get</p>
                </div>

                <!-- Output Type -->
                <div>
                  <label class="block text-sm font-medium mb-2">Output Type</label>
                  <div class="space-y-2">
                    <label class="flex items-center">
                      <input type="checkbox" id="outputPrompts" checked class="mr-2">
                      <span>Prompts Only</span>
                    </label>
                    <label class="flex items-center">
                      <input type="checkbox" id="outputImages" class="mr-2">
                      <span>Prompts + Images (Real Generation)</span>
                    </label>
                    <p class="text-xs text-gray-500 ml-6">Generates preview images for first 10 prompts</p>
                  </div>
                </div>

                <!-- Batch Size with Live Cost -->
                <div>
                  <label class="block text-sm font-medium mb-2">Batch Size</label>
                  <div class="flex gap-2">
                    <input type="number" id="batchSize" value="100" min="10" max="5000"
                           onchange="app.updateLiveCost()"
                           class="px-4 py-2 bg-gray-700 rounded-lg w-32">
                    <span class="py-2 text-gray-400">Items to Generate</span>
                  </div>
                  
                  <!-- Live Cost Display -->
                  <div id="liveCostDisplay" class="mt-3 p-3 bg-gray-900 rounded-lg border border-gray-700">
                    <div class="flex justify-between items-center">
                      <span class="text-sm text-gray-400">Estimated Cost:</span>
                      <span id="liveCostAmount" class="text-lg font-bold text-green-400">$0.01</span>
                    </div>
                    <div class="flex justify-between items-center mt-1">
                      <span class="text-sm text-gray-400">Time Estimate:</span>
                      <span id="liveTimeEstimate" class="text-sm">< 1 minute</span>
                    </div>
                  </div>
                  
                  <!-- Quick Select Buttons -->
                  <div class="flex gap-2 mt-3">
                    <button onclick="document.getElementById('batchSize').value=100; app.updateLiveCost()" 
                            class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">100</button>
                    <button onclick="document.getElementById('batchSize').value=500; app.updateLiveCost()" 
                            class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">500</button>
                    <button onclick="document.getElementById('batchSize').value=1000; app.updateLiveCost()" 
                            class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">1K</button>
                    <button onclick="document.getElementById('batchSize').value=5000; app.updateLiveCost()" 
                            class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm">5K</button>
                  </div>
                </div>

                <!-- Production Notes -->
                <div>
                  <label class="block text-sm font-medium mb-2">Production Notes</label>
                  <textarea id="productionNotes" rows="3"
                            placeholder="- Avoid nighttime scenes\n- Limit actions to 5 words max\n- Keep backgrounds urban or suburban"
                            class="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600"></textarea>
                </div>
              </div>

              <div class="mt-6 flex gap-3">
                <button onclick="app.startProduction('${themeId}')" 
                        class="px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-lg font-bold text-lg transform hover:scale-105 transition-all">
                  <i class="fas fa-play mr-2"></i>Start Production
                </button>
                <button onclick="app.loadTheme('${themeId}')" 
                        class="px-6 py-3 bg-gray-600 hover:bg-gray-700 rounded-lg font-medium transition-all">
                  <i class="fas fa-flask mr-2"></i>Back to Testing
                </button>
              </div>
            </div>

            <!-- Approved Elements Display -->
            ${approved.length > 0 ? `
            <div class="bg-gray-800 rounded-lg p-6 border border-gray-700 animate-fadeIn">
              <h3 class="text-xl font-bold mb-4">✅ Approved Elements (${approved.length})</h3>
              <div class="flex flex-wrap gap-2">
                ${approved.map(el => `
                  <span class="px-3 py-1 bg-green-600 bg-opacity-20 border border-green-600 rounded-full text-sm animate-fadeIn">
                    ${el.element}
                  </span>
                `).join('')}
              </div>
            </div>
            ` : `
            <div class="bg-gray-800 rounded-lg p-6 border border-yellow-700 animate-fadeIn">
              <h3 class="text-xl font-bold mb-4 text-yellow-400">
                <i class="fas fa-exclamation-circle mr-2"></i>No Approved Elements Yet
              </h3>
              <p class="text-gray-400 mb-4">You haven't approved any test prompts yet. You can still generate using the master template.</p>
              <button onclick="app.loadTheme('${themeId}')" class="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-medium transition-all">
                <i class="fas fa-flask mr-2"></i>Start Testing
              </button>
            </div>
            `}

            <!-- Production Output Area -->
            <div id="productionOutput" class="hidden mt-6">
              <!-- Production results will appear here -->
            </div>
          </div>
        </div>
      `
    } catch (error) {
      console.error('Error loading scaling mode:', error)
      this.hideLoading()
    }
  }

  updateVarietyLabel() {
    const level = document.getElementById('varietyLevel').value
    const label = document.getElementById('varietyLabel')
    const labels = ['Low', 'Medium', 'High']
    label.textContent = labels[level - 1]
  }
  
  updateLiveCost() {
    const batchSize = parseInt(document.getElementById('batchSize')?.value || 100)
    const generateImages = document.getElementById('outputImages')?.checked || false
    const model = this.currentTheme?.model || 'SEED_DREAM'
    
    const costInfo = this.calculateProductionCost(model, batchSize, generateImages)
    
    const costDisplay = document.getElementById('liveCostAmount')
    const timeDisplay = document.getElementById('liveTimeEstimate')
    
    if (costDisplay) {
      costDisplay.textContent = `$${costInfo.totalCost}`
      costDisplay.className = `text-lg font-bold ${
        parseFloat(costInfo.totalCost) > 10 ? 'text-yellow-400' : 
        parseFloat(costInfo.totalCost) > 50 ? 'text-red-400' : 'text-green-400'
      }`
    }
    
    if (timeDisplay) {
      timeDisplay.textContent = costInfo.estimatedTime
    }
  }
  
  calculateProductionCost(model, totalImages, includeImages) {
    const IMAGE_PRICING = {
      'SEED_DREAM': 0.03,  // $0.03 per image
      'IMAGEN_4': 0.04,    // $0.04 per image
      'flux-pro': 0.05,
      'ideogram': 0.08
    }
    
    const MODEL_CAPABILITIES = {
      'SEED_DREAM': 4,
      'IMAGEN_4': 4,
      'flux-pro': 1,
      'ideogram': 1
    }
    
    const pricePerImage = IMAGE_PRICING[model] || 0.05
    const imagesPerRequest = MODEL_CAPABILITIES[model] || 1
    const totalRequests = Math.ceil(totalImages / imagesPerRequest)
    
    // Time estimate
    const secondsPerBatch = 20
    const totalBatches = Math.ceil(totalRequests / 10) // 10 concurrent
    const totalSeconds = totalBatches * secondsPerBatch
    
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
      totalImages,
      promptCost: (totalImages * 0.0001).toFixed(4),
      imageCost: includeImages ? (totalImages * pricePerImage).toFixed(2) : '0.00',
      totalCost: includeImages 
        ? ((totalImages * pricePerImage) + (totalImages * 0.0001)).toFixed(2)
        : (totalImages * 0.0001).toFixed(4),
      estimatedTime: includeImages ? estimatedTime : '< 1 minute',
      imagesPerRequest,
      totalRequests: includeImages ? totalRequests : 0,
      includeImages
    }
  }
  
  async confirmProductionCost(costInfo) {
    return new Promise((resolve) => {
      const modal = document.createElement('div')
      modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4'
      
      modal.innerHTML = `
        <div class="bg-gray-800 rounded-lg max-w-lg w-full animate-scaleIn">
          <div class="p-6">
            <h2 class="text-2xl font-bold mb-4">
              <i class="fas fa-calculator mr-2 text-green-500"></i>
              Production Cost Estimate
            </h2>
            
            <div class="bg-gray-900 rounded-lg p-4 mb-4">
              <div class="space-y-3">
                <div class="flex justify-between">
                  <span class="text-gray-400">Model:</span>
                  <span class="font-bold">${costInfo.model}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Total Items:</span>
                  <span class="font-bold">${costInfo.totalImages}</span>
                </div>
                ${costInfo.includeImages ? `
                <div class="flex justify-between">
                  <span class="text-gray-400">Images per Request:</span>
                  <span class="font-bold">${costInfo.imagesPerRequest}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-400">Total API Calls:</span>
                  <span class="font-bold">${costInfo.totalRequests}</span>
                </div>
                ` : ''}
                <div class="border-t border-gray-700 pt-3">
                  <div class="flex justify-between">
                    <span class="text-gray-400">Prompt Generation (GPT-4o-mini):</span>
                    <span>$${costInfo.promptCost}</span>
                  </div>
                  ${costInfo.includeImages ? `
                  <div class="flex justify-between">
                    <span class="text-gray-400">Image Generation (${costInfo.model}):</span>
                    <span>$${costInfo.imageCost}</span>
                  </div>
                  ` : ''}
                </div>
                <div class="border-t border-gray-700 pt-3">
                  <div class="flex justify-between text-xl font-bold">
                    <span>Total Cost:</span>
                    <span class="text-green-400">$${costInfo.totalCost}</span>
                  </div>
                  <div class="flex justify-between mt-2">
                    <span class="text-gray-400">Estimated Time:</span>
                    <span>${costInfo.estimatedTime}</span>
                  </div>
                </div>
              </div>
            </div>
            
            ${costInfo.includeImages ? `
            <div class="bg-yellow-900 bg-opacity-30 border border-yellow-600 rounded-lg p-3 mb-4">
              <p class="text-sm text-yellow-300">
                <i class="fas fa-info-circle mr-1"></i>
                Preview images will be generated for the first 10 prompts only.
                Full generation available after setup.
              </p>
            </div>
            ` : ''}
            
            <div class="flex gap-3">
              <button onclick="this.closest('.fixed').remove(); window.app.resolveProductionConfirm(true)"
                      class="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-bold transition-all">
                <i class="fas fa-check mr-2"></i>Confirm & Generate
              </button>
              <button onclick="this.closest('.fixed').remove(); window.app.resolveProductionConfirm(false)"
                      class="flex-1 px-4 py-3 bg-gray-600 hover:bg-gray-700 rounded-lg font-bold transition-all">
                <i class="fas fa-times mr-2"></i>Cancel
              </button>
            </div>
          </div>
        </div>
      `
      
      document.body.appendChild(modal)
      
      // Store resolve function for button callbacks
      this.resolveProductionConfirm = resolve
    })
  }

  async startProduction(themeId) {
    const batchSize = parseInt(document.getElementById('batchSize').value)
    const varietyLevel = document.getElementById('varietyLevel').value
    const notes = document.getElementById('productionNotes').value
    const generateImages = document.getElementById('outputImages').checked
    const generationMode = document.getElementById('generationMode')?.value || 'tested'
    
    // Calculate and show cost first
    const model = this.currentTheme?.model || 'SEED_DREAM'
    const costInfo = this.calculateProductionCost(model, batchSize, generateImages)
    
    // Show cost confirmation modal
    if (!await this.confirmProductionCost(costInfo)) {
      return
    }
    
    this.showLoading(`Generating ${batchSize} prompts...`)
    
    try {
      // First generate prompts
      const response = await axios.post(`/api/themes/${themeId}/generate`, {
        count: batchSize,
        varietyLevel,
        notes,
        mode: generationMode
      })
      
      if (response.data.success) {
        // Check if we're using fallback (reusing approved prompts)
        if (response.data.using_fallback) {
          console.warn('⚠️ USING FALLBACK - OpenAI generation failed, reusing approved test prompts!')
          alert('Warning: OpenAI generation failed. Using your approved test prompts instead of generating new ones. Check console for details.')
        } else {
          console.log(`✅ Successfully generated ${response.data.prompts.length} NEW prompts with GPT-4o`)
        }
        
        // Log first few prompts to verify they're new
        console.log('Generated prompts (first 3):', response.data.prompts.slice(0, 3).map(p => p.prompt))
        
        // If images requested, use mass generation endpoint
        if (generateImages) {
          await this.massGenerateWithProgress(
            response.data.prompts.map(p => p.prompt),
            model,
            themeId
          )
        } else {
          // Just display prompts without images
          this.hideLoading()
          this.displayProductionResults(response.data.prompts)
        }
      }
    } catch (error) {
      console.error('Error generating prompts:', error)
      alert('Error starting production')
      this.hideLoading()
    }
  }

  displayProductionResults(prompts) {
    const outputDiv = document.getElementById('productionOutput')
    outputDiv.classList.remove('hidden')
    
    outputDiv.innerHTML = `
      <div class="bg-gray-800 rounded-lg p-6 border border-gray-700 animate-fadeIn">
        <h3 class="text-xl font-bold mb-4">
          <i class="fas fa-check-circle text-green-500 mr-2"></i>
          Generated Batch (${prompts.length} prompts)
        </h3>
        
        <div class="mb-4 flex gap-3">
          <button onclick="app.downloadPrompts()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium transition-all">
            <i class="fas fa-download mr-2"></i>Download Prompts
          </button>
          <button onclick="app.exportResults()" class="px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-medium transition-all">
            <i class="fas fa-file-export mr-2"></i>Export JSON
          </button>
        </div>
        
        <div class="space-y-2 max-h-96 overflow-y-auto bg-gray-900 rounded p-4">
          ${prompts.map((p, idx) => `
            <div class="p-3 bg-gray-800 rounded border border-gray-700 animate-fadeIn" style="animation-delay: ${Math.min(idx * 0.05, 1)}s">
              <div class="flex items-start gap-3">
                ${p.image_url ? `
                  <img src="${p.image_url}" alt="Preview" class="w-16 h-16 rounded object-cover">
                ` : ''}
                <div class="flex-1">
                  <span class="text-xs text-gray-500">#${idx + 1}</span>
                  <p class="font-mono text-sm mt-1 text-blue-400">${p.prompt}</p>
                  <div class="mt-1 text-xs text-gray-500">
                    Subject: ${p.subject || 'N/A'} | Action: ${p.action || 'N/A'} | Location: ${p.location || 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        
        <div class="mt-4 p-3 bg-blue-900 bg-opacity-20 rounded border border-blue-700">
          <p class="text-sm text-blue-300">
            <i class="fas fa-info-circle mr-2"></i>
            ${prompts.length} unique prompts generated using approved elements. 
            ${prompts[0]?.image_url ? 'Preview images shown for first 10 prompts.' : 'Enable "Prompts + Images" to see visual previews.'}
          </p>
        </div>
      </div>
    `
    
    // Store prompts for download
    this.lastGeneratedPrompts = prompts
  }

  downloadPrompts() {
    if (!this.lastGeneratedPrompts) return
    
    const text = this.lastGeneratedPrompts.map((p, idx) => `${idx + 1}. ${p.prompt}`).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `prompts_${this.currentTheme?.theme_id || 'export'}_${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  exportResults() {
    if (!this.lastGeneratedPrompts) return
    
    const exportData = {
      theme: this.currentTheme?.theme,
      model: this.currentTheme?.model,
      style: this.currentTheme?.style,
      timestamp: new Date().toISOString(),
      count: this.lastGeneratedPrompts.length,
      prompts: this.lastGeneratedPrompts
    }
    
    const json = JSON.stringify(exportData, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `results_${this.currentTheme?.theme_id || 'export'}_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ==================== VIEW HISTORY ====================
  async deleteTheme(themeId) {
    console.log('deleteTheme called with:', themeId)
    console.log('All themes:', this.allThemes)
    
    const theme = this.allThemes.find(t => t.theme_id === themeId)
    console.log('Found theme:', theme)
    
    if (!theme) {
      console.error('Theme not found in allThemes array!')
      // Try to delete anyway if we have the ID
      if (!themeId) return
      
      if (!confirm(`Are you sure you want to delete this theme?\n\nThis will permanently delete all related data.\n\nThis action cannot be undone.`)) {
        return
      }
    } else {
      if (!confirm(`Are you sure you want to delete "${theme.theme}"?\n\nThis will permanently delete:\n• The theme configuration\n• All test elements (${theme.total_elements || 0})\n• All test results\n• Any discovered patterns\n\nThis action cannot be undone.`)) {
        return
      }
    }
    
    this.showLoading('Deleting theme...')
    
    try {
      console.log('Sending DELETE request for:', themeId)
      const response = await axios.delete(`/api/themes/${themeId}`)
      console.log('Delete response:', response.data)
      
      if (response.data.success) {
        // Remove from local array
        this.allThemes = this.allThemes.filter(t => t.theme_id !== themeId)
        
        // Reset selector
        const selector = document.getElementById('themeSelector')
        if (selector) selector.value = ''
        
        const container = document.getElementById('selectedThemeContainer')
        if (container) container.classList.add('hidden')
        
        // Refresh selector
        this.populateThemeSelector()
        
        // Reload themes to refresh the UI
        await this.loadThemes()
        
        this.showNotification('Theme deleted successfully', 'success')
      }
    } catch (error) {
      console.error('Error deleting theme:', error)
      alert('Error deleting theme: ' + (error.response?.data?.error || error.message))
    } finally {
      this.hideLoading()
    }
  }
  
  async viewHistory(themeId) {
    this.showLoading('Loading history...')
    
    try {
      const response = await axios.get(`/api/themes/${themeId}/history`)
      const sessions = this.sanitizeArray(response.data.sessions || [])
      
      this.hideLoading()
      
      const modal = document.createElement('div')
      modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'
      modal.innerHTML = `
        <div class="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto animate-scaleIn">
          <h3 class="text-xl font-bold mb-4">Testing History</h3>
          ${sessions.length === 0 ? '<p class="text-gray-400">No testing history yet</p>' : `
            <div class="space-y-2">
              ${sessions.map(s => `
                <div class="p-3 bg-gray-700 rounded">
                  <p class="font-medium">Round ${s.round_number}</p>
                  <p class="text-sm text-gray-400">
                    Tested: ${s.elements_tested} | 
                    Passed: <span class="text-green-500">${s.passed}</span> | 
                    Failed: <span class="text-red-500">${s.failed}</span> | 
                    Date: ${new Date(s.session_date).toLocaleDateString()}
                  </p>
                </div>
              `).join('')}
            </div>
          `}
          <button onclick="this.parentElement.parentElement.remove()" 
                  class="mt-4 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded transition-all">Close</button>
        </div>
      `
      document.body.appendChild(modal)
    } catch (error) {
      console.error('Error loading history:', error)
      this.hideLoading()
    }
  }

  // ==================== BULK THEME SYSTEM ====================

  showBulkUpload() {
    this.currentView = 'bulk-upload'
    
    document.getElementById('app').innerHTML = `
      <div class="max-w-4xl mx-auto p-6">
        <!-- Header -->
        <div class="mb-6">
          <div class="flex justify-between items-center mb-4">
            <h1 class="text-3xl font-bold">
              <i class="fas fa-upload mr-2 text-green-500"></i>
              Bulk Theme Upload
            </h1>
            <button onclick="app.showDashboard()" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg">
              <i class="fas fa-arrow-left mr-2"></i>Back to Dashboard
            </button>
          </div>
          <p class="text-gray-400">Upload multiple themes via CSV or line-by-line input</p>
        </div>

        <!-- Upload Form -->
        <div class="bg-gray-800 rounded-lg p-6 space-y-6">
          <!-- Input Format -->
          <div class="space-y-4">
            <h3 class="text-xl font-semibold">Theme Data</h3>
            <p class="text-sm text-gray-400 mb-2">
              Format: <code class="bg-gray-700 px-2 py-1 rounded">Category,Theme,Tier,tag1,tag2,tag3...</code>
            </p>
            <div class="text-xs text-yellow-400 bg-yellow-900/20 p-3 rounded border border-yellow-500/30">
              <div class="font-medium mb-1">💡 Pro Tips:</div>
              <ul class="space-y-1 list-disc list-inside">
                <li>Use quotes for fields containing commas: <code>"Complex theme, with commas"</code></li>
                <li>Tags are separated by commas after Tier field</li>
                <li>Click "Verify Format" before uploading to check your data</li>
                <li>Each line = one theme. Long lines will wrap but that's OK</li>
              </ul>
            </div>
            
            <textarea 
              id="themesInput"
              placeholder="Urban & Industrial,Officecore,B-TIER,corporate,minimalist,urban,liminal space
Nature,Forestcore,A-TIER,cozy,fantasy,moss,trees"
              class="w-full h-64 px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-green-500 font-mono text-sm"
            ></textarea>
          </div>

          <!-- Model and Style Selection -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-2 text-gray-400">Model</label>
              <select id="bulkModel" class="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-green-500">
                <option value="">Select model</option>
                <option value="SEED_DREAM">Seedream</option>
                <option value="IMAGEN_4">Imagen</option>
                <option value="RECRAFT_V3">Recraft V3</option>
              </select>
            </div>
            
            <div>
              <label class="block text-sm font-medium mb-2 text-gray-400">Master Prompt/Style</label>
              <select id="bulkMasterPrompt" class="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-green-500">
                <option value="">Select style</option>
              </select>
              <button onclick="app.showAddStyleModalForBulk()" class="mt-2 text-sm text-purple-400 hover:text-purple-300 transition-all">
                <i class="fas fa-plus mr-1"></i>Add Custom Style
              </button>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
              onclick="app.verifyCSVFormat()" 
              class="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-all"
            >
              <i class="fas fa-check-circle mr-2"></i>Verify Format
            </button>
            <button 
              onclick="app.uploadBulkThemes()" 
              class="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-all"
            >
              <i class="fas fa-upload mr-2"></i>Upload Themes
            </button>
          </div>
        </div>

        <!-- Results -->
        <div id="uploadResults" class="hidden mt-6 bg-gray-800 rounded-lg p-6">
          <!-- Results will appear here -->
        </div>
      </div>

      <!-- Add Style Modal for Bulk -->
      <div id="addStyleModalBulk" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4">
          <h3 class="text-xl font-bold mb-4">Add Custom Style</h3>
          <input type="text" id="newStyleNameBulk" placeholder="Style name" 
                 class="w-full px-4 py-2 bg-gray-700 rounded mb-3">
          <textarea id="newStylePromptBulk" placeholder="Master prompt template"
                    class="w-full px-4 py-2 bg-gray-700 rounded mb-3" rows="3"></textarea>
          <div class="flex gap-2">
            <button onclick="app.addCustomStyleForBulk()" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded">Add Style</button>
            <button onclick="app.hideAddStyleModalForBulk()" class="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded">Cancel</button>
          </div>
        </div>
      </div>
    `
    
    this.loadStylesForBulk()
  }

  async loadStylesForBulk() {
    try {
      await this.loadStyles() // Reuse existing method
      const select = document.getElementById('bulkMasterPrompt')
      select.innerHTML = '<option value="">Select style</option>'
      
      this.styles.forEach(style => {
        const option = document.createElement('option')
        option.value = style.master_prompt
        option.textContent = `${style.name} (${style.model})`
        select.appendChild(option)
      })
    } catch (error) {
      console.error('Error loading styles:', error)
    }
  }

  showAddStyleModalForBulk() {
    document.getElementById('addStyleModalBulk').classList.remove('hidden')
  }

  hideAddStyleModalForBulk() {
    document.getElementById('addStyleModalBulk').classList.add('hidden')
  }

  async addCustomStyleForBulk() {
    const model = document.getElementById('bulkModel').value
    const name = document.getElementById('newStyleNameBulk').value
    const prompt = document.getElementById('newStylePromptBulk').value
    
    if (!model || !name || !prompt) {
      alert('Please select a model and fill all fields')
      return
    }
    
    this.showLoading('Adding custom style...')
    
    try {
      await axios.post('/api/styles', {
        name,
        model,
        masterPrompt: prompt,
        isCustom: true
      })
      
      await this.loadStylesForBulk()  // Refresh the bulk dropdown
      document.getElementById('bulkMasterPrompt').value = prompt  // Auto-select new style
      this.hideAddStyleModalForBulk()
    } catch (error) {
      console.error('Error adding style:', error)
      alert('Error adding custom style')
    } finally {
      this.hideLoading()
    }
  }

  // Enhanced CSV parsing that handles quoted fields and commas in tags
  parseCSVLine(line) {
    const result = []
    let current = ''
    let inQuotes = false
    let i = 0
    
    while (i < line.length) {
      const char = line[i]
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"'
          i += 2
        } else {
          // Toggle quote state
          inQuotes = !inQuotes
          i++
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        result.push(current.trim())
        current = ''
        i++
      } else {
        current += char
        i++
      }
    }
    
    // Add the last field
    result.push(current.trim())
    return result
  }

  verifyCSVFormat() {
    try {
      const themesText = document.getElementById('themesInput').value.trim()
      
      if (!themesText) {
        alert('Please enter some themes data first')
        return
      }

      const lines = themesText.split('\n').filter(line => line.trim())
      const themes = []
      const errors = []
      const warnings = []

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        
        try {
          const parts = this.parseCSVLine(line)
          
          if (parts.length < 3) {
            errors.push(`Line ${i + 1}: Invalid format - need at least Category,Theme,Tier (found ${parts.length} fields)`)
            continue
          }
          
          const [category, theme, tier, ...tagParts] = parts
          
          // Validate required fields
          if (!category || !theme || !tier) {
            errors.push(`Line ${i + 1}: Missing required fields - Category: "${category}", Theme: "${theme}", Tier: "${tier}"`)
            continue
          }
          
          // Process tags (everything after tier)
          const tagsText = tagParts.join(',').trim()
          const tags = tagsText ? tagsText.split(',').map(t => t.trim()).filter(t => t) : []
          
          // Warnings for potential issues
          if (tags.length === 0) {
            warnings.push(`Line ${i + 1}: No tags found for theme "${theme}"`)
          }
          if (theme.length > 100) {
            warnings.push(`Line ${i + 1}: Theme name is quite long (${theme.length} chars): "${theme.substring(0, 50)}..."`)
          }
          
          themes.push({ 
            lineNumber: i + 1,
            category: category.trim(), 
            theme: theme.trim(), 
            tier: tier.trim(), 
            tags 
          })
          
        } catch (parseError) {
          errors.push(`Line ${i + 1}: Parse error - ${parseError.message}`)
        }
      }

      // Simple verification message
      let message = ''
      
      if (errors.length === 0) {
        message = `✅ Format correct - ${themes.length} themes detected\\n\\nReady to upload!`
      } else {
        message = `❌ Format errors found\\n\\n`
        message += `• Valid themes: ${themes.length}\\n`
        message += `• Errors: ${errors.length}\\n\\n`
        message += `First few errors:\\n`
        message += errors.slice(0, 5).map(e => `  ${e}`).join('\\n')
        if (errors.length > 5) {
          message += `\\n  ... and ${errors.length - 5} more errors`
        }
        message += `\\n\\nFix errors before uploading.`
      }
      
      alert(message)
      
      // Store parsed themes for upload
      this.verifiedThemes = errors.length === 0 ? themes : null
      
      return { themes, errors, warnings }
      
    } catch (error) {
      console.error('Error verifying CSV format:', error)
      alert('Error verifying format: ' + error.message)
    }
  }

  async uploadBulkThemes() {
    try {
      this.showLoading('Uploading themes...')
      
      const themesText = document.getElementById('themesInput').value.trim()
      const model = document.getElementById('bulkModel').value
      const masterPrompt = document.getElementById('bulkMasterPrompt').value
      
      if (!themesText || !model || !masterPrompt) {
        this.hideLoading()
        alert('Please fill in all required fields')
        return
      }

      // Use verified themes if available, otherwise parse fresh
      let themes = []
      let errors = []
      
      if (this.verifiedThemes) {
        themes = this.verifiedThemes.map(t => ({ 
          category: t.category, 
          theme: t.theme, 
          tier: t.tier, 
          tags: t.tags 
        }))
      } else {
        // Parse CSV with enhanced parser
        const lines = themesText.split('\n').filter(line => line.trim())

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim()
          if (!line) continue
          
          try {
            const parts = this.parseCSVLine(line)
            
            if (parts.length < 3) {
              errors.push(`Line ${i + 1}: Invalid format (need at least Category,Theme,Tier)`)
              continue
            }
            
            const [category, theme, tier, ...tagParts] = parts
            
            if (!category || !theme || !tier) {
              errors.push(`Line ${i + 1}: Missing required fields`)
              continue
            }
            
            // Process tags - everything after tier
            const tagsText = tagParts.join(',').trim()
            const tags = tagsText ? tagsText.split(',').map(t => t.trim()).filter(t => t) : []
            
            themes.push({ 
              category: category.trim(), 
              theme: theme.trim(), 
              tier: tier.trim(), 
              tags 
            })
            
          } catch (parseError) {
            errors.push(`Line ${i + 1}: Parse error - ${parseError.message}`)
          }
        }
      }

      if (themes.length === 0) {
        this.hideLoading()
        alert('No valid themes found in input. Use "Verify Format" button to check your data.')
        return
      }

      console.log(`🚀 Uploading ${themes.length} themes to backend...`)

      // Upload to backend
      const response = await axios.post('/api/bulk/upload-themes', {
        themes,
        model,
        masterPrompt
      })

      this.hideLoading()

      if (response.data.success) {
        const results = response.data.results
        this.showUploadResults(results, errors)
      } else {
        alert('Upload failed: ' + response.data.error)
      }
    } catch (error) {
      this.hideLoading()
      console.error('Upload error:', error)
      alert('Upload failed: ' + error.message)
    }
  }

  showUploadResults(results, parseErrors) {
    const container = document.getElementById('uploadResults')
    container.classList.remove('hidden')
    
    let html = '<h3 class="text-xl font-semibold mb-4">Upload Results</h3>'
    
    // Success summary
    html += `
      <div class="grid grid-cols-3 gap-4 mb-6">
        <div class="bg-green-900 bg-opacity-50 p-4 rounded-lg text-center">
          <div class="text-2xl font-bold text-green-400">${results.uploaded}</div>
          <div class="text-sm text-gray-400">Uploaded</div>
        </div>
        <div class="bg-yellow-900 bg-opacity-50 p-4 rounded-lg text-center">
          <div class="text-2xl font-bold text-yellow-400">${results.skipped}</div>
          <div class="text-sm text-gray-400">Skipped (Duplicates)</div>
        </div>
        <div class="bg-red-900 bg-opacity-50 p-4 rounded-lg text-center">
          <div class="text-2xl font-bold text-red-400">${results.errors.length + parseErrors.length}</div>
          <div class="text-sm text-gray-400">Errors</div>
        </div>
      </div>
    `
    
    // Show errors if any
    const allErrors = [...parseErrors, ...results.errors]
    if (allErrors.length > 0) {
      html += '<div class="bg-red-900 bg-opacity-30 rounded-lg p-4 mb-4">'
      html += '<h4 class="font-semibold text-red-400 mb-2">Errors:</h4>'
      html += '<ul class="text-sm space-y-1">'
      allErrors.forEach(error => {
        html += `<li class="text-red-300">• ${error}</li>`
      })
      html += '</ul></div>'
    }
    
    // Success message
    if (results.uploaded > 0) {
      html += `
        <div class="bg-green-900 bg-opacity-30 rounded-lg p-4">
          <p class="text-green-400">✅ Successfully uploaded ${results.uploaded} themes!</p>

        </div>
      `
    }
    
    container.innerHTML = html
  }




















  // ==================== BULK DEPLOY SYSTEM ====================

  showBulkDeploy() {
    this.currentView = 'bulk-deploy'
    
    document.getElementById('app').innerHTML = `
      <div class="max-w-6xl mx-auto p-6">
        <!-- Header -->
        <div class="mb-6">
          <div class="flex justify-between items-center mb-4">
            <h1 class="text-3xl font-bold">
              <i class="fas fa-rocket mr-2 text-orange-500"></i>
              Bulk Deploy to Production
            </h1>
            <button onclick="app.showDashboard()" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg">
              <i class="fas fa-arrow-left mr-2"></i>Back to Dashboard
            </button>
          </div>
          <p class="text-gray-400">Select themes to deploy with 200 variations each</p>
        </div>

        <!-- Filters -->
        <div class="bg-gray-800 rounded-lg p-4 mb-6">
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input 
              type="text" 
              id="deploySearch" 
              placeholder="Search themes..." 
              onkeyup="app.filterBulkThemes()"
              class="px-4 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-orange-500"
            >
            <select id="deployFilterCategory" onchange="app.filterBulkThemes()" class="px-4 py-2 bg-gray-700 rounded-lg border border-gray-600">
              <option value="">All Categories</option>
            </select>
            <select id="deployFilterTier" onchange="app.filterBulkThemes()" class="px-4 py-2 bg-gray-700 rounded-lg border border-gray-600">
              <option value="">All Tiers</option>
              <option value="S-TIER">S-TIER</option>
              <option value="A-TIER">A-TIER</option>
              <option value="B-TIER">B-TIER</option>
              <option value="C-TIER">C-TIER</option>
            </select>
            <select id="deployFilterModel" onchange="app.filterBulkThemes()" class="px-4 py-2 bg-gray-700 rounded-lg border border-gray-600">
              <option value="">All Models</option>
            </select>
          </div>
        </div>

        <!-- Theme Count Display -->
        <div id="themeCountDisplay" class="bg-gray-700 rounded-lg p-3 mb-4 text-center">
          <span class="text-lg font-semibold text-white">Loading themes...</span>
        </div>
        
        <!-- Selection Actions -->
        <div class="bg-gray-800 rounded-lg p-4 mb-6 flex justify-between items-center">
          <div>
            <span id="selectedCount" class="text-lg font-semibold">0 selected</span>
            <span class="text-gray-400 ml-2" id="estimatedVariations">0 variations total</span>
          </div>
          <div class="flex gap-3">
            <button onclick="app.selectAllVisible()" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg">
              Select All Visible
            </button>
            <button onclick="app.clearSelection()" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg">
              Clear Selection
            </button>
            <button 
              onclick="app.deploySelectedThemes()" 
              id="deployBtn"
              class="px-6 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg font-medium disabled:opacity-50"
              disabled
            >
              <i class="fas fa-rocket mr-2"></i>Deploy Selected
            </button>
            <button 
              onclick="app.deleteSelectedThemes()" 
              id="deleteBtn"
              class="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium disabled:opacity-50"
              disabled
            >
              <i class="fas fa-trash mr-2"></i>Delete Selected
            </button>
          </div>
        </div>

        <!-- Theme Grid -->
        <div id="bulkThemeGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <!-- Loading placeholder -->
          <div class="col-span-full text-center py-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
            <p class="text-gray-400 mt-2">Loading themes...</p>
          </div>
        </div>
        
        <!-- Pagination Controls -->
        <div id="paginationControls" class="flex justify-center items-center gap-4 mt-6 p-4 bg-gray-800 rounded-lg" style="display: none;">
          <button 
            onclick="app.previousPage()" 
            id="prevPageBtn"
            class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            disabled
          >
            <i class="fas fa-chevron-left mr-2"></i>Previous
          </button>
          
          <div class="flex items-center gap-2 text-gray-300">
            <span>Page</span>
            <span id="currentPageNum" class="font-semibold text-white">1</span>
            <span>of</span>
            <span id="totalPagesNum" class="font-semibold text-white">1</span>
          </div>
          
          <button 
            onclick="app.nextPage()" 
            id="nextPageBtn"
            class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            disabled
          >
            Next<i class="fas fa-chevron-right ml-2"></i>
          </button>
        </div>

        <!-- Simple Deploy Progress Modal -->
        <div id="deployModal" class="hidden fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div class="bg-gray-800 rounded-lg shadow-xl max-w-lg w-full">
            <div class="px-6 py-4 border-b border-gray-700">
              <h2 class="text-xl font-bold text-white flex items-center">
                <i class="fas fa-rocket mr-2 text-orange-400"></i>
                Bulk Deploy Progress
              </h2>
            </div>
            
            <div class="p-6">
              <div class="text-center mb-6">
                <div class="text-2xl font-bold text-orange-400 mb-2" id="currentProgress">0%</div>
                <p class="text-gray-300" id="currentStatus">Preparing deployment...</p>
              </div>
              
              <div class="w-full bg-gray-700 rounded-full h-3 mb-4">
                <div id="progressBar" class="bg-orange-500 h-3 rounded-full transition-all duration-300" style="width: 0%"></div>
              </div>
              
              <div class="grid grid-cols-2 gap-4 mb-4 text-center text-sm">
                <div>
                  <div class="text-gray-400">Themes Processed</div>
                  <div class="text-white font-bold" id="themesProgress">0 / 0</div>
                </div>
                <div>
                  <div class="text-gray-400">Total Generated</div>
                  <div class="text-green-400 font-bold" id="totalGenerated">0 items</div>
                </div>
              </div>
              
              <div class="bg-gray-900 rounded-lg p-4 max-h-32 overflow-y-auto">
                <div id="statusLog" class="text-sm text-gray-300 space-y-1">
                  <!-- Status updates will appear here -->
                </div>
              </div>
            </div>
            
            <div class="px-6 py-4 border-t border-gray-700 flex justify-center gap-3">
              <button onclick="app.cancelBulkDeploy()" id="cancelBtn" class="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-all">
                <i class="fas fa-stop mr-2"></i>Cancel Deploy
              </button>
              <button onclick="app.closeDeployModal()" id="closeBtn" class="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-all disabled:opacity-50" disabled>
                <i class="fas fa-times mr-2"></i>Close
              </button>
            </div>
          </div>
        </div>

        <!-- Video Generation Modal -->
        <div id="modal" class="hidden fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <!-- Modal content will be dynamically inserted here -->
        </div>
      </div>
    `
    
    this.selectedThemes = new Set()
    this.selectedVideoSessions = new Set()
    
    // Initialize pagination state
    this.bulkPagination = {
      currentPage: 1,
      themesPerPage: 24,
      totalThemes: 0,
      filteredThemes: [],
      totalPages: 1
    }
    
    this.loadBulkThemes()
  }

  async loadBulkThemes() {
    try {
      // Load all themes by requesting a large limit to avoid pagination
      const response = await axios.get('/api/bulk/themes?limit=1000')
      this.bulkThemes = response.data.themes || []
      
      // Populate filter dropdowns
      this.populateDeployFilters()
      
      // Display themes
      this.renderBulkThemes(this.bulkThemes)
      
    } catch (error) {
      console.error('Error loading bulk themes:', error)
      document.getElementById('bulkThemeGrid').innerHTML = `
        <div class="col-span-full text-center py-8 text-red-400">
          <i class="fas fa-exclamation-triangle text-4xl mb-2"></i>
          <p>Error loading themes: ${error.message}</p>
        </div>
      `
    }
  }

  populateDeployFilters() {
    const categories = [...new Set(this.bulkThemes.map(t => t.category))].sort()
    const models = [...new Set(this.bulkThemes.map(t => t.model))].sort()
    
    const categorySelect = document.getElementById('deployFilterCategory')
    categorySelect.innerHTML = '<option value="">All Categories</option>'
    categories.forEach(cat => {
      const option = document.createElement('option')
      option.value = cat
      option.textContent = cat
      categorySelect.appendChild(option)
    })
    
    const modelSelect = document.getElementById('deployFilterModel')
    modelSelect.innerHTML = '<option value="">All Models</option>'
    models.forEach(model => {
      const option = document.createElement('option')
      option.value = model
      option.textContent = model
      modelSelect.appendChild(option)
    })
  }

  renderBulkThemes(themes) {
    const grid = document.getElementById('bulkThemeGrid')
    
    // Store filtered themes for pagination
    this.bulkPagination.filteredThemes = themes
    this.bulkPagination.totalThemes = themes.length
    this.bulkPagination.totalPages = Math.ceil(themes.length / this.bulkPagination.themesPerPage)
    
    // Update theme count display
    this.updateThemeCountDisplay()
    
    // Update pagination controls
    this.updatePaginationControls()
    
    if (themes.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-8">
          <i class="fas fa-inbox text-4xl text-gray-600 mb-2"></i>
          <p class="text-gray-400">No themes found</p>
          <p class="text-sm text-gray-500 mt-2">Use Bulk Upload to add themes first</p>
        </div>
      `
      return
    }
    
    // Calculate themes for current page
    const startIndex = (this.bulkPagination.currentPage - 1) * this.bulkPagination.themesPerPage
    const endIndex = startIndex + this.bulkPagination.themesPerPage
    const pageThemes = themes.slice(startIndex, endIndex)
    
    grid.innerHTML = pageThemes.map(theme => `
      <div class="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors">
        <div class="flex items-start justify-between mb-3">
          <div class="flex-1">
            <h4 class="font-semibold text-lg">${theme.theme}</h4>
            <p class="text-sm text-gray-400">${theme.category}</p>
          </div>
          <input 
            type="checkbox" 
            onchange="app.toggleThemeSelection(${theme.id})"
            ${this.selectedThemes.has(theme.id) ? 'checked' : ''}
            class="mt-1 w-5 h-5 text-orange-600 bg-gray-700 border-gray-600 rounded focus:ring-orange-500"
          >
        </div>
        
        <div class="space-y-2 mb-3">
          <div class="flex justify-between text-sm">
            <span class="text-gray-400">Tier:</span>
            <span class="px-2 py-1 rounded text-xs font-medium ${
              theme.tier === 'S-TIER' ? 'bg-yellow-900 text-yellow-300' :
              theme.tier === 'A-TIER' ? 'bg-green-900 text-green-300' :
              theme.tier === 'B-TIER' ? 'bg-blue-900 text-blue-300' :
              'bg-gray-900 text-gray-300'
            }">${theme.tier}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-400">Model:</span>
            <span class="text-white">${theme.model}</span>
          </div>
        </div>
        
        <div class="flex flex-wrap gap-1 mb-3">
          ${theme.tags.slice(0, 3).map(tag => 
            `<span class="px-2 py-1 bg-gray-700 text-xs rounded">${tag}</span>`
          ).join('')}
          ${theme.tags.length > 3 ? 
            `<span class="px-2 py-1 bg-gray-700 text-xs rounded">+${theme.tags.length - 3} more</span>` : 
            ''
          }
        </div>
        
        <div class="text-xs text-gray-500 border-t border-gray-700 pt-2">
          Added: ${new Date(theme.created_at).toLocaleDateString()}
        </div>
      </div>
    `).join('')
  }

  updateThemeCountDisplay() {
    const countDisplay = document.getElementById('themeCountDisplay')
    if (!countDisplay) return
    
    const { totalThemes, currentPage, totalPages } = this.bulkPagination
    
    if (totalThemes === 0) {
      countDisplay.innerHTML = '<span class="text-lg font-semibold text-white">No themes found</span>'
    } else {
      countDisplay.innerHTML = `
        <span class="text-lg font-semibold text-white">
          ${totalThemes.toLocaleString()} themes total, Page ${currentPage} of ${totalPages}
        </span>
      `
    }
  }

  updatePaginationControls() {
    const paginationControls = document.getElementById('paginationControls')
    const prevBtn = document.getElementById('prevPageBtn')
    const nextBtn = document.getElementById('nextPageBtn')
    const currentPageNum = document.getElementById('currentPageNum')
    const totalPagesNum = document.getElementById('totalPagesNum')
    
    if (!paginationControls) return
    
    const { currentPage, totalPages } = this.bulkPagination
    
    // Show/hide pagination controls
    if (totalPages > 1) {
      paginationControls.style.display = 'flex'
    } else {
      paginationControls.style.display = 'none'
    }
    
    // Update page numbers
    if (currentPageNum) currentPageNum.textContent = currentPage
    if (totalPagesNum) totalPagesNum.textContent = totalPages
    
    // Update button states
    if (prevBtn) {
      prevBtn.disabled = currentPage <= 1
    }
    if (nextBtn) {
      nextBtn.disabled = currentPage >= totalPages
    }
  }

  previousPage() {
    if (this.bulkPagination.currentPage > 1) {
      this.bulkPagination.currentPage--
      this.renderBulkThemes(this.bulkPagination.filteredThemes)
    }
  }

  nextPage() {
    if (this.bulkPagination.currentPage < this.bulkPagination.totalPages) {
      this.bulkPagination.currentPage++
      this.renderBulkThemes(this.bulkPagination.filteredThemes)
    }
  }

  filterBulkThemes() {
    const search = document.getElementById('deploySearch').value.toLowerCase()
    const category = document.getElementById('deployFilterCategory').value
    const tier = document.getElementById('deployFilterTier').value
    const model = document.getElementById('deployFilterModel').value
    
    const filtered = this.bulkThemes.filter(theme => {
      const matchesSearch = !search || 
        theme.theme.toLowerCase().includes(search) ||
        theme.category.toLowerCase().includes(search) ||
        theme.tags.some(tag => tag.toLowerCase().includes(search))
      
      const matchesCategory = !category || theme.category === category
      const matchesTier = !tier || theme.tier === tier
      const matchesModel = !model || theme.model === model
      
      return matchesSearch && matchesCategory && matchesTier && matchesModel
    })
    
    // Reset pagination to page 1 when filtering
    this.bulkPagination.currentPage = 1
    this.renderBulkThemes(filtered)
    this.updateSelectionUI()
  }

  toggleThemeSelection(themeId) {
    if (this.selectedThemes.has(themeId)) {
      this.selectedThemes.delete(themeId)
    } else {
      this.selectedThemes.add(themeId)
    }
    this.updateSelectionUI()
  }

  selectAllVisible() {
    const visibleCheckboxes = document.querySelectorAll('#bulkThemeGrid input[type="checkbox"]')
    visibleCheckboxes.forEach(cb => {
      if (!cb.checked) {
        cb.checked = true
        const themeId = parseInt(cb.getAttribute('onchange').match(/\\d+/)[0])
        this.selectedThemes.add(themeId)
      }
    })
    this.updateSelectionUI()
  }

  clearSelection() {
    this.selectedThemes.clear()
    const checkboxes = document.querySelectorAll('#bulkThemeGrid input[type="checkbox"]')
    checkboxes.forEach(cb => cb.checked = false)
    this.updateSelectionUI()
  }

  updateSelectionUI() {
    const count = this.selectedThemes.size
    const variations = count * 200 // 200 variations per theme
    
    document.getElementById('selectedCount').textContent = `${count} selected`
    document.getElementById('estimatedVariations').textContent = `${variations.toLocaleString()} variations total`
    
    const deployBtn = document.getElementById('deployBtn')
    const deleteBtn = document.getElementById('deleteBtn')
    deployBtn.disabled = count === 0
    deleteBtn.disabled = count === 0
  }

  // Video session selection functions
  toggleVideoSessionSelection(sessionId) {
    if (this.selectedVideoSessions.has(sessionId)) {
      this.selectedVideoSessions.delete(sessionId)
    } else {
      this.selectedVideoSessions.add(sessionId)
    }
    this.updateVideoSelectionUI()
  }

  clearVideoSessionSelection() {
    this.selectedVideoSessions.clear()
    const checkboxes = document.querySelectorAll('input[type="checkbox"][data-video-session]')
    checkboxes.forEach(cb => cb.checked = false)
    this.updateVideoSelectionUI()
  }

  updateVideoSelectionUI() {
    const count = this.selectedVideoSessions.size
    const ultraSimpleBtn = document.getElementById('ultraSimpleVideoBtn')
    if (ultraSimpleBtn) {
      ultraSimpleBtn.style.display = count > 0 ? 'inline-block' : 'none'
    }
    const bulkVideoBtn = document.getElementById('bulkVideoSelectedBtn')
    if (bulkVideoBtn) {
      bulkVideoBtn.style.display = count > 0 ? 'inline-block' : 'none'
      bulkVideoBtn.innerHTML = `<i class="fas fa-video mr-2"></i>Generate Videos for ${count} Selected Session${count === 1 ? '' : 's'}`
    }
    const clearBtn = document.getElementById('clearVideoSelectionBtn')
    if (clearBtn) {
      clearBtn.style.display = count > 0 ? 'inline-block' : 'none'
    }
  }

  async generateSelectedSessionsVideos() {
    if (this.selectedVideoSessions.size === 0) {
      alert('Please select at least one session')
      return
    }

    if (this.selectedVideoSessions.size > 10) {
      alert('Maximum 10 sessions can be processed at once')
      return
    }

    const sessionIds = Array.from(this.selectedVideoSessions)
    
    // Calculate total images across all sessions
    let totalImages = 0
    for (const sessionId of sessionIds) {
      try {
        const response = await axios.get(`/api/gallery/session/${sessionId}`)
        const images = response.data.images || []
        totalImages += images.filter(img => img.image_url).length
      } catch (error) {
        console.error(`Error getting info for session ${sessionId}:`, error)
      }
    }

    // Show aspect ratio selection modal
    this.showAspectRatioSelectionModal(sessionIds, totalImages)
  }

  showAspectRatioSelectionModal(sessionIds, totalImages) {
    const modal = document.getElementById('modal')
    modal.innerHTML = `
      <div class="bg-gray-800 p-6 rounded-lg max-w-md">
        <h2 class="text-xl font-bold mb-4">Simple Video Generation</h2>
        
        <p class="text-gray-300 mb-4">
          Generating videos for ${sessionIds.length} session${sessionIds.length === 1 ? '' : 's'}<br>
          Total images: ~${totalImages}
        </p>
        
        <!-- Aspect Ratio Selection -->
        <div class="mb-6">
          <h3 class="font-medium mb-3">Select Aspect Ratio</h3>
          <div class="space-y-3">
            <label class="flex items-center p-3 bg-gray-700 rounded cursor-pointer hover:bg-gray-600">
              <input type="radio" name="aspectRatio" value="1:1" checked class="mr-3">
              <div>
                <div class="font-medium">1:1 (Square)</div>
                <div class="text-sm text-gray-400">960x960 pixels</div>
              </div>
            </label>
            
            <label class="flex items-center p-3 bg-gray-700 rounded cursor-pointer hover:bg-gray-600">
              <input type="radio" name="aspectRatio" value="9:16" class="mr-3">
              <div>
                <div class="font-medium">9:16 (Vertical)</div>
                <div class="text-sm text-gray-400">720x1280 pixels - Mobile optimized</div>
              </div>
            </label>
          </div>
        </div>
        
        <!-- Video Settings (Fixed) -->
        <div class="mb-6">
          <h3 class="font-medium mb-3">Video Settings</h3>
          <div class="bg-gray-700 rounded-lg p-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm text-gray-300">Model:</span>
              <span class="text-sm text-green-400 font-medium">Pixverse v5</span>
            </div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm text-gray-300">Prompt:</span>
              <span class="text-sm text-green-400 font-medium">"subtle"</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-300">Concurrency:</span>
              <span class="text-sm text-green-400 font-medium">10 per session</span>
            </div>
          </div>
        </div>
        
        <div class="flex gap-3">
          <button onclick="app.closeModal()" 
                  class="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded">
            Cancel
          </button>
          <button onclick="app.confirmSimpleVideoGeneration()" 
                  class="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded">
            Generate Videos
          </button>
        </div>
      </div>
    `
    modal.classList.remove('hidden')
    
    // Store session info for later
    this.pendingVideoGeneration = { sessionIds, totalImages }
  }

  async confirmSimpleVideoGeneration() {
    // Get selected aspect ratio
    const selectedRatio = document.querySelector('input[name="aspectRatio"]:checked').value
    
    // Get stored session info
    const { sessionIds, totalImages } = this.pendingVideoGeneration
    
    // Close modal
    this.closeModal()
    
    try {
      // Show progress modal
      this.showBulkVideoProgressModal(`${sessionIds.length} sessions`, totalImages)
      
      // Call new simple video generation endpoint
      const response = await axios.post('/api/simple-video-generation', {
        sessionIds: sessionIds,
        aspectRatio: selectedRatio,
        prompt: 'subtle',
        videoModel: 'pixverse'
      })
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Simple video generation failed to start')
      }
      
      // Store video session ID for tracking
      this.currentVideoSessionId = response.data.videoSessionId
      console.log(`🎬 Simple video generation started: ${this.currentVideoSessionId}`)
      console.log(`📐 Aspect ratio: ${selectedRatio}`)
      console.log(`🎯 Sessions: ${sessionIds.length}`)
      
      // Show success message
      this.hideBulkVideoProgressModal()
      this.showNotification(`✅ Video generation started for ${sessionIds.length} sessions!`, 'success')
      
      // Clear selection
      this.clearVideoSessionSelection()
      
    } catch (error) {
      console.error('Simple video generation error:', error)
      this.hideBulkVideoProgressModal()
      alert('❌ Simple video generation failed: ' + error.message)
    }
  }

  // ULTRA SIMPLE VIDEO GENERATION - BRAND NEW
  async ultraSimpleVideoGeneration() {
    if (this.selectedVideoSessions.size === 0) {
      alert('Please select at least one session')
      return
    }
    
    const sessionIds = Array.from(this.selectedVideoSessions)
    
    console.log(`🚀 ULTRA SIMPLE VIDEO - Starting for ${sessionIds.length} sessions`)
    
    try {
      // Show simple progress
      alert(`Starting ULTRA SIMPLE video generation for ${sessionIds.length} session(s)...\n\nSettings:\n• Prompt: "subtle"\n• Aspect Ratio: 9:16\n• Model: Pixverse v5`)
      
      // Call ultra simple endpoint
      const response = await axios.post('/api/ultra-simple-video', {
        sessionIds: sessionIds
      })
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Ultra simple video generation failed')
      }
      
      console.log(`✅ ULTRA SIMPLE VIDEO - Complete:`, response.data)
      
      alert(`✅ Ultra simple video generation complete!\n\nTotal Images: ${response.data.totalImages}\nVideos Generated: ${response.data.videosGenerated}\nVideos Failed: ${response.data.videosFailed}\n\nVideo Session ID: ${response.data.videoSessionId}`)
      
      // Clear selection
      this.clearVideoSessionSelection()
      
      // Refresh gallery
      this.fetchGallerySessions()
      
    } catch (error) {
      console.error('Ultra simple video error:', error)
      alert('❌ Ultra simple video generation failed: ' + error.message)
    }
  }

  closeModal() {
    const modal = document.getElementById('modal')
    if (modal) {
      modal.classList.add('hidden')
    }
  }

  async deploySelectedThemes() {
    if (this.selectedThemes.size === 0) {
      alert('Please select at least one theme to deploy')
      return
    }

    const confirmed = confirm(
      `Deploy ${this.selectedThemes.size} themes with ${this.selectedThemes.size * 200} total variations?\\n\\n` +
      'This will generate prompts and images for production use.'
    )
    
    if (!confirmed) return

    try {
      // Get selected theme IDs
      const themeIds = Array.from(this.selectedThemes)
      
      // Get selected theme details for UI display
      const selectedThemeDetails = this.bulkThemes.filter(t => this.selectedThemes.has(t.id))
      
      // Show progress modal
      this.showSimpleProgressModal(selectedThemeDetails)
      
      // Call the proper bulk deployment API
      const response = await axios.post('/api/bulk/deploy', {
        themeIds: themeIds
      })
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Bulk deployment failed')
      }
      
      // Store session ID for cancellation and log streaming
      this.currentDeploySessionId = response.data.sessionId
      console.log(`🎯 Bulk deployment started with session ID: ${this.currentDeploySessionId}`)
      
      // Start real-time log streaming
      this.startLogStreaming(this.currentDeploySessionId, selectedThemeDetails.length)
      
    } catch (error) {
      console.error('Deploy error:', error)
      this.showDeploymentError(error.message)
    }
  }

  async deleteSelectedThemes() {
    if (this.selectedThemes.size === 0) {
      alert('Please select at least one theme to delete')
      return
    }

    // Get selected theme details for confirmation
    const selectedThemeDetails = this.bulkThemes.filter(t => this.selectedThemes.has(t.id))
    const themeNames = selectedThemeDetails.map(t => `• ${t.theme} (${t.category})`).join('\n')
    
    const confirmed = confirm(
      `⚠️ DELETE ${this.selectedThemes.size} theme profile${this.selectedThemes.size === 1 ? '' : 's'}?\n\n` +
      `This will PERMANENTLY delete from database:\n${themeNames}\n\n` +
      `❌ This action CANNOT be undone!\n\nContinue?`
    )
    
    if (!confirmed) return

    try {
      console.log('🗑️ Deleting selected themes:', Array.from(this.selectedThemes))
      
      // Show loading state on delete button
      const deleteBtn = document.getElementById('deleteBtn')
      const originalText = deleteBtn.innerHTML
      deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Deleting...'
      deleteBtn.disabled = true
      
      // Call backend delete API
      const response = await axios.delete('/api/bulk/theme-profiles', {
        data: { themeIds: Array.from(this.selectedThemes) }
      })
      
      if (response.data.success) {
        console.log('✅ Themes deleted successfully:', response.data.deleted_themes)
        
        // Clear selection
        this.selectedThemes.clear()
        
        // Refresh the theme list to remove deleted items
        await this.loadBulkThemes()
        
        // Show success message
        alert(`✅ Successfully deleted ${response.data.deleted_count} theme profile${response.data.deleted_count === 1 ? '' : 's'}:\n\n${response.data.deleted_themes.join('\n')}`)
        
      } else {
        throw new Error(response.data.error || 'Delete failed')
      }
      
    } catch (error) {
      console.error('Delete themes error:', error)
      alert('❌ Failed to delete themes: ' + (error.response?.data?.error || error.message))
      
      // Restore button state
      const deleteBtn = document.getElementById('deleteBtn')
      if (deleteBtn) {
        deleteBtn.innerHTML = originalText
        deleteBtn.disabled = this.selectedThemes.size === 0
      }
    }
  }

  // Start real-time log streaming for bulk deployment
  startLogStreaming(sessionId, totalThemes) {
    console.log(`🔄 Starting log streaming for session: ${sessionId}`)
    
    // Track deployment state
    let isCompleted = false
    let lastLogCount = 0
    
    // Poll logs every 2 seconds
    const logInterval = setInterval(async () => {
      try {
        if (isCompleted) {
          clearInterval(logInterval)
          return
        }
        
        const response = await axios.get(`/api/bulk/logs/${sessionId}`)
        
        if (!response.data.success) {
          console.error('Log streaming error:', response.data.error)
          return
        }
        
        const logs = response.data.logs || []
        
        // Process new logs only
        const newLogs = logs.slice(lastLogCount)
        lastLogCount = logs.length
        
        for (const log of newLogs) {
          this.processLogEntry(log, totalThemes)
          
          // Check if deployment is completed or cancelled
          if (log.step_type === 'deployment_completed' || 
              log.step_type === 'deployment_stopped' ||
              log.step_type === 'deployment_error') {
            isCompleted = true
            clearInterval(logInterval)
            
            // Enable close button
            document.getElementById('closeBtn').disabled = false
            
            if (log.step_type === 'deployment_completed') {
              this.showDeploymentComplete(totalThemes)
            } else if (log.step_type === 'deployment_error') {
              this.showDeploymentError(log.message)
            }
            break
          }
        }
        
      } catch (error) {
        console.error('Log polling error:', error)
        // Don't stop polling on network errors, just continue
      }
    }, 2000) // Poll every 2 seconds
    
    // Store interval for cleanup
    this.currentLogInterval = logInterval
  }
  
  // Process individual log entry and update UI accordingly
  processLogEntry(log, totalThemes) {
    const metadata = log.metadata || {}
    
    // Update status message
    document.getElementById('currentStatus').textContent = log.message
    
    // Add to status log with proper formatting
    const logIcon = {
      'info': '📋',
      'warning': '⚠️', 
      'error': '❌',
      'success': '✅'
    }[log.log_level] || '📋'
    
    this.addStatusLog(`${logIcon} ${log.message}`)
    
    // Update progress based on metadata from backend
    if (metadata.overall_progress !== undefined) {
      const progress = metadata.overall_progress
      document.getElementById('currentProgress').textContent = `${progress}%`
      document.getElementById('progressBar').style.width = `${progress}%`
    }
    
    // Update themes progress
    if (metadata.themes_completed !== undefined && metadata.total_themes !== undefined) {
      document.getElementById('themesProgress').textContent = 
        `${metadata.themes_completed} / ${metadata.total_themes}`
    }
    
    // Update total generated count
    if (metadata.total_images_completed !== undefined) {
      document.getElementById('totalGenerated').textContent = 
        `${metadata.total_images_completed} items`
    }
    
    // For debugging - log progress details
    if (metadata.overall_progress !== undefined) {
      console.log(`📊 Progress Update: ${metadata.overall_progress}% - ` +
        `Themes: ${metadata.themes_completed || 0}/${metadata.total_themes || totalThemes} - ` +
        `Images: ${metadata.total_images_completed || 0}/${metadata.total_images || totalThemes * 200}`)
    }
  }

  // Cancel active bulk deployment
  async cancelBulkDeploy() {
    if (!this.currentDeploySessionId) {
      alert('No active deployment to cancel')
      return
    }
    
    if (!confirm('Cancel the current bulk deployment?\n\nThis will stop processing but keep any completed themes.')) {
      return
    }
    
    try {
      // Show canceling state
      const cancelBtn = document.getElementById('cancelBtn')
      const originalText = cancelBtn.innerHTML
      cancelBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Cancelling...'
      cancelBtn.disabled = true
      
      // Call cancel API
      const response = await axios.post(`/api/bulk/cancel/${this.currentDeploySessionId}`)
      
      if (response.data.success) {
        // Update status
        document.getElementById('currentStatus').textContent = 'Deployment cancelled by user'
        document.getElementById('cancelBtn').style.display = 'none'
        document.getElementById('closeBtn').disabled = false
        
        // Stop log streaming
        if (this.currentLogInterval) {
          clearInterval(this.currentLogInterval)
          this.currentLogInterval = null
        }
        
        // Clear session ID
        this.currentDeploySessionId = null
        
        alert('✅ Deployment cancellation requested. Processing will stop after the current theme completes.')
      } else {
        throw new Error(response.data.error || 'Cancel failed')
      }
      
    } catch (error) {
      console.error('Cancel deployment error:', error)
      alert('❌ Failed to cancel deployment: ' + error.message)
      
      // Restore cancel button
      if (cancelBtn) {
        cancelBtn.innerHTML = originalText
        cancelBtn.disabled = false
      }
    }
  }

  // ==================== SIMPLIFIED DEPLOYMENT SYSTEM ====================
  
  showSimpleProgressModal(themes) {
    const modal = document.getElementById('deployModal')
    modal.classList.remove('hidden')
    
    // Initialize progress
    document.getElementById('currentProgress').textContent = '0%'
    document.getElementById('currentStatus').textContent = 'Preparing deployment...'
    document.getElementById('progressBar').style.width = '0%'
    document.getElementById('themesProgress').textContent = `0 / ${themes.length}`
    document.getElementById('totalGenerated').textContent = '0 items'
    document.getElementById('statusLog').innerHTML = '<div class="text-gray-400">Starting deployment...</div>'
    document.getElementById('closeBtn').disabled = true
  }
  
  async processThemeDeployment(theme, currentIndex, totalThemes, sessionId) {
    try {
      // Update status to show we're starting this theme
      this.updateProgress(
        Math.round(((currentIndex - 1) / totalThemes) * 100),
        `Processing "${theme.theme}" (${currentIndex}/${totalThemes})...`,
        currentIndex - 1,
        totalThemes,
        (currentIndex - 1) * 200
      )
      
      this.addStatusLog(`🎯 Starting ${theme.theme} (${theme.category})`)
      
      // Step 1: Generate 200 prompt variations with OpenAI (with proper prefix)
      this.addStatusLog(`🧠 Generating 200 variations with locked prefix...`)
      
      // Update progress during prompt generation (25% of theme progress)
      const promptProgress = Math.round(((currentIndex - 1) + 0.25) / totalThemes * 100)
      this.updateProgress(
        promptProgress,
        `Generating prompts for "${theme.theme}"...`,
        currentIndex - 1,
        totalThemes,
        (currentIndex - 1) * 200
      )
      
      const promptResponse = await axios.post('/api/bulk/generate-variations', {
        themeId: theme.id,
        masterPrompt: theme.master_prompt,
        themeName: theme.theme,
        tags: this.parseTags(theme.tags),
        category: theme.category,
        count: 200
      })
      
      if (!promptResponse.data.success) {
        throw new Error(`Prompt generation failed: ${promptResponse.data.error}`)
      }
      
      const variations = promptResponse.data.variations
      this.addStatusLog(`✅ Generated ${variations.length} variations with locked prefix`)
      
      // Step 2: Generate images in batches of 25 with progress updates
      this.addStatusLog(`🎨 Generating images with ${theme.model} (batches of 25)...`)
      
      let totalGenerated = 0
      const batchSize = 25
      const totalBatches = Math.ceil(variations.length / batchSize)
      
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const batchStart = batchIndex * batchSize
        const batchEnd = Math.min(batchStart + batchSize, variations.length)
        const batchVariations = variations.slice(batchStart, batchEnd)
        
        // Update progress for this batch (50% to 100% of theme progress)
        const batchProgress = Math.round(((currentIndex - 1) + 0.25 + (0.75 * (batchIndex + 1) / totalBatches)) / totalThemes * 100)
        this.updateProgress(
          batchProgress,
          `Batch ${batchIndex + 1}/${totalBatches} for "${theme.theme}"...`,
          currentIndex - 1,
          totalThemes,
          (currentIndex - 1) * 200 + totalGenerated
        )
        
        this.addStatusLog(`📊 Processing batch ${batchIndex + 1}/${totalBatches} (${batchVariations.length} prompts)`)
        
        try {
          const imageResponse = await axios.post('/api/bulk/generate-images', {
            themeId: theme.id,
            variations: batchVariations,
            model: theme.model,
            themeName: theme.theme,
            category: theme.category,
            tier: theme.tier,
            sessionId: sessionId // ✅ Pass sessionId through the chain
          })
          
          if (imageResponse.data.success) {
            const batchGenerated = imageResponse.data.generated_count || batchVariations.length
            totalGenerated += batchGenerated
            this.addStatusLog(`✅ Batch ${batchIndex + 1} complete: ${batchGenerated} items saved to gallery`)
          } else {
            throw new Error(`Batch ${batchIndex + 1} failed: ${imageResponse.data.error}`)
          }
          
        } catch (batchError) {
          console.error(`Error in batch ${batchIndex + 1}:`, batchError)
          this.addStatusLog(`❌ Batch ${batchIndex + 1} failed: ${batchError.message}`, 'error')
          // Continue with next batch
        }
      }
      
      // Final progress update for completed theme
      this.updateProgress(
        Math.round((currentIndex / totalThemes) * 100),
        `Completed "${theme.theme}" - ${totalGenerated} items generated`,
        currentIndex,
        totalThemes,
        currentIndex * 200
      )
      
      this.addStatusLog(`🎯 Finished ${theme.theme}: ${totalGenerated} items saved to gallery`, 'success')
      
    } catch (error) {
      console.error(`Error processing theme ${theme.theme}:`, error)
      this.addStatusLog(`❌ Error with ${theme.theme}: ${error.message}`, 'error')
      
      // Update progress to show error but continue
      this.updateProgress(
        Math.round((currentIndex / totalThemes) * 100),
        `Error with "${theme.theme}" - continuing...`,
        currentIndex,
        totalThemes,
        currentIndex * 200
      )
    }
  }
  
  updateProgress(percent, status, completedThemes, totalThemes, totalItems) {
    document.getElementById('currentProgress').textContent = `${percent}%`
    document.getElementById('currentStatus').textContent = status
    document.getElementById('progressBar').style.width = `${percent}%`
    document.getElementById('themesProgress').textContent = `${completedThemes} / ${totalThemes}`
    document.getElementById('totalGenerated').textContent = `${totalItems} items`
  }
  
  addStatusLog(message, type = 'info') {
    const log = document.getElementById('statusLog')
    const timestamp = new Date().toLocaleTimeString()
    const colorClass = {
      'error': 'text-red-400',
      'success': 'text-green-400', 
      'info': 'text-gray-300'
    }[type] || 'text-gray-300'
    
    const entry = document.createElement('div')
    entry.className = colorClass
    entry.innerHTML = `<span class="text-gray-500">[${timestamp}]</span> ${message}`
    
    log.appendChild(entry)
    log.scrollTop = log.scrollHeight
  }
  
  showDeploymentComplete(totalThemes) {
    this.updateProgress(100, `🎉 Deployment complete! All ${totalThemes} themes processed.`, totalThemes, totalThemes, totalThemes * 200)
    this.addStatusLog(`🎯 Deployment completed successfully!`, 'success')
    document.getElementById('closeBtn').disabled = false
    document.getElementById('closeBtn').innerHTML = '<i class="fas fa-check mr-2"></i>Complete'
    
    // Show success notification
    this.showNotification(`Successfully deployed ${totalThemes} themes with ${totalThemes * 200} total variations!`, 'success')
  }
  
  showDeploymentError(message) {
    document.getElementById('currentStatus').textContent = 'Deployment failed'
    this.addStatusLog(`❌ Deployment failed: ${message}`, 'error')
    document.getElementById('closeBtn').disabled = false
    document.getElementById('closeBtn').innerHTML = '<i class="fas fa-times mr-2"></i>Close'
  }
  
  // Parse tags handling both JSON array and double-escaped JSON string formats
  parseTags(tagsField) {
    try {
      if (!tagsField) return []
      
      if (Array.isArray(tagsField)) {
        // Already an array
        return tagsField
      }
      
      if (typeof tagsField === 'string') {
        // Check if it's a double-escaped JSON string (starts and ends with quotes and contains escaped quotes)
        if (tagsField.startsWith('"[') && tagsField.endsWith(']"') && tagsField.includes('\\"')) {
          // First parse to remove outer quotes, then parse the inner JSON array
          const unescaped = JSON.parse(tagsField)
          return JSON.parse(unescaped)
        } else if (tagsField.startsWith('[') && tagsField.endsWith(']')) {
          // Regular JSON array string
          return JSON.parse(tagsField)
        } else {
          // Treat as comma-separated string
          return tagsField.split(',').map(tag => tag.trim()).filter(tag => tag)
        }
      }
      
      return []
    } catch (e) {
      console.warn(`Failed to parse tags:`, tagsField, 'Error:', e.message)
      // Fallback: treat as comma-separated string
      if (typeof tagsField === 'string') {
        return tagsField.split(',').map(tag => tag.trim()).filter(tag => tag)
      }
      return []
    }
  }
  
  closeDeployModal() {
    document.getElementById('deployModal').classList.add('hidden')
    
    // Stop log streaming if still active
    if (this.currentLogInterval) {
      clearInterval(this.currentLogInterval)
      this.currentLogInterval = null
    }
    
    // Clear session ID
    this.currentDeploySessionId = null
    
    // Clear selection and refresh view
    this.selectedThemes.clear()
    this.updateSelectionUI()
    const checkboxes = document.querySelectorAll('#bulkThemeGrid input[type="checkbox"]')
    checkboxes.forEach(cb => cb.checked = false)
  }

  // ============= GALLERY SESSIONS FUNCTIONS =============

  // View Gallery by Session - show sessions list with bulk video options
  async viewGalleryBySession() {
    console.log('Switching to Gallery Sessions view')
    
    // Clear the session viewing flag when returning to session list
    this.viewingSessionId = null
    
    try {
      // Update button states
      document.getElementById('browseByTheme')?.classList.replace('bg-blue-600', 'bg-gray-700')
      document.getElementById('browseBySession')?.classList.replace('bg-gray-700', 'bg-blue-600')
      
      // Get sessions from API
      const response = await axios.get('/api/gallery/sessions')
      const sessions = this.sanitizeArray(response.data.sessions || [])
      
      // Update gallery grid to show sessions
      const galleryGrid = document.getElementById('galleryGrid')
      if (!galleryGrid) return
      
      // Add bulk video button for selected sessions (only show if sessions with images exist)
      const sessionsWithImages = sessions.filter(s => s.images_with_url > 0)
      const bulkVideoHeader = sessionsWithImages.length > 0 ? `
        <div class="col-span-full mb-4">
          <button id="ultraSimpleVideoBtn" 
                  onclick="app.ultraSimpleVideoGeneration()" 
                  class="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-all"
                  style="display: none;">
            <i class="fas fa-bolt mr-2"></i>ULTRA SIMPLE VIDEO (subtle + 9:16)
          </button>
          <button id="bulkVideoSelectedBtn" 
                  onclick="app.generateSelectedSessionsVideos()" 
                  class="ml-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-all"
                  style="display: none;">
            <i class="fas fa-video mr-2"></i>Generate Videos for Selected Sessions
          </button>
          <button onclick="app.clearVideoSessionSelection()" 
                  class="ml-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg font-medium transition-all"
                  style="display: none;"
                  id="clearVideoSelectionBtn">
            <i class="fas fa-times mr-2"></i>Clear Selection
          </button>
        </div>
      ` : ''
      
      if (sessions.length === 0) {
        galleryGrid.innerHTML = `
          <div class="col-span-full text-center py-12">
            <i class="fas fa-clock text-6xl text-gray-600 mb-4"></i>
            <h3 class="text-xl font-bold text-gray-400 mb-2">No Sessions Found</h3>
            <p class="text-gray-500">No bulk deployment sessions have created images yet.</p>
          </div>
        `
        return
      }
      
      galleryGrid.innerHTML = bulkVideoHeader + sessions.map(session => `
        <div class="col-span-full bg-gray-800 rounded-lg p-6 mb-4 animate-fadeIn">
          <div class="flex justify-between items-start mb-4">
            <div class="flex items-start gap-3">
              ${session.images_with_url > 0 && !session.session_id.startsWith('bulk-video-') ? `
                <input type="checkbox" 
                       data-video-session="${session.session_id}"
                       onchange="app.toggleVideoSessionSelection('${session.session_id}')"
                       ${this.selectedVideoSessions.has(session.session_id) ? 'checked' : ''}
                       class="mt-2 w-5 h-5 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500">
              ` : ''}
              <div>
                <h3 class="text-xl font-bold text-white mb-2">
                  ${session.is_video_session && session.status === 'processing' ? `
                    <i class="fas fa-spinner fa-spin mr-2 text-yellow-400"></i>
                  ` : `
                    <i class="fas fa-clock mr-2 text-blue-400"></i>
                  `}
                  Session: ${session.session_id}
                  ${session.is_video_session && session.status === 'processing' ? `
                    <span class="ml-2 px-2 py-1 bg-yellow-600 text-xs rounded-full">
                      <i class="fas fa-video mr-1"></i>Processing Videos
                    </span>
                  ` : session.is_video_session && session.status === 'complete' ? `
                    <span class="ml-2 px-2 py-1 bg-green-600 text-xs rounded-full">
                      <i class="fas fa-check mr-1"></i>Complete
                    </span>
                  ` : ''}
                </h3>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span class="text-gray-400">Images:</span>
                  <span class="text-white font-medium ml-2">${session.image_count}</span>
                </div>
                ${session.session_id.startsWith('bulk-video-') ? `
                <div>
                  <span class="text-gray-400">Videos:</span>
                  <span class="text-yellow-400 font-medium ml-2">${session.video_count || 0}</span>
                </div>
                ` : `
                <div>
                  <span class="text-gray-400">With URLs:</span>
                  <span class="text-green-400 font-medium ml-2">${session.images_with_url}</span>
                </div>
                `}
                <div>
                  <span class="text-gray-400">Theme:</span>
                  <span class="text-white font-medium ml-2">${session.theme_name || 'Unknown'}</span>
                </div>
                <div>
                  <span class="text-gray-400">Model:</span>
                  <span class="text-purple-400 font-medium ml-2">${session.model || 'Unknown'}</span>
                </div>
              </div>
                <div class="grid grid-cols-2 gap-4 text-sm mt-2">
                  <div>
                    <span class="text-gray-400">Started:</span>
                    <span class="text-white font-medium ml-2">${new Date(session.started_at).toLocaleString()}</span>
                  </div>
                  <div>
                    <span class="text-gray-400">Last Image:</span>
                    <span class="text-white font-medium ml-2">${new Date(session.last_image_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="flex gap-3">
            <button onclick="app.openSession('${session.session_id}')" 
                    class="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-all">
              <i class="fas fa-images mr-2"></i>View Images (${session.image_count})
            </button>
            ${session.images_with_url > 0 ? `
              <button onclick="app.showAspectRatioModal('${session.session_id}')" 
                      class="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-all">
                <i class="fas fa-video mr-2"></i>Bulk Video (${session.images_with_url} images)
              </button>
            ` : `
              <button disabled class="flex-1 px-4 py-2 bg-gray-600 rounded-lg font-medium cursor-not-allowed">
                <i class="fas fa-video mr-2"></i>No Images with URLs
              </button>
            `}
            ${session.is_video_session && session.status === 'processing' ? `
              <button onclick="app.cancelVideoGeneration('${session.session_id}')" 
                      class="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-all"
                      title="Cancel video generation">
                <i class="fas fa-stop mr-2"></i>Cancel
              </button>
            ` : ''}
            <button onclick="app.deleteSession('${session.session_id}')" 
                    class="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-all"
                    title="Delete entire session">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `).join('')
      
    } catch (error) {
      console.error('Error loading gallery sessions:', error)
      document.getElementById('galleryGrid').innerHTML = `
        <div class="col-span-full text-center py-12 text-red-400">
          <i class="fas fa-exclamation-triangle text-6xl mb-4"></i>
          <h3 class="text-xl font-bold mb-2">Error Loading Sessions</h3>
          <p>${error.message}</p>
        </div>
      `
    }
  }
  
  // Delete entire session
  async deleteSession(sessionId) {
    if (!confirm(`Delete entire session "${sessionId}"?\n\nThis will permanently delete ALL images and videos in this session.`)) {
      return
    }
    
    try {
      const response = await axios.delete(`/api/gallery/session/${sessionId}`)
      
      if (response.data.success) {
        alert(`✅ Successfully deleted session "${sessionId}"\n\n` +
              `📊 Deleted: ${response.data.deleted_images} images, ${response.data.deleted_videos} videos`)
        
        // Refresh the sessions view
        this.viewGalleryBySession()
      } else {
        throw new Error(response.data.message || 'Failed to delete session')
      }
      
    } catch (error) {
      console.error('Session delete error:', error)
      alert('❌ Failed to delete session: ' + error.message)
    }
  }
  
  // Open session images in detailed view
  // COMMENTED OUT: This was the broken openSession function that was showing all images
  // instead of filtering by session_id. The correct openSession function is at line 4931.
  // async openSession(sessionId) {
  //   try {
  //     // Switch to normal gallery view filtered by session
  //     this.showGallery()
  //     
  //     // Search for this session specifically
  //     const searchInput = document.getElementById('gallerySearch')
  //     if (searchInput) {
  //       searchInput.value = sessionId
  //       this.searchGallery(sessionId)
  //     }
  //     
  //   } catch (error) {
  //     console.error('Error opening session:', error)
  //   }
  // }
  



  // View Gallery by Theme - restore original theme-based view
  async viewGalleryByTheme() {
    console.log('Switching to Gallery Themes view')
    
    // Clear the session viewing flag when switching to theme view
    this.viewingSessionId = null
    
    // Update button states
    document.getElementById('browseBySession')?.classList.replace('bg-blue-600', 'bg-gray-700')
    document.getElementById('browseByTheme')?.classList.replace('bg-gray-700', 'bg-blue-600')
    
    // Reload the original gallery view
    await this.showGallery()
  }

  // Open specific session to view its images
  async openSession(sessionId) {
    console.log(`Opening session: ${sessionId}`)
    
    // Set flag to indicate we're viewing a specific session
    this.viewingSessionId = sessionId
    
    try {
      const response = await axios.get(`/api/gallery/session/${sessionId}`)
      const images = this.sanitizeArray(response.data.images || [])
      const safeSessionId = this.escapeHtml(sessionId)
      
      const galleryGrid = document.getElementById('galleryGrid')
      if (!galleryGrid) return
      
      // Hide gallery controls and pagination when viewing specific session
      document.querySelectorAll('#galleryControls, .pagination-controls, [id*="pagination"], #gallerySearch, #galleryThemeFilter, #galleryModelFilter, #galleryTypeFilter, #gallerySortFilter').forEach(el => el.style.display = 'none')
      
      if (images.length === 0) {
        galleryGrid.innerHTML = `
          <div class="col-span-full text-center py-12">
            <i class="fas fa-images text-6xl text-gray-600 mb-4"></i>
            <h3 class="text-xl font-bold text-gray-400 mb-2">No Images in Session</h3>
            <p class="text-gray-500">Session ${safeSessionId} has no images.</p>
            <button onclick="app.viewGalleryBySession()" 
                    class="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium">
              <i class="fas fa-arrow-left mr-2"></i>Back to Sessions
            </button>
          </div>
        `
        return
      }
      
      // Add back button and show images
      galleryGrid.innerHTML = `
        <div class="col-span-full mb-4">
          <div class="flex justify-between items-center">
            <h2 class="text-xl font-bold text-white">
              <i class="fas fa-images mr-2 text-blue-400"></i>
              Session ${safeSessionId} - ${images.length} Images
            </h2>
            <button onclick="app.viewGalleryBySession()" 
                    class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium">
              <i class="fas fa-arrow-left mr-2"></i>Back to Sessions
            </button>
          </div>
        </div>
        
        ${images.map((image, idx) => `
          <div class="group relative bg-gray-800 rounded-lg overflow-hidden animate-fadeIn" 
               style="animation-delay: ${Math.min(idx * 0.05, 1)}s">
            
            ${image.video_url_generated ? `
              <!-- Has video: show video player -->
              <div class="relative">
                <video controls class="w-full h-48 object-cover">
                  <source src="${image.video_url_generated}" type="video/mp4">
                  Your browser does not support the video tag.
                </video>
                <div class="absolute top-2 right-2 bg-purple-600 px-2 py-1 rounded text-xs">
                  <i class="fas fa-video mr-1"></i>Video
                </div>
              </div>
            ` : image.image_url ? `
              <!-- No video: show image as before -->
              <img src="${image.image_url}" 
                   alt="Generated Image" 
                   class="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                   onclick="app.showImageModal('${image.image_url}', '${image.prompt}', '${image.model}')">
            ` : `
              <!-- No image URL -->
              <div class="w-full h-48 bg-gray-700 flex items-center justify-center">
                <i class="fas fa-image text-4xl text-gray-500"></i>
              </div>
            `}
            
            <!-- Image Info Overlay -->
            <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-75 transition-all duration-300 flex flex-col justify-end p-3 opacity-0 group-hover:opacity-100">
              <p class="text-white text-sm font-medium truncate mb-2">${image.prompt}</p>
              <div class="flex justify-between items-center text-xs text-gray-300">
                <span class="bg-purple-600 px-2 py-1 rounded">${image.model}</span>
                ${image.image_url ? `
                  <button onclick="app.generateVideoFromImage('${image.image_url}', '${image.prompt}', '${image.id}')" 
                          class="bg-red-600 hover:bg-red-700 px-2 py-1 rounded">
                    <i class="fas fa-video"></i>
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
        `).join('')}
      `
      
    } catch (error) {
      console.error('Error loading session images:', error)
      alert('Error loading session: ' + error.message)
    }
  }

  // Delete all images for the currently selected theme
  async deleteAllThemeImages() {
    const themeFilter = document.getElementById('galleryThemeFilter')
    const selectedTheme = themeFilter ? themeFilter.value : ''
    
    if (!selectedTheme) {
      alert('Please select a specific theme first to delete its images.')
      return
    }
    
    // Get theme info from backend to confirm
    try {
      const statsResponse = await axios.get('/api/gallery/stats')
      const themes = statsResponse.data.popular_themes || []
      const theme = themes.find(t => t.theme_name === selectedTheme)
      
      if (!theme) {
        alert('Theme not found. Please refresh and try again.')
        return
      }
      
      const confirmMessage = `⚠️ DELETE ALL IMAGES FOR THEME: "${selectedTheme}"?\n\nThis will permanently delete:\n• All ${theme.count} images for this theme\n• All associated videos\n• This action CANNOT be undone!\n\nType "DELETE" to confirm:`
      
      const confirmation = prompt(confirmMessage)
      if (confirmation !== 'DELETE') {
        alert('Deletion cancelled. No images were deleted.')
        return
      }
      
      // Show loading state
      const button = event.target
      const originalText = button.innerHTML
      button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Deleting...'
      button.disabled = true
      
      // Call delete API using theme_name (URL encoded)
      const encodedThemeName = encodeURIComponent(selectedTheme)
      const response = await axios.delete(`/api/gallery/theme/${encodedThemeName}/images`)
      
      if (response.data.success) {
        alert(`✅ Successfully deleted ${response.data.deleted_images} images and ${response.data.deleted_videos} videos for theme "${selectedTheme}"`)
        
        // Refresh gallery to show updated state
        await this.showGallery()
      } else {
        throw new Error(response.data.error || 'Delete failed')
      }
      
    } catch (error) {
      console.error('Delete theme images error:', error)
      alert('❌ Failed to delete theme images: ' + error.message)
      
      // Restore button state
      if (button) {
        button.innerHTML = originalText
        button.disabled = false
      }
    }
  }

  // Show/hide theme management buttons based on current filter
  updateThemeManagement() {
    const themeFilter = document.getElementById('galleryThemeFilter')
    const themeManagement = document.getElementById('themeManagement')
    
    if (themeFilter && themeManagement) {
      const selectedTheme = themeFilter.value
      if (selectedTheme && selectedTheme !== '') {
        themeManagement.classList.remove('hidden')
      } else {
        themeManagement.classList.add('hidden')
      }
    }
  }

  // Show/hide session management buttons when viewing a specific session
  updateSessionManagement(searchValue, items) {
    // Check if we have a sessionManagement div, if not create it
    let sessionManagement = document.getElementById('sessionManagement')
    if (!sessionManagement) {
      // Find the theme management div and add session management after it
      const themeManagement = document.getElementById('themeManagement')
      if (themeManagement && themeManagement.parentNode) {
        sessionManagement = document.createElement('div')
        sessionManagement.id = 'sessionManagement'
        sessionManagement.className = 'hidden'
        themeManagement.parentNode.insertBefore(sessionManagement, themeManagement.nextSibling)
      } else {
        return // Can't find where to insert it
      }
    }
    
    // Check if search looks like a session ID and we have items from that session
    const isSessionSearch = searchValue && searchValue.length > 10 && items.length > 0
    const sessionId = searchValue
    
    if (isSessionSearch) {
      // Show session delete button
      sessionManagement.innerHTML = `
        <button onclick="app.deleteSessionFromGallery('${sessionId}')" 
                class="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium ml-2">
          <i class="fas fa-trash mr-2"></i>Delete Entire Session
        </button>
      `
      sessionManagement.classList.remove('hidden')
    } else {
      sessionManagement.classList.add('hidden')
    }
  }

  // Delete session from within the gallery view (wrapper for existing deleteSession function)
  async deleteSessionFromGallery(sessionId) {
    await this.deleteSession(sessionId)
    
    // After deletion, clear the search and refresh gallery
    const searchInput = document.getElementById('gallerySearch')
    if (searchInput) {
      searchInput.value = ''
    }
    
    // Refresh the gallery view
    this.showGallery()
  }

  // Show aspect ratio selection modal before video generation

  // Show bulk video progress modal (similar to bulk deployment)
  showBulkVideoProgressModal(sessionId, totalImages) {
    const modal = document.createElement('div')
    modal.id = 'bulkVideoProgressModal'
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'
    modal.innerHTML = `
      <div class="bg-gray-800 rounded-lg p-8 max-w-md w-full mx-4 border border-gray-700">
        <div class="text-center mb-6">
          <i class="fas fa-video text-6xl text-purple-400 mb-4"></i>
          <h3 class="text-2xl font-bold text-white mb-2">Generating Bulk Videos</h3>
          <p class="text-gray-300">Processing ${totalImages} images from session</p>
          <p class="text-sm text-gray-400">${sessionId}</p>
        </div>
        
        <div class="space-y-4">
          <div class="bg-gray-700 rounded-lg p-4">
            <div class="flex justify-between items-center mb-2">
              <span class="text-white font-medium">Overall Progress</span>
              <span id="bulkVideoOverallPercent" class="text-purple-400 font-bold">0%</span>
            </div>
            <div class="w-full bg-gray-600 rounded-full h-3">
              <div id="bulkVideoOverallBar" class="bg-purple-600 h-3 rounded-full transition-all duration-500" style="width: 0%"></div>
            </div>
            <div class="mt-2 text-sm text-gray-400">
              <span id="bulkVideoStatus">Preparing video generation...</span>
            </div>
          </div>
          
          <div class="bg-gray-700 rounded-lg p-4">
            <div class="text-sm space-y-2">
              <div class="flex justify-between">
                <span class="text-gray-300">Images:</span>
                <span class="text-white">${totalImages}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-300">Videos Generated:</span>
                <span id="bulkVideoSuccessCount" class="text-green-400">0</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-300">Videos Failed:</span>
                <span id="bulkVideoErrorCount" class="text-red-400">0</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="mt-6 text-center">
          <p class="text-sm text-gray-400">This process may take 10-30 minutes...</p>
          <p class="text-xs text-gray-500 mt-2">Processing in batches of 25 to optimize performance</p>
        </div>
        
        <div class="mt-6 flex justify-center gap-3">
          <button onclick="app.cancelBulkVideoGeneration()" id="cancelVideoBtn" class="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-all">
            <i class="fas fa-stop mr-2"></i>Cancel Video Generation
          </button>
          <button onclick="app.hideBulkVideoProgressModal()" id="closeVideoBtn" class="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-all disabled:opacity-50" disabled>
            <i class="fas fa-times mr-2"></i>Close
          </button>
        </div>
      </div>
    `
    
    document.body.appendChild(modal)
    
    // Start progress simulation (since we don't have real-time updates)
    // this.simulateBulkVideoProgress(totalImages)
  }

  // Hide bulk video progress modal
  hideBulkVideoProgressModal() {
    const modal = document.getElementById('bulkVideoProgressModal')
    if (modal) {
      modal.remove()
    }
    
    // Stop video log streaming if still active
    if (this.currentVideoLogInterval) {
      clearInterval(this.currentVideoLogInterval)
      this.currentVideoLogInterval = null
    }
    
    // Clear video session ID
    this.currentVideoSessionId = null
  }
  
  // Start real-time log streaming for bulk video generation
  startVideoLogStreaming(videoSessionId, totalImages, sourceSessionId) {
    console.log(`🔄 Starting video log streaming for session: ${videoSessionId}`)
    
    // Track video deployment state
    let isCompleted = false
    let lastLogCount = 0
    
    // Poll logs every 3 seconds (videos take longer than images)
    const logInterval = setInterval(async () => {
      try {
        if (isCompleted) {
          clearInterval(logInterval)
          return
        }
        
        const response = await axios.get(`/api/bulk/video-logs/${videoSessionId}`)
        
        if (!response.data.success) {
          console.error('Video log streaming error:', response.data.error)
          return
        }
        
        const logs = response.data.logs || []
        
        // Process new logs only
        const newLogs = logs.slice(lastLogCount)
        lastLogCount = logs.length
        
        for (const log of newLogs) {
          this.processVideoLogEntry(log, totalImages)
          
          // Check if video generation is completed or cancelled
          if (log.step_type === 'video_deployment_completed' || 
              log.step_type === 'video_deployment_stopped' ||
              log.step_type === 'video_deployment_error') {
            isCompleted = true
            clearInterval(logInterval)
            
            // Enable close button
            document.getElementById('closeVideoBtn').disabled = false
            
            if (log.step_type === 'video_deployment_completed') {
              const metadata = log.metadata || {}
              const message = `✅ Bulk video generation completed!
              
📦 Source Session: ${sourceSessionId}
🎬 Video Session: ${videoSessionId}
📊 Total Images: ${totalImages}
✅ Videos Generated: ${metadata.videos_success || 0}
❌ Videos Failed: ${metadata.videos_failed || 0}

${log.message}`
              
              setTimeout(() => {
                this.hideBulkVideoProgressModal()
                alert(message)
                this.viewGalleryBySession()
              }, 1000)
            } else if (log.step_type === 'video_deployment_error') {
              setTimeout(() => {
                this.hideBulkVideoProgressModal()
                alert('❌ Video generation failed: ' + log.message)
              }, 1000)
            }
            break
          }
        }
        
      } catch (error) {
        console.error('Video log polling error:', error)
        // Don't stop polling on network errors, just continue
      }
    }, 3000) // Poll every 3 seconds for video generation
    
    // Store interval for cleanup
    this.currentVideoLogInterval = logInterval
  }
  
  // Process individual video log entry and update UI accordingly
  processVideoLogEntry(log, totalImages) {
    const metadata = log.metadata || {}
    
    // Update status message
    const statusElement = document.getElementById('bulkVideoStatus')
    if (statusElement) {
      statusElement.textContent = log.message
    }
    
    // Update progress based on metadata from backend
    if (metadata.overall_progress !== undefined) {
      const progress = metadata.overall_progress
      const percentElement = document.getElementById('bulkVideoOverallPercent')
      const barElement = document.getElementById('bulkVideoOverallBar')
      
      if (percentElement) percentElement.textContent = `${progress}%`
      if (barElement) barElement.style.width = `${progress}%`
    }
    
    // Update success/error counts
    if (metadata.videos_success !== undefined) {
      const successElement = document.getElementById('bulkVideoSuccessCount')
      if (successElement) successElement.textContent = metadata.videos_success
    }
    
    if (metadata.videos_failed !== undefined) {
      const errorElement = document.getElementById('bulkVideoErrorCount')
      if (errorElement) errorElement.textContent = metadata.videos_failed
    }
    
    // For debugging - log progress details
    if (metadata.overall_progress !== undefined) {
      console.log(`🎬 Video Progress Update: ${metadata.overall_progress}% - ` +
        `Videos: ${metadata.videos_completed || 0}/${totalImages} - ` +
        `Success: ${metadata.videos_success || 0}, Failed: ${metadata.videos_failed || 0}`)
    }
  }
  
  // Cancel active bulk video generation
  async cancelBulkVideoGeneration() {
    if (!this.currentVideoSessionId) {
      alert('No active video generation to cancel')
      return
    }
    
    if (!confirm('Cancel the current bulk video generation?\n\n⚠️ IMPORTANT:\n• Videos already submitted to FAL will be cancelled if still in queue\n• Videos already processing cannot be cancelled and will complete\n• Cancellation is most effective in the first 10 seconds\n• Completed videos will be kept')) {
      return
    }
    
    try {
      // Show canceling state
      const cancelBtn = document.getElementById('cancelVideoBtn')
      const originalText = cancelBtn.innerHTML
      cancelBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Cancelling...'
      cancelBtn.disabled = true
      
      // Call cancel API
      const response = await axios.post(`/api/bulk/cancel-video/${this.currentVideoSessionId}`)
      
      if (response.data.success) {
        // Update status
        const statusElement = document.getElementById('bulkVideoStatus')
        if (statusElement) {
          statusElement.textContent = 'Video generation cancelled by user'
        }
        
        document.getElementById('cancelVideoBtn').style.display = 'none'
        document.getElementById('closeVideoBtn').disabled = false
        
        // Stop log streaming
        if (this.currentVideoLogInterval) {
          clearInterval(this.currentVideoLogInterval)
          this.currentVideoLogInterval = null
        }
        
        // Clear session ID
        this.currentVideoSessionId = null
        
        alert('✅ Cancellation requested!\n\n' +
              '• Videos still in FAL queue are being cancelled\n' +
              '• Videos already processing will complete\n' +
              '• Check logs for detailed cancellation results\n' +
              '• Completed videos are saved in your gallery')
      } else {
        throw new Error(response.data.error || 'Cancel failed')
      }
      
    } catch (error) {
      console.error('Cancel video generation error:', error)
      alert('❌ Failed to cancel video generation: ' + error.message)
      
      // Restore button
      const cancelBtn = document.getElementById('cancelVideoBtn')
      if (cancelBtn) {
        cancelBtn.innerHTML = '<i class="fas fa-stop mr-2"></i>Cancel Video Generation'
        cancelBtn.disabled = false
      }
    }
  }

  // Simulate bulk video progress (similar to bulk deployment)
  simulateBulkVideoProgress(totalImages) {
    const batchSize = 25
    const totalBatches = Math.ceil(totalImages / batchSize)
    const videoTimePerImage = 30000 // Estimate 30 seconds per video
    const totalEstimatedTime = totalImages * videoTimePerImage
    
    let currentProgress = 0
    let currentBatch = 1
    let successCount = 0
    let errorCount = 0
    
    const updateInterval = 2000 // Update every 2 seconds
    const progressPerUpdate = 100 / (totalEstimatedTime / updateInterval)
    
    const progressTimer = setInterval(() => {
      currentProgress += progressPerUpdate
      
      if (currentProgress >= 100) {
        currentProgress = 95 // Cap at 95% until real completion
      }
      
      // Update batch status
      const expectedBatch = Math.floor((currentProgress / 100) * totalBatches) + 1
      if (expectedBatch > currentBatch) {
        currentBatch = expectedBatch
      }
      
      // Simulate success/error counts
      const expectedCompleted = Math.floor((currentProgress / 100) * totalImages)
      successCount = Math.floor(expectedCompleted * 0.9) // Assume 90% success rate
      errorCount = expectedCompleted - successCount
      
      // Update UI
      document.getElementById('bulkVideoOverallPercent').textContent = Math.floor(currentProgress) + '%'
      document.getElementById('bulkVideoOverallBar').style.width = currentProgress + '%'
      document.getElementById('bulkVideoStatus').textContent = `Processing batch ${Math.min(currentBatch, totalBatches)}/${totalBatches} - Generating videos...`
      document.getElementById('bulkVideoSuccessCount').textContent = successCount
      document.getElementById('bulkVideoErrorCount').textContent = errorCount
    }, updateInterval)
    
    // Store timer reference for cleanup
    this.bulkVideoProgressTimer = progressTimer
  }

  // ==================== VIDEO CANCELLATION ====================
  
  // Cancel video generation for a session
  async cancelVideoGeneration(sessionId) {
    try {
      console.log(`🛑 Cancelling video generation for session: ${sessionId}`)
      
      const response = await axios.post('/api/video/cancel', {
        sessionId: sessionId
      })
      
      if (response.data.success) {
        console.log(`✅ Successfully cancelled ${response.data.cancelledCount} requests`)
        alert(`✅ Cancelled ${response.data.cancelledCount} video generation requests`)
        
        // Refresh gallery to show updated status
        this.showGallery()
      } else {
        console.log(`❌ Failed to cancel: ${response.data.message}`)
        alert(`❌ ${response.data.message}`)
      }
      
    } catch (error) {
      console.error('Cancel video generation error:', error)
      alert(`❌ Error cancelling video generation: ${error.message}`)
    }
  }

  // ==================== MIDJOURNEY IMPORT ====================
  showMidjourneyImport() {
  this.currentView = 'midjourney-import'
  
  // Initialize if needed
  if (!this.midjourneyJobs) {
    this.midjourneyJobs = new Map() // Track active jobs
  }
  
  document.getElementById('app').innerHTML = `
    <div class="max-w-6xl mx-auto p-6">
      <!-- Header -->
      <div class="mb-6">
        <div class="flex justify-between items-center mb-4">
          <h1 class="text-3xl font-bold">
            <i class="fas fa-wand-magic-sparkles mr-2 text-purple-500"></i>
            Midjourney Import
          </h1>
          <button onclick="app.showDashboard()" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg">
            <i class="fas fa-arrow-left mr-2"></i>Back to Dashboard
          </button>
        </div>
        <p class="text-gray-400">Import 50 Midjourney prompts → Generate 200 images (4 variations each)</p>
      </div>

      <!-- Input Section -->
      <div class="bg-gray-800 rounded-lg p-6 mb-6">
        <h3 class="text-xl font-semibold mb-4">New Generation Batch</h3>
        
        <!-- Theme/Category Input -->
        <div class="mb-4">
          <label class="block text-sm font-medium mb-2 text-gray-400">Category</label>
          <input 
            type="text" 
            id="midjourneyCategory"
            placeholder="e.g., Urban & Industrial, Nature, Fantasy"
            class="w-full px-4 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-purple-500"
          >
        </div>
        
        <div class="mb-4">
          <label class="block text-sm font-medium mb-2 text-gray-400">Theme Name</label>
          <input 
            type="text" 
            id="midjourneyTheme"
            placeholder="e.g., Officecore, Forestcore, Cyberpunk Aesthetics"
            class="w-full px-4 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-purple-500"
          >
        </div>
        
        <!-- Prompts Input -->
        <div class="mb-4">
          <label class="block text-sm font-medium mb-2 text-gray-400">
            Midjourney Prompts (up to 50 prompts)
          </label>
          <textarea 
            id="midjourneyPrompts"
            placeholder="Just paste your Midjourney prompts! Each prompt can be multiple lines.

For best results:
✓ Leave blank lines between prompts
✓ Include parameters like --sref, --v, --stylize at end of each prompt
✓ Multi-line prompts are automatically detected

Example:
gen z girl laughing with skateboard tucked under arm 
shot on sony alpha 1 golden light gritty
curbside candid moment --sref 2414818143 --v 7 --stylize 1000

another prompt here..."
            class="w-full h-64 px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-purple-500 font-mono text-sm"
          ></textarea>
          <div class="mt-2 text-sm text-gray-500">
            <span id="promptCount">0</span> / 50 prompts detected
          </div>
        </div>
        
        <!-- Submit Button -->
        <button 
          onclick="app.submitMidjourneyBatch()" 
          id="submitMidjourneyBtn"
          class="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-all"
        >
          <i class="fas fa-paper-plane mr-2"></i>Start Generation
        </button>
      </div>
      
      <!-- Active Jobs Dashboard -->
      <div class="bg-gray-800 rounded-lg p-6">
        <h3 class="text-xl font-semibold mb-4">
          <i class="fas fa-tasks mr-2"></i>Active Generation Jobs
        </h3>
        <div id="midjourneyJobsList">
          <p class="text-gray-500 text-center py-8">No active jobs. Submit prompts above to start.</p>
        </div>
      </div>
    </div>
  `
  
  // Add smart prompt counter with real-time parsing
  document.getElementById('midjourneyPrompts').addEventListener('input', (e) => {
    const prompts = this.parseSmartPrompts(e.target.value)
    document.getElementById('promptCount').textContent = prompts.length
  })
  
  // Start polling for job updates
  this.startMidjourneyPolling()
  }

  async submitMidjourneyBatch() {
  const category = document.getElementById('midjourneyCategory').value.trim()
  const theme = document.getElementById('midjourneyTheme').value.trim()
  const promptsText = document.getElementById('midjourneyPrompts').value
  const prompts = this.parseSmartPrompts(promptsText)
  
  // Validation
  if (!category) {
    alert('Please enter a category')
    return
  }
  
  if (!theme) {
    alert('Please enter a theme name')
    return
  }
  
  if (prompts.length < 1 || prompts.length > 50) {
    alert(`You have ${prompts.length} prompts. Please enter between 1 and 50 prompts.`)
    return
  }
  
  // Disable submit button
  const submitBtn = document.getElementById('submitMidjourneyBtn')
  submitBtn.disabled = true
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Submitting...'
  
  try {
    const response = await axios.post('/api/midjourney/start-batch', {
      category: category,
      theme: theme,
      prompts: prompts
    })
    
    if (response.data.success) {
      // Add to jobs tracking
      this.midjourneyJobs.set(response.data.sessionId, {
        sessionId: response.data.sessionId,
        theme: theme,
        promptCount: prompts.length,
        startTime: Date.now(),
        status: 'processing'
      })
      
      // Clear form
      document.getElementById('midjourneyCategory').value = ''
      document.getElementById('midjourneyTheme').value = ''
      document.getElementById('midjourneyPrompts').value = ''
      document.getElementById('promptCount').textContent = '0'
      
      // Update jobs display
      this.updateMidjourneyJobsList()
      
      alert(`✅ Batch started! Session ID: ${response.data.sessionId}`)
    }
    
  } catch (error) {
    console.error('Submit error:', error)
    alert('Failed to start batch: ' + (error.response?.data?.error || error.message))
  } finally {
    submitBtn.disabled = false
    submitBtn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>Start Generation'
  }
  }

  parseSmartPrompts(text) {
  if (!text || !text.trim()) {
    return []
  }
  
  // Midjourney parameter patterns to detect prompt endings
  const mjParamPattern = /--(sref|v|version|stylize|s|ar|aspect|chaos|c|quality|q|weird|w|tile|no|style|sw|cw|iw|video|seed|stop|uplight|upbeta|upanime|niji|test|testp|creative|hd|same)\s+/i
  
  const lines = text.split('\n')
  const prompts = []
  let currentPrompt = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    
    // Skip empty lines - they're natural separators
    if (!line) {
      if (currentPrompt.length > 0) {
        prompts.push(currentPrompt.join(' ').trim())
        currentPrompt = []
      }
      continue
    }
    
    currentPrompt.push(line)
    
    // Check if this line ends with Midjourney parameters
    const hasParams = mjParamPattern.test(line)
    
    // Check if next line exists and looks like a new prompt start
    const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : null
    const nextLooksLikeNewPrompt = nextLine && 
      nextLine.length > 0 && 
      /^[A-Z]/.test(nextLine) && 
      !nextLine.startsWith('--')
    
    // Decide if we should end the current prompt
    if (hasParams && (nextLooksLikeNewPrompt || !nextLine)) {
      // Line has parameters and next line is new prompt or end of text
      prompts.push(currentPrompt.join(' ').trim())
      currentPrompt = []
    }
  }
  
  // Add any remaining prompt
  if (currentPrompt.length > 0) {
    prompts.push(currentPrompt.join(' ').trim())
  }
  
  return prompts
  }

  startMidjourneyPolling() {
  // Stop existing interval if any
  if (this.midjourneyPollInterval) {
    clearInterval(this.midjourneyPollInterval)
  }
  
  // Poll every 5 seconds
  this.midjourneyPollInterval = setInterval(() => {
    if (this.currentView === 'midjourney-import') {
      this.updateMidjourneyJobs()
    } else {
      // Stop polling if not on midjourney page
      clearInterval(this.midjourneyPollInterval)
    }
  }, 5000)
  
  // Initial update
  this.updateMidjourneyJobs()
  }

  async updateMidjourneyJobs() {
  // Update status for each active job
  for (const [sessionId, job] of this.midjourneyJobs) {
    if (job.status === 'processing') {
      try {
        const response = await axios.get(`/api/midjourney/status/${sessionId}`)
        
        // Update job status
        job.status = response.data.status
        job.imageCount = response.data.imageCount
        
        if (response.data.status === 'complete') {
          job.completedTime = Date.now()
        }
        
      } catch (error) {
        console.error(`Failed to update job ${sessionId}:`, error)
      }
    }
  }
  
  // Update display
  this.updateMidjourneyJobsList()
  }

  updateMidjourneyJobsList() {
  const container = document.getElementById('midjourneyJobsList')
  if (!container) return
  
  if (this.midjourneyJobs.size === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-8">No active jobs. Submit prompts above to start.</p>'
    return
  }
  
  const jobsHtml = Array.from(this.midjourneyJobs.values()).map(job => {
    const elapsed = Math.floor((Date.now() - job.startTime) / 1000)
    const minutes = Math.floor(elapsed / 60)
    const seconds = elapsed % 60
    
    let statusIcon = ''
    let statusColor = ''
    let actionButton = ''
    
    if (job.status === 'processing') {
      statusIcon = '<i class="fas fa-spinner fa-spin mr-2"></i>'
      statusColor = 'text-yellow-400'
    } else if (job.status === 'complete') {
      statusIcon = '<i class="fas fa-check-circle mr-2"></i>'
      statusColor = 'text-green-400'
      actionButton = `
        <button onclick="app.viewSessionInGallery('${job.sessionId}')" 
                class="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm">
          <i class="fas fa-images mr-1"></i>View in Gallery
        </button>
      `
    } else if (job.status === 'error') {
      statusIcon = '<i class="fas fa-exclamation-triangle mr-2"></i>'
      statusColor = 'text-red-400'
    }
    
    return `
      <div class="bg-gray-700 rounded-lg p-4 mb-3">
        <div class="flex justify-between items-center">
          <div>
            <h4 class="font-semibold text-lg">${job.theme}</h4>
            <p class="text-sm text-gray-400">
              Session: ${job.sessionId.substring(0, 30)}...
            </p>
            <p class="text-sm ${statusColor} mt-1">
              ${statusIcon}
              ${job.status === 'processing' ? 'Generating' : job.status === 'complete' ? 'Completed' : 'Error'}
              ${job.imageCount ? ` - ${job.imageCount} images` : ''}
            </p>
          </div>
          <div class="text-right">
            <p class="text-sm text-gray-400">
              ${minutes}m ${seconds}s
            </p>
            ${actionButton}
          </div>
        </div>
      </div>
    `
  }).join('')
  
  container.innerHTML = jobsHtml
  }

  viewSessionInGallery(sessionId) {
  // Navigate to gallery with session filter
  this.showGallery()
  
  // After gallery loads, search for this session
  setTimeout(() => {
    document.getElementById('gallerySearch').value = sessionId
    this.searchGallery()
  }, 500)
  }

  // ==================== NANO BANANA ====================
  
  showNanoBanana() {
    const app = document.getElementById('app')
    app.innerHTML = `
      <div class="min-h-screen bg-gray-900 text-white">
        <div class="container mx-auto p-6 max-w-4xl">
          <button onclick="app.showDashboard()" class="mb-6 text-gray-400 hover:text-white transition-all">
            <i class="fas fa-arrow-left mr-2"></i>Back to Dashboard
          </button>

          <div class="bg-gray-800 rounded-lg p-8 border border-gray-700 animate-fadeIn">
            <h1 class="text-3xl font-bold mb-2">
              <i class="fas fa-image mr-2 text-yellow-500"></i>
              Nano Banana Image Editor
            </h1>
            <p class="text-gray-400 mb-6">Upload 1 reference image + up to 200 prompts to generate edited images</p>

            <!-- Reference Image Upload -->
            <div class="mb-6">
              <label class="block text-sm font-medium mb-2">Reference Image</label>
              <input type="file" 
                     id="nanoBananaReferenceImage" 
                     accept="image/*" 
                     onchange="app.handleNanoBananaImageUpload(event)"
                     class="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-yellow-500 transition-all">
              <div id="nanoBananaImagePreview" class="mt-4"></div>
            </div>

            <!-- Category Dropdown -->
            <div class="mb-6">
              <label class="block text-sm font-medium mb-2">Category</label>
              <select id="nanoBananaCategory" class="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-yellow-500 transition-all">
                <option>Fitness</option>
                <option>Fashion</option>
                <option>Beauty</option>
                <option>Food</option>
                <option>Travel</option>
                <option>Lifestyle</option>
                <option>Business</option>
                <option>Technology</option>
              </select>
            </div>

            <!-- Theme Input -->
            <div class="mb-6">
              <label class="block text-sm font-medium mb-2">Theme Name</label>
              <input type="text" 
                     id="nanoBananaTheme" 
                     placeholder="e.g., Urban Backgrounds"
                     class="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-yellow-500 transition-all">
            </div>

            <!-- Prompts Textarea -->
            <div class="mb-6">
              <label class="block text-sm font-medium mb-2">Prompts (1-200)</label>
              <textarea id="nanoBananaPrompts" 
                        rows="15" 
                        oninput="app.updateNanoBananaPromptCount()"
                        placeholder="Paste your prompts here. Use double spaces between paragraphs or single lines for short prompts."
                        class="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-yellow-500 transition-all font-mono text-sm"></textarea>
              <div class="text-sm text-gray-400 mt-2">Detected: <span id="nanoBananaPromptCount" class="font-bold text-yellow-500">0</span> prompts</div>
            </div>

            <!-- Action Buttons -->
            <div class="flex gap-4">
              <button onclick="app.previewNanoBananaPrompts()" 
                      class="px-6 py-3 bg-gray-600 hover:bg-gray-700 rounded-lg font-medium transition-all">
                <i class="fas fa-eye mr-2"></i>Preview Parsed Prompts
              </button>
              <button onclick="app.submitNanoBananaBatch()" 
                      class="flex-1 px-6 py-3 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-bold transition-all">
                <i class="fas fa-magic mr-2"></i>Start Generation
              </button>
            </div>
          </div>

          <!-- Active Jobs Section -->
          <div id="nanoBananaJobs" class="mt-8"></div>
        </div>
      </div>
    `
    
    // Initialize state
    this.nanoBananaReferenceImage = null
    this.nanoBananaJobs = []
    
    // Start polling for active jobs
    this.updateNanoBananaJobs()
    this.startNanoBananaPolling()
  }

  handleNanoBananaImageUpload(event) {
    const file = event.target.files[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUri = e.target.result
      this.nanoBananaReferenceImage = dataUri
      
      // Show preview
      const preview = document.getElementById('nanoBananaImagePreview')
      preview.innerHTML = `
        <div class="flex items-center gap-4 p-3 bg-gray-700 rounded">
          <img src="${dataUri}" class="w-20 h-20 object-cover rounded">
          <div class="flex-1">
            <div class="font-medium text-green-400">✓ Image loaded</div>
            <div class="text-sm text-gray-400">${file.name}</div>
          </div>
        </div>
      `
    }
    reader.readAsDataURL(file)
  }

  updateNanoBananaPromptCount() {
    const prompts = this.parseNanoBananaPrompts(document.getElementById('nanoBananaPrompts').value)
    document.getElementById('nanoBananaPromptCount').textContent = prompts.length
  }

  parseNanoBananaPrompts(text) {
    if (!text || !text.trim()) return []
    
    // Try double newline first (for paragraphs)
    let prompts = text.split(/\n\s*\n+/).map(p => p.trim()).filter(p => p.length > 0)
    
    // Fallback if < 10 prompts
    if (prompts.length < 10) {
      prompts = text.split('\n').map(p => p.trim()).filter(p => p.length > 0)
    }
    
    return prompts
  }

  previewNanoBananaPrompts() {
    const text = document.getElementById('nanoBananaPrompts').value
    const prompts = this.parseNanoBananaPrompts(text)
    
    if (prompts.length === 0) {
      alert('No prompts detected. Please paste your prompts first.')
      return
    }
    
    const method = prompts.length >= 10 ? 'Double newline (paragraphs)' : 'Single newline (fallback)'
    
    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4'
    modal.innerHTML = `
      <div class="bg-gray-800 rounded-lg p-6 max-w-4xl max-h-[80vh] overflow-y-auto">
        <h2 class="text-2xl font-bold mb-4">Preview Parsed Prompts</h2>
        <div class="mb-4 p-3 bg-gray-700 rounded">
          <div class="text-lg font-bold text-yellow-500">Detected: ${prompts.length} prompts</div>
          <div class="text-sm text-gray-400">Parsing method: ${method}</div>
        </div>
        <div class="space-y-2">
          ${prompts.map((p, i) => `
            <div class="p-3 bg-gray-700 rounded">
              <div class="font-bold text-sm text-gray-400 mb-1">Prompt ${i + 1}:</div>
              <div class="text-sm">${p.substring(0, 200)}${p.length > 200 ? '...' : ''}</div>
            </div>
          `).join('')}
        </div>
        <button onclick="this.closest('.fixed').remove()" 
                class="mt-6 w-full px-4 py-3 bg-gray-600 hover:bg-gray-700 rounded-lg font-bold transition-all">
          Close
        </button>
      </div>
    `
    document.body.appendChild(modal)
  }

  async submitNanoBananaBatch() {
    // Validate inputs
    if (!this.nanoBananaReferenceImage) {
      alert('Please upload a reference image')
      return
    }
    
    const category = document.getElementById('nanoBananaCategory').value
    const theme = document.getElementById('nanoBananaTheme').value.trim()
    const promptsText = document.getElementById('nanoBananaPrompts').value
    const prompts = this.parseNanoBananaPrompts(promptsText)
    
    if (!theme) {
      alert('Please enter a theme name')
      return
    }
    
    if (prompts.length < 1 || prompts.length > 200) {
      alert(`Invalid number of prompts: ${prompts.length}. Please provide between 1 and 200 prompts.`)
      return
    }
    
    if (!confirm(`Start generation for ${prompts.length} prompts?\n\nThis will use the Nano Banana model.`)) {
      return
    }
    
    try {
      const response = await axios.post('/api/nano-banana/start-batch', {
        category,
        theme,
        referenceImageDataUri: this.nanoBananaReferenceImage,
        prompts
      })
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to start batch')
      }
      
      alert(`✓ Generation started!\n\nSession ID: ${response.data.sessionId}\n${prompts.length} images will be generated.`)
      
      // Clear form
      document.getElementById('nanoBananaPrompts').value = ''
      document.getElementById('nanoBananaTheme').value = ''
      this.nanoBananaReferenceImage = null
      document.getElementById('nanoBananaImagePreview').innerHTML = ''
      document.getElementById('nanoBananaReferenceImage').value = ''
      this.updateNanoBananaPromptCount()
      
      // Refresh jobs list
      this.updateNanoBananaJobs()
      
    } catch (error) {
      console.error('Nano Banana batch submission error:', error)
      alert(`Failed to start batch: ${error.response?.data?.error || error.message}`)
    }
  }

  startNanoBananaPolling() {
    // Poll every 3 seconds for job updates
    if (this.nanoBananaPollingInterval) {
      clearInterval(this.nanoBananaPollingInterval)
    }
    this.nanoBananaPollingInterval = setInterval(() => {
      if (this.currentView === 'nanoBanana') {
        this.updateNanoBananaJobs()
      }
    }, 3000)
  }

  async updateNanoBananaJobs() {
    try {
      // Get list of recent Nano Banana sessions from gallery
      const response = await axios.get('/api/gallery/sessions')
      const sessions = this.sanitizeArray(response.data.sessions || [])
      
      // Filter to only Nano Banana sessions
      const nanoBananaSessions = sessions.filter(s => s.session_id.startsWith('bulk-nano-banana-'))
      
      // Display active jobs
      this.updateNanoBananaJobsList(nanoBananaSessions.slice(0, 5))
      
    } catch (error) {
      console.error('Error updating Nano Banana jobs:', error)
    }
  }

  updateNanoBananaJobsList(sessions) {
    const container = document.getElementById('nanoBananaJobs')
    if (!container) return
    
    if (sessions.length === 0) {
      container.innerHTML = ''
      return
    }
    
    const jobsHtml = `
      <h2 class="text-2xl font-bold mb-4">Recent Generations</h2>
      <div class="space-y-4">
        ${sessions.map(s => `
          <div class="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div class="flex justify-between items-start mb-2">
              <div>
                <h3 class="text-xl font-bold text-yellow-500">${s.model || 'NANO_BANANA'}</h3>
                <div class="text-sm text-gray-400">${s.session_id}</div>
              </div>
              <div class="text-right">
                <div class="text-2xl font-bold text-white">${s.images_with_url || 0}</div>
                <div class="text-sm text-gray-400">images</div>
              </div>
            </div>
            <button onclick="app.viewSessionInGallery('${s.session_id}')" 
                    class="mt-3 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded font-medium transition-all">
              <i class="fas fa-images mr-2"></i>View in Gallery
            </button>
          </div>
        `).join('')}
      </div>
    `
    container.innerHTML = jobsHtml
  }

  // ==================== MANUAL PROMPT GROUPING ====================
  
  async showManualPromptGroupingModal(sessionIds, aspectRatio, videoModel) {
    console.log('Opening Manual Prompt Grouping modal...')
    
    try {
      // Fetch ALL images from the selected sessions (limit=1000 to get all)
      const response = await axios.get(`/api/gallery/search?sessionIds=${sessionIds.join(',')}&limit=1000`)
      const images = response.data.images || []
      
      console.log(`Loaded ${images.length} images from ${sessionIds.length} session(s)`)
      
      if (images.length === 0) {
        alert('No images found in selected sessions')
        return
      }
      
      this.showPromptGroupingInterface(images, sessionIds, aspectRatio, videoModel)
      
    } catch (error) {
      console.error('Error loading images for grouping:', error)
      alert('Failed to load images: ' + error.message)
    }
  }

  showPromptGroupingInterface(images, sessionIds, aspectRatio, videoModel) {
    // Initialize grouping state
    this.promptGroupings = {
      images: images,
      sessionIds: sessionIds,
      aspectRatio: aspectRatio,
      videoModel: videoModel,
      selectedIndices: new Set(),
      groupings: new Map(), // Map of imageId -> custom video prompt
      isSelecting: false,
      selectionStart: null
    }
    
    const modal = document.createElement('div')
    modal.id = 'promptGroupingModal'
    modal.className = 'fixed inset-0 bg-black bg-opacity-90 z-50 overflow-y-auto'
    modal.innerHTML = `
      <div class="container mx-auto p-6 max-w-6xl">
        <h2 class="text-3xl font-bold mb-2">Assign Custom Video Prompts</h2>
        <p class="text-gray-400 mb-6">Click and drag to select images, then press <kbd class="px-2 py-1 bg-gray-700 rounded text-yellow-400 font-bold">ENTER</kbd> to assign a prompt</p>
        
        <!-- Counters -->
        <div class="flex gap-6 mb-6 p-4 bg-gray-800 rounded-lg">
          <div>
            <span class="text-gray-400">Total Images:</span>
            <span id="totalImagesCount" class="ml-2 font-bold text-white">${images.length}</span>
          </div>
          <div>
            <span class="text-gray-400">Grouped:</span>
            <span id="groupedCount" class="ml-2 font-bold text-green-400">0</span>
          </div>
          <div>
            <span class="text-gray-400">Ungrouped:</span>
            <span id="ungroupedCount" class="ml-2 font-bold text-gray-400">${images.length}</span>
          </div>
        </div>
        
        <!-- Prompt List (scrollable) -->
        <div id="promptList" class="overflow-y-auto max-h-[60vh] space-y-2 mb-6 p-4 bg-gray-800 rounded-lg">
          ${images.map((image, index) => `
            <div class="prompt-item p-3 bg-gray-800 rounded cursor-pointer select-none border-2 border-transparent hover:border-gray-600 transition-all" 
                 data-index="${index}"
                 data-image-id="${image.id}"
                 onmousedown="app.startSelection(${index}, event)"
                 onmouseover="app.updateSelection(${index})"
                 onmouseup="app.endSelection(${index})">
              <div class="flex items-start gap-3">
                <div class="font-mono text-xs text-gray-500 mt-1">#${image.id}</div>
                <div class="flex-1">
                  <div class="text-sm truncate">${image.prompt || 'No prompt'}</div>
                  <div class="custom-prompt-display mt-1"></div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        
        <!-- Buttons -->
        <div class="flex gap-4">
          <button onclick="app.clearSelection()" 
                  class="px-6 py-3 bg-gray-600 hover:bg-gray-700 rounded-lg font-medium transition-all">
            <i class="fas fa-times mr-2"></i>Clear Selection
          </button>
          <button onclick="app.closePromptGroupingModal()" 
                  class="px-6 py-3 bg-gray-600 hover:bg-gray-700 rounded-lg font-medium transition-all">
            <i class="fas fa-arrow-left mr-2"></i>Cancel
          </button>
          <button onclick="app.confirmPromptGrouping()" 
                  class="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-bold transition-all">
            <i class="fas fa-video mr-2"></i>Continue to Generation
          </button>
        </div>
      </div>
    `
    document.body.appendChild(modal)
    
    // Add keyboard listener for Enter key
    this.groupingKeydownHandler = this.handleGroupingKeydown.bind(this)
    document.addEventListener('keydown', this.groupingKeydownHandler)
  }

  startSelection(index, event) {
    event.preventDefault()
    this.promptGroupings.isSelecting = true
    this.promptGroupings.selectionStart = index
    this.promptGroupings.selectedIndices.clear()
    this.promptGroupings.selectedIndices.add(index)
    this.updateSelectionDisplay()
  }

  updateSelection(index) {
    if (!this.promptGroupings.isSelecting) return
    
    const start = Math.min(this.promptGroupings.selectionStart, index)
    const end = Math.max(this.promptGroupings.selectionStart, index)
    
    this.promptGroupings.selectedIndices.clear()
    for (let i = start; i <= end; i++) {
      this.promptGroupings.selectedIndices.add(i)
    }
    this.updateSelectionDisplay()
  }

  endSelection(index) {
    this.promptGroupings.isSelecting = false
  }

  updateSelectionDisplay() {
    const { selectedIndices, groupings, images } = this.promptGroupings
    
    document.querySelectorAll('.prompt-item').forEach((item, index) => {
      const isSelected = selectedIndices.has(index)
      const imageId = images[index]?.id
      const isGrouped = imageId !== undefined && groupings.has(imageId)
      
      // Update border and background
      if (isSelected) {
        item.classList.remove('border-transparent', 'border-green-500', 'bg-green-900/30')
        item.classList.add('border-blue-500', 'bg-blue-900/30')
      } else if (isGrouped) {
        item.classList.remove('border-transparent', 'border-blue-500', 'bg-blue-900/30')
        item.classList.add('border-green-500', 'bg-green-900/30')
      } else {
        item.classList.remove('border-blue-500', 'bg-blue-900/30', 'border-green-500', 'bg-green-900/30')
        item.classList.add('border-transparent')
      }
      
      // Show custom prompt if grouped
      const displayDiv = item.querySelector('.custom-prompt-display')
      if (isGrouped && displayDiv) {
        const customPrompt = groupings.get(imageId)
        displayDiv.innerHTML = `<div class="text-green-400 text-sm">✓ Custom: "${customPrompt}"</div>`
      } else if (displayDiv) {
        displayDiv.innerHTML = ''
      }
    })
    
    // Update counters
    const groupedCount = groupings.size
    const ungroupedCount = images.length - groupedCount
    document.getElementById('groupedCount').textContent = groupedCount
    document.getElementById('ungroupedCount').textContent = ungroupedCount
  }

  handleGroupingKeydown(e) {
    console.log('Key pressed:', e.key)
    if (e.key === 'Enter' && this.promptGroupings.selectedIndices.size > 0) {
      e.preventDefault()
      console.log('Opening prompt input modal...')
      this.showPromptInputModal()
    }
  }

  showPromptInputModal() {
    console.log('showPromptInputModal called')
    const modal = document.createElement('div')
    modal.id = 'promptInputModal'
    modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center'
    modal.style.zIndex = '9999'
    modal.innerHTML = `
      <div class="bg-gray-800 p-6 rounded-lg max-w-md">
        <h3 class="text-xl font-bold mb-4">Assign Video Prompt</h3>
        <p class="text-gray-400 mb-4">For <span id="selectedCountDisplay" class="font-bold text-yellow-400">${this.promptGroupings.selectedIndices.size}</span> selected images</p>
        <input type="text" 
               id="customPromptInput" 
               placeholder="e.g., walking forward, sitting down"
               class="w-full px-4 py-3 bg-gray-700 rounded-lg border border-gray-600 focus:border-purple-500 transition-all mb-4">
        <div class="flex gap-4">
          <button onclick="app.cancelPromptInput()" 
                  class="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded">
            Cancel
          </button>
          <button onclick="app.confirmPromptInput()" 
                  class="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded font-bold">
            Assign
          </button>
        </div>
      </div>
    `
    document.body.appendChild(modal)
    
    // Focus input
    setTimeout(() => {
      document.getElementById('customPromptInput')?.focus()
    }, 100)
  }

  cancelPromptInput() {
    document.getElementById('promptInputModal')?.remove()
  }

  confirmPromptInput() {
    const input = document.getElementById('customPromptInput')
    const customPrompt = input?.value.trim()
    
    if (!customPrompt) {
      alert('Please enter a custom prompt')
      return
    }
    
    // Assign the custom prompt to all selected images
    const { selectedIndices, images, groupings } = this.promptGroupings
    selectedIndices.forEach(index => {
      const imageId = images[index].id
      groupings.set(imageId, customPrompt)
    })
    
    // Clear selection
    selectedIndices.clear()
    
    // Update display
    this.updateSelectionDisplay()
    
    // Close modal
    document.getElementById('promptInputModal')?.remove()
  }

  clearSelection() {
    this.promptGroupings.selectedIndices.clear()
    this.updateSelectionDisplay()
  }

  closePromptGroupingModal() {
    // Remove modal
    document.getElementById('promptGroupingModal')?.remove()
    
    // Remove keyboard listener
    if (this.groupingKeydownHandler) {
      document.removeEventListener('keydown', this.groupingKeydownHandler)
      this.groupingKeydownHandler = null
    }
    
    // Clear state
    this.promptGroupings = null
  }

  async confirmPromptGrouping() {
    const { groupings, images, sessionIds, aspectRatio, videoModel } = this.promptGroupings
    
    // Validate: must have at least 1 grouping
    if (groupings.size === 0) {
      alert('No custom prompts assigned. Please select at least one image and assign a prompt with Enter.')
      return
    }
    
    // Build customVideoPrompts structure
    const customVideoPrompts = {
      manualGroupings: Array.from(groupings.entries()).map(([imageId, prompt]) => {
        const img = images.find(i => i.id === imageId)
        return {
          imageId: imageId,
          sessionId: img?.session_id,
          customPrompt: prompt
        }
      })
    }
    
    console.log('Submitting with custom prompts:', customVideoPrompts)
    
    // Close grouping modal
    this.closePromptGroupingModal()
    
    // Calculate total images
    let totalImages = 0
    for (const sessionId of sessionIds) {
      try {
        const response = await axios.get(`/api/gallery/session/${sessionId}`)
        const imgs = response.data.images || []
        totalImages += imgs.filter(img => img.image_url).length
      } catch (error) {
        console.error(`Error getting info for session ${sessionId}:`, error)
      }
    }
    
    try {
      // Show progress modal
      this.showBulkVideoProgressModal(`${sessionIds.length} sessions`, totalImages)
      
      // Call API with custom prompts
      const response = await axios.post('/api/bulk/generate-videos-multiple', {
        sessionIds: sessionIds,
        aspectRatio: aspectRatio,
        videoModel: videoModel,
        useOriginalPrompt: false,
        customVideoPrompts: customVideoPrompts
      })
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Multi-session video generation failed to start')
      }
      
      // Store master session ID for tracking
      this.currentVideoSessionId = response.data.masterSessionId
      console.log(`🎬 Multi-session bulk video generation started with custom prompts: ${this.currentVideoSessionId}`)
      
      // Start log streaming
      this.startVideoLogStreaming(this.currentVideoSessionId, totalImages, `${sessionIds.length} sessions`)
      
    } catch (error) {
      console.error('Error starting video generation:', error)
      this.closeModal()
      alert(`Failed to start video generation: ${error.response?.data?.error || error.message}`)
    }
  }

}

// Add CSS animations and custom styles
const style = document.createElement('style')
style.textContent = `
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .line-clamp-3 {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  
  /* Custom gray shades for deployment modal */
  .bg-gray-850 {
    background-color: #1F2937;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  @keyframes scaleIn {
    from { transform: scale(0.9); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  
  /* Pulse animation for active progress */
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
  .animate-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
  
  .animate-fadeIn {
    animation: fadeIn 0.5s ease-out forwards;
  }
  .animate-slideIn {
    animation: slideIn 0.3s ease-out forwards;
  }
  .animate-scaleIn {
    animation: scaleIn 0.3s ease-out forwards;
  }
  .animate-spin {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  
  /* Custom scrollbar for logs */
  #deploymentLogs::-webkit-scrollbar {
    width: 8px;
  }
  #deploymentLogs::-webkit-scrollbar-track {
    background: #374151;
    border-radius: 4px;
  }
  #deploymentLogs::-webkit-scrollbar-thumb {
    background: #6B7280;
    border-radius: 4px;
  }
  #deploymentLogs::-webkit-scrollbar-thumb:hover {
    background: #9CA3AF;
  }
`
document.head.appendChild(style)

// Initialize app when DOM is ready
function initializeApp() {
  console.log('Creating app instance...')
  try {
    window.app = new window.FloodifyPromptEngineer()
    console.log('App created successfully, window.app is:', window.app)
    // Test that methods exist
    console.log('app.showGallery exists:', typeof window.app.showGallery === 'function')
  } catch (error) {
    console.error('Error creating app:', error)
    alert('Error initializing app: ' + error.message)
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp)
} else {
  initializeApp()
}

// Also make app globally accessible for onclick handlers
window.app = window.app || null

// Global safety wrapper for onclick handlers
window.safeShowGallery = function() {
  if (!window.app) {
    console.error('App not initialized yet')
    alert('Application is still loading. Please try again in a moment.')
    return
  }
  if (typeof window.app.showGallery !== 'function') {
    console.error('showGallery method not found on app')
    alert('Gallery feature is not available. Please refresh the page.')
    return
  }
  window.app.showGallery()
}
