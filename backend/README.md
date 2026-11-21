# WAREN API

Fastify and PostgreSQL foundation for the WAREN application.

## Setup

From this directory, install packages with `pnpm install --frozen-lockfile`, then set `DATABASE_URL` in `.env` using `.env.example` as a template. The server reads its environment from this directory.

`DATABASE_SSL_MODE` accepts `verify-full` (default; verify the database certificate), `require` (encrypt without certificate verification), or `disable`. Prefer `verify-full`. Use `require` only when the database endpoint supports TLS but uses a certificate that cannot be verified by Node.js.

For Neon, copy the connection string from the Neon dashboard into `DATABASE_URL`. The API ignores the URI's `sslmode` query parameter and applies `DATABASE_SSL_MODE` explicitly, which defaults to certificate verification.

In production, set `NODE_ENV=production` and `CORS_ORIGIN` to the exact HTTPS origin of the deployed frontend (no path or trailing slash); multiple exact origins can be comma-separated. Set `CORS_ORIGIN=*` to allow browser requests from any origin. This can be appropriate for a public, unauthenticated school project, but it lets any website call the API. The API fails to start if a production CORS origin is missing or invalid.

## Commands

- `pnpm dev` — run the API with reload
- `pnpm build` — compile TypeScript to `dist/`
- `pnpm start` — run the compiled API

## Endpoints

- `GET /api/health` — API process health
- `GET /api/health/db` — database connection check
- `GET /api/data/tables` — accessible application tables, views, and column metadata
- `GET /api/data/spatial-layers` — accessible PostGIS spatial columns with geometry type and SRID metadata
- `GET /api/data/:table/geojson?schema=public&geometryColumn=geom` — a validated PostGIS GeoJSON FeatureCollection
- `GET /api/data/:table?schema=public&limit=100&offset=0` — fetch a page of rows from an existing table

Table identifiers are checked against PostgreSQL metadata before use. The row endpoint only supports retrieval and does not modify the database. Geometry columns are selected as stored; no schema or spatial processing is performed.

## Render deployment

Deploy from the repository root using [render.yaml](../render.yaml), which sets this directory as the service root, builds and starts the compiled API, and checks `/api/health/db`.

Configure these Render service variables:

- `DATABASE_URL` — Neon connection string from the Neon dashboard.
- `NODE_ENV=production`
- `CORS_ORIGIN=https://<your-vercel-domain>` — exact deployed frontend origin, without `/api` or a trailing slash; or `*` to allow any origin for a public, unauthenticated API.
- `DATABASE_SSL_MODE=verify-full` — use `require` only if TLS certificate verification cannot be used.

Render supplies `PORT`; the server binds to `0.0.0.0` by default. Provision and populate the Neon PostGIS database before deploying the API. After deployment, verify `https://<your-render-domain>/api/health` and `/api/health/db`.
