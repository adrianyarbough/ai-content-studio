# 🔑 API Key Setup for Real Image Generation

## Current Status
The system is currently using **placeholder images** because API keys are not configured. To enable REAL AI image generation, follow these steps:

## Supported Image Models

### 1. **SEED_DREAM** (ByteDance SeedDream V4)
- Provider: Fal.ai
- Best for: Gritty iPhone realism, candid shots
- API Required: FAL_API_KEY

### 2. **IMAGEN_4** (Google Imagen 4)  
- Provider: Google/OpenAI
- Best for: Clean animation, Pixar-style
- API Required: OPENAI_API_KEY or Google API

### 3. Other Supported Models
- flux-pro/ultra
- recraft-v3
- ideogram/V_3
- qwen-image

## Setup Instructions

### Step 1: Get Your API Keys

#### For Fal.ai (SEED_DREAM):
1. Go to https://fal.ai
2. Sign up/Login
3. Go to Dashboard → API Keys
4. Copy your API key

#### For OpenAI (DALL-E):
1. Go to https://platform.openai.com
2. Sign up/Login
3. Go to API Keys section
4. Create new secret key
5. Copy your API key

### Step 2: Configure Local Development

Edit the `.dev.vars` file:
```bash
# In /home/user/webapp/.dev.vars
OPENAI_API_KEY=sk-your-openai-key-here
FAL_API_KEY=your-fal-key-here
IMAGE_GENERATION_ENABLED=true
```

### Step 3: Configure Production (Cloudflare)

```bash
# Set secrets for production
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put FAL_API_KEY
npx wrangler secret put IMAGE_GENERATION_ENABLED
```

### Step 4: Restart the Application

```bash
pm2 restart webapp
```

## Testing Your Setup

1. Create a new theme
2. Select model (SEED_DREAM or IMAGEN_4)
3. Start testing
4. You should see:
   - "Images generated with [Model Name]" notification
   - Real AI-generated images instead of placeholders
   - Console logs showing "Using real AI image generation!"

## Troubleshooting

### Still Seeing Placeholders?
- Check console (F12) for messages
- Look for "Using placeholder images (API keys not configured)"
- Verify your .dev.vars file has correct keys
- Make sure IMAGE_GENERATION_ENABLED=true

### API Errors?
- Check API key validity
- Verify you have credits/quota remaining
- Check rate limits (we process 3 images at a time)

### Different Models Not Working?
- SEED_DREAM requires FAL_API_KEY
- IMAGEN_4 requires OPENAI_API_KEY
- Other models may need specific API keys

## Cost Considerations

### Approximate Costs:
- **Fal.ai (SEED_DREAM)**: ~$0.01-0.02 per image
- **OpenAI (DALL-E 3)**: ~$0.04-0.08 per image
- **Testing Round**: 5 images = ~$0.05-0.40
- **Production Batch**: 100 prompts = ~$1-8 (if generating images)

### Cost Saving Tips:
1. Use "Prompts Only" in production mode
2. Generate images only for approved elements
3. Use placeholders during development
4. Set smaller batch sizes

## Model Selection Guide

### When to use SEED_DREAM:
- iPhone/candid photography style
- Gritty, realistic textures
- Human subjects
- Street photography aesthetic

### When to use IMAGEN_4:
- Animation style
- Clean, cartoon aesthetics
- Fantasy/fictional subjects
- Pixar-like quality

## Security Notes

⚠️ **NEVER commit API keys to git!**
- .dev.vars is in .gitignore
- Use wrangler secrets for production
- Don't share keys in code
- Rotate keys regularly

## Current Configuration

To check your current setup:
1. Open browser console (F12)
2. Create a theme and start testing
3. Look for these messages:
   - "Using real AI image generation!" ✅
   - "Using placeholder images" ⚠️
   - Check response data for `using_real_api: true`

## Need Help?

If you're still having issues:
1. Check pm2 logs: `pm2 logs webapp --lines 50`
2. Check browser console for errors
3. Verify API endpoint responses
4. Test API keys directly with curl

Remember: The system works with placeholders too, so you can test the full workflow before adding real API keys!