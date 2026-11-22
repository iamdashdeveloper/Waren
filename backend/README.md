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
- `POST /api/analysis/isochrone` — generate a walking isochrone for a tap, tank, borehole, or map coordinate
- `GET /api/analysis/water-points/metadata` — discover the tap identifier, block, and operational-status columns
- `POST /api/analysis/emergency-area` — load taps inside a selected polygon and nearby alternative taps/tanks by its `service_code`
- `POST /api/analysis/emergency-rankings` — rank explicitly selected affected taps against operational taps and manually confirmed tanks using the ORS walking-time matrix
- `POST /api/analysis/emergency-coverage` — generate selected-source isochrones and calculate their geometric coverage and uncovered area within the polygon
- `GET /api/analysis/supply-planning/scenarios` — list saved planning scenarios and saved-result summaries
- `GET /api/analysis/supply-planning/scenarios/:id` — restore a saved scenario, allocations, and balance snapshots without recalculation
- `POST /api/analysis/supply-planning/scenarios` — explicitly save a new scenario
- `PUT /api/analysis/supply-planning/scenarios/:id` — recalculate from current source data and transactionally update a scenario
- `PATCH /api/analysis/supply-planning/scenarios/:id` — rename a saved scenario without recalculating it
- `DELETE /api/analysis/supply-planning/scenarios/:id` — delete saved scenario data only

Emergency accessibility requests use the OpenRouteService `foot-walking` profile. Area selection accepts any accessible polygon layer with a `service_code` column and identifies a unit by schema, table, and service code. Tap matching is spatial (`ST_Covers`); recorded `damaged` taps are preselected as affected, but the user must explicitly confirm the scenario. Alternatives are limited to explicitly `operational` taps. Tank conditions are shown as recorded and a tank must be manually selected/confirmed because the dataset has no explicit tank availability field. Ranking uses pedestrian-network durations, preserving unreachable pairs as null. Coverage percentages describe geometric intersection with the selected polygon only; they do not estimate population, demand, water availability, or capacity.

Configure an `ORS_API_KEY` with both Matrix and Isochrone services enabled on the backend only; never expose it as a frontend `VITE_*` variable. ORS live coverage for the study area and live Matrix/Isochrone responses have not been verified until a valid provider key is available and the provider is successfully exercised.

Table identifiers are checked against PostgreSQL metadata before use. The row endpoint only supports retrieval and does not modify the database. Geometry columns are selected as stored; no schema or spatial processing is performed.

## Supply by Planning persistence

Before deploying the API changes, apply `migrations/001_water_planning_scenarios.sql` to the same PostgreSQL database used by WAREN. This additive migration creates scenario metadata, allocation, and tank-result tables. It references the existing `public.tanks(id)` `varchar` primary key and cascades scenario deletion only to its own allocations/results; original tanks and balances are never changed. The repository has no automatic migration runner, so apply migrations explicitly through the database's approved SQL migration process.

Scenario writes validate the requested tank IDs, water balances, coordinates, distance threshold, supplier surplus, and receiver deficit inside a repeatable-read transaction. The API calculates and stores allocation distances and balance snapshots from the current `public.tanks` and `public.water_supply_balance` records. `source_data_timestamp` marks the database snapshot capture time because the source tables do not expose a source-update timestamp. Loading a saved scenario returns these stored snapshots and does not recalculate them. `PUT` is the explicit edit-and-recalculate operation; `PATCH` renames metadata without changing saved calculations.

The current API has no authentication or ownership model. Saved planning scenarios are therefore shared records for all clients authorized to call this public API. Do not store sensitive notes in scenario descriptions; add authenticated ownership before using this feature for private or tenant-specific plans.

## Render deployment

Deploy from the repository root using [render.yaml](../render.yaml), which sets this directory as the service root, builds and starts the compiled API, and checks `/api/health/db`.

Configure these Render service variables:

- `DATABASE_URL` — Neon connection string from the Neon dashboard.
- `NODE_ENV=production`
- `CORS_ORIGIN=https://<your-vercel-domain>` — exact deployed frontend origin, without `/api` or a trailing slash; or `*` to allow any origin for a public, unauthenticated API.
- `DATABASE_SSL_MODE=verify-full` — use `require` only if TLS certificate verification cannot be used.
- `ORS_API_KEY` — OpenRouteService key with Matrix and Isochrone services enabled.

Render supplies `PORT`; the server binds to `0.0.0.0` by default. Provision and populate the Neon PostGIS database before deploying the API. After deployment, verify `https://<your-render-domain>/api/health` and `/api/health/db`.
