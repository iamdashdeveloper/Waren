import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify"
import {
  fetchTableGeoJSON,
  fetchTablePage,
  fetchTapsForCamp,
  listApplicationTables,
  listCampContexts,
  listSpatialLayers,
  SpatialDataError,
} from "../services/data.js"
import { env } from "../config/env.js"

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

type TableParams = { table: string }
type GeoJSONQuery = {
  schema?: string
  geometryColumn?: string
  camp?: string
}
type TablePageQuery = {
  schema?: string
  limit?: string
  offset?: string
}

function parsePaginationValue(
  value: string | undefined,
  name: string,
  fallback: number,
  maximum: number,
): number {
  if (value === undefined) return fallback
  if (!/^\d+$/.test(value)) {
    throw Object.assign(new Error(`${name} must be a non-negative integer.`), {
      statusCode: 400,
    })
  }

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw Object.assign(
      new Error(`${name} must not exceed ${maximum}.`),
      { statusCode: 400 },
    )
  }
  return parsed
}

async function getTableGeoJSON(
  request: FastifyRequest<{ Params: TableParams; Querystring: GeoJSONQuery }>,
  reply: FastifyReply,
) {
  if (request.query.camp !== undefined) {
    if (request.params.table.toLowerCase() !== "taps") {
      return reply.code(400).send({
        status: "error",
        message: "Camp filtering is only supported for the taps layer.",
      })
    }
    if (
      request.query.schema &&
      request.query.schema.toLowerCase() !== "public"
    ) {
      return reply.code(404).send({
        status: "error",
        message: "Spatial table was not found or is not accessible.",
      })
    }
    const result = await fetchTapsForCamp(request.query.camp)
    return reply
      .header("X-WAREN-Geometry-Column", result.geometryColumn)
      .header("X-WAREN-SRID", result.srid === null ? "" : String(result.srid))
      .send(result.collection)
  }

  const [tables, spatialLayers] = await Promise.all([
    listApplicationTables(),
    listSpatialLayers(),
  ])
  const candidates = spatialLayers.filter(
    (layer) =>
      layer.table === request.params.table &&
      (!request.query.schema || layer.schema === request.query.schema) &&
      (!request.query.geometryColumn ||
        layer.geometryColumn === request.query.geometryColumn),
  )

  if (candidates.length === 0) {
    return reply.code(404).send({
      status: "error",
      message: "Spatial table was not found or is not accessible.",
    })
  }
  if (candidates.length > 1) {
    return reply.code(409).send({
      status: "error",
      message:
        "Table has multiple spatial columns or ambiguous schema; provide schema and geometryColumn.",
    })
  }

  const [spatialLayer] = candidates
  if (!spatialLayer) {
    return reply.code(404).send({
      status: "error",
      message: "Spatial table was not found or is not accessible.",
    })
  }
  const table = tables.find(
    (candidate) =>
      candidate.schema === spatialLayer.schema &&
      candidate.name === spatialLayer.table,
  )
  if (!table) {
    return reply.code(404).send({
      status: "error",
      message: "Spatial table was not found or is not accessible.",
    })
  }

  let result
  try {
    result = await fetchTableGeoJSON(table, spatialLayer.geometryColumn)
  } catch (error) {
    if (error instanceof SpatialDataError) throw error
    const pgError =
      error instanceof Error && "code" in error
        ? {
            code: String(error.code),
            message: error.message,
          }
        : {
            code: "unknown",
            message: error instanceof Error ? error.message : "Unknown error",
          }
    request.log.error(
      {
        ...pgError,
        schema: table.schema,
        table: table.name,
        geometryColumn: spatialLayer.geometryColumn,
        operation: "GeoJSON SRID inspection or feature query",
      },
      "Unable to generate spatial GeoJSON.",
    )
    return reply.code(500).send({
      error: "Failed to generate GeoJSON",
      table: table.name,
      ...(env.nodeEnv === "development"
        ? { code: pgError.code, message: pgError.message }
        : {}),
    })
  }
  return reply
    .header("X-WAREN-Geometry-Column", result.geometryColumn)
    .header("X-WAREN-SRID", result.srid === null ? "" : String(result.srid))
    .send(result.collection)
}

async function getTablePage(
  request: FastifyRequest<{ Params: TableParams; Querystring: TablePageQuery }>,
  reply: FastifyReply,
) {
  const limit = parsePaginationValue(
    request.query.limit,
    "limit",
    DEFAULT_LIMIT,
    MAX_LIMIT,
  )
  const offset = parsePaginationValue(
    request.query.offset,
    "offset",
    0,
    Number.MAX_SAFE_INTEGER,
  )

  const tables = await listApplicationTables()
  const candidates = tables.filter(
    (table) =>
      table.name === request.params.table &&
      (!request.query.schema || table.schema === request.query.schema),
  )

  if (candidates.length === 0) {
    return reply.code(404).send({
      status: "error",
      message: "Table was not found or is not accessible.",
    })
  }
  if (candidates.length > 1) {
    return reply.code(409).send({
      status: "error",
      message: "Table name is ambiguous; provide a schema query parameter.",
    })
  }
  const [table] = candidates
  if (!table) {
    return reply.code(404).send({
      status: "error",
      message: "Table was not found or is not accessible.",
    })
  }

  const rows = await fetchTablePage(table.schema, table.name, limit, offset)
  return {
    schema: table.schema,
    table: table.name,
    limit,
    offset,
    rows,
  }
}

export async function dataRoutes(app: FastifyInstance) {
  app.get("/api/data/tables", async () => ({
    tables: await listApplicationTables(),
  }))

  app.get("/api/data/spatial-layers", async () => ({
    layers: await listSpatialLayers(),
  }))

  app.get("/api/data/camps", async () => ({
    camps: await listCampContexts(),
  }))

  app.get<{ Params: TableParams; Querystring: GeoJSONQuery }>(
    "/api/data/:table/geojson",
    getTableGeoJSON,
  )

  app.get<{ Params: TableParams; Querystring: TablePageQuery }>(
    "/api/data/:table",
    getTablePage,
  )
}
