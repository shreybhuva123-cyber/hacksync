# Deployment Guide

HackSync is designed as a modern web application with a separated frontend and managed backend.

## Architecture
- **Frontend**: Vite + React build.
- **Backend**: Supabase hosted PostgreSQL and Edge Functions.

## Environment Variables
The following environment variables must be configured in the deployment environment:
- `VITE_SUPABASE_URL`: The URL of the Supabase instance.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: The public API key for Supabase.

## CI/CD Pipeline
Continuous Integration and Deployment are handled via GitHub Actions (`.github/workflows/ci.yml`).
The pipeline consists of a strict 7-step process that enforces formatting, linting, testing, and build verification before deployment.

### Lovable Integration
When integrating with Lovable or similar tools, the cardinal rule is to **never rewrite git history**. All changes must roll forward.

## Local Development and Build Commands
- **Build Command**: `bun run build`
- **Test Command**: `bun test`
- **Validation**: `bun scripts/validate.ts` (runs pre-deployment validation checks)
