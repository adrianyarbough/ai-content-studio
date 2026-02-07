# 🎯 Floodify Prompt Engineer - Complete Features & Tech Stack

## 📋 Table of Contents
- [Overview](#overview)
- [Core Features](#core-features)
- [Tech Stack](#tech-stack)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Architecture](#architecture)
- [External Integrations](#external-integrations)
- [Deployment](#deployment)

---

## 🎯 Overview

**Floodify Prompt Engineer** is a professional AI-powered content generation platform that transforms theme profiles into production-ready images and videos using advanced AI models. The system follows a Chain of Responsibility architecture pattern for maintainable, scalable content generation.

**Core Philosophy**: Test once, learn forever, scale intelligently

---

## ✨ Core Features

### 1. **Bulk Theme Management**
- **CSV Upload System**
  - Upload 500+ theme profiles via CSV
  - Enhanced CSV parsing with quoted fields support
  - "Verify Format" button for pre-upload validation
  - Duplicate detection (Category + Theme)
  - Tier validation (S-TIER, A-TIER, B-TIER, C-TIER)
  - Clear error messages with line numbers

- **Theme Categorization**
  - Professional tier system (S-TIER, A-TIER, B-TIER, C-TIER)
  - Category-based organization
  - Tag-based metadata system
  - Model assignment (SEED_DREAM, IMAGEN_4)

- **Bulk Operations**
  - Select multiple themes for batch processing
  - "Select All Visible" functionality
  - Bulk deletion with cascade cleanup
  - Theme filtering and search

### 2. **Bulk Deployment System**
- **OpenAI Integration**
  - Generate 200 unique prompts per theme using GPT-4o
  - Intelligent prompt variation generation
  - Theme-aware prompt engineering

- **Image Generation**
  - Mass image generation with SEED_DREAM and IMAGEN_4 models
  - FAL AI integration for image generation
  - Real-time progress tracking with live log streaming
  - Batch processing with error isolation
  - Request tracking and cancellation support

- **Progress Tracking**
  - Real-time deployment logs
  - Session-based progress monitoring
  - Error reporting and recovery
  - Deployment statistics

### 3. **Video Generation Pipeline**
- **Multiple Video Models**
  - **Runway Gen4 Turbo**: High-quality image-to-video (3 seconds)
  - **Pixverse v5**: Via FAL AI (5-8 seconds)
  - **Kling Video**: Via FAL AI (v2.5 Turbo Pro)

- **Bulk Video Generation**
  - Convert multiple gallery images to videos
  - User-selectable aspect ratios (1:1 Square, 9:16 Vertical)
  - Individual image-to-video conversion
  - Real-time progress tracking
  - Cancellation support

- **Image Proxy System**
  - R2 Image Proxy for Midjourney CDN compatibility
  - Prevents 403 errors from Runway API
  - Automatic proxy selection for Midjourney images
  - Direct URL usage for FAL images

- **Video-Image Pairing**
  - Fixed image-video pairing with proper gallery_image_id linkage
  - Progress reporting after every video
  - Session-based organization

### 4. **Gallery & Media Management**
- **Unified Gallery**
  - Combined images and videos in single interface
  - Advanced search and filtering
  - Theme-based filtering
  - Model-based filtering
  - Type filtering (images/videos/all)
  - Sort options (newest, oldest, random)

- **View Modes**
  - Grid view
  - List view
  - Masonry view
  - Browse by Theme
  - Browse by Session

- **Media Operations**
  - Individual image/video deletion with cascade cleanup
  - Bulk session deletion
  - Theme-based bulk deletion
  - Manual image upload
  - Session-based organization

- **Statistics Dashboard**
  - Total images count
  - Total videos count
  - Total themes count
  - Total batches count
  - Total models count
  - Popular themes listing

### 5. **Midjourney Import System**
- **Batch Import**
  - Import multiple Midjourney images via URLs
  - Automatic theme assignment
  - Session tracking
  - Progress monitoring
  - Status checking endpoint

- **Puppeteer Integration**
  - Downloads images from Midjourney CDN
  - Handles authentication cookies
  - Converts to base64 for processing
  - Service runs on port 3001

### 6. **Nano Banana Image Editing**
- **FAL AI Integration**
  - Image editing via Nano Banana model
  - Prompt-based image transformation
  - Aspect ratio control (9:16)
  - Batch processing support

### 7. **Theme Testing & Refinement**
- **Progressive Testing System**
  - Boundary mapping mode
  - Element testing
  - Test result tracking
  - Pass rate calculation
  - Estimated variations calculation

- **Theme Refinement**
  - Failed prompt refinement
  - Approved element tracking
  - Mass generation from approved elements
  - History tracking

### 8. **Session Management**
- **Deployment Sessions**
  - Unique session IDs for each deployment
  - Session-based gallery organization
  - Session statistics
  - Session deletion with cascade cleanup

- **Video Sessions**
  - Separate video generation sessions
  - Session-based progress tracking
  - Multiple session selection
  - Session completion tracking

### 9. **Real-time Features**
- **Progress Streaming**
  - Live log streaming for deployments
  - Real-time video generation status
  - WebSocket-like polling for updates
  - Progress percentage tracking

- **Cancellation Support**
  - Cancel active deployments
  - Cancel video generation jobs
  - FAL API request cancellation
  - Clean resource cleanup

---

## 🛠️ Tech Stack

### **Frontend**
- **Framework**: Vanilla JavaScript (ES6+)
- **Styling**: Tailwind CSS
- **HTTP Client**: Axios
- **Icons**: Font Awesome
- **Build Tool**: Vite
- **Type System**: TypeScript (for source files)

### **Backend**
- **Primary Framework**: Hono (Cloudflare Workers/Pages)
- **Alternative Framework**: Express.js (for full Node.js features)
- **Runtime**: Cloudflare Workers / Node.js
- **Language**: TypeScript

### **Database**
- **Primary**: Cloudflare D1 (SQLite)
- **ORM**: Raw SQL queries
- **Migrations**: Wrangler D1 migrations

### **Storage**
- **Object Storage**: Cloudflare R2
- **CDN**: Cloudinary
- **Image Proxy**: R2 bucket for Midjourney images

### **Build & Development**
- **Build Tool**: Vite
- **Bundler**: @hono/vite-build
- **Dev Server**: @hono/vite-dev-server
- **Type Generation**: Wrangler types
- **Package Manager**: npm

### **External APIs & Services**
- **AI Models**:
  - OpenAI GPT-4o (prompt generation)
  - FAL AI (SEED_DREAM, IMAGEN_4, Pixverse, Kling, Nano Banana)
  - Runway Gen4 Turbo (video generation)
  
- **Cloud Services**:
  - Cloudinary (image/video hosting)

### **Development Tools**
- **Process Manager**: PM2 (ecosystem.config.cjs)
- **Browser Automation**: Puppeteer (for image downloads)
- **Concurrency**: concurrently (npm package)
- **Archiving**: archiver (for file compression)

### **Deployment**
- **Platform**: Cloudflare Pages/Workers
- **CLI**: Wrangler
- **Environment**: Cloudflare Workers environment
- **Local Development**: Wrangler Pages dev

---

## 🔌 API Endpoints

### **Styles Management**
- `GET /api/styles` - List all styles
- `POST /api/styles` - Add custom style

### **Theme Management**
- `GET /api/themes` - List all themes with stats
- `GET /api/themes/:themeId/details` - Get theme details
- `GET /api/themes/:themeId/stats` - Get theme statistics
- `GET /api/themes/:themeId/approved` - Get approved elements
- `GET /api/themes/:themeId/failed` - Get failed prompts
- `GET /api/themes/:themeId/history` - Get theme history
- `POST /api/themes` - Create new theme
- `POST /api/themes/:themeId/add-elements` - Add testing elements
- `POST /api/themes/:themeId/next-batch` - Get next batch
- `POST /api/themes/:themeId/save-test-images` - Save test results
- `POST /api/themes/:themeId/test-results` - Submit test results
- `POST /api/themes/:themeId/refine` - Refine failed prompts
- `POST /api/themes/:themeId/mass-generate` - Mass generate from approved
- `POST /api/themes/:themeId/generate` - Generate images for theme
- `POST /api/themes/:themeId/rules` - Update theme rules
- `DELETE /api/themes/:themeId` - Delete theme

### **Image Generation**
- `POST /api/images/generate` - Generate single image
- `POST /api/generate-test-images` - Generate test images

### **Video Generation**
- `POST /api/video/generate` - Generate single video
- `POST /api/video/batch-generate` - Batch video generation
- `POST /api/video/cancel` - Cancel video generation
- `POST /api/simple-video-generation` - Simple video generation
- `POST /api/ultra-simple-video` - Ultra simple video generation

### **Bulk Operations**
- `POST /api/bulk/upload-themes` - Upload themes via CSV
- `GET /api/bulk/themes` - Get bulk themes with pagination
- `POST /api/bulk/deploy` - Deploy themes with image generation
- `GET /api/bulk/logs/:sessionId` - Get deployment logs
- `POST /api/bulk/cancel/:sessionId` - Cancel deployment
- `POST /api/bulk/generate-variations` - Generate prompt variations
- `POST /api/bulk/generate-images` - Generate images for themes
- `POST /api/bulk/generate-videos` - Generate videos from images
- `POST /api/bulk/generate-videos-multiple` - Generate videos for multiple sessions
- `POST /api/bulk/cancel-video/:sessionId` - Cancel video generation
- `GET /api/bulk/video-logs/:sessionId` - Get video generation logs
- `DELETE /api/bulk/theme-profiles` - Delete bulk theme profiles

### **Gallery Management**
- `GET /api/gallery/search` - Search gallery (images & videos)
- `GET /api/gallery/stats` - Gallery statistics
- `GET /api/gallery/sessions` - List all sessions
- `GET /api/gallery/session/:sessionId` - Get session details
- `GET /api/gallery/videos` - Get all videos
- `POST /api/gallery/save` - Save image to gallery
- `POST /api/gallery/images` - Add images to gallery
- `POST /api/gallery/session/:sessionId/videos` - Add videos to session
- `DELETE /api/gallery/:itemId` - Delete gallery item
- `DELETE /api/gallery/session/:sessionId` - Delete session
- `DELETE /api/gallery/images` - Bulk delete images
- `DELETE /api/gallery/theme/:themeIdentifier/images` - Delete theme images

### **Midjourney Import**
- `POST /api/midjourney/start-batch` - Start Midjourney import
- `GET /api/midjourney/status/:sessionId` - Check import status

### **Nano Banana**
- `POST /api/nano-banana/start-batch` - Start Nano Banana batch
- `GET /api/nano-banana/status/:sessionId` - Check Nano Banana status

### **Debug & Testing**
- `GET /api/debug/test-mode` - Test mode status
- `GET /api/test-midjourney-download` - Test Midjourney download
- `GET /api/test-session-to-cloudinary` - Test Cloudinary upload
- `GET /test-gallery` - Test gallery page

### **Static Files**
- `GET /static/*` - Serve static files
- `GET /` - Main application page

---

## 🗄️ Database Schema

### **Core Tables**

#### **themes**
- Theme definitions and metadata
- Fields: id, theme_id, theme, model, style, master_prompt, total_tested, rounds_completed, pass_rate, can_generate, etc.

#### **testing_elements**
- Testing elements for themes
- Fields: id, theme_id, element, element_type, test_order, tested, test_result, round_number

#### **testing_sessions**
- Testing session tracking
- Fields: id, theme_id, session_date, round_number, elements_tested, passed, failed

#### **production_runs**
- Production generation sessions
- Fields: id, theme_id, run_date, prompts_generated, images_generated, approved_elements_used

#### **bulk_theme_profiles**
- Bulk theme profiles from CSV uploads
- Fields: id, category, theme, tier, tags, model, master_prompt, created_at

#### **bulk_deploy_logs**
- Real-time deployment progress logs
- Fields: id, session_id, step_type, message, metadata, log_level, created_at

#### **gallery_images**
- Generated images with theme linkage
- Fields: id, session_id, theme_id, theme_name, model, prompt, image_url, tags, bulk_theme_profile_id, r2_key, created_at

#### **gallery_videos**
- Generated videos with session tracking
- Fields: id, session_id, gallery_image_id, theme_id, theme_name, video_url, aspect_ratio, model, created_at

#### **styles**
- Style definitions for models
- Fields: id, name, model, master_prompt, created_at

#### **rules**
- Theme rules and constraints
- Fields: id, theme_id, rule_text, created_at

### **Indexes**
- Performance indexes on frequently queried fields
- Foreign key indexes
- Session-based indexes

---

## 🏗️ Architecture

### **Chain of Responsibility Pattern**

```
Frontend Layer (UI)
       ↓
Backend Layer (API Routes) 
       ↓
Workers Layer (Background Processing)
       ↓
Services Layer (External APIs)
       ↓
Database Layer (D1 SQLite)
```

### **Core Principle**
Every operation follows the chain: `Frontend → Backend → Workers → Services → Database → Response`

### **Layers**

1. **Frontend Layer**
   - Vanilla JavaScript UI
   - Axios for API calls
   - Real-time progress updates
   - Session management

2. **Backend Layer**
   - Hono/Express API routes
   - Request validation
   - Authentication/authorization
   - Response formatting

3. **Workers Layer**
   - Background processing (bulk-deploy, bulk-video)
   - Async job handling
   - Progress tracking
   - Error handling

4. **Services Layer**
   - External API integrations
   - Image generation services
   - Video generation services
   - Storage services

5. **Database Layer**
   - D1 SQLite (primary)
   - Data persistence
   - Query optimization

---

## 🔗 External Integrations

### **OpenAI**
- **Purpose**: Prompt variation generation
- **Model**: GPT-4o
- **Usage**: Generate 200 unique prompts per theme
- **Endpoint**: `https://api.openai.com/v1/chat/completions`

### **FAL AI**
- **Purpose**: Image and video generation
- **Models**:
  - `fal-ai/bytedance/seedream/v4/text-to-image` (SEED_DREAM)
  - `fal-ai/imagen4/preview` (IMAGEN_4)
  - `fal-ai/pixverse/v5/image-to-video` (Pixverse)
  - `fal-ai/kling-video/v2.5-turbo/pro/image-to-video` (Kling)
  - `fal-ai/nano-banana/edit` (Nano Banana)
- **Authentication**: API Key
- **Endpoints**: Queue-based async processing

### **Runway ML**
- **Purpose**: High-quality video generation
- **Model**: Gen4 Turbo
- **Endpoint**: `https://api.dev.runwayml.com/v1/image_to_video`
- **Features**: 3-second videos, aspect ratio control

### **Cloudinary**
- **Purpose**: Image and video hosting/CDN
- **Features**: Transformations, optimization, delivery
- **Integration**: Native SDK support

### **Cloudflare Services**
- **D1 Database**: Primary SQLite database
- **R2 Storage**: Object storage for image proxy
- **Workers**: Serverless compute
- **Pages**: Static site hosting

### **Puppeteer Service**
- **Purpose**: Download images from protected CDNs
- **Port**: 3001
- **Features**: Cookie handling, base64 conversion
- **Usage**: Midjourney image downloads

---

## 🚀 Deployment

### **Development**
```bash
# Install dependencies
npm install

# Start dev server (Vite)
npm run dev

# Start sandbox with D1 database
npm run dev:sandbox

# Start full stack (sandbox + puppeteer)
npm run dev:full

# Start Express server
npm run start:express

# Start Express + Puppeteer
npm run start:express:full
```

### **Database Setup**
```bash
# Apply migrations locally
npm run db:migrate:local

# Seed database
npm run db:seed

# Reset database
npm run db:reset

# Database console
npm run db:console:local
```

### **Production**
```bash
# Build
npm run build

# Deploy to Cloudflare Pages
npm run deploy

# Apply production migrations
npm run db:migrate:prod
```

### **PM2 Process Management**
```bash
# Start main app (port 3000)
pm2 start ecosystem.config.cjs

# View logs
pm2 logs

# Stop all
pm2 stop all
```

### **Environment Variables**
Required environment variables (`.dev.vars` or Cloudflare secrets):
- `OPENAI_API_KEY` - OpenAI API key
- `FAL_API_KEY` - FAL AI API key
- `RUNWAY_API_KEY` - Runway API key
- `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- `CLOUDINARY_API_KEY` - Cloudinary API key
- `CLOUDINARY_API_SECRET` - Cloudinary API secret
- `MIDJOURNEY_COOKIE` - Midjourney authentication cookie
- `ADMIN_API_KEY` - Optional admin key for non-GET endpoints
- `REQUIRE_ADMIN_KEY` - Require admin key for non-GET endpoints (recommended in production)
- `EXPOSE_ERRORS` - Show server error messages in responses (default: false)
- `CORS_ORIGIN` - Optional allowlist for CORS origins (comma-separated)
- `MAX_BODY_MB` - Optional request body size limit (MB)

---

## 📊 Key Metrics & Statistics

### **Supported Models**
- **Image**: SEED_DREAM, IMAGEN_4
- **Video**: Runway Gen4 Turbo, Pixverse v5, Kling v2.5 Turbo Pro
- **Editing**: Nano Banana

### **Scale Capabilities**
- 500+ theme profiles via CSV
- 200 prompts per theme
- Bulk image generation
- Bulk video generation
- Session-based organization

### **Performance Features**
- Real-time progress tracking
- Background processing
- Request cancellation
- Error isolation
- Cascade deletion
- Database indexes for optimization

---

## 🔒 Security & Best Practices

- Input validation on all endpoints
- API key authentication for external services
- SQL injection prevention via parameterized queries
- CORS configuration
- Error handling and logging
- Session isolation
- Foreign key constraints for data integrity

---

## 📝 Notes

- **R2 Storage**: Used for proxying Midjourney images to avoid 403 errors
- **Puppeteer Service**: Separate Express server for browser automation
- **Image-Video Pairing**: Maintained through gallery_image_id foreign keys

---

**Last Updated**: February 2026
**Version**: Production Ready
**Status**: All Core Features Active ✅
