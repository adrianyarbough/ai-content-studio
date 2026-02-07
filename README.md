# Floodify Prompt Engineer

Professional AI-powered content generation platform that transforms theme profiles into production-ready images and videos using OpenAI GPT-4o plus multiple image/video models.

## Highlights
- Bulk theme management via CSV with validation and duplicate detection
- Bulk prompt generation and image generation with real-time progress logs
- Video generation pipeline (Runway Gen4 Turbo, Pixverse v5, Kling v2.5 Turbo Pro)
- Unified gallery for images and videos with advanced filtering
- Session-based processing and cancellation support

## Project Structure
- `src/` TypeScript frontend + workers + service integrations
- `public/` Static frontend assets
- `migrations/` D1 migration SQL files
- `server.js`, `server-full.js` Hono/Express server entry points
- `puppeteer-download-service.js` Midjourney download service
- `docs/` Product and implementation documentation

## Documentation
- `docs/FEATURES_AND_TECH_STACK.md` Full feature list, API surface, and architecture

## Quick Start
```bash
npm install
npm run db:reset
npm run dev
```

Local dev runs at `http://localhost:3000` (Wrangler Pages + D1 bindings).

If you run `npm run dev:vite` (Vite on `http://localhost:5173`), the UI loads but
API routes that rely on D1 will return 500 unless you separately run the
Wrangler dev server.

## Local D1 + Puppeteer
```bash
npm run dev:sandbox
npm run dev:full
```

### Sample Bulk Themes
The local seed includes a few `bulk_theme_profiles` rows so the Bulk Deploy page
shows data immediately after `npm run db:reset`.

## Express Server
```bash
npm run start:express
npm run start:express:full
```

## Build & Deploy
```bash
npm run build
npm run deploy
```

## Environment Variables
Copy `.env.example` to your own local environment file and populate the keys listed there.

### Admin Key (Recommended)
Set `ADMIN_API_KEY` to enable an admin guard on non-GET endpoints. In production, set `REQUIRE_ADMIN_KEY=true`.
When set, include the key as:
- `X-Admin-Key: <your-key>` or `Authorization: Bearer <your-key>`

### Error Exposure
- `EXPOSE_ERRORS=false` (default) keeps error responses generic.

### CORS / CSP
- `CORS_ORIGIN` allows a comma-separated list of allowed origins.
- `CSP` overrides the default Content Security Policy if needed.

## Security & Hygiene
- Secrets are not stored in the repo. Use your local env files.
- Build artifacts, logs, and backups are ignored.

---
Built with a Chain of Responsibility architecture for scalable, maintainable AI content generation.
