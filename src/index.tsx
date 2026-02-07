import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { generateImage, generateImageBatch, MODEL_MAPPINGS } from './image-service'
import { getDeploymentLogs, logDeploymentStep, runBulkDeploy } from './bulk-deploy'
import { generateMultiselectVideos } from './multiselect-video'
import { generateUltraSimpleVideos } from './ultra-simple-video'

type Bindings = {
  DB: D1Database
  OPENAI_API_KEY?: string
  FAL_API_KEY?: string
  IMAGE_GENERATION_ENABLED?: string
  ADMIN_API_KEY?: string
  CORS_ORIGIN?: string
  CSP?: string
  EXPOSE_ERRORS?: string
  REQUIRE_ADMIN_KEY?: string
  NODE_ENV?: string
}

const app = new Hono<{ Bindings: Bindings }>()

const defaultCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
  "img-src 'self' data: https: blob:",
  "font-src 'self' https://cdnjs.cloudflare.com data:",
  "connect-src 'self' https:",
  "frame-ancestors 'none'",
].join('; ')

// Security headers
app.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  c.header('Content-Security-Policy', c.env.CSP || defaultCsp)
})

// Enable CORS with allowlist
app.use('/api/*', cors({
  origin: (origin, c) => {
    const allowed = (c?.env?.CORS_ORIGIN || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
    if (allowed.length === 0) {
      return origin || 'http://localhost:3000'
    }
    return allowed
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}))

// Admin key guard for non-GET requests (optional)
app.use('/api/*', async (c, next) => {
  const method = c.req.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next()
  const requireAdminKey = (c.env.REQUIRE_ADMIN_KEY ?? (c.env.NODE_ENV === 'production' ? 'true' : 'false')) === 'true'
  if (!requireAdminKey) return next()
  const adminKey = c.env.ADMIN_API_KEY
  if (!adminKey) {
    return c.json({ success: false, error: 'Admin API key is required' }, 503)
  }
  const headerKey = c.req.header('x-admin-key') || ''
  const authHeader = c.req.header('authorization') || ''
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : ''
  const key = headerKey || bearer
  if (key !== adminKey) {
    return c.json({ success: false, error: 'Unauthorized' }, 401)
  }
  return next()
})

const errorMessage = (c: { env: Bindings }, error: unknown, fallback: string) => {
  const expose = c.env.EXPOSE_ERRORS === 'true'
  if (expose && typeof error === 'object' && error && 'message' in error) {
    const message = (error as { message?: string }).message
    if (message) return message
  }
  return fallback
}

// Serve static files from public/static folder
app.use('/static/*', serveStatic({ root: './public/static', rewriteRequestPath: (path) => path.replace(/^\/static/, '') }))

// ============= STYLES MANAGEMENT =============

// Get all styles
app.get('/api/styles', async (c) => {
  const { env } = c
  
  try {
    // Check if styles exist, if not add the real ones
    const styles = await env.DB.prepare(`
      SELECT * FROM styles ORDER BY model, name
    `).all()
    
    // If no styles exist, add the proper ones for the models
    if (!styles.results || styles.results.length === 0) {
      // Add styles for SEED_DREAM - discovery in progress
      await env.DB.prepare(`
        INSERT OR IGNORE INTO styles (name, model, master_prompt) VALUES
        ('Gritty iPhone Realism', 'SEED_DREAM', 'low quality, extreme grain, raw, Shaky iPhone candid video still of [subject] [action]'),
        ('Custom Style 1', 'SEED_DREAM', '[subject] [action]')
      `).run()
      
      // Add styles for IMAGEN_4 - discovery in progress
      await env.DB.prepare(`
        INSERT OR IGNORE INTO styles (name, model, master_prompt) VALUES
        ('Style 1', 'IMAGEN_4', '[subject] [action] [location]'),
        ('Style 2', 'IMAGEN_4', '[subject] [action]')
      `).run()
      
      // Re-fetch styles
      const updatedStyles = await env.DB.prepare(`
        SELECT * FROM styles ORDER BY model, name
      `).all()
      
      return c.json({ success: true, styles: updatedStyles.results })
    }
    
    return c.json({ success: true, styles: styles.results })
  } catch (error) {
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Add custom style
app.post('/api/styles', async (c) => {
  const { env } = c
  const { name, model, masterPrompt, isCustom } = await c.req.json()
  
  try {
    await env.DB.prepare(`
      INSERT INTO styles (name, model, master_prompt, is_custom)
      VALUES (?, ?, ?, ?)
    `).bind(name, model, masterPrompt, isCustom ? 1 : 0).run()
    
    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// ============= THEME MANAGEMENT APIs =============

// Get all themes with progress
app.get('/api/themes', async (c) => {
  const { env } = c
  
  try {
    const themes = await env.DB.prepare(`
      SELECT 
        t.*,
        s.name as style_name,
        COUNT(CASE WHEN te.test_result = 'pass' THEN 1 END) as approved_count,
        COUNT(CASE WHEN te.test_result = 'fail' THEN 1 END) as failed_count,
        COUNT(CASE WHEN te.tested = 0 THEN 1 END) as remaining_count,
        COUNT(te.id) as total_elements
      FROM themes t
      LEFT JOIN styles s ON t.style_id = s.id
      LEFT JOIN testing_elements te ON t.theme_id = te.theme_id
      GROUP BY t.theme_id
      ORDER BY t.last_tested DESC NULLS LAST, t.created_at DESC
    `).all()
    
    return c.json({ success: true, themes: themes.results })
  } catch (error) {
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Get theme details
app.get('/api/themes/:themeId/details', async (c) => {
  const { env } = c
  const themeId = c.req.param('themeId')
  
  try {
    const theme = await env.DB.prepare(`
      SELECT t.*, s.name as style_name, s.master_prompt
      FROM themes t
      LEFT JOIN styles s ON t.style_id = s.id
      WHERE t.theme_id = ?
    `).bind(themeId).first()
    
    return c.json({ success: true, theme })
  } catch (error) {
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Create or initialize a new theme
app.post('/api/themes', async (c) => {
  const { env } = c
  const { theme, model, style, styleId, masterPrompt, description, testingStrategy: requestedStrategy } = await c.req.json()
  
  // Generate theme ID (handle missing model field)
  const modelName = model || 'default'
  const themeId = `${theme.toLowerCase().replace(/\s+/g, '-')}-${modelName.toLowerCase().replace(/[/_]/g, '-')}-${style?.toLowerCase().replace(/\s+/g, '-') || 'default'}`
  
  try {
    // Clean the description markers
    const cleanDescription = description?.replace(/^\[(OUTLIER TEST|PROGRESSIVE EXPANSION|AI CONVERGENCE)\]\s*/i, '') || description
    
    // Use requested strategy or detect from keywords
    let testingStrategy = requestedStrategy || 'boundary_mapping'
    
    if (!requestedStrategy) {
      // Auto-detect strategy from description if not explicitly passed
      if (description?.includes('[OUTLIER TEST]')) {
        testingStrategy = 'outlier_exploration'
      } else if (description?.includes('[PROGRESSIVE EXPANSION]')) {
        testingStrategy = 'progressive_expansion'
      } else if (description?.includes('[AI CONVERGENCE]')) {
        testingStrategy = 'ai_convergence'
      }
    }
    
    console.log(`Testing strategy: ${testingStrategy}`)
    
    // Create theme (use clean description for storage)
    await env.DB.prepare(`
      INSERT OR REPLACE INTO themes (
        theme_id, theme, model, style, master_prompt
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(
      themeId, 
      theme, 
      model || null, 
      style || null, 
      masterPrompt || null
    ).run()
    
    // Use OpenAI to generate smart prompt variations for stress testing
    let promptVariations = []
    if (env.OPENAI_API_KEY) {
      let prompt
      
      if (testingStrategy === 'progressive_expansion') {
        // Progressive Expansion: Start safe, gradually expand boundaries
        const roundNumber = 1 // Will be tracked in database later
        prompt = `You are generating prompts for PROGRESSIVE BOUNDARY EXPANSION testing.
Theme: "${theme}"
${cleanDescription ? `Theme Description: ${cleanDescription}` : ''}
Master Template: ${masterPrompt}
Current Round: ${roundNumber}/5

PROGRESSIVE EXPANSION STRATEGY:
Round 1 (Current): ULTRA SAFE - Most canonical, expected combinations only
Round 2: MILD EXPANSION - Slight variations, still very safe
Round 3: MODERATE PUSH - Exploring edges but still coherent
Round 4: AGGRESSIVE TESTING - Pushing boundaries significantly  
Round 5: MAXIMUM CHAOS - Find the absolute breaking points

For Round ${roundNumber}, generate 5 prompts that are ULTRA SAFE and canonical.

CRITICAL INSTRUCTIONS:
1. You MUST use the master template EXACTLY: ${masterPrompt}
2. ONLY replace [subject], [action], [world] placeholders
3. For Round 1, use ONLY the most obvious, expected combinations
4. These should be guaranteed to work perfectly

Return ONLY a valid JSON array with exactly 5 prompts.
[{"prompt": "FULL TEMPLATE with placeholders replaced", "safety_level": "ultra_safe", "round": 1}]`

      } else if (testingStrategy === 'ai_convergence') {
        // AI Convergence: Learn from approvals in real-time
        // Check if we have previous approvals to analyze
        const approvedPrompts = await env.DB.prepare(`
          SELECT te.element as prompt, te.test_result
          FROM testing_elements te
          WHERE te.theme_id = ? AND te.test_result IS NOT NULL
          ORDER BY te.test_order DESC
          LIMIT 20
        `).bind(themeId).all()
        
        const approved = approvedPrompts.results?.filter(p => p.test_result === 'pass').map(p => p.prompt) || []
        const rejected = approvedPrompts.results?.filter(p => p.test_result === 'fail').map(p => p.prompt) || []
        
        if (approved.length > 0 || rejected.length > 0) {
          // Subsequent rounds - AI learns from approvals
          prompt = `You are an AI learning system for image generation convergence.
Theme: "${theme}"
${cleanDescription ? `Theme Description: ${cleanDescription}` : ''}
Base Template: ${masterPrompt}

APPROVED PROMPTS (User liked these):
${approved.length > 0 ? approved.join('\n') : 'None yet'}

REJECTED PROMPTS (User didn't like these):
${rejected.length > 0 ? rejected.join('\n') : 'None yet'}

YOUR TASK: Generate 5 NEW prompts that converge on what the user wants.

CONVERGENCE STRATEGY:
1. ANALYZE APPROVALS - Find patterns in what worked:
   - Did likeness/accuracy succeed? (for people/characters)
   - Was the style consistent?
   - Did it match the theme well?
   
2. LEARN FROM REJECTIONS - Understand failures:
   - Likeness issues → Add "accurate likeness", "recognizable features"
   - Style drift → Reinforce style keywords
   - Off-theme → Stay closer to core concept
   - Quality issues → Add quality modifiers
   
3. BUILD THE PUZZLE - Each approval is a piece:
   - Approved prompts show what combinations work
   - Stack successful elements together
   
4. ADD CORRECTIVE ENHANCEMENTS:
   - If likeness fails → Add: "accurate likeness of", "clearly resembles"
   - If style wavers → Add: specific style reinforcements
   - If theme drifts → Add: core theme anchors
   - If quality varies → Add: "high quality", "well-defined"
   
5. CONVERGE PRECISELY - Each round should get tighter

IMPORTANT: You can MODIFY the master template by:
- Adding accuracy enhancers: "accurate likeness", "true to character", "recognizable as"
- Adding style locks: "consistently", "maintaining style", "in exact style of"
- Adding quality guards: "high quality", "well-defined", "clear details"
- Adding theme anchors: core keywords that keep it on-theme
- Adding atmospheric details: lighting, mood, setting refinements
- Building on approved combinations: merge elements from multiple approved prompts

REMEMBER: Each approved prompt is a GOLDEN EXAMPLE - it worked! 
Build new prompts that stay within the zone defined by these approvals.

Generate 5 prompts that are CLOSER to the approved zone.
Return ONLY a valid JSON array.
[{"prompt": "ENHANCED prompt based on learnings", "reasoning": "why this should work", "enhancement": "what was added/changed"}]`
        } else {
          // First round - start with diverse exploration
          prompt = `You are generating initial exploration prompts for AI CONVERGENCE testing.
Theme: "${theme}"
${cleanDescription ? `Theme Description: ${cleanDescription}` : ''}
Master Template: ${masterPrompt}

ROUND 1 STRATEGY: Generate 5 DIVERSE test prompts to understand user preferences.
Cover different aspects to learn what the user likes:
1. Safe/canonical interpretation
2. Atmospheric/mood focused  
3. Character/subject focused
4. Action/dynamic focused
5. Environment/setting focused

CRITICAL INSTRUCTIONS:
1. Start with the master template: ${masterPrompt}
2. Fill placeholders AND feel free to add subtle enhancements
3. Make each prompt explore a different aspect

Return ONLY a valid JSON array with exactly 5 prompts.
[{"prompt": "FULL prompt with placeholders filled", "test_aspect": "what this explores", "focus": "safe|mood|character|action|setting"}]`
        }

      } else if (testingStrategy === 'boundary_mapping') {
        // Normal boundary mapping mode
        prompt = `You are generating prompts to discover the CONCEPTUAL BOUNDARIES and VIBES of what works in image generation.
Theme: "${theme}"
${cleanDescription ? `Theme Description: ${cleanDescription}` : ''}
Master Template: ${masterPrompt}

CRITICAL INSTRUCTIONS:
1. You MUST use the master template EXACTLY: ${masterPrompt}
2. ONLY replace [subject], [action], [world] placeholders
3. Keep ALL other words unchanged
4. Every prompt MUST follow this template structure

Create 20 test prompts that map the VIBE SPACE:

1-5: CORE ZONE - Expected canonical combinations (establishes baseline)
6-10: EXTENSION ZONE - Same vibe, different contexts (if Patrick + lazy works, try lazy in various forms)  
11-15: CROSSOVER TESTS - Blend with other known concepts (test conceptual flexibility)
16-20: BOUNDARY PROBES - Find where coherence breaks (discover limits)

Focus on discovering:
- How well does the AI "know" this character/concept?
- What similar contexts maintain the vibe?
- What style transfers succeed?
- Where does the conceptual understanding break down?

Don't just test locations - test the CHARACTER VIBE in various forms.
Example: If testing "Patrick", explore "lazy vibe" not just "Patrick in places"

IMPORTANT: Each prompt MUST be the COMPLETE master template with placeholders filled.
For example, if template is "low quality, extreme grain, raw, Shaky iPhone candid video still of [subject] [action] [world]"
Then return: "low quality, extreme grain, raw, Shaky iPhone candid video still of SpongeBob flipping patties at the Krusty Krab"
NOT just: "SpongeBob flipping patties"

Return ONLY a valid JSON array with exactly 20 prompts.
[{"prompt": "FULL TEMPLATE with placeholders replaced", "type": "core|extension|crossover|boundary", "vibe_tested": "what conceptual space this tests"}]`
      } else {
        // Outlier exploration mode
        prompt = `You are generating prompts to test an UNUSUAL CROSSOVER or OUTLIER concept in image generation.
        
Theme: "${theme}"
Description: "${cleanDescription}"
Master Template: ${masterPrompt}

This is an OUTLIER TEST - user wants to explore unexpected combinations!

CRITICAL: Every prompt MUST use the full master template: ${masterPrompt}
Just replace the [subject], [action], [world] placeholders.

Create 20 test prompts:

1-5: TEST THE EXACT OUTLIER - variations of the specific unusual request
6-10: RELATED OUTLIERS - if this works, what similar weird things might work?
11-15: BLEND STABILITY - how well does the AI handle this crossover?
16-20: PUSH FURTHER - if this outlier works, test even wilder combinations

Example: If testing "SpongeBob in New York" with template "low quality, extreme grain, raw, Shaky iPhone candid video still of [subject] [action] [world]":
- "low quality, extreme grain, raw, Shaky iPhone candid video still of SpongeBob walking through Times Square"
- "low quality, extreme grain, raw, Shaky iPhone candid video still of SpongeBob eating pizza in Brooklyn"
NOT just "SpongeBob in Times Square"

Each prompt MUST be the COMPLETE template with placeholders filled!

Return ONLY a valid JSON array with exactly 20 prompts.
[{"prompt": "FULL MASTER TEMPLATE with placeholders replaced", "type": "exact|related|blend|push", "vibe_tested": "what boundary this explores"}]`
      }

      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-4o',  // Using GPT-4o for better vibe understanding and theme analysis
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7
          })
        })
        
        if (response.ok) {
          const data = await response.json()
          const content = data.choices[0].message.content
          // Parse JSON from response
          const match = content.match(/\[[\s\S]*\]/)
          if (match) {
            promptVariations = JSON.parse(match[0])
          }
        }
      } catch (error) {
        console.error('OpenAI generation error:', error)
      }
    }
    
    // Fallback: Generate basic prompt variations if OpenAI fails
    if (promptVariations.length === 0) {
      // Simple template filling as fallback
      const filledPrompt = masterPrompt
        .replace('[subject]', theme)
        .replace('[action]', 'standing')
        .replace('[world]', 'their world')
      promptVariations = [
        { prompt: filledPrompt, type: 'safe' }
      ]
    }
    
    // Store prompt variations as testing elements with vibe info
    for (let idx = 0; idx < promptVariations.length; idx++) {
      const variation = promptVariations[idx]
      
      // Handle different field names based on testing strategy
      const elementType = variation.type || variation.focus || variation.diversity_type || 'general'
      const vibeInfo = variation.vibe_tested || variation.test_aspect || variation.reasoning || null
      
      const insertResult = await env.DB.prepare(`
        INSERT INTO testing_elements (theme_id, element, element_type, test_order, round_number, tested)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        themeId, 
        variation.prompt, 
        elementType, 
        idx + 1,
        1, // Initial round
        0  // Not tested yet
      ).run()
      
      console.log(`Inserted prompt ${idx + 1}: ${insertResult.success ? 'success' : 'failed'}`)
    }
    
    console.log(`Created theme ${themeId} with ${promptVariations.length} initial prompts (strategy: ${testingStrategy})`)
    
    return c.json({ success: true, themeId })
  } catch (error) {
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Add more elements to existing theme
app.post('/api/themes/:themeId/add-elements', async (c) => {
  const { env } = c
  const themeId = c.req.param('themeId')
  const { elements } = await c.req.json()
  
  try {
    // Get current max order
    const maxOrder = await env.DB.prepare(`
      SELECT MAX(test_order) as max_order FROM testing_elements WHERE theme_id = ?
    `).bind(themeId).first()
    
    const startOrder = (maxOrder?.max_order || 0) + 1
    
    // Add new elements
    for (let idx = 0; idx < elements.length; idx++) {
      const el = elements[idx]
      await env.DB.prepare(`
        INSERT OR IGNORE INTO testing_elements (theme_id, element, element_type, test_order)
        VALUES (?, ?, ?, ?)
      `).bind(themeId, el.name, el.type || 'general', startOrder + idx).run()
    }
    
    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// ============= TESTING APIs =============

// Get next batch of elements to test (5 at a time)
app.get('/api/themes/:themeId/next-batch', async (c) => {
  const { env } = c
  const themeId = c.req.param('themeId')
  
  console.log(`Getting next batch for theme: ${themeId}`)
  
  try {
    // Get theme info first to check testing strategy
    const theme = await env.DB.prepare(`
      SELECT t.*, s.name as style_name, s.master_prompt
      FROM themes t
      LEFT JOIN styles s ON t.style_id = s.id
      WHERE t.theme_id = ?
    `).bind(themeId).first()
    
    // Check if AI Convergence mode and if we need to generate new prompts
    if (theme && theme.testing_strategy === 'ai_convergence') {
      // Check how many rounds completed
      const roundsCompleted = theme.rounds_completed || 0
      console.log(`AI Convergence mode - rounds completed: ${roundsCompleted}`)
      
      // If we've done less than 5 rounds, generate new prompts based on approvals
      if (roundsCompleted < 5) {
        // Get approved/rejected prompts for learning
        const testHistory = await env.DB.prepare(`
          SELECT element, test_result FROM testing_elements
          WHERE theme_id = ? AND test_result IS NOT NULL
          ORDER BY test_order DESC
        `).bind(themeId).all()
        
        // If we have history, generate new prompts based on it
        if (testHistory.results && testHistory.results.length > 0) {
          // Generate new prompts using OpenAI based on approvals
          const approved = testHistory.results.filter(r => r.test_result === 'pass').map(r => r.element)
          const rejected = testHistory.results.filter(r => r.test_result === 'fail').map(r => r.element)
          
          console.log(`Found ${approved.length} approved and ${rejected.length} rejected prompts`)
          
          // Call OpenAI to generate next round
          if (env.OPENAI_API_KEY) {
            console.log('Calling OpenAI to generate convergence prompts...')
            const prompt = `You are an AI learning system for image generation convergence.
Theme: "${theme.theme}"
${theme.description ? `Description: ${theme.description}` : ''}
Master Template: ${theme.master_prompt}
Current Round: ${roundsCompleted + 1}/5

APPROVED PROMPTS (User liked these):
${approved.length > 0 ? approved.join('\n') : 'None yet'}

REJECTED PROMPTS (User didn't like these):
${rejected.length > 0 ? rejected.join('\n') : 'None yet'}

Generate 5 NEW prompts for Round ${roundsCompleted + 2} that converge on what the user wants.
Learn from approvals, avoid rejections, and get CLOSER to the sweet spot.
You can MODIFY the template by adding details that ensure success.

Return ONLY a valid JSON array with exactly 5 prompts.`

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.OPENAI_API_KEY}`
              },
              body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.8,
                max_tokens: 2000
              })
            })
            
            const data = await response.json()
            console.log(`OpenAI response received for round ${roundsCompleted + 2}`)
            
            if (!data.choices || !data.choices[0]) {
              console.error('Invalid OpenAI response:', data)
              throw new Error('Invalid OpenAI response')
            }
            
            let content = data.choices[0].message.content
            // Clean markdown formatting if present
            content = content.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim()
            const newPrompts = JSON.parse(content)
            console.log(`Generated ${newPrompts.length} new prompts for convergence`)
            
            // Save new prompts to testing_elements
            const testOrder = (roundsCompleted + 1) * 5
            for (let i = 0; i < newPrompts.length; i++) {
              const promptData = newPrompts[i]
              // Handle different response formats from OpenAI
              const promptText = typeof promptData === 'string' ? promptData : (promptData.prompt || promptData.text || '')
              const reasoning = promptData.reasoning || promptData.enhancement || promptData.focus || 'convergence'
              
              if (!promptText) {
                console.error('Invalid prompt data:', promptData)
                continue
              }
              
              await env.DB.prepare(`
                INSERT INTO testing_elements (
                  theme_id, element, element_type, test_order, tested, round_number
                ) VALUES (?, ?, ?, ?, 0, ?)
              `).bind(
                themeId,
                promptText,
                reasoning,
                testOrder + i,
                roundsCompleted + 2
              ).run()
            }
            
            // Update rounds completed
            await env.DB.prepare(`
              UPDATE themes SET rounds_completed = ? WHERE theme_id = ?
            `).bind(roundsCompleted + 1, themeId).run()
          }
        }
      }
    }
    
    // Get next 5 untested elements (now includes newly generated ones)
    const elements = await env.DB.prepare(`
      SELECT * FROM testing_elements
      WHERE theme_id = ? AND tested = 0
      ORDER BY test_order
      LIMIT 5
    `).bind(themeId).all()

    
    // Get testing stats
    const stats = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN tested = 1 THEN 1 END) as tested,
        COUNT(CASE WHEN test_result = 'pass' THEN 1 END) as passed,
        COUNT(CASE WHEN test_result = 'fail' THEN 1 END) as failed
      FROM testing_elements
      WHERE theme_id = ?
    `).bind(themeId).first()
    
    // Check if we have saved test images for these elements
    let savedImages = { results: [] }
    if (elements.results && elements.results.length > 0) {
      const elementNames = elements.results.map(el => el.element)
      if (elementNames.length > 0) {
        savedImages = await env.DB.prepare(`
          SELECT element, image_url FROM test_images
          WHERE theme_id = ? AND element IN (${elementNames.map(() => '?').join(',')})
        `).bind(themeId, ...elementNames).all()
      }
    }
    
    // Create a map of saved images
    const imageMap = {}
    savedImages.results.forEach(img => {
      imageMap[img.element] = img.image_url
    })
    
    // Elements already contain the full prompts from OpenAI
    const elementsWithPrompts = elements.results.map(el => {
      return {
        ...el,
        generated_prompt: el.element, // The 'element' field contains the full prompt
        saved_image_url: imageMap[el.element] || null // Include saved image if exists
      }
    })
    
    return c.json({
      success: true,
      theme,
      elements: elementsWithPrompts,
      stats,
      hasMore: elements.results.length === 5
    })
  } catch (error) {
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Save test images for persistence
app.post('/api/themes/:themeId/save-test-images', async (c) => {
  const { env } = c
  const themeId = c.req.param('themeId')
  const { images } = await c.req.json()
  
  try {
    // Save each image to database
    for (const img of images) {
      await env.DB.prepare(`
        INSERT OR REPLACE INTO test_images (theme_id, element, prompt, image_url, round_number)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        themeId,
        img.element,
        img.prompt,
        img.image_url,
        img.round_number || 1
      ).run()
      
      // Also update testing_elements with the image URL
      await env.DB.prepare(`
        UPDATE testing_elements
        SET image_url = ?
        WHERE theme_id = ? AND element = ?
      `).bind(img.image_url, themeId, img.element).run()
    }
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Error saving test images:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Submit test results for a batch
app.post('/api/themes/:themeId/test-results', async (c) => {
  const { env } = c
  const themeId = c.req.param('themeId')
  const { results, roundNumber } = await c.req.json()
  
  try {
    const timestamp = new Date().toISOString()
    
    // Update each element's test result
    for (const result of results) {
      await env.DB.prepare(`
        UPDATE testing_elements
        SET 
          tested = 1,
          test_result = ?,
          tested_at = ?,
          round_number = ?
        WHERE theme_id = ? AND element = ?
      `).bind(
        result.passed ? 'pass' : 'fail',
        timestamp,
        roundNumber,
        themeId,
        result.element
      ).run()
    }
    
    // Update theme statistics
    const stats = await env.DB.prepare(`
      SELECT 
        COUNT(CASE WHEN tested = 1 THEN 1 END) as total_tested,
        COUNT(CASE WHEN test_result = 'pass' THEN 1 END) as passed,
        MAX(round_number) as rounds_completed
      FROM testing_elements
      WHERE theme_id = ?
    `).bind(themeId).first()
    
    const passRate = stats.total_tested > 0 
      ? (stats.passed / stats.total_tested * 100).toFixed(2) 
      : 0
    
    const canGenerate = stats.passed >= 5
    const estimatedVariations = Math.floor(Math.pow(stats.passed, 2) * 100)
    
    await env.DB.prepare(`
      UPDATE themes
      SET 
        total_tested = ?,
        rounds_completed = ?,
        last_tested = ?,
        pass_rate = ?,
        can_generate = ?,
        estimated_variations = ?,
        updated_at = ?
      WHERE theme_id = ?
    `).bind(
      stats.total_tested,
      stats.rounds_completed || 0,
      timestamp,
      passRate,
      canGenerate ? 1 : 0,
      estimatedVariations,
      timestamp,
      themeId
    ).run()
    
    // Create testing session record
    const passed = results.filter(r => r.passed).length
    const failed = results.filter(r => !r.passed).length
    
    if (results.length > 0) {
      await env.DB.prepare(`
        INSERT INTO testing_sessions (
          theme_id, round_number, elements_tested, passed, failed
        ) VALUES (?, ?, ?, ?, ?)
      `).bind(themeId, roundNumber, results.length, passed, failed).run()
    }
    
    return c.json({ 
      success: true,
      stats: {
        totalTested: stats.total_tested,
        passRate,
        canGenerate,
        estimatedVariations
      }
    })
  } catch (error) {
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// ============= IMAGE GENERATION API =============

// Generate images for testing batch
app.post('/api/generate-test-images', async (c) => {
  const { env } = c
  const { prompts, model } = await c.req.json()
  
  try {
    // Check if FAL API key is configured
    if (!env.FAL_API_KEY) {
      console.warn('FAL_API_KEY not configured, using placeholders for testing')
      const images = prompts.map(p => {
        const prompt = p.generated_prompt || p
        return `https://picsum.photos/seed/${encodeURIComponent(prompt)}/512/512`
      })
      return c.json({ 
        success: true, 
        images,
        using_placeholder: true,
        message: 'FAL_API_KEY not configured - using placeholder images' 
      })
    }
    
    // Generate real images using FAL AI
    const results = await generateImageBatch(
      prompts.map(p => p.generated_prompt || p),
      model,
      env.FAL_API_KEY
    )
    
    const images = results.map((result, idx) => {
      if (result.error || !result.url) {
        // Use placeholder for failed generations
        const prompt = prompts[idx].generated_prompt || prompts[idx]
        return `https://picsum.photos/seed/${encodeURIComponent(prompt)}/512/512`
      }
      return result.url
    })
    
    return c.json({ success: true, images, using_real_api: true })
  } catch (error) {
    console.error('Batch generation error:', error)
    // Fallback to placeholders
    const images = prompts.map(p => {
      const prompt = p.generated_prompt || p
      return `https://picsum.photos/seed/${encodeURIComponent(prompt)}/512/512`
    })
    return c.json({ success: true, images, using_placeholder: true, error: errorMessage(c, error, 'Internal server error') })
  }
})

// ============= VIDEO GENERATION APIs =============

// Generate video from single image
app.post('/api/video/generate', async (c) => {
  const { env } = c
  const { 
    image_url, 
    prompt, 
    aspect_ratio = '16:9',
    resolution = '720p',
    duration = '5',
    style,
    gallery_image_id,
    theme_name,
    model 
  } = await c.req.json()
  
  try {
    // Check if FAL API key is configured
    if (!env.FAL_API_KEY) {
      return c.json({ success: false, error: 'FAL API key not configured' }, 400)
    }
    
    const videoService = await import('./video-service')
    
    // Generate the video (always use "subtle" as prompt)
    const result = await videoService.generateVideo({
      imageUrl: image_url,
      prompt: 'subtle',  // Always use "subtle" for video generation
      aspectRatio: aspect_ratio,
      resolution,
      duration,
      style,
      apiKey: env.FAL_API_KEY
    })
    
    // If no gallery_image_id, save the image to gallery first
    let finalGalleryImageId = gallery_image_id
    if (result.url && !gallery_image_id) {
      // Save image to gallery if it's not already there
      const insertResult = await env.DB.prepare(`
        INSERT INTO gallery_images (
          theme_id, theme_name, model, prompt, image_url,
          created_at
        ) VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        null, // theme_id can be null for production images
        theme_name || 'Production',
        model || 'UNKNOWN',
        prompt || 'subtle',
        image_url
      ).run()
      
      finalGalleryImageId = insertResult.meta.last_row_id
    }
    
    // Save video to gallery
    if (result.url && finalGalleryImageId) {
      const videoSaveResult = await env.DB.prepare(`
        INSERT INTO gallery_videos (
          gallery_image_id, video_url, prompt, 
          aspect_ratio, resolution, duration, style,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        finalGalleryImageId,
        result.url,
        'subtle',  // Always use "subtle" for video prompts
        aspect_ratio || '16:9',
        resolution || '720p',
        duration || '5',
        style || null  // Use null instead of undefined
      ).run()
      
      console.log(`✅ Video saved to gallery! ID: ${videoSaveResult.meta.last_row_id}, URL: ${result.url}`)
    } else {
      console.log(`⚠️ Video not saved: URL=${result.url}, galleryImageId=${finalGalleryImageId}`)
    }
    
    return c.json({ 
      success: true, 
      video_url: result.url,
      request_id: result.requestId 
    })
    
  } catch (error) {
    console.error('Video generation error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Batch video generation from multiple images  
app.post('/api/video/batch-generate', async (c) => {
  const { env } = c
  const { 
    images, // Array of {id, url, prompt}
    settings = {},
    theme_id,
    theme_name,
    model 
  } = await c.req.json()
  
  try {
    if (!env.FAL_API_KEY) {
      return c.json({ success: false, error: 'FAL API key not configured' }, 400)
    }
    
    const videoService = await import('./video-service')
    
    // First, ensure all images are in the gallery
    const galleryImageIds = []
    for (const img of images) {
      let galleryImageId = img.gallery_image_id || img.id
      
      // Check if this is a real gallery image ID or just a frontend ID
      const existing = await env.DB.prepare(`
        SELECT id FROM gallery_images WHERE id = ?
      `).bind(galleryImageId).first()
      
      if (!existing) {
        // Image not in gallery, add it
        const insertResult = await env.DB.prepare(`
          INSERT INTO gallery_images (
            theme_id, theme_name, model, prompt, image_url,
            created_at
          ) VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          theme_id || null,
          theme_name || 'Production',
          model || 'UNKNOWN',
          img.prompt || 'subtle',
          img.url
        ).run()
        
        galleryImageId = insertResult.meta.last_row_id
      }
      
      galleryImageIds.push(galleryImageId)
    }
    
    // Generate videos for all images
    const results = await videoService.generateBatchVideos({
      images,
      settings,
      apiKey: env.FAL_API_KEY
    })
    
    // Save successful videos to database
    const savedVideos = []
    for (let i = 0; i < results.length; i++) {
      if (results[i].url) {
        const video = {
          gallery_image_id: galleryImageIds[i],
          video_url: results[i].url,
          prompt: 'subtle',  // Always use "subtle" for video prompts
          theme_id,
          ...settings
        }
        
        const saveResult = await env.DB.prepare(`
          INSERT INTO gallery_videos (
            gallery_image_id, video_url, prompt, theme_id,
            aspect_ratio, resolution, duration, style,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          video.gallery_image_id,
          video.video_url,
          video.prompt,
          video.theme_id || null,
          settings.aspect_ratio || '16:9',
          settings.resolution || '720p',
          settings.duration || '5',
          settings.style || null
        ).run()
        
        console.log(`✅ Batch video ${i+1} saved! ID: ${saveResult.meta.last_row_id}, URL: ${video.video_url}`)
        savedVideos.push(video)
      }
    }
    
    return c.json({
      success: true,
      total: images.length,
      successful: savedVideos.length,
      failed: images.length - savedVideos.length,
      videos: savedVideos
    })
    
  } catch (error) {
    console.error('Batch video generation error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// ==================== NANO BANANA INTEGRATION ====================

// Start Nano Banana batch generation
app.post('/api/nano-banana/start-batch', async (c) => {
  const { env } = c
  const { category, theme, referenceImageDataUri, prompts } = await c.req.json()
  
  // Validate input
  if (!category || !theme || !referenceImageDataUri || !prompts || !Array.isArray(prompts)) {
    return c.json({ success: false, error: 'Category, theme, reference image data URI, and prompts array required' }, 400)
  }
  
  if (prompts.length < 1 || prompts.length > 200) {
    return c.json({ success: false, error: 'Between 1 and 200 prompts required' }, 400)
  }
  
  // Check for FAL API key
  if (!env.FAL_API_KEY) {
    return c.json({ success: false, error: 'FAL_API_KEY not configured' }, 500)
  }
  
  // Generate session ID
  const sessionId = `bulk-nano-banana-${Date.now()}-${Math.random().toString(36).substring(7)}`
  
  // Store job in database for tracking
  await env.DB.prepare(`
    INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
    VALUES (?, 'nano_banana_start', ?, ?, 'info', datetime('now'))
  `).bind(sessionId, `Starting Nano Banana batch: ${category} - ${theme}`, JSON.stringify({ category, theme, promptCount: prompts.length, referenceImageDataUri: referenceImageDataUri.substring(0, 100) + '...' })).run()
  
  // Start async processing
  c.executionCtx.waitUntil(
    processNanoBananaBatch(env, sessionId, category, theme, referenceImageDataUri, prompts)
  )
  
  return c.json({ 
    success: true, 
    sessionId,
    message: `Started generation for ${prompts.length} prompts`
  })
})

// Get Nano Banana job status
app.get('/api/nano-banana/status/:sessionId', async (c) => {
  const { env } = c
  const sessionId = c.req.param('sessionId')
  
  // Get latest status from deployment logs
  const logs = await env.DB.prepare(`
    SELECT * FROM deployment_logs 
    WHERE session_id = ? 
    ORDER BY created_at DESC 
    LIMIT 20
  `).bind(sessionId).all()
  
  // Check if completed by looking for session in gallery
  const imageCount = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM gallery_images 
    WHERE session_id = ?
  `).bind(sessionId).first()
  
  const isComplete = logs.results.some(log => log.step_type === 'nano_banana_complete')
  const hasError = logs.results.some(log => log.log_level === 'error')
  
  return c.json({
    sessionId,
    status: isComplete ? 'complete' : hasError ? 'error' : 'processing',
    logs: logs.results,
    imageCount: imageCount?.count || 0,
    theme: logs.results[0]?.metadata ? JSON.parse(logs.results[0].metadata).theme : null
  })
})

// Process Nano Banana batch (async function)
async function processNanoBananaBatch(env: any, sessionId: string, category: string, theme: string, referenceImageDataUri: string, prompts: string[]) {
  console.log(`🍌 Starting Nano Banana batch ${sessionId} for theme: ${category} - ${theme}`)
  console.log(`   Reference image: ${referenceImageDataUri.substring(0, 50)}...`)
  console.log(`   Total prompts: ${prompts.length}`)
  
  try {
    // Import nano banana service
    const { generateImage } = await import('./nano-banana-service')
    
    const BATCH_SIZE = 10 // Process 10 images at a time
    let successCount = 0
    let failCount = 0
    
    // Process in batches
    for (let i = 0; i < prompts.length; i += BATCH_SIZE) {
      const batch = prompts.slice(i, i + BATCH_SIZE)
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1
      const totalBatches = Math.ceil(prompts.length / BATCH_SIZE)
      
      console.log(`🍌 Processing batch ${batchNumber}/${totalBatches} (${batch.length} prompts)`)
      
      // Log progress
      await env.DB.prepare(`
        INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
        VALUES (?, 'nano_banana_progress', ?, ?, 'info', datetime('now'))
      `).bind(
        sessionId, 
        `Processing batch ${batchNumber}/${totalBatches}`,
        JSON.stringify({ batchNumber, totalBatches, promptsInBatch: batch.length })
      ).run()
      
      // Generate all images in batch concurrently
      const batchPromises = batch.map(async (prompt, index) => {
        try {
          console.log(`   🍌 [${i + index + 1}/${prompts.length}] Generating image...`)
          
          const result = await generateImage({
            prompt: prompt,
            imageUrl: referenceImageDataUri,
            apiKey: env.FAL_API_KEY
          })
          
          // Insert into gallery
          if (result.images && result.images.length > 0) {
            await env.DB.prepare(`
              INSERT INTO gallery_images (
                batch_id, session_id, theme_id, theme_name, model, 
                prompt, image_url, tags, favorited, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `).bind(
              `bulk-deploy-${sessionId}-nano-banana`,
              sessionId,
              category,
              `${category} - ${theme}`,
              'NANO_BANANA',
              prompt,
              result.images[0].url,
              JSON.stringify([category]),
              0
            ).run()
            
            console.log(`   ✅ [${i + index + 1}/${prompts.length}] Image saved to gallery`)
            return { success: true }
          } else {
            console.error(`   ❌ [${i + index + 1}/${prompts.length}] No images in result`)
            return { success: false }
          }
          
        } catch (error) {
          console.error(`   ❌ [${i + index + 1}/${prompts.length}] Failed:`, error)
          return { success: false }
        }
      })
      
      // Wait for all in batch to complete
      const batchResults = await Promise.all(batchPromises)
      
      // Count successes/failures
      const batchSuccesses = batchResults.filter(r => r.success).length
      const batchFailures = batchResults.filter(r => !r.success).length
      
      successCount += batchSuccesses
      failCount += batchFailures
      
      console.log(`✅ Batch ${batchNumber}/${totalBatches} complete: ${batchSuccesses} success, ${batchFailures} failed`)
    }
    
    // Log completion
    await env.DB.prepare(`
      INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
      VALUES (?, 'nano_banana_complete', 'Batch completed successfully', ?, 'success', datetime('now'))
    `).bind(sessionId, JSON.stringify({ 
      totalImages: successCount,
      failedImages: failCount,
      category: category,
      theme: theme 
    })).run()
    
    console.log(`🎉 Nano Banana batch ${sessionId} complete! ${successCount} images added to gallery, ${failCount} failed`)
    
  } catch (error) {
    console.error(`❌ Nano Banana batch ${sessionId} failed:`, error)
    
    // Log error
    await env.DB.prepare(`
      INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
      VALUES (?, 'nano_banana_error', 'Batch failed', ?, 'error', datetime('now'))
    `).bind(sessionId, JSON.stringify({ error: errorMessage(c, error, 'Internal server error') })).run()
  }
}

// ==================== END NANO BANANA ====================

// ==================== MIDJOURNEY INTEGRATION ====================

// Start Midjourney batch generation
app.post('/api/midjourney/start-batch', async (c) => {
  const { env } = c
  const { category, theme, prompts } = await c.req.json()
  
  // Validate input
  if (!category || !theme || !prompts || !Array.isArray(prompts)) {
    return c.json({ success: false, error: 'Category, theme, and prompts array required' }, 400)
  }
  
  if (prompts.length < 1 || prompts.length > 50) {
    return c.json({ success: false, error: 'Between 1 and 50 prompts required' }, 400)
  }
  
  // Generate session ID - SAME FORMAT as bulk deploy
  const sessionId = `bulk-midjourney-${Date.now()}-${Math.random().toString(36).substring(7)}`
  
  // Store job in database for tracking
  await env.DB.prepare(`
    INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
    VALUES (?, 'midjourney_start', ?, ?, 'info', datetime('now'))
  `).bind(sessionId, `Starting Midjourney batch: ${category} - ${theme}`, JSON.stringify({ category, theme, promptCount: prompts.length })).run()
  
  // Start async processing
  c.executionCtx.waitUntil(
    processMidjourneyBatch(env, sessionId, category, theme, prompts)
  )
  
  return c.json({ 
    success: true, 
    sessionId,
    message: `Started generation for ${prompts.length} prompts`
  })
})

// Get Midjourney job status
app.get('/api/midjourney/status/:sessionId', async (c) => {
  const { env } = c
  const sessionId = c.req.param('sessionId')
  
  // Get latest status from deployment logs
  const logs = await env.DB.prepare(`
    SELECT * FROM deployment_logs 
    WHERE session_id = ? 
    ORDER BY created_at DESC 
    LIMIT 20
  `).bind(sessionId).all()
  
  // Check if completed by looking for session in gallery
  const imageCount = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM gallery_images 
    WHERE session_id = ?
  `).bind(sessionId).first()
  
  const isComplete = logs.results.some(log => log.step_type === 'midjourney_complete')
  const hasError = logs.results.some(log => log.log_level === 'error')
  
  return c.json({
    sessionId,
    status: isComplete ? 'complete' : hasError ? 'error' : 'processing',
    logs: logs.results,
    imageCount: imageCount?.count || 0,
    theme: logs.results[0]?.metadata ? JSON.parse(logs.results[0].metadata).theme : null
  })
})

// Process Midjourney batch (async function with polling)
async function processMidjourneyBatch(env: any, sessionId: string, category: string, theme: string, prompts: string[]) {
  console.log(`🎨 Starting Midjourney batch ${sessionId} for theme: ${category} - ${theme}`)
  
  try {
    // Check for Apify token
    if (!env.APIFY_TOKEN) {
      throw new Error('APIFY_TOKEN not configured')
    }
    
    // Log progress
    await env.DB.prepare(`
      INSERT INTO deployment_logs (session_id, step_type, message, log_level, created_at)
      VALUES (?, 'midjourney_progress', 'Starting Apify actor run', 'info', datetime('now'))
    `).bind(sessionId).run()
    
    // Start Apify actor run (async - returns immediately with run_id)
    const startResponse = await fetch('https://api.apify.com/v2/acts/igolaizola~midjourney-automation/runs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.APIFY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompts: prompts,
        mode: 'relaxed',
        concurrency: 5,
        privacy: true,
        cookie: env.MIDJOURNEY_COOKIE,
        upscale: '',
        proxyConfiguration: {
          useApifyProxy: true,
          apifyProxyGroups: ['RESIDENTIAL']
        }
      })
    })
    
    if (!startResponse.ok) {
      throw new Error(`Apify API error: ${startResponse.status}`)
    }
    
    const runData = await startResponse.json()
    const runId = runData.data.id
    const datasetId = runData.data.defaultDatasetId
    
    console.log(`✅ Apify run started: ${runId}`)
    
    // Log run ID for tracking
    await env.DB.prepare(`
      INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
      VALUES (?, 'midjourney_run_started', 'Apify run started', ?, 'info', datetime('now'))
    `).bind(sessionId, JSON.stringify({ runId, datasetId, promptCount: prompts.length })).run()
    
    // Poll for completion (check every 30 seconds, max 3 hours)
    const maxAttempts = 360 // 3 hours = 360 * 30 seconds
    let attempts = 0
    let runStatus = 'RUNNING'
    
    while (attempts < maxAttempts && runStatus === 'RUNNING') {
      // Wait 30 seconds before checking
      await new Promise(resolve => setTimeout(resolve, 30000))
      attempts++
      
      // Check run status
      const statusResponse = await fetch(`https://api.apify.com/v2/acts/igolaizola~midjourney-automation/runs/${runId}`, {
        headers: {
          'Authorization': `Bearer ${env.APIFY_TOKEN}`
        }
      })
      
      if (!statusResponse.ok) {
        throw new Error(`Failed to check run status: ${statusResponse.status}`)
      }
      
      const statusData = await statusResponse.json()
      runStatus = statusData.data.status
      
      console.log(`⏳ Apify run ${runId} status: ${runStatus} (attempt ${attempts}/${maxAttempts})`)
      
      // Log progress every 5 minutes
      if (attempts % 10 === 0) {
        await env.DB.prepare(`
          INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
          VALUES (?, 'midjourney_polling', 'Waiting for Apify to complete', ?, 'info', datetime('now'))
        `).bind(sessionId, JSON.stringify({ runStatus, attempts, elapsed: attempts * 30 })).run()
      }
    }
    
    // Check if run succeeded
    if (runStatus !== 'SUCCEEDED') {
      throw new Error(`Apify run failed or timed out. Status: ${runStatus}`)
    }
    
    console.log(`✅ Apify run completed: ${runId}`)
    
    // Fetch dataset items (all generated images)
    const itemsResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items`, {
      headers: {
        'Authorization': `Bearer ${env.APIFY_TOKEN}`
      }
    })
    
    if (!itemsResponse.ok) {
      throw new Error(`Failed to fetch dataset items: ${itemsResponse.status}`)
    }
    
    const items = await itemsResponse.json()
    console.log(`✅ Got ${items.length} images from Apify`)
    
    // Log completion
    await env.DB.prepare(`
      INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
      VALUES (?, 'midjourney_images', 'Received images from Apify', ?, 'success', datetime('now'))
    `).bind(sessionId, JSON.stringify({ imageCount: items.length })).run()
    
    // Insert images into gallery - EXACT SAME STRUCTURE as bulk deploy
    let successCount = 0
    for (const item of items) {
      try {
        await env.DB.prepare(`
          INSERT INTO gallery_images (
            batch_id, session_id, theme_id, theme_name, model, 
            prompt, image_url, tags, favorited, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          `bulk-deploy-${sessionId}-midjourney`, // Same format as bulk deploy
          sessionId,
          category, // theme_id = category (consistent with bulk deploy)
          `${category} - ${theme}`, // theme_name = combined format
          'MIDJOURNEY',
          item.prompt,
          item.url,
          JSON.stringify([category]), // tags = [category] for searchability
          0 // not favorited
        ).run()
        
        successCount++
      } catch (err) {
        console.error(`Failed to insert image: ${err}`)
      }
    }
    
    // Log completion
    await env.DB.prepare(`
      INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
      VALUES (?, 'midjourney_complete', 'Batch completed successfully', ?, 'success', datetime('now'))
    `).bind(sessionId, JSON.stringify({ 
      totalImages: successCount,
      category: category,
      theme: theme 
    })).run()
    
    console.log(`🎉 Midjourney batch ${sessionId} complete! ${successCount} images added to gallery`)
    
  } catch (error) {
    console.error(`❌ Midjourney batch ${sessionId} failed:`, error)
    
    // Log error
    await env.DB.prepare(`
      INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
      VALUES (?, 'midjourney_error', 'Batch failed', ?, 'error', datetime('now'))
    `).bind(sessionId, JSON.stringify({ error: errorMessage(c, error, 'Internal server error') }), 'error').run()
  }
}

// ==================== END MIDJOURNEY ====================

// Get videos from gallery
app.get('/api/gallery/videos', async (c) => {
  const { env } = c
  const { theme_id, page = 1, limit = 20 } = c.req.query()
  
  try {
    let query = `
      SELECT v.*, g.image_url, g.theme_name, g.model 
      FROM gallery_videos v
      LEFT JOIN gallery_images g ON v.gallery_image_id = g.id
      WHERE 1=1
    `
    const params = []
    
    if (theme_id) {
      query += ` AND v.theme_id = ?`
      params.push(theme_id)
    }
    
    query += ` ORDER BY v.created_at DESC`
    
    const offset = (parseInt(page) - 1) * parseInt(limit)
    query += ` LIMIT ? OFFSET ?`
    params.push(parseInt(limit), offset)
    
    const videos = await env.DB.prepare(query).bind(...params).all()
    
    return c.json({
      success: true,
      videos: videos.results
    })
    
  } catch (error) {
    console.error('Get videos error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// ============= GALLERY APIs =============

// Delete all images for a specific theme (and their associated videos)
app.delete('/api/gallery/theme/:themeIdentifier/images', async (c) => {
  const { env } = c
  const themeIdentifier = c.req.param('themeIdentifier')
  
  if (!themeIdentifier) {
    return c.json({ success: false, error: 'Theme identifier is required' }, 400)
  }
  
  try {
    // Support both theme_id (numeric) and theme_name (string)
    const isNumeric = /^\d+$/.test(themeIdentifier)
    const whereClause = isNumeric ? 'theme_id = ?' : 'theme_name = ?'
    const bindValue = isNumeric ? parseInt(themeIdentifier) : themeIdentifier
    
    console.log(`🗑️ Deleting images for theme: ${themeIdentifier} (${isNumeric ? 'ID' : 'Name'})`)
    
    // Get count of images to be deleted for confirmation
    const countResult = await env.DB.prepare(`
      SELECT COUNT(*) as image_count, theme_name FROM gallery_images 
      WHERE ${whereClause}
      GROUP BY theme_name
    `).bind(bindValue).first()
    
    const imageCount = countResult?.image_count || 0
    const themeName = countResult?.theme_name || themeIdentifier
    
    if (imageCount === 0) {
      return c.json({ 
        success: true, 
        message: 'No images found for this theme',
        deleted_images: 0,
        deleted_videos: 0,
        theme_name: themeName
      })
    }
    
    // Delete associated videos first (maintains referential integrity)
    const videoDeleteResult = await env.DB.prepare(`
      DELETE FROM gallery_videos 
      WHERE gallery_image_id IN (
        SELECT id FROM gallery_images WHERE ${whereClause}
      )
    `).bind(bindValue).run()
    
    // Delete the images
    const imageDeleteResult = await env.DB.prepare(`
      DELETE FROM gallery_images WHERE ${whereClause}
    `).bind(bindValue).run()
    
    console.log(`🗑️ Deleted ${imageDeleteResult.changes || 0} images and ${videoDeleteResult.changes || 0} videos for theme ${themeName}`)
    
    return c.json({ 
      success: true,
      message: `Successfully deleted all images for theme "${themeName}"`,
      deleted_images: imageDeleteResult.changes || 0,
      deleted_videos: videoDeleteResult.changes || 0,
      theme_name: themeName
    })
    
  } catch (error) {
    console.error('Delete theme images error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Save production images to gallery
app.post('/api/gallery/save', async (c) => {
  const { env } = c
  const { images, theme_id, theme_name, model, batch_id } = await c.req.json()
  
  try {
    let savedCount = 0
    let skippedCount = 0
    
    // Save each image to gallery database
    for (const img of images) {
      console.log("DEBUG - Attempting to save image:", img.image_url)
      
      // Check if image already exists
      const existing = await env.DB.prepare(`
        SELECT id FROM gallery_images 
        WHERE theme_id = ? AND image_url = ?
      `).bind(theme_id, img.image_url).first()
      
      if (existing) {
        console.log("DEBUG - Duplicate image skipped:", img.image_url)
        skippedCount++
        continue
      }
      
      await env.DB.prepare(`
        INSERT INTO gallery_images (
          batch_id, theme_id, theme_name, model, 
          prompt, image_url, r2_key, 
          tags, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        batch_id || `batch_${Date.now()}`,
        theme_id,
        theme_name,
        model,
        img.prompt,
        img.image_url,
        img.r2_key || null,
        JSON.stringify(img.tags || [])
      ).run()
      
      console.log("DEBUG - Save completed for image:", img.image_url)
      savedCount++
    }
    
    return c.json({ 
      success: true, 
      saved: savedCount, 
      skipped: skippedCount,
      message: skippedCount > 0 ? `${skippedCount} duplicate images skipped` : undefined
    })
  } catch (error) {
    console.error('Gallery save error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Save single image to gallery (called from stress testing)
app.post('/api/gallery/images', async (c) => {
  const { env } = c
  const { prompt, image_url, theme_id, theme_name, model, style } = await c.req.json()
  
  try {
    console.log("DEBUG - Attempting to save image:", image_url)
    
    // Check if image already exists for this theme
    const existing = await env.DB.prepare(`
      SELECT id FROM gallery_images 
      WHERE theme_id = ? AND image_url = ?
    `).bind(theme_id, image_url).first()
    
    if (existing) {
      console.log("DEBUG - Duplicate image skipped:", image_url)
      return c.json({ 
        success: false, 
        message: "Duplicate image skipped",
        duplicate: true
      })
    }
    
    // Generate a unique batch ID for this single image
    const batch_id = `approved_${Date.now()}_${Math.random().toString(36).substring(7)}`
    
    await env.DB.prepare(`
      INSERT INTO gallery_images (
        batch_id, theme_id, theme_name, model, 
        prompt, image_url, r2_key, 
        tags, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      batch_id,
      theme_id || null,
      theme_name || null,
      model || null,
      prompt,
      image_url,
      null, // r2_key
      JSON.stringify([style || 'approved', 'stress-test']) // tags
    ).run()
    
    console.log("DEBUG - Save completed for image:", image_url)
    console.log(`Saved approved image to gallery: ${prompt}`)
    return c.json({ success: true, message: 'Image saved to gallery' })
  } catch (error) {
    console.error('Gallery save error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Delete single image from gallery
app.delete('/api/gallery/:itemId', async (c) => {
  const { env } = c
  const itemId = c.req.param('itemId')
  
  try {
    console.log("DEBUG - Attempting to delete gallery item ID:", itemId)
    
    // Check if it's an image first
    const existingImage = await env.DB.prepare(`
      SELECT id, image_url FROM gallery_images WHERE id = ?
    `).bind(itemId).first()
    
    if (existingImage) {
      // Delete any associated videos first
      await env.DB.prepare(`
        DELETE FROM gallery_videos WHERE gallery_image_id = ?
      `).bind(itemId).run()
      
      // Delete the image
      await env.DB.prepare(`
        DELETE FROM gallery_images WHERE id = ?
      `).bind(itemId).run()
      
      console.log("DEBUG - Successfully deleted image ID:", itemId, "URL:", existingImage.image_url)
      return c.json({ success: true, message: 'Image deleted successfully' })
    }
    
    // Check if it's a video
    const existingVideo = await env.DB.prepare(`
      SELECT id, video_url FROM gallery_videos WHERE id = ?
    `).bind(itemId).first()
    
    if (existingVideo) {
      // Delete the video
      await env.DB.prepare(`
        DELETE FROM gallery_videos WHERE id = ?
      `).bind(itemId).run()
      
      console.log("DEBUG - Successfully deleted video ID:", itemId, "URL:", existingVideo.video_url)
      return c.json({ success: true, message: 'Video deleted successfully' })
    }
    
    // Neither image nor video found
    return c.json({ success: false, message: 'Item not found' }, 404)
    
  } catch (error) {
    console.error('Gallery delete error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Delete entire session (all images and videos in a session)
app.delete('/api/gallery/session/:sessionId', async (c) => {
  const { env } = c
  const sessionId = c.req.param('sessionId')
  
  try {
    console.log("DEBUG - Attempting to delete entire session:", sessionId)
    
    // Get counts before deletion
    const imageCounts = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM gallery_images WHERE session_id = ?
    `).bind(sessionId).first()
    
    const videoCounts = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM gallery_videos WHERE session_id = ?
    `).bind(sessionId).first()
    
    const imageCount = imageCounts?.count || 0
    const videoCount = videoCounts?.count || 0
    
    if (imageCount === 0 && videoCount === 0) {
      return c.json({ success: false, message: 'Session not found or already empty' }, 404)
    }
    
    // Delete all videos in session
    const videoDeleteResult = await env.DB.prepare(`
      DELETE FROM gallery_videos WHERE session_id = ?
    `).bind(sessionId).run()
    
    // Delete all images in session
    const imageDeleteResult = await env.DB.prepare(`
      DELETE FROM gallery_images WHERE session_id = ?
    `).bind(sessionId).run()
    
    console.log(`🗑️ Deleted entire session ${sessionId}: ${imageDeleteResult.changes || 0} images, ${videoDeleteResult.changes || 0} videos`)
    
    return c.json({ 
      success: true,
      message: `Successfully deleted session "${sessionId}"`,
      deleted_images: imageDeleteResult.changes || 0,
      deleted_videos: videoDeleteResult.changes || 0,
      session_id: sessionId
    })
    
  } catch (error) {
    console.error('Session delete error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Search gallery with filters (includes both images and videos)
app.get('/api/gallery/search', async (c) => {
  const { env } = c
  const { 
    search, 
    theme, 
    model, 
    tags,
    sessionIds,
    page = 1, 
    limit = 50,
    sort = 'newest',
    type = 'all' // 'all', 'images', 'videos'
  } = c.req.query()
  
  try {
    const items = []
    let totalCount = 0
    
    // Fetch images if requested
    if (type === 'all' || type === 'images') {
      let imageQuery = `SELECT *, 'image' as media_type FROM gallery_images WHERE 1=1`
      const imageParams = []
      
      // Add search conditions for images
      if (search) {
        imageQuery += ` AND (prompt LIKE ? OR theme_name LIKE ?)`
        imageParams.push(`%${search}%`, `%${search}%`)
      }
      
      if (theme) {
        imageQuery += ` AND theme_name = ?`
        imageParams.push(theme)
      }
      
      if (model) {
        imageQuery += ` AND model = ?`
        imageParams.push(model)
      }
      
      if (tags) {
        imageQuery += ` AND tags LIKE ?`
        imageParams.push(`%${tags}%`)
      }
      
      // Add sessionIds filtering
      if (sessionIds) {
        const sessionIdList = sessionIds.split(',').map(id => id.trim()).filter(id => id)
        if (sessionIdList.length > 0) {
          const placeholders = sessionIdList.map(() => '?').join(',')
          imageQuery += ` AND session_id IN (${placeholders})`
          imageParams.push(...sessionIdList)
        }
      }
      
      const imageResults = await env.DB.prepare(imageQuery).bind(...imageParams).all()
      items.push(...imageResults.results)
      
      // Count images
      let imageCountQuery = `SELECT COUNT(*) as total FROM gallery_images WHERE 1=1`
      const imageCountParams = []
      
      if (search) {
        imageCountQuery += ` AND (prompt LIKE ? OR theme_name LIKE ?)`
        imageCountParams.push(`%${search}%`, `%${search}%`)
      }
      if (theme) {
        imageCountQuery += ` AND theme_name = ?`
        imageCountParams.push(theme)
      }
      if (model) {
        imageCountQuery += ` AND model = ?`
        imageCountParams.push(model)
      }
      if (tags) {
        imageCountQuery += ` AND tags LIKE ?`
        imageCountParams.push(`%${tags}%`)
      }
      
      // Add sessionIds filtering to count query
      if (sessionIds) {
        const sessionIdList = sessionIds.split(',').map(id => id.trim()).filter(id => id)
        if (sessionIdList.length > 0) {
          const placeholders = sessionIdList.map(() => '?').join(',')
          imageCountQuery += ` AND session_id IN (${placeholders})`
          imageCountParams.push(...sessionIdList)
        }
      }
      
      const imageCount = await env.DB.prepare(imageCountQuery).bind(...imageCountParams).first()
      totalCount += imageCount.total
    }
    
    // Fetch videos if requested
    if (type === 'all' || type === 'videos') {
      let videoQuery = `
        SELECT v.*, 'video' as media_type, g.image_url as thumbnail_url, g.theme_name, g.model, g.prompt
        FROM gallery_videos v
        LEFT JOIN gallery_images g ON v.gallery_image_id = g.id
        WHERE 1=1
      `
      const videoParams = []
      
      // Add search conditions for videos
      if (search) {
        videoQuery += ` AND (v.prompt LIKE ? OR g.theme_name LIKE ? OR g.prompt LIKE ?)`
        videoParams.push(`%${search}%`, `%${search}%`, `%${search}%`)
      }
      
      if (theme) {
        videoQuery += ` AND g.theme_name = ?`
        videoParams.push(theme)
      }
      
      if (model) {
        videoQuery += ` AND v.model = ?`
        videoParams.push(model)
      }
      
      const videoResults = await env.DB.prepare(videoQuery).bind(...videoParams).all()
      items.push(...videoResults.results)
      
      // Count videos
      let videoCountQuery = `
        SELECT COUNT(*) as total 
        FROM gallery_videos v
        LEFT JOIN gallery_images g ON v.gallery_image_id = g.id
        WHERE 1=1
      `
      const videoCountParams = []
      
      if (search) {
        videoCountQuery += ` AND (v.prompt LIKE ? OR g.theme_name LIKE ? OR g.prompt LIKE ?)`
        videoCountParams.push(`%${search}%`, `%${search}%`, `%${search}%`)
      }
      if (theme) {
        videoCountQuery += ` AND g.theme_name = ?`
        videoCountParams.push(theme)
      }
      if (model) {
        videoCountQuery += ` AND v.model = ?`
        videoCountParams.push(model)
      }
      
      const videoCount = await env.DB.prepare(videoCountQuery).bind(...videoCountParams).first()
      totalCount += videoCount.total
    }
    
    // Sort all items together
    if (sort === 'newest') {
      items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    } else if (sort === 'oldest') {
      items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    } else if (sort === 'random') {
      items.sort(() => Math.random() - 0.5)
    }
    
    // Apply pagination
    const offset = (parseInt(page) - 1) * parseInt(limit)
    const paginatedItems = items.slice(offset, offset + parseInt(limit))
    
    return c.json({
      success: true,
      items: paginatedItems, // Changed from 'images' to 'items' to include both
      images: paginatedItems.filter(item => item.media_type === 'image'), // Keep backward compatibility
      videos: paginatedItems.filter(item => item.media_type === 'video'),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / parseInt(limit))
      }
    })
  } catch (error) {
    console.error('Gallery search error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Get gallery statistics
app.get('/api/gallery/stats', async (c) => {
  const { env } = c
  
  try {
    // Get image stats only (no videos in gallery)
    const imageStats = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total_images,
        COUNT(DISTINCT theme_id) as total_themes,
        COUNT(DISTINCT batch_id) as total_batches,
        COUNT(DISTINCT model) as total_models
      FROM gallery_images
    `).first()
    
    // Simple stats for images only
    const stats = {
      total_images: imageStats.total_images,
      total_videos: 0,
      total_items: imageStats.total_images,
      total_themes: imageStats.total_themes,
      total_batches: imageStats.total_batches,
      total_models: imageStats.total_models
    }
    
    // Get popular themes (from images)
    const themes = await env.DB.prepare(`
      SELECT theme_name, COUNT(*) as count
      FROM gallery_images
      GROUP BY theme_name
      ORDER BY count DESC
      LIMIT 100
    `).all()
    
    // Get recent batches
    const recentBatches = await env.DB.prepare(`
      SELECT DISTINCT batch_id, theme_name, COUNT(*) as image_count, MAX(created_at) as created_at
      FROM gallery_images
      GROUP BY batch_id
      ORDER BY created_at DESC
      LIMIT 5
    `).all()
    
    return c.json({
      success: true,
      stats,
      popular_themes: themes.results,
      recent_batches: recentBatches.results
    })
  } catch (error) {
    console.error('Gallery stats error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Delete images from gallery
app.delete('/api/gallery/images', async (c) => {
  const { env } = c
  const { image_ids } = await c.req.json()
  
  try {
    // Delete from database
    for (const id of image_ids) {
      await env.DB.prepare(`
        DELETE FROM gallery_images WHERE id = ?
      `).bind(id).run()
    }
    
    return c.json({ success: true, deleted: image_ids.length })
  } catch (error) {
    console.error('Gallery delete error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// ============= REFINEMENT APIs =============

// Get failed elements for refinement
app.get('/api/themes/:themeId/failed', async (c) => {
  const { env } = c
  const themeId = c.req.param('themeId')
  
  try {
    const elements = await env.DB.prepare(`
      SELECT element, element_type, tested_at
      FROM testing_elements
      WHERE theme_id = ? AND test_result = 'fail'
      ORDER BY test_order
    `).bind(themeId).all()
    
    return c.json({ success: true, elements: elements.results })
  } catch (error) {
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Refine or blacklist element
app.post('/api/themes/:themeId/refine', async (c) => {
  const { env } = c
  const themeId = c.req.param('themeId')
  const { element, action, refinedPrompt } = await c.req.json()
  
  try {
    if (action === 'blacklist') {
      // Permanently blacklist element
      await env.DB.prepare(`
        UPDATE testing_elements
        SET test_result = 'blacklisted'
        WHERE theme_id = ? AND element = ?
      `).bind(themeId, element).run()
    } else if (action === 'refine') {
      // Save refinement attempt
      await env.DB.prepare(`
        INSERT INTO refinement_attempts (
          theme_id, element, attempt_number, refined_prompt, test_result
        ) VALUES (?, ?, 
          (SELECT COUNT(*) + 1 FROM refinement_attempts WHERE theme_id = ? AND element = ?),
          ?, 'pending')
      `).bind(themeId, element, themeId, element, refinedPrompt).run()
    }
    
    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Delete theme and all associated data
// DELETE theme and all related data - comprehensive cleanup
app.delete('/api/themes/:themeId', async (c) => {
  const { env } = c
  const themeId = c.req.param('themeId')
  
  try {
    console.log(`Deleting theme ${themeId} and all related data...`)
    
    // Delete in order to respect any potential foreign key constraints
    // Using individual try-catch blocks since some tables might not have data
    
    // 1. Delete gallery data
    try {
      // First delete videos that reference gallery images from this theme
      await env.DB.prepare(`
        DELETE FROM gallery_videos 
        WHERE gallery_image_id IN (
          SELECT id FROM gallery_images WHERE theme_id = ? OR theme_name = ?
        )
      `).bind(themeId, themeId).run()
      
      // Then delete gallery images
      await env.DB.prepare(`
        DELETE FROM gallery_images WHERE theme_id = ? OR theme_name = ?
      `).bind(themeId, themeId).run()
    } catch (e) {
      console.log('No gallery data to delete or error:', e.message)
    }
    
    // 2. Delete test images
    try {
      await env.DB.prepare(`
        DELETE FROM test_images WHERE theme_id = ?
      `).bind(themeId).run()
    } catch (e) {
      console.log('No test images to delete')
    }
    
    // 3. Delete production/generation data
    try {
      await env.DB.prepare(`
        DELETE FROM production_sessions WHERE theme_id = ?
      `).bind(themeId).run()
      
      await env.DB.prepare(`
        DELETE FROM generated_images WHERE theme_id = ?
      `).bind(themeId).run()
      
      await env.DB.prepare(`
        DELETE FROM production_runs WHERE theme_id = ?
      `).bind(themeId).run()
    } catch (e) {
      console.log('No production data to delete')
    }
    
    // 4. Delete scaling data
    try {
      await env.DB.prepare('DELETE FROM scaling_sessions WHERE theme_id = ?').bind(themeId).run()
      await env.DB.prepare('DELETE FROM scaling_rules WHERE theme_id = ?').bind(themeId).run()
      await env.DB.prepare('DELETE FROM scaling_notes WHERE theme_id = ?').bind(themeId).run()
    } catch (e) {
      console.log('No scaling data to delete')
    }
    
    // 5. Delete testing data
    try {
      await env.DB.prepare('DELETE FROM testing_sessions WHERE theme_id = ?').bind(themeId).run()
      await env.DB.prepare('DELETE FROM testing_elements WHERE theme_id = ?').bind(themeId).run()
      await env.DB.prepare('DELETE FROM refinement_attempts WHERE theme_id = ?').bind(themeId).run()
    } catch (e) {
      console.log('No testing data to delete')
    }
    
    // 6. Delete discovered patterns
    try {
      await env.DB.prepare('DELETE FROM discovered_patterns WHERE theme_id = ?').bind(themeId).run()
    } catch (e) {
      console.log('No patterns to delete')
    }
    
    // 7. Finally delete the theme itself
    const result = await env.DB.prepare(`
      DELETE FROM themes WHERE theme_id = ?
    `).bind(themeId).run()
    
    console.log(`Theme ${themeId} deleted successfully. Rows affected: ${result.meta.changes}`)
    
    return c.json({ 
      success: true, 
      message: 'Theme and all related data deleted successfully',
      deleted: {
        theme_id: themeId,
        rows_affected: result.meta.changes
      }
    })
  } catch (error) {
    console.error('Error deleting theme:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// ============= PRODUCTION/SCALING APIs =============

// Get theme statistics
app.get('/api/themes/:themeId/stats', async (c) => {
  const { env } = c
  const themeId = c.req.param('themeId')
  
  try {
    const stats = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN test_result IS NOT NULL THEN 1 ELSE 0 END) as tested,
        SUM(CASE WHEN test_result = 'pass' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN test_result = 'fail' THEN 1 ELSE 0 END) as failed
      FROM testing_elements
      WHERE theme_id = ?
    `).bind(themeId).first()
    
    return c.json({ 
      success: true, 
      total: stats.total || 0,
      tested: stats.tested || 0,
      passed: stats.passed || 0,
      failed: stats.failed || 0
    })
  } catch (error) {
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Get approved elements for production
app.get('/api/themes/:themeId/approved', async (c) => {
  const { env } = c
  const themeId = c.req.param('themeId')
  
  try {
    const elements = await env.DB.prepare(`
      SELECT element, element_type 
      FROM testing_elements
      WHERE theme_id = ? AND test_result = 'pass'
      ORDER BY test_order
    `).bind(themeId).all()
    
    return c.json({ success: true, elements: elements.results })
  } catch (error) {
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Mass generation endpoint with progress tracking
app.post('/api/themes/:themeId/mass-generate', async (c) => {
  const { env } = c
  const themeId = c.req.param('themeId')
  const { prompts, model, generateImages = false } = await c.req.json()
  
  try {
    // Import mass generation utilities
    const { calculateCost, GenerationQueue, MODEL_CAPABILITIES } = await import('./mass-generation')
    
    // Calculate cost
    const pricing = calculateCost(model, prompts.length)
    
    // If only generating prompts (no images), return them immediately
    if (!generateImages) {
      return c.json({
        success: true,
        prompts: prompts.map((p, idx) => ({
          id: idx + 1,
          prompt: p,
          image_url: null
        })),
        pricing,
        generated_images: false
      })
    }
    
    // For image generation, we'll simulate the queue processing
    // In production, this would use FAL AI
    const imagesPerRequest = MODEL_CAPABILITIES[model] || 1
    const totalBatches = Math.ceil(prompts.length / imagesPerRequest)
    
    // Generate preview images for first 10 prompts only
    const previewPrompts = prompts.slice(0, 10)
    let previewImages = []
    
    if (env.FAL_API_KEY && env.IMAGE_GENERATION_ENABLED === 'true') {
      // Use real FAL AI generation
      const imageService = await import('./image-service')
      try {
        // Generate real images using FAL AI
        const results = await imageService.generateImageBatch(previewPrompts, model, env.FAL_API_KEY)
        previewImages = previewPrompts.map((p, idx) => ({
          prompt: p,
          image_url: results[idx]?.url || null
        }))
      } catch (error) {
        console.error('Error generating preview images:', error)
        // Return error but still include prompts
        previewImages = previewPrompts.map(p => ({
          prompt: p,
          image_url: null
        }))
      }
    } else {
      // No API key configured
      console.warn('FAL_API_KEY not configured - skipping image generation')
      previewImages = previewPrompts.map(p => ({
        prompt: p,
        image_url: null
      }))
    }
    
    // Save to gallery if images were generated
    if (previewImages.length > 0 && previewImages.some(img => img.image_url)) {
      const batchId = `${themeId}_${Date.now()}`
      const galleryImages = previewImages.filter(img => img.image_url).map(img => ({
        prompt: img.prompt,
        image_url: img.image_url,
        tags: [model, 'production']
      }))
      
      try {
        // Get theme info
        const theme = await env.DB.prepare(`
          SELECT theme, model FROM themes WHERE theme_id = ?
        `).bind(themeId).first()
        
        // Save to gallery
        for (const img of galleryImages) {
          await env.DB.prepare(`
            INSERT INTO gallery_images (
              batch_id, theme_id, theme_name, model, 
              prompt, image_url, tags, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `).bind(
            batchId,
            themeId,
            theme?.theme || 'Unknown',
            model,
            img.prompt,
            img.image_url,
            JSON.stringify(img.tags)
          ).run()
        }
        console.log(`Saved ${galleryImages.length} images to gallery`)
      } catch (error) {
        console.error('Failed to save to gallery:', error)
      }
    }
    
    // Return results with preview images
    return c.json({
      success: true,
      prompts: prompts.map((p, idx) => ({
        id: idx + 1,
        prompt: p,
        image_url: idx < 10 ? previewImages[idx]?.image_url : null
      })),
      pricing,
      generated_images: true,
      preview_count: previewImages.length,
      total_batches: totalBatches,
      estimated_time: pricing.estimatedTime
    })
    
  } catch (error) {
    console.error('Mass generation error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Generate production prompts using discovered vibes
app.post('/api/themes/:themeId/generate', async (c) => {
  const { env } = c
  const themeId = c.req.param('themeId')
  const { count = 100, varietyLevel = 'medium', notes, mode = 'tested' } = await c.req.json()
  
  try {
    // Get theme and discovered patterns
    const theme = await env.DB.prepare(`
      SELECT t.*, s.master_prompt 
      FROM themes t
      LEFT JOIN styles s ON t.style_id = s.id
      WHERE t.theme_id = ?
    `).bind(themeId).first()
    
    // Remove the strict requirement - allow generation at any stage
    // if (!theme.can_generate) {
    //   return c.json({ 
    //     success: false, 
    //     error: 'Theme needs at least 5 approved elements for production' 
    //   }, 400)
    // }
    
    // Get passed and failed tests to understand patterns
    const passedTests = await env.DB.prepare(`
      SELECT element, element_type, vibe_tested 
      FROM testing_elements
      WHERE theme_id = ? AND test_result = 'pass'
    `).bind(themeId).all()
    
    const failedTests = await env.DB.prepare(`
      SELECT element, element_type, vibe_tested 
      FROM testing_elements
      WHERE theme_id = ? AND test_result = 'fail'
    `).bind(themeId).all()
    
    console.log(`Found ${passedTests.results.length} approved prompts for theme: ${theme.theme}`)
    if (passedTests.results.length > 0) {
      console.log('Sample approved prompts:', passedTests.results.slice(0, 3).map(t => t.element))
    }
    
    // Analyze patterns from test results
    const discoveredPatterns = {
      working_vibes: [],
      failed_patterns: [],
      boundary_rules: []
    }
    
    // Extract what worked
    passedTests.results.forEach(test => {
      if (test.vibe_tested) {
        discoveredPatterns.working_vibes.push(test.vibe_tested)
      }
    })
    
    // Extract what failed
    failedTests.results.forEach(test => {
      if (test.vibe_tested) {
        discoveredPatterns.failed_patterns.push(test.vibe_tested)
      }
    })
    
    // Determine generation strategy based on mode and available data
    const hasApprovedPrompts = passedTests.results.length > 0
    const generationMode = mode || (hasApprovedPrompts ? 'tested' : 'freeform')
    
    // Use OpenAI to generate based on discovered vibes
    let prompts = []
    
    if (env.OPENAI_API_KEY) {
      console.log('OpenAI API key is configured, proceeding with generation...')
      let generationPrompt = ''
      
      if (generationMode === 'freeform') {
        // Free-form generation using only master template
        generationPrompt = `Generate ${count} creative prompt variations.

Theme: ${theme.theme}
Master Template: ${theme.master_prompt}

CRITICAL RULES:
1. EVERY prompt MUST use the EXACT master template structure
2. ONLY replace [subject], [action], [world] placeholders
3. Keep ALL other words from the template unchanged
4. Each prompt must be COMPLETE, not just the filled values

Since no testing has been done yet, explore creative possibilities within the theme concept.
Be imaginative but respect the theme's core identity.

VARIETY LEVEL: ${varietyLevel}
- low: Conservative, safe variations
- medium: Balanced creativity
- high: Bold, experimental combinations

${notes ? `Additional Notes:\n${notes}` : ''}

Return ONLY valid JSON:
[{"prompt": "FULL MASTER TEMPLATE with placeholders filled", "conceptual_basis": "creative exploration"}]`
        
      } else if (generationMode === 'partial') {
        // Partial mode - use limited approved prompts + exploration
        generationPrompt = `Generate ${count} creative prompt variations.

Theme: ${theme.theme}
Master Template: ${theme.master_prompt}

CRITICAL RULES:
1. EVERY prompt MUST use the EXACT master template structure
2. ONLY replace [subject], [action], [world] placeholders
3. Keep ALL other words from the template unchanged
4. Each prompt must be COMPLETE, not just the filled values

LIMITED APPROVED ELEMENTS (${passedTests.results.length} approved):
${passedTests.results.map(t => t.element).slice(0, 5).join('\n')}

Since testing is incomplete, use these approved elements as inspiration but also explore new combinations.
Mix proven elements with creative exploration.

VARIETY LEVEL: ${varietyLevel}

${notes ? `Additional Notes:\n${notes}` : ''}

Return ONLY valid JSON:
[{"prompt": "FULL MASTER TEMPLATE with placeholders filled", "conceptual_basis": "partial data + exploration"}]`
        
      } else {
        // Tested mode - full vibe-based generation
        generationPrompt = `Generate ${count} creative prompt variations.

Theme: ${theme.theme}
Master Template: ${theme.master_prompt}
Testing Strategy: ${theme.testing_strategy || 'boundary_mapping'}

CRITICAL RULES:
1. EVERY prompt MUST use the EXACT master template structure
2. ONLY replace [subject], [action], [world] placeholders
3. Keep ALL other words from the template unchanged
4. Each prompt must be COMPLETE, not just the filled values

DISCOVERED WORKING VIBES (${passedTests.results.length} approved):
${discoveredPatterns.working_vibes.slice(0, 10).join('\n')}

DISCOVERED FAILURES (AVOID):
${discoveredPatterns.failed_patterns.slice(0, 5).join('\n')}

VARIETY LEVEL: ${varietyLevel}
- low: Stay well within proven vibes
- medium: Explore within discovered conceptual space
- high: Push boundaries based on what worked

Generate creative variations that respect the VIBE and CONCEPTUAL BOUNDARIES discovered, not literal copies.

${notes ? `Additional Notes:\n${notes}` : ''}

Return ONLY valid JSON:
[{"prompt": "FULL MASTER TEMPLATE with placeholders filled", "conceptual_basis": "what vibe/pattern this is based on"}]`
      }

      try {
        console.log(`Calling OpenAI for production generation - Theme: ${theme.theme}, Count: ${count}, Mode: ${generationMode}`)
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-4o',  // Using full GPT-4o for best vibe understanding and prompt generation
            messages: [{ role: 'user', content: generationPrompt }],
            temperature: varietyLevel === 'high' ? 0.9 : varietyLevel === 'low' ? 0.3 : 0.6
          })
        })
        
        if (response.ok) {
          const data = await response.json()
          const content = data.choices[0].message.content
          console.log(`OpenAI generated response for ${theme.theme}`)
          const match = content.match(/\[[\s\S]*\]/)
          if (match) {
            const generated = JSON.parse(match[0])
            prompts = generated.map(g => ({
              prompt: g.prompt,
              variety: varietyLevel,
              conceptual_basis: g.conceptual_basis
            }))
            console.log(`Successfully generated ${prompts.length} NEW prompts via OpenAI`)
          } else {
            console.error('Could not parse OpenAI response - no JSON array found')
          }
        } else {
          const errorData = await response.text()
          console.error(`OpenAI API error: ${response.status} - ${errorData}`)
        }
      } catch (error) {
        console.error('OpenAI generation error:', error)
      }
    }
    
    // Fallback if OpenAI fails - simple vibe-aware generation
    if (prompts.length === 0) {
      console.warn(`⚠️ FALLBACK MODE: OpenAI generation failed - reusing approved prompts for theme: ${theme.theme}`)
      // Extract successful patterns manually
      const workingElements = passedTests.results.map(t => t.element)
      
      // If we have NO approved elements, we can't generate anything
      if (workingElements.length === 0) {
        console.error('No approved elements to fall back on!')
        return c.json({ 
          success: false, 
          error: 'No approved prompts available and OpenAI generation failed. Please approve some test prompts first.',
          fallback_mode: true
        }, 400)
      }
      
      // Cycle through approved prompts (THIS IS NOT IDEAL - just a fallback)
      for (let i = 0; i < Math.min(count, workingElements.length); i++) {
        prompts.push({
          prompt: workingElements[i % workingElements.length],
          variety: varietyLevel,
          conceptual_basis: 'FALLBACK: Reusing approved prompt due to OpenAI failure'
        })
      }
    }
    
    // Save production notes if provided
    if (notes) {
      await env.DB.prepare(`
        INSERT INTO scaling_notes (theme_id, note)
        VALUES (?, ?)
      `).bind(themeId, notes).run()
    }
    
    // Record scaling session
    await env.DB.prepare(`
      INSERT INTO scaling_sessions (
        theme_id, variety_level, batch_size, total_generated, output_type
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(
      themeId,
      varietyLevel,
      count,
      prompts.length,
      'prompts_only'
    ).run()
    
    // Check if we're using fallback prompts
    const usingFallback = prompts.some(p => p.conceptual_basis?.includes('FALLBACK'))
    
    return c.json({ 
      success: true, 
      prompts,
      theme: {
        name: theme.theme,
        model: theme.model,
        style: theme.style
      },
      generation_mode: generationMode,
      using_fallback: usingFallback,
      message: usingFallback ? 'WARNING: OpenAI generation failed, reusing approved test prompts' : 'Successfully generated new prompts with GPT-4o'
    })
  } catch (error) {
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Delete theme and all related data
// Note: DELETE endpoint for themes is defined earlier in the file (around line 1043)
// This duplicate has been removed to avoid conflicts

// Add scaling rule
app.post('/api/themes/:themeId/rules', async (c) => {
  const { env } = c
  const themeId = c.req.param('themeId')
  const { ruleType, ruleValue } = await c.req.json()
  
  try {
    await env.DB.prepare(`
      INSERT INTO scaling_rules (theme_id, rule_type, rule_value)
      VALUES (?, ?, ?)
    `).bind(themeId, ruleType, ruleValue).run()
    
    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Get testing history
app.get('/api/themes/:themeId/history', async (c) => {
  const { env } = c
  const themeId = c.req.param('themeId')
  
  try {
    const sessions = await env.DB.prepare(`
      SELECT * FROM testing_sessions
      WHERE theme_id = ?
      ORDER BY session_date DESC
      LIMIT 20
    `).bind(themeId).all()
    
    return c.json({ success: true, sessions: sessions.results })
  } catch (error) {
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Generate test images using REAL AI models via FAL AI
app.post('/api/images/generate', async (c) => {
  const { env } = c
  const { prompts, model, style } = await c.req.json()
  
  try {
    // Check if FAL API key is configured
    if (!env.FAL_API_KEY) {
      console.warn('FAL_API_KEY not configured, using placeholders')
      // Fallback to placeholders if no API key
      const images = prompts.map(prompt => ({
        prompt,
        image_url: `https://picsum.photos/seed/${encodeURIComponent(prompt)}/512/512`,
        model: 'placeholder',
        status: 'no_api_key',
        note: 'FAL_API_KEY not configured - using placeholder images'
      }))
      return c.json({ 
        success: true, 
        images, 
        model_used: 'placeholder',
        using_real_api: false,
        api_keys_configured: false,
        message: 'Please configure FAL_API_KEY to use real image generation'
      })
    }
    
    console.log(`Generating real images with FAL AI model: ${model}`)
    
    // Use batch generation for efficiency
    const results = await generateImageBatch(
      prompts.map(p => typeof p === 'string' ? p : p.generated_prompt || p.prompt),
      model,
      env.FAL_API_KEY
    )
    
    const images = results.map((result, idx) => {
      if (result.error) {
        // If individual generation failed, use placeholder
        return {
          prompt: prompts[idx],
          image_url: `https://picsum.photos/seed/${encodeURIComponent(prompts[idx])}/512/512`,
          model: 'placeholder',
          status: 'error',
          error: result.error
        }
      }
      return {
        prompt: prompts[idx],
        image_url: result.url,
        model: result.model,
        status: 'success'
      }
    })
    
    return c.json({ 
      success: true, 
      images, 
      model_used: model,
      using_real_api: true,
      api_keys_configured: true,
      message: 'Images generated successfully using FAL AI'
    })
  } catch (error) {
    console.error('Image generation error:', error)
    // Fallback to placeholders on error
    const images = prompts.map(prompt => ({
      prompt,
      image_url: `https://picsum.photos/seed/${encodeURIComponent(prompt)}/512/512`,
      model: 'placeholder',
      status: 'error',
      error: errorMessage(c, error, 'Internal server error')
    }))
    return c.json({ 
      success: true, 
      images, 
      using_placeholder: true,
      error: errorMessage(c, error, 'Internal server error') 
    })
  }
})

// Test page for debugging Gallery
app.get('/test-gallery', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Gallery Button Test</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gray-900 text-white p-8">
        <h1 class="text-3xl mb-6">🔍 Gallery Button Debug Test</h1>
        
        <div class="space-y-4 mb-8">
            <!-- Test 1: Simple inline alert -->
            <button onclick="alert('✅ Simple inline alert works!')" 
                    class="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg">
                Test 1: Simple Alert
            </button>
            
            <!-- Test 2: Console log -->
            <button onclick="console.log('✅ Console log works!'); alert('Check console!')" 
                    class="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg">
                Test 2: Console Log
            </button>
            
            <!-- Test 3: Check if window.app exists -->
            <button onclick="alert('window.app exists: ' + (typeof window.app !== 'undefined') + '\\napp type: ' + typeof window.app)" 
                    class="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg">
                Test 3: Check window.app
            </button>
            
            <!-- Test 4: Try to call app.showGallery with safety -->
            <button onclick="if(window.app && window.app.showGallery) { console.log('🚀 Calling showGallery...'); window.app.showGallery(); } else { alert('❌ app.showGallery not found!\\nwindow.app: ' + typeof window.app); }" 
                    class="px-6 py-3 bg-orange-600 hover:bg-orange-700 rounded-lg">
                Test 4: Safe Gallery Call
            </button>
            
            <!-- Test 5: Direct method call like production -->
            <button onclick="app.showGallery()" 
                    class="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg font-medium">
                <i class="fas fa-images mr-2"></i>Test 5: Direct Gallery Call
            </button>
            
            <!-- Test 6: Gallery API test -->
            <button onclick="testGalleryAPI()" 
                    class="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg">
                Test 6: Gallery API
            </button>
        </div>
        
        <div id="debug-output" class="bg-gray-800 p-4 rounded-lg font-mono text-sm">
            <p>🔄 Loading debug info...</p>
        </div>
        
        <!-- Load dependencies and main app -->
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js"></script>
        
        <script>
            const output = document.getElementById('debug-output');
            
            function log(msg) {
                output.innerHTML += \`<p class="mb-1">\${new Date().toLocaleTimeString()}: \${msg}</p>\`;
                console.log(msg);
            }
            
            // Initialize debug info
            setTimeout(() => {
                output.innerHTML = '';
                log('🚀 Debug Test Initialized');
                log(\`📦 Axios: \${typeof axios !== 'undefined' ? '✅' : '❌'}\`);
                log(\`🏗️ FloodifyPromptEngineer class: \${typeof window.FloodifyPromptEngineer !== 'undefined' ? '✅' : '❌'}\`);
                log(\`🎯 window.app: \${typeof window.app !== 'undefined' ? '✅' : '❌'}\`);
                
                if (window.app) {
                    log(\`🔧 showGallery method: \${typeof window.app.showGallery === 'function' ? '✅' : '❌'}\`);
                    log(\`📋 App constructor: \${window.app.constructor.name}\`);
                }
                
                // List all available methods
                if (window.app) {
                    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(window.app))
                        .filter(name => typeof window.app[name] === 'function')
                        .slice(0, 10); // First 10 methods
                    log(\`🛠️ Methods: \${methods.join(', ')}...\`);
                }
            }, 1500);
            
            async function testGalleryAPI() {
                try {
                    log('🌐 Testing Gallery API...');
                    const response = await axios.get('/api/gallery/stats');
                    log(\`📊 Gallery has \${response.data.stats.total_images} images\`);
                    log('✅ Gallery API working!');
                } catch (error) {
                    log(\`❌ API Error: \${error.message}\`);
                }
            }
        </script>
    </body>
    </html>
  `)
})

// Main page
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Prompt Engineer</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
        <style>
          input[type="range"] {
            -webkit-appearance: none;
            appearance: none;
            background: transparent;
            cursor: pointer;
          }
          input[type="range"]::-webkit-slider-track {
            background: #4B5563;
            height: 8px;
            border-radius: 4px;
          }
          input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            background: #A855F7;
            height: 20px;
            width: 20px;
            border-radius: 50%;
            margin-top: -6px;
          }
        </style>
    </head>
    <body class="bg-gray-900 text-white">
        <div id="app"></div>
        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js?v=${Date.now()}&cache=bust"></script>
    </body>
    </html>
  `)
})








// ============= BULK DEPLOYMENT API =============

// Bulk Theme Upload API - Upload CSV or line-by-line theme data
app.post('/api/bulk/upload-themes', async (c) => {
  const { env } = c
  const { themes, model, masterPrompt } = await c.req.json()

  if (!themes || !Array.isArray(themes)) {
    return c.json({ success: false, error: 'Invalid themes data' }, 400)
  }

  if (!model || !masterPrompt) {
    return c.json({ success: false, error: 'Model and master prompt are required' }, 400)
  }

  const results = {
    uploaded: 0,
    skipped: 0,
    errors: []
  }

  for (let i = 0; i < themes.length; i++) {
    const t = themes[i]
    
    try {
      // Validate tier
      if (!["S-TIER", "A-TIER", "B-TIER", "C-TIER"].includes(t.tier)) {
        results.errors.push(`Line ${i + 1}: Invalid tier "${t.tier}" for theme "${t.theme}"`)
        continue
      }

      // Validate required fields
      if (!t.category || !t.theme || !t.tier) {
        results.errors.push(`Line ${i + 1}: Missing required fields (category, theme, tier)`)
        continue
      }

      // Check for duplicates
      const exists = await env.DB.prepare(`
        SELECT id FROM bulk_theme_profiles WHERE theme = ? AND category = ?
      `).bind(t.theme, t.category).first()

      if (exists) {
        results.skipped++
        continue // Skip duplicates silently
      }

      // Process tags - ensure it's an array
      let tagsArray = t.tags || []
      if (typeof tagsArray === 'string') {
        tagsArray = tagsArray.split(',').map((tag: string) => tag.trim())
      }

      // Insert new theme profile
      await env.DB.prepare(`
        INSERT INTO bulk_theme_profiles (category, theme, tier, tags, model, master_prompt)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        t.category,
        t.theme,
        t.tier,
        JSON.stringify(tagsArray),
        model,
        masterPrompt
      ).run()

      results.uploaded++
    } catch (error) {
      results.errors.push(`Line ${i + 1}: ${error.message}`)
    }
  }

  return c.json({ 
    success: true, 
    results: {
      uploaded: results.uploaded,
      skipped: results.skipped,
      errors: results.errors
    }
  })
})

// Get all available bulk themes for deployment
app.get('/api/bulk/themes', async (c) => {
  const { env } = c
  const { category, tier, model, search, page = '1', limit = '50' } = c.req.query()
  
  try {
    let query = `SELECT * FROM bulk_theme_profiles WHERE 1=1`
    const params: any[] = []
    
    // Add filters
    if (category) {
      query += ` AND category = ?`
      params.push(category)
    }
    
    if (tier) {
      query += ` AND tier = ?`
      params.push(tier)
    }
    
    if (model) {
      query += ` AND model = ?`
      params.push(model)
    }
    
    if (search) {
      query += ` AND (theme LIKE ? OR category LIKE ? OR tags LIKE ?)`
      params.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }
    
    // Add ordering and pagination
    query += ` ORDER BY created_at DESC`
    
    const offset = (parseInt(page) - 1) * parseInt(limit)
    query += ` LIMIT ? OFFSET ?`
    params.push(parseInt(limit), offset)
    
    const themes = await env.DB.prepare(query).bind(...params).all()
    
    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) as total FROM bulk_theme_profiles WHERE 1=1`
    const countParams: any[] = []
    
    if (category) {
      countQuery += ` AND category = ?`
      countParams.push(category)
    }
    if (tier) {
      countQuery += ` AND tier = ?`
      countParams.push(tier)
    }
    if (model) {
      countQuery += ` AND model = ?`
      countParams.push(model)
    }
    if (search) {
      countQuery += ` AND (theme LIKE ? OR category LIKE ? OR tags LIKE ?)`
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }
    
    const countResult = await env.DB.prepare(countQuery).bind(...countParams).first()
    
    const safeParseTags = (tagsValue: any) => {
      if (!tagsValue) return []
      if (Array.isArray(tagsValue)) return tagsValue
      if (typeof tagsValue !== 'string') return []
      try {
        return JSON.parse(tagsValue)
      } catch {
        return tagsValue.split(',').map((t) => t.trim()).filter(Boolean)
      }
    }

    // Parse tags JSON for each theme (safe)
    const themesWithParsedTags = themes.results?.map(theme => ({
      ...theme,
      tags: safeParseTags(theme.tags)
    })) || []
    
    return c.json({
      success: true,
      themes: themesWithParsedTags,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult?.total || 0,
        pages: Math.ceil((countResult?.total || 0) / parseInt(limit))
      }
    })
  } catch (error) {
    console.error('Get bulk themes error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Delete selected bulk theme profiles
app.delete('/api/bulk/theme-profiles', async (c) => {
  const { env } = c
  const { themeIds } = await c.req.json()
  
  try {
    console.log(`🗑️ Attempting to delete ${themeIds.length} theme profiles:`, themeIds)
    
    if (!themeIds || !Array.isArray(themeIds) || themeIds.length === 0) {
      return c.json({ success: false, error: 'No theme IDs provided' }, 400)
    }
    
    // Validate all IDs exist before deletion
    const placeholders = themeIds.map(() => '?').join(',')
    const existingThemes = await env.DB.prepare(`
      SELECT id, theme, category FROM bulk_theme_profiles 
      WHERE id IN (${placeholders})
    `).bind(...themeIds).all()
    
    if (!existingThemes.results || existingThemes.results.length === 0) {
      return c.json({ success: false, error: 'No valid theme profiles found to delete' }, 404)
    }
    
    // Log what we're about to delete
    console.log('🗑️ Deleting theme profiles:', existingThemes.results.map(t => `${t.theme} (${t.category})`))
    
    // First, delete related gallery videos that reference gallery images that reference these theme profiles
    await env.DB.prepare(`
      DELETE FROM gallery_videos 
      WHERE gallery_image_id IN (
        SELECT id FROM gallery_images 
        WHERE bulk_theme_profile_id IN (${placeholders})
      )
    `).bind(...themeIds).run()
    
    // Then, delete related gallery images that reference these theme profiles
    const galleryDeleteResult = await env.DB.prepare(`
      DELETE FROM gallery_images 
      WHERE bulk_theme_profile_id IN (${placeholders})
    `).bind(...themeIds).run()
    
    console.log(`🗑️ Deleted ${galleryDeleteResult.changes || 0} related gallery images and videos`)
    
    // Finally, delete from bulk_theme_profiles table
    const deleteResult = await env.DB.prepare(`
      DELETE FROM bulk_theme_profiles 
      WHERE id IN (${placeholders})
    `).bind(...themeIds).run()
    
    console.log(`✅ Successfully deleted ${deleteResult.changes || 0} theme profiles`)
    
    return c.json({
      success: true,
      message: `Successfully deleted ${deleteResult.changes || 0} theme profile${deleteResult.changes === 1 ? '' : 's'} and ${galleryDeleteResult.changes || 0} related gallery items`,
      deleted_count: deleteResult.changes || 0,
      deleted_gallery_items: galleryDeleteResult.changes || 0,
      deleted_themes: existingThemes.results.map(t => `${t.theme} (${t.category})`)
    })
    
  } catch (error) {
    console.error('Delete theme profiles error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Cancel active bulk deployment
app.post('/api/bulk/cancel/:sessionId', async (c) => {
  const { env } = c
  const sessionId = c.req.param('sessionId')
  
  if (!sessionId) {
    return c.json({ success: false, error: 'Session ID is required' }, 400)
  }
  
  try {
    // Import FAL cancellation function
    const { cancelSessionFalRequests } = await import('./bulk-deploy')
    
    let falCancelResults = null
    
    // Cancel active FAL API requests if FAL API key is configured
    if (env.FAL_API_KEY) {
      console.log(`🚫 Cancelling active FAL requests for session ${sessionId}`)
      falCancelResults = await cancelSessionFalRequests(sessionId, env.FAL_API_KEY)
      console.log(`🎯 FAL cancellation results:`, falCancelResults)
    } else {
      console.log('⚠️ FAL_API_KEY not configured, skipping FAL request cancellation')
    }
    
    // Insert cancellation flag into deployment logs
    const cancelMetadata = {
      cancelled: true,
      cancelled_at: new Date().toISOString(),
      fal_cancellation: falCancelResults || { message: 'FAL_API_KEY not configured' }
    }
    
    await env.DB.prepare(`
      INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      sessionId,
      'deployment_cancelled',
      '🛑 Deployment cancelled by user',
      JSON.stringify(cancelMetadata),
      'warning'
    ).run()
    
    console.log(`🛑 Bulk deployment ${sessionId} cancelled by user`)
    
    const responseMessage = falCancelResults 
      ? `Deployment cancelled. ${falCancelResults.cancelled} FAL requests stopped, ${falCancelResults.failed} failed to cancel.`
      : 'Deployment cancellation requested'
    
    return c.json({ 
      success: true, 
      message: responseMessage,
      session_id: sessionId,
      fal_cancellation: falCancelResults
    })
    
  } catch (error) {
    console.error('Cancel deployment error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Start bulk deployment job (returns immediately with sessionId)
app.post('/api/bulk/deploy', async (c) => {
  const { env } = c
  const { themeIds } = await c.req.json()

  // Validate input
  if (!themeIds || !Array.isArray(themeIds) || themeIds.length === 0) {
    return c.json({ success: false, error: 'Theme IDs array is required' }, 400)
  }

  // Generate unique session ID
  const sessionId = `bulk-${Date.now()}-${Math.random().toString(36).substring(7)}`

  // Log deployment start immediately
  await logDeploymentStep(env, sessionId, "deployment_start", `Bulk deploy for ${themeIds.length} themes`, { themeIds })

  // Start background processing using c.executionCtx.waitUntil
  c.executionCtx.waitUntil(
    runBulkDeploy(env, sessionId, themeIds).catch(err => {
      console.error("Bulk deploy failed:", err)
      logDeploymentStep(env, sessionId, "deployment_error", err.message, {}, "error")
    })
  )

  // Return immediately with session ID for polling
  return c.json({ success: true, sessionId })
})

// Get deployment logs for a session (for real-time polling)
app.get('/api/bulk/logs/:sessionId', async (c) => {
  const { env } = c
  const sessionId = c.req.param('sessionId')
  
  try {
    const result = await getDeploymentLogs(env, sessionId)
    return c.json(result)
  } catch (error) {
    console.error('Error fetching deployment logs:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error'), logs: [] }, 500)
  }
})

// Simple API: Generate 200 prompt variations using OpenAI with LOCKED PREFIX
app.post('/api/bulk/generate-variations', async (c) => {
  const { env } = c
  const { themeId, masterPrompt, themeName, tags = [], category, count = 200 } = await c.req.json()
  
  try {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured')
    }
    
    // Get theme details from database to ensure we have all data
    const theme = await env.DB.prepare(`SELECT * FROM bulk_theme_profiles WHERE id = ?`)
      .bind(themeId)
      .first()
    
    if (!theme) {
      throw new Error(`Theme ${themeId} not found`)
    }
    
    // Handle both JSON array and double-escaped JSON string formats for tags
    let tagsArray = []
    try {
      if (theme.tags && typeof theme.tags === 'string') {
        // Check if it's a double-escaped JSON string (starts and ends with quotes and contains escaped quotes)
        if (theme.tags.startsWith('"[') && theme.tags.endsWith(']"') && theme.tags.includes('\\"')) {
          // First parse to remove outer quotes, then parse the inner JSON array
          const unescaped = JSON.parse(theme.tags)
          tagsArray = JSON.parse(unescaped)
        } else if (theme.tags.startsWith('[') && theme.tags.endsWith(']')) {
          // Regular JSON array string
          tagsArray = JSON.parse(theme.tags)
        } else {
          // Treat as comma-separated string
          tagsArray = theme.tags.split(',').map(tag => tag.trim()).filter(tag => tag)
        }
      } else if (Array.isArray(theme.tags)) {
        // Already an array
        tagsArray = theme.tags
      }
    } catch (e) {
      console.warn(`Failed to parse tags for theme ${themeId}:`, theme.tags, 'Error:', e.message)
      // Fallback: treat as comma-separated string
      if (theme.tags && typeof theme.tags === 'string') {
        tagsArray = theme.tags.split(',').map(tag => tag.trim()).filter(tag => tag)
      }
    }
    
    const tagsString = tagsArray.join(', ')
    
    // LOCKED PREFIX: masterPrompt + theme + tags (EXACTLY as specified)
    const lockedPrefix = `${theme.master_prompt}, ${theme.theme}, ${tagsString}`
    
    console.log(`🔒 LOCKED PREFIX: "${lockedPrefix}"`)
    console.log(`Generating ${count} variations for theme: ${themeName}`)
    
    // BATCHED APPROACH: Generate 8 batches of 25 prompts each
    const BATCH_SIZE = 25
    const TOTAL_BATCHES = Math.ceil(count / BATCH_SIZE) // 200 ÷ 25 = 8 batches
    const allPrompts: string[] = []
    
    console.log(`🔄 Starting batched generation: ${TOTAL_BATCHES} batches of ${BATCH_SIZE} prompts each`)
    
    for (let batchIndex = 0; batchIndex < TOTAL_BATCHES; batchIndex++) {
      const currentBatch = batchIndex + 1
      const isLastBatch = currentBatch === TOTAL_BATCHES
      const promptsInThisBatch = isLastBatch ? (count - (batchIndex * BATCH_SIZE)) : BATCH_SIZE
      
      console.log(`📦 Batch ${currentBatch}/${TOTAL_BATCHES}: Generating ${promptsInThisBatch} prompts`)
      
      const systemPrompt = `
You are generating safe, creative prompt variations for image generation.
You must produce exactly ${promptsInThisBatch} variations.
Do not output numbering. One variation per line.

RULES:
1. Every variation MUST begin with this LOCKED prefix:
   "${lockedPrefix}"
2. After this prefix, add a unique subject + single clear action (object or person).
3. If the theme excludes people → 100% environments/props with actions.
4. If people allowed → at least 40% environment-only, at least 30% people.
5. No gore, violence, nudity, illegal content, brands, or unsafe items.
6. Format: ${promptsInThisBatch} lines, each variation is one single descriptive line. No numbering or commentary.
7. Make each variation unique - avoid repeating concepts from previous batches.

Example output format:
${lockedPrefix}, a CRT monitor glowing with pixel art
${lockedPrefix}, a figure waiting in neon-lit doorway
${lockedPrefix}, holographic displays flickering in darkness
`

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: systemPrompt }],
          temperature: 0.8,
          max_tokens: 1500 // Reduced since we're asking for fewer prompts per batch
        })
      })

      if (!response.ok) {
        throw new Error(`OpenAI API error in batch ${currentBatch}: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      const content = data.choices[0].message.content
      const lines = content
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line)

      // VALIDATE this batch - Must be exactly the expected number
      if (lines.length !== promptsInThisBatch) {
        console.error(`❌ Batch ${currentBatch}: OpenAI returned ${lines.length} lines instead of ${promptsInThisBatch}`)
        throw new Error(`Batch ${currentBatch}: OpenAI returned ${lines.length} variations, expected exactly ${promptsInThisBatch}. Deployment stopped.`)
      }
      
      // Add to master collection
      allPrompts.push(...lines)
      
      const progressPercent = Math.round((currentBatch / TOTAL_BATCHES) * 25) // 25% of total progress is for prompts
      console.log(`✅ Batch ${currentBatch}/${TOTAL_BATCHES} completed: ${lines.length} prompts added (${progressPercent}% total progress)`)
      
      // Small delay between batches to be nice to OpenAI API
      if (currentBatch < TOTAL_BATCHES) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    console.log(`🎉 ALL BATCHES COMPLETED: Generated exactly ${allPrompts.length} variations total`)
    
    // Use allPrompts instead of lines for the rest of the function
    const lines = allPrompts
    console.log(`📋 First 3 variations:`, lines.slice(0, 3))
    
    return c.json({ 
      success: true, 
      variations: lines.map((prompt, index) => ({
        id: index + 1,
        prompt: prompt
      })),
      locked_prefix: lockedPrefix
    })
  } catch (error) {
    console.error('Generate variations error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Simple API: Generate images for variations and save to gallery (with batch progress)
app.post('/api/bulk/generate-images', async (c) => {
  const { env } = c
  const { themeId, variations, model, themeName, category, tier, sessionId } = await c.req.json()
  
  try {
    if (!variations || variations.length === 0) {
      throw new Error('No variations provided')
    }
    
    console.log(`📊 Processing batch of ${variations.length} variations using ${model}`)
    let generatedCount = 0
    let savedCount = 0
    
    // Process ALL variations with FAL.ai Queue API for mass generation
    // Following 5 Golden Rules: Backend handles ALL business logic for 200 images
    
    const batchId = `batch-${Date.now()}-${themeId}`
    const imageService = await import('./image-service')
    
    if (env.FAL_API_KEY && variations.length > 0) {
      console.log(`🎨 Generating ALL ${variations.length} images using ${model} with FAL.ai Queue API`)
      
      try {
        // Use batch generation with proper concurrent limit handling (10 concurrent max)
        const results = await imageService.generateImageBatch(
          variations.map(v => v.prompt),
          model,
          env.FAL_API_KEY
        )
        
        console.log(`📊 Generated ${results.filter(r => r.url).length}/${variations.length} images successfully`)
        
        // Save ALL results to database with theme categorization
        for (let i = 0; i < variations.length; i++) {
          const variation = variations[i]
          const result = results[i] || { url: null, error: 'Generation failed' }
          
          try {
            await env.DB.prepare(`
              INSERT INTO gallery_images (
                batch_id, theme_id, theme_name, model, prompt, image_url, 
                style, tags, bulk_theme_profile_id, session_id, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `).bind(
              batchId,
              themeId.toString(),
              themeName,
              model,
              variation.prompt,
              result.url, // Will be null if generation failed, but prompt still saved
              tier, // Use tier as style
              JSON.stringify([category, tier, model]), // Include model in tags for better categorization
              themeId,
              sessionId || batchId // Use sessionId if provided, fallback to batchId for legacy calls
            ).run()
            
            savedCount++
            if (result.url) generatedCount++
            
          } catch (dbError) {
            console.error(`Database save failed for variation ${i + 1}:`, dbError)
          }
        }
        
      } catch (batchError) {
        console.error(`Batch generation failed for ${model}:`, batchError)
        
        // Fallback: Save all prompts without images if batch generation fails
        for (let i = 0; i < variations.length; i++) {
          const variation = variations[i]
          
          try {
            await env.DB.prepare(`
              INSERT INTO gallery_images (
                batch_id, theme_id, theme_name, model, prompt, image_url, 
                style, tags, bulk_theme_profile_id, session_id, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `).bind(
              batchId,
              themeId.toString(),
              themeName,
              model,
              variation.prompt,
              null, // No image due to batch failure
              tier,
              JSON.stringify([category, tier, model, 'batch_failed']),
              themeId,
              sessionId || batchId // Use sessionId if provided, fallback to batchId for legacy calls
            ).run()
            
            savedCount++
            
          } catch (dbError) {
            console.error(`Database save failed for variation ${i + 1}:`, dbError)
          }
        }
      }
    } else {
      // No FAL API key - save prompts without images
      console.log(`⚠️ No FAL_API_KEY configured - saving prompts without images`)
      
      for (let i = 0; i < variations.length; i++) {
        const variation = variations[i]
        
        try {
          await env.DB.prepare(`
            INSERT INTO gallery_images (
              batch_id, theme_id, theme_name, model, prompt, image_url, 
              style, tags, bulk_theme_profile_id, session_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `).bind(
            batchId,
            themeId.toString(),
            themeName,
            model,
            variation.prompt,
            null, // No image - API key not configured
            tier,
            JSON.stringify([category, tier, model, 'no_api_key']),
            themeId,
            sessionId || batchId // Use sessionId if provided, fallback to batchId for legacy calls
          ).run()
          
          savedCount++
          
        } catch (dbError) {
          console.error(`Database save failed for variation ${i + 1}:`, dbError)
        }
      }
    }
    
    console.log(`✅ Batch complete: ${generatedCount} images generated, ${savedCount} prompts saved`)
    
    return c.json({ 
      success: true, 
      generated_count: generatedCount,
      saved_count: savedCount,
      total_processed: variations.length,
      message: `Generated ${generatedCount} images and saved ${savedCount} prompts to gallery`
    })
  } catch (error) {
    console.error('Generate images error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// ============= FAL CANCELLATION API =============

// Cancel FAL video generation request
app.post('/api/video/cancel', async (c) => {
  const { env } = c
  const { sessionId } = await c.req.json()
  
  try {
    if (!sessionId) {
      throw new Error('Session ID is required')
    }
    
    // Get all pending FAL requests for this session
    const pendingVideos = await env.DB.prepare(`
      SELECT id, fal_request_id, video_url
      FROM gallery_videos 
      WHERE session_id = ? AND fal_request_id IS NOT NULL AND video_url IS NULL
    `).bind(sessionId).all()
    
    if (pendingVideos.results?.length === 0) {
      return c.json({ 
        success: false, 
        message: 'No pending requests found for this session' 
      })
    }
    
    let cancelledCount = 0
    let errors = []
    
    // Cancel each FAL request
    for (const video of pendingVideos.results || []) {
      try {
        console.log(`🛑 Cancelling FAL request: ${video.fal_request_id}`)
        
        const cancelResponse = await fetch(
          `https://queue.fal.run/fal-ai/pixverse/v5/image-to-video/requests/${video.fal_request_id}/cancel`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Key ${env.FAL_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        )
        
        if (cancelResponse.ok) {
          // Mark video as cancelled in database
          await env.DB.prepare(`
            UPDATE gallery_videos 
            SET video_url = 'CANCELLED', fal_request_id = NULL
            WHERE id = ?
          `).bind(video.id).run()
          
          cancelledCount++
          console.log(`✅ Successfully cancelled request: ${video.fal_request_id}`)
        } else {
          const errorText = await cancelResponse.text()
          errors.push(`Failed to cancel ${video.fal_request_id}: ${cancelResponse.status} ${errorText}`)
          console.log(`❌ Failed to cancel ${video.fal_request_id}: ${cancelResponse.status}`)
        }
        
      } catch (error) {
        errors.push(`Error cancelling ${video.fal_request_id}: ${error.message}`)
        console.error(`❌ Error cancelling request ${video.fal_request_id}:`, error)
      }
    }
    
    return c.json({
      success: cancelledCount > 0,
      cancelledCount,
      totalRequests: pendingVideos.results?.length || 0,
      errors: errors.length > 0 ? errors : undefined,
      message: `Cancelled ${cancelledCount} out of ${pendingVideos.results?.length || 0} requests`
    })
    
  } catch (error) {
    console.error('Cancel video generation error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// ============= GALLERY SESSIONS API =============

// List all sessions from gallery images
app.get('/api/gallery/sessions', async (c) => {
  const { env } = c
  
  try {
    // Get image sessions
    const imageSessionsResult = await env.DB.prepare(`
      SELECT 
        session_id,
        COUNT(*) as image_count,
        COUNT(image_url) as images_with_url,
        MIN(created_at) as started_at,
        MAX(created_at) as last_image_at,
        theme_name,
        model
      FROM gallery_images 
      WHERE session_id IS NOT NULL
      GROUP BY session_id, theme_name, model
      ORDER BY started_at DESC
    `).all()
    
    const imageSessions = imageSessionsResult.results || []
    
    // Add video counts to image sessions
    for (const session of imageSessions) {
      if (session.session_id.startsWith('bulk-video-')) {
        const videoCountResult = await env.DB.prepare(`
          SELECT COUNT(*) as video_count
          FROM gallery_videos
          WHERE session_id = ?
        `).bind(session.session_id).first()
        
        session.video_count = videoCountResult?.video_count || 0
      } else {
        session.video_count = 0
      }
    }
    
    // Get pure video sessions (videos without image sessions)
    const videoSessionsResult = await env.DB.prepare(`
      SELECT 
        session_id,
        COUNT(*) as video_count,
        MIN(created_at) as started_at,
        MAX(created_at) as last_image_at,
        model,
        prompt
      FROM gallery_videos 
      WHERE session_id IS NOT NULL
        AND session_id NOT IN (
          SELECT DISTINCT session_id FROM gallery_images WHERE session_id IS NOT NULL
        )
      GROUP BY session_id, model, prompt
      ORDER BY started_at DESC
    `).all()
    
    const videoSessions = (videoSessionsResult.results || []).map(session => {
      // Determine status based on timing (if last video was > 2 min ago, assume complete)
      const lastVideoTime = new Date(session.last_image_at).getTime()
      const timeSinceLastVideo = Date.now() - lastVideoTime
      const isComplete = timeSinceLastVideo > 120000 // 2 minutes
      
      return {
        ...session,
        image_count: 0,
        images_with_url: 0,
        theme_name: session.prompt || 'Video Session',
        video_count: session.video_count,
        is_video_session: true,
        status: isComplete ? 'complete' : 'processing'
      }
    })
    
    // Combine and sort by date
    const allSessions = [...imageSessions, ...videoSessions].sort((a, b) => {
      return new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
    })
    
    return c.json({ 
      success: true, 
      sessions: allSessions
    })
  } catch (error) {
    console.error('Get gallery sessions error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Get images/videos in a specific session
app.get('/api/gallery/session/:sessionId', async (c) => {
  const { env } = c
  const sessionId = c.req.param('sessionId')
  
  try {
    // Check if this is a pure video session (like ultra-simple-*)
    if (sessionId.startsWith('ultra-simple-') || sessionId.startsWith('video-')) {
      const videoResult = await env.DB.prepare(`
        SELECT 
          id,
          video_url,
          prompt,
          model,
          aspect_ratio,
          resolution,
          duration,
          created_at,
          image_id,
          gallery_image_id
        FROM gallery_videos 
        WHERE session_id = ?
        ORDER BY created_at ASC
      `).bind(sessionId).all()
      
      return c.json({ 
        success: true, 
        videos: videoResult.results || [],
        session_id: sessionId,
        is_video_session: true
      })
    }
    
    // Get images for image sessions
    const result = await env.DB.prepare(`
      SELECT * FROM gallery_images 
      WHERE session_id = ?
      ORDER BY created_at ASC
    `).bind(sessionId).all()
    
    // Check if this is a video session and add video URLs
    if (sessionId.startsWith('bulk-video-')) {
      const videoResult = await env.DB.prepare(`
        SELECT gallery_image_id, video_url, created_at 
        FROM gallery_videos 
        WHERE session_id = ?
      `).bind(sessionId).all()
      
      // Create a map for O(1) lookup
      const videoMap = {}
      for (const video of (videoResult.results || [])) {
        videoMap[video.gallery_image_id] = video.video_url
      }
      
      // Add video_url to each image object
      const imagesWithVideos = (result.results || []).map(img => ({
        ...img,
        video_url_generated: videoMap[img.id] || null
      }))
      
      return c.json({ 
        success: true, 
        images: imagesWithVideos,
        session_id: sessionId,
        has_videos: true
      })
    }
    
    // Regular sessions - unchanged
    return c.json({ 
      success: true, 
      images: result.results || [],
      session_id: sessionId
    })
  } catch (error) {
    console.error('Get session images error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Debug endpoint to check test mode status
app.get('/api/debug/test-mode', async (c) => {
  const { env } = c
  const hasValidKey = env.FAL_API_KEY && env.FAL_API_KEY !== 'your-fal-api-key' && env.FAL_API_KEY.length > 10
  const isTestMode = !hasValidKey
  
  return c.json({
    success: true,
    isTestMode,
    hasApiKey: !!env.FAL_API_KEY,
    apiKeyType: env.FAL_API_KEY ? typeof env.FAL_API_KEY : 'undefined',
    keyLength: env.FAL_API_KEY ? env.FAL_API_KEY.length : 0,
    keyPreview: env.FAL_API_KEY ? env.FAL_API_KEY.substring(0, 10) + '...' : 'none'
  })
})

// Import bulk video worker
import { runBulkVideoGeneration, runBulkVideoGenerationMultiple, logVideoStep } from './bulk-video'

// Bulk Video Generation - Background Worker Pattern (like bulk deployment)
app.post('/api/bulk/generate-videos', async (c) => {
  const { env } = c
  const { sessionId, aspectRatio = '1:1', videoModel = 'runway', useOriginalPrompt = false } = await c.req.json()

  // Validate input
  if (!sessionId) {
    return c.json({ success: false, error: 'Source session ID is required' }, 400)
  }

  try {
    // Validate that source session exists and has images
    const result = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM gallery_images 
      WHERE session_id = ? AND image_url IS NOT NULL
    `).bind(sessionId).first()
    
    const imageCount = result?.count || 0
    if (imageCount === 0) {
      return c.json({ success: false, error: 'No images found for session' }, 404)
    }

    // Generate unique video session ID
    const videoSessionId = `bulk-video-${Date.now()}-${Math.random().toString(36).substring(7)}`

    // Log video deployment start immediately
    await logVideoStep(env, videoSessionId, "video_deployment_start", `🎬 Bulk video generation for ${imageCount} images`, { 
      sourceSessionId: sessionId,
      imageCount
    })

    // Start background processing using c.executionCtx.waitUntil
    c.executionCtx.waitUntil(
      runBulkVideoGeneration(env, videoSessionId, sessionId, aspectRatio, videoModel, useOriginalPrompt).catch(err => {
        console.error("Bulk video generation failed:", err)
        logVideoStep(env, videoSessionId, "video_deployment_error", err.message, {}, "error")
      })
    )

    // Return immediately with session ID for polling (same pattern as bulk deployment)
    return c.json({ 
      success: true, 
      videoSessionId,
      sourceSessionId: sessionId,
      totalImages: imageCount,
      message: `Video generation started for ${imageCount} images`
    })
    
  } catch (error) {
    console.error('Bulk video generation error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Import the multiple sessions function
import { runBulkVideoGenerationMultiple } from './bulk-video'

// Bulk Video Generation for Multiple Sessions - Parallel Processing
app.post('/api/bulk/generate-videos-multiple', async (c) => {
  const { env } = c
  const { sessionIds, aspectRatio = '1:1', videoModel = 'runway', useOriginalPrompt = false, customVideoPrompts } = await c.req.json()

  // Validate input
  if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
    return c.json({ success: false, error: 'Array of source session IDs is required' }, 400)
  }

  try {
    // Validate that all sessions exist and have images
    const validSessions = []
    for (const sessionId of sessionIds) {
      const result = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM gallery_images 
        WHERE session_id = ? AND image_url IS NOT NULL
      `).bind(sessionId).first()
      
      const imageCount = result?.count || 0
      if (imageCount > 0) {
        validSessions.push({ sessionId, imageCount })
      }
    }

    if (validSessions.length === 0) {
      return c.json({ success: false, error: 'No valid sessions with images found' }, 404)
    }

    // Generate master session ID for tracking all parallel operations
    const masterSessionId = `bulk-video-multi-${Date.now()}-${Math.random().toString(36).substring(7)}`
    const totalImages = validSessions.reduce((sum, s) => sum + s.imageCount, 0)

    // Log master deployment start
    await logVideoStep(env, masterSessionId, "video_deployment_start", 
      `🎬🎬 Bulk video generation for ${validSessions.length} sessions (${totalImages} total images)`, { 
      sourceSessionIds: validSessions.map(s => s.sessionId),
      sessionCount: validSessions.length,
      totalImages,
      aspectRatio: aspectRatio,
      videoModel: videoModel,
      useOriginalPrompt: useOriginalPrompt,
      customVideoPrompts: customVideoPrompts ? 'Smart Action Detection enabled' : null,
      sessionDetails: validSessions
    })

    // Start background parallel processing
    c.executionCtx.waitUntil(
      runBulkVideoGenerationMultiple(
        env, 
        masterSessionId, 
        validSessions.map(s => s.sessionId),
        aspectRatio,
        videoModel,
        useOriginalPrompt,
        customVideoPrompts
      ).catch(err => {
        console.error("Bulk video generation (multiple) failed:", err)
        logVideoStep(env, masterSessionId, "video_deployment_error", err.message, {}, "error")
      })
    )

    // Return immediately with master session ID and details
    return c.json({ 
      success: true, 
      masterSessionId,
      sessionCount: validSessions.length,
      sourceSessionIds: validSessions.map(s => s.sessionId),
      totalImages,
      sessionDetails: validSessions,
      message: `Video generation started for ${validSessions.length} sessions (${totalImages} images total)`
    })
    
  } catch (error) {
    console.error('Bulk video generation (multiple) error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Cancel active bulk video generation
app.post('/api/bulk/cancel-video/:sessionId', async (c) => {
  const { env } = c
  const sessionId = c.req.param('sessionId')
  
  if (!sessionId) {
    return c.json({ success: false, error: 'Session ID is required' }, 400)
  }
  
  try {
    // Insert cancellation flag into deployment logs
    await env.DB.prepare(`
      INSERT INTO deployment_logs (session_id, step_type, message, metadata, log_level, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      sessionId,
      'video_deployment_cancelled',
      '🛑 Video generation cancelled by user',
      JSON.stringify({ cancelled: true, cancelled_at: new Date().toISOString() }),
      'warning'
    ).run()
    
    console.log(`🛑 Bulk video generation ${sessionId} cancelled by user`)
    
    return c.json({ 
      success: true, 
      message: 'Video generation cancellation requested',
      session_id: sessionId
    })
    
  } catch (error) {
    console.error('Cancel video generation error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// ============= SIMPLE VIDEO GENERATION =============

// Simple video generation - clean, separate from existing code
app.post('/api/simple-video-generation', async (c) => {
  const { env } = c
  
  try {
    const { sessionIds, aspectRatio, prompt, videoModel } = await c.req.json()
    
    // Validate required parameters
    if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
      return c.json({ 
        success: false, 
        error: 'Missing required parameters: sessionIds (array)' 
      }, 400)
    }
    
    if (!aspectRatio || !prompt || !videoModel) {
      return c.json({ 
        success: false, 
        error: 'Missing required parameters: aspectRatio, prompt, videoModel' 
      }, 400)
    }
    
    // Validate video model
    if (videoModel !== 'pixverse') {
      return c.json({ 
        success: false, 
        error: 'Invalid video model. Must be: pixverse' 
      }, 400)
    }
    
    // Check if FAL API key is available
    if (!env.FAL_API_KEY) {
      return c.json({ 
        success: false, 
        error: 'FAL API key not configured' 
      }, 500)
    }
    
    console.log(`🎬 Starting simple video generation:`)
    console.log(`   Sessions: ${sessionIds.length}`)
    console.log(`   Aspect Ratio: ${aspectRatio}`)
    console.log(`   Prompt: ${prompt}`)
    console.log(`   Model: ${videoModel}`)
    
    // Generate videos using the enhanced function
    const result = await generateMultiselectVideos(env, {
      sessionIds,
      aspectRatio,
      prompt,
      videoModel,
      apiKey: env.FAL_API_KEY
    })
    
    console.log(`✅ Simple video generation completed:`, result)
    
    return c.json({
      success: result.success,
      videoSessionId: result.videoSessionId,
      totalImages: result.totalImages,
      videosGenerated: result.videosGenerated,
      videosFailed: result.videosFailed,
      message: result.message
    })
    
  } catch (error) {
    console.error('Simple video generation error:', error)
    return c.json({ 
      success: false, 
      error: errorMessage(c, error, 'Internal server error'),
      message: 'Simple video generation failed'
    }, 500)
  }
})

// ============= ULTRA SIMPLE VIDEO GENERATION (BRAND NEW) =============

app.post('/api/ultra-simple-video', async (c) => {
  const { env } = c
  
  try {
    const { sessionIds } = await c.req.json()
    
    if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
      return c.json({ 
        success: false, 
        error: 'sessionIds required (array)' 
      }, 400)
    }
    
    if (!env.FAL_API_KEY) {
      return c.json({ 
        success: false, 
        error: 'FAL API key not configured' 
      }, 500)
    }
    
    console.log(`🎬 ULTRA SIMPLE VIDEO - Starting for ${sessionIds.length} sessions`)
    
    const result = await generateUltraSimpleVideos(env, {
      sessionIds,
      apiKey: env.FAL_API_KEY
    })
    
    console.log(`✅ ULTRA SIMPLE VIDEO - Complete:`, result)
    
    return c.json({
      success: result.success,
      videoSessionId: result.videoSessionId,
      totalImages: result.totalImages,
      videosGenerated: result.videosGenerated,
      videosFailed: result.videosFailed
    })
    
  } catch (error) {
    console.error('Ultra simple video error:', error)
    return c.json({ 
      success: false, 
      error: (error as Error).message
    }, 500)
  }
})

// Get video deployment logs for a session (for real-time polling)
app.get('/api/bulk/video-logs/:sessionId', async (c) => {
  const { env } = c
  const sessionId = c.req.param('sessionId')
  
  try {
    const result = await getDeploymentLogs(env, sessionId)
    return c.json(result)
  } catch (error) {
    console.error('Error fetching video deployment logs:', error)
    return c.json({ success: false, error: (error as Error).message, logs: [] }, 500)
  }
})

// Legacy single bulk video (now deprecated but kept for compatibility)
app.post('/api/gallery/session/:sessionId/videos', async (c) => {
  const { env } = c
  const sessionId = c.req.param('sessionId')
  
  console.log('⚠️ Using legacy single bulk video endpoint - redirecting to new implementation')
  
  if (!sessionId) {
    return c.json({ success: false, error: 'Session ID is required' }, 400)
  }
  
  try {
    // Get all images with URLs from the source session
    const result = await env.DB.prepare(`
      SELECT * FROM gallery_images 
      WHERE session_id = ? AND image_url IS NOT NULL
      ORDER BY created_at ASC
    `).bind(sessionId).all()
    
    const images = result.results || []
    
    if (!images.length) {
      return c.json({ success: false, error: 'No images found for session' }, 404)
    }
    
    // Check if FAL API key is configured
    if (!env.FAL_API_KEY) {
      return c.json({ success: false, error: 'FAL API key not configured' }, 400)
    }
    
    // Generate new bulk video session ID (following chain of responsibility)
    const videoSessionId = `bulk-video-${Date.now()}-${Math.random().toString(36).substring(7)}`
    
    console.log(`🎬 Legacy endpoint: Starting bulk video generation for ${images.length} images`)
    console.log(`📦 Source session: ${sessionId}`)
    console.log(`🎯 Video session: ${videoSessionId}`)
    
    // Generate videos in batches of 25 (same as image generation for consistency)
    const BATCH_SIZE = 25
    const totalBatches = Math.ceil(images.length / BATCH_SIZE)
    let successCount = 0
    let errorCount = 0
    
    const videoService = await import('./video-service')
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * BATCH_SIZE
      const batchEnd = Math.min(batchStart + BATCH_SIZE, images.length)
      const batchImages = images.slice(batchStart, batchEnd)
      
      console.log(`📦 Processing video batch ${batchIndex + 1}/${totalBatches} (${batchImages.length} videos)`)
      
      // Process batch of videos (similar to bulk image generation)
      for (let i = 0; i < batchImages.length; i++) {
        const image = batchImages[i]
        
        try {
          // ✅ Reuse existing single video generation logic
          const videoResult = await videoService.generateVideo({
            imageUrl: image.image_url,
            prompt: 'subtle',  // Always use "subtle" for video generation
            aspectRatio: '16:9',
            resolution: '720p', 
            duration: '8',
            apiKey: env.FAL_API_KEY
          })
          
          // Save video to gallery_videos with proper session linking
          await env.DB.prepare(`
            INSERT INTO gallery_videos (
              session_id, image_id, gallery_image_id, theme_id, video_url, prompt, 
              model, aspect_ratio, resolution, duration, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `).bind(
            videoSessionId,           // New bulk video session
            image.id,                 // Link back to source image
            image.id,                 // gallery_image_id (legacy)
            image.theme_id,           // Preserve theme relationship
            videoResult.url,          // Generated video URL
            'subtle',                 // Always use "subtle" for video prompts
            isTestMode ? 'TEST-MODE' : 'pixverse-v5',  // Video generation model
            '16:9',
            '720p',
            '8s'
          ).run()
          
          console.log(`✅ Video ${successCount + 1}/${images.length}: ${videoResult.url}`)
          successCount++
          
        } catch (videoError) {
          console.error(`Failed to generate video for image ${image.id}:`, videoError)
          
          // Still save entry with null video_url for tracking
          try {
            await env.DB.prepare(`
              INSERT INTO gallery_videos (
                session_id, image_id, gallery_image_id, theme_id, video_url, prompt, 
                model, aspect_ratio, resolution, duration, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            `).bind(
              videoSessionId,
              image.id,
              image.id,
              image.theme_id,
              null,           // No video URL due to error
              image.prompt,
              'pixverse-v5',
              '16:9',
              '720p',
              '8s'
            ).run()
          } catch (dbError) {
            console.error(`Failed to save video record:`, dbError)
          }
          
          errorCount++
        }
      }
      
      console.log(`✅ Batch ${batchIndex + 1}/${totalBatches} completed`)
    }
    
    console.log(`🎉 Legacy bulk video generation completed: ${successCount} successful, ${errorCount} failed`)
    
    // Return legacy format for frontend compatibility
    return c.json({ 
      success: true, 
      video_url: successCount > 0 ? `Session ${videoSessionId} created with ${successCount} videos` : 'No videos were generated successfully',
      video_session_id: videoSessionId,
      images_count: images.length,
      videos_generated: successCount,
      videos_failed: errorCount,
      message: `Generated ${successCount}/${images.length} videos in session ${videoSessionId}`
    })
    
  } catch (error) {
    console.error('Legacy bulk video generation error:', error)
    return c.json({ success: false, error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Test endpoint to download Midjourney image from within Workers
app.get('/api/test-midjourney-download', async (c) => {
  const imageUrl = c.req.query('url')
  
  if (!imageUrl) {
    return c.json({ error: 'Missing url parameter' }, 400)
  }
  
  try {
    console.log('🧪 Testing download from Workers environment:', imageUrl)
    const response = await fetch(imageUrl, {
      headers: {
        'Cookie': c.env.MIDJOURNEY_COOKIE,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.midjourney.com/',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br'
      }
    })
    
    console.log('📥 Response status:', response.status)
    console.log('📥 Response headers:', Object.fromEntries(response.headers.entries()))
    
    if (response.ok) {
      const contentType = response.headers.get('content-type')
      const contentLength = response.headers.get('content-length')
      
      return c.json({
        success: true,
        status: response.status,
        contentType,
        contentLength,
        message: 'Download successful from Workers environment!'
      })
    } else {
      const errorText = await response.text()
      return c.json({
        success: false,
        status: response.status,
        error: errorText.substring(0, 500)
      }, response.status)
    }
  } catch (error) {
    console.error('❌ Download error:', error)
    return c.json({ error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// Test endpoint: Download from session and upload to Cloudinary
app.get('/api/test-session-to-cloudinary', async (c) => {
  const sessionId = c.req.query('sessionId')
  
  if (!sessionId) {
    return c.json({ error: 'Missing sessionId parameter' }, 400)
  }
  
  try {
    // Get first image from the session
    const images = await c.env.DB.prepare(`
      SELECT id, image_url, model FROM gallery_images 
      WHERE session_id = ? AND model = 'MIDJOURNEY' 
      LIMIT 1
    `).bind(sessionId).all()
    
    if (!images.results || images.results.length === 0) {
      return c.json({ error: 'No Midjourney images found in session' }, 404)
    }
    
    const image = images.results[0]
    console.log(`🧪 Testing: Download image ${image.id} from ${image.image_url}`)
    
    // Download image with proper headers
    const response = await fetch(image.image_url, {
      headers: {
        'Cookie': c.env.MIDJOURNEY_COOKIE,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.midjourney.com/',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br'
      }
    })
    
    if (!response.ok) {
      return c.json({ error: `Failed to download image: ${response.status}` }, 500)
    }
    
    const imageBlob = await response.arrayBuffer()
    console.log(`✅ Downloaded ${imageBlob.byteLength} bytes`)
    
    // Upload to Cloudinary
    const timestamp = Math.floor(Date.now() / 1000)
    const signatureString = `timestamp=${timestamp}${c.env.CLOUDINARY_API_SECRET}`
    
    // Create SHA-256 signature
    const encoder = new TextEncoder()
    const data = encoder.encode(signatureString)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    
    // Create form data
    const formData = new FormData()
    formData.append('file', new Blob([imageBlob], { type: 'image/png' }), 'test-image.png')
    formData.append('api_key', c.env.CLOUDINARY_API_KEY)
    formData.append('timestamp', timestamp.toString())
    formData.append('signature', signature)
    
    const uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${c.env.CLOUDINARY_CLOUD_NAME}/image/upload`,
      {
        method: 'POST',
        body: formData
      }
    )
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text()
      return c.json({ error: `Cloudinary upload failed: ${uploadResponse.status} - ${errorText}` }, 500)
    }
    
    const uploadResult = await uploadResponse.json()
    
    return c.json({
      success: true,
      message: 'Successfully downloaded from session and uploaded to Cloudinary!',
      imageId: image.id,
      originalUrl: image.image_url,
      downloadedSize: imageBlob.byteLength,
      cloudinaryResult: {
        publicId: uploadResult.public_id,
        secureUrl: uploadResult.secure_url,
        format: uploadResult.format,
        size: uploadResult.bytes
      }
    })
    
  } catch (error) {
    console.error('❌ Test error:', error)
    return c.json({ error: errorMessage(c, error, 'Internal server error') }, 500)
  }
})

// New status check endpoint for polling
app.get('/api/process/:sessionId/status', async (c) => {
  const sessionId = c.req.param('sessionId')
  
  try {
    const response = await fetch(`http://localhost:3001/process/${sessionId}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    const data = await response.json()
    return c.json(data, response.status)
  } catch (error) {
    console.error('Status proxy error:', error)
    return c.json({ error: 'Failed to connect to process server' }, 500)
  }
})

// Simple completion check - checks database for real completion
app.get('/api/session-complete/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')
  
  try {
    const response = await fetch(`http://localhost:3001/session-complete/${sessionId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    const data = await response.json()
    return c.json(data, response.status)
  } catch (error) {
    console.error('Session complete check error:', error)
    return c.json({ error: 'Failed to check session status' }, 500)
  }
})

export default app
