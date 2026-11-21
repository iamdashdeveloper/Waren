# WAREN

WAREN is a water infrastructure mapping application for Kakuma and Kalobeyei. The repository contains a Vite/React frontend and a Fastify/PostgreSQL API.

## Production deployment

### 1. Set up the Neon database

1. Create a Neon project and database in a region close to the Render API service.
2. Enable PostGIS and load the WAREN schema/data required by the application.
3. Copy the Neon connection string. Keep it private; it will be entered as the Render API's `DATABASE_URL`.
4. The API defaults to `DATABASE_SSL_MODE=verify-full`. It uses the explicit SSL setting for the connection and ignores the connection string's `sslmode` query parameter so the certificate-verification policy remains controlled by this setting.

### 2. Deploy the API to Render

1. Create a Render Blueprint from this repository, or create a Web Service with the repository root and use [render.yaml](./render.yaml). The Blueprint sets the API root directory to `backend`, builds and starts the service, and checks `/api/health/db`.
2. Set the Blueprint's `DATABASE_URL` to the Neon connection string.
3. Set `CORS_ORIGIN` to the exact HTTPS origin of the Vercel production frontend, with no path or trailing slash. For this public, unauthenticated school-project API, you can instead set `CORS_ORIGIN=*` to allow browser requests from any origin. This does not add authentication or make the database URL public, but any website can call the public API.
4. Set `ORS_API_KEY` to your OpenRouteService API key in Render's backend environment variables. Keep it server-side; never set it in Vercel.
5. Render provides `PORT`; the API listens on it and binds to `0.0.0.0`.
6. After deploy, verify `https://<your-render-domain>/api/health` and `/api/health/db`.

The database URL is a server-only secret: configure it in Render, never in the frontend or a `VITE_*` variable. Enable Neon backups and verify a recovery procedure before production use.

### 3. Deploy the frontend to Vercel

1. Import the repository into Vercel and set the **Root Directory** to `frontend`.
2. Vercel reads [frontend/vercel.json](./frontend/vercel.json) for the Vite build, static output, SPA route fallback, and baseline security headers.
3. Add the build-time environment variable `VITE_API_BASE_URL=https://<your-render-domain>/api`. The frontend also appends `/api` automatically if you enter only the Render service origin.
4. Open `/dashboard` directly on the deployed frontend, then confirm the camp list, map layers, and infrastructure data load. Check the browser network console and API health endpoints if a request fails.

Vite embeds `VITE_*` values into public frontend assets. Only the API's public URL belongs there—never database credentials or other secrets. If not using `*`, Vercel preview deployments use different origins; add specific preview origins to Render's `CORS_ORIGIN` only if previews need API access.

The app expects Node.js 22.12.0 or later and pnpm 10.26.2 (pinned in each package manifest). Choose an always-on Render instance plan for production API availability; free instances may spin down when idle.

## Local development

- Frontend: `cd frontend`, `pnpm install --frozen-lockfile`, `pnpm dev`. The Vite development server proxies `/api` to `http://localhost:3000`.
- API: `cd backend`, `pnpm install --frozen-lockfile`, copy `.env.example` to `.env`, set `DATABASE_URL`, then `pnpm dev`.
- Production-like checks: run `pnpm build` in both `frontend` and `backend`.
