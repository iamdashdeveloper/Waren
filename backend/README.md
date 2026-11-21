# WAREN API

Fastify and PostgreSQL foundation for the WAREN application.

## Setup

From this directory, install packages with `pnpm install`, then set `DATABASE_URL` in `.env` using `.env.example` as a template. The server reads its environment from this directory.

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
