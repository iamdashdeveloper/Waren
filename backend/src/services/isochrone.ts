import { pool } from "../db/client.js"
import { env } from "../config/env.js"
import {
  listApplicationTables,
  listSpatialLayers,
  type ApplicationTable,
  type SpatialLayer,
} from "./data.js"

const providerEndpoint =
  "https://api.openrouteservice.org/v2/isochrones/foot-walking"
const providerTimeoutMs = 20_000
const cacheTtlMs = 5 * 60_000
const maximumCacheEntries = 100
const identifierAliases = new Set([
  "id",
  "tapid",
  "tapno",
  "waterpointid",
  "wpid",
])
const blockAliases = new Set([
  "block",
  "blockid",
  "blockname",
  "blockno",
  "area",
  "zone",
])
const statusAliases = new Set([
  "operationalstatus",
  "isoperational",
  "functionalitystatus",
  "status",
])

type WaterPointMetadata = {
  id: string
  block: string | null
  operationalStatus: string | null
}

export type WaterPointAnalysisMetadata = {
  identifierColumn: string
  blockColumn: string | null
  operationalStatusColumn: string | null
}

type IsochroneFeature = {
  type: "Feature"
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown[] }
  properties: Record<string, unknown> & { contourSeconds: number }
}

export type EmergencyWaterIsochrone = {
  type: "FeatureCollection"
  features: IsochroneFeature[]
  waterPoint: WaterPointMetadata
  profile: "foot-walking"
  contours: number[]
}

export class IsochroneError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly retryAfter?: string,
  ) {
    super(message)
    this.name = "IsochroneError"
  }
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`
}

function normalizedColumnName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function findColumn(table: ApplicationTable, aliases: Set<string>) {
  return table.columns.find((column) =>
    aliases.has(normalizedColumnName(column.name)),
  )?.name
}

async function findPrimaryKeyColumn(table: ApplicationTable) {
  const result = await pool.query<{ columnName: string }>(
    `SELECT key_column_usage.column_name AS "columnName"
     FROM information_schema.table_constraints AS table_constraints
     JOIN information_schema.key_column_usage AS key_column_usage
       ON key_column_usage.constraint_schema = table_constraints.constraint_schema
       AND key_column_usage.constraint_name = table_constraints.constraint_name
       AND key_column_usage.table_schema = table_constraints.table_schema
       AND key_column_usage.table_name = table_constraints.table_name
     WHERE table_constraints.constraint_type = 'PRIMARY KEY'
       AND table_constraints.table_schema = $1
       AND table_constraints.table_name = $2
     ORDER BY key_column_usage.ordinal_position`,
    [table.schema, table.name],
  )

  return result.rows.length === 1 ? result.rows[0]?.columnName : undefined
}

function discoverTapTable(
  tables: ApplicationTable[],
  layers: SpatialLayer[],
): { table: ApplicationTable; layer: SpatialLayer } {
  const tapLayers = layers.filter((layer) => layer.table.toLowerCase() === "taps")
  const matches = tapLayers.flatMap((layer) => {
    const table = tables.find(
      (candidate) =>
        candidate.schema === layer.schema && candidate.name === layer.table,
    )
    return table ? [{ table, layer }] : []
  })
  const publicMatch = matches.filter(({ table }) => table.schema === "public")
  const candidates = publicMatch.length > 0 ? publicMatch : matches

  if (candidates.length === 0) {
    throw new IsochroneError("The taps spatial layer is unavailable.", 404)
  }
  if (candidates.length > 1) {
    throw new IsochroneError(
      "More than one taps spatial layer was found; the water-point table is ambiguous.",
      409,
    )
  }
  const candidate = candidates[0]
  if (!candidate) {
    throw new IsochroneError("The taps spatial layer is unavailable.", 404)
  }
  return candidate
}

function parseWaterPointIdColumn(table: ApplicationTable, primaryKey?: string) {
  const column =
    primaryKey ??
    table.columns.find((candidate) =>
      identifierAliases.has(normalizedColumnName(candidate.name)),
    )?.name
  if (!column) {
    throw new IsochroneError(
      "The taps table has no supported unique water-point identifier.",
      422,
    )
  }
  return column
}

function normalizedStatus(value: string | null) {
  return (value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_")
}

function isKnownNonOperational(value: string | null) {
  return new Set([
    "damaged",
    "broken",
    "dry",
    "inactive",
    "non_operational",
    "nonfunctional",
    "out_of_service",
    "out_of_order",
    "not_operational",
    "not_working",
    "unavailable",
    "false",
    "no",
    "0",
  ]).has(normalizedStatus(value))
}

function isKnownOperational(value: string | null) {
  return new Set([
    "operational",
    "active",
    "working",
    "functional",
    "true",
    "yes",
    "1",
  ]).has(normalizedStatus(value))
}

async function discoverWaterPointSchema(): Promise<{
  table: ApplicationTable
  layer: SpatialLayer
  metadata: WaterPointAnalysisMetadata
}> {
  const [tables, layers] = await Promise.all([
    listApplicationTables(),
    listSpatialLayers(),
  ])
  const { table, layer } = discoverTapTable(tables, layers)
  const primaryKeyColumn = await findPrimaryKeyColumn(table)
  const idColumn = parseWaterPointIdColumn(table, primaryKeyColumn)
  return {
    table,
    layer,
    metadata: {
      identifierColumn: idColumn,
      blockColumn: findColumn(table, blockAliases) ?? null,
      operationalStatusColumn: findColumn(table, statusAliases) ?? null,
    },
  }
}

export async function getWaterPointAnalysisMetadata() {
  const { metadata } = await discoverWaterPointSchema()
  return metadata
}

async function findWaterPoint(
  waterPointId: string,
): Promise<{ metadata: WaterPointMetadata; coordinates: [number, number] }> {
  const { table, layer, metadata: schema } =
    await discoverWaterPointSchema()
  const idColumn = schema.identifierColumn
  const statusColumn = schema.operationalStatusColumn
  const blockColumn = schema.blockColumn
  if (layer.srid === null || layer.srid < 1) {
    throw new IsochroneError(
      "The taps spatial reference information is unavailable.",
      422,
    )
  }

  const geometryColumn = table.columns.find(
    (column) =>
      column.name === layer.geometryColumn &&
      ["geometry", "geography"].includes(column.udtName.toLowerCase()),
  )
  if (!geometryColumn) {
    throw new IsochroneError(
      "The taps spatial geometry column is unavailable.",
      422,
    )
  }

  const geometry = `tap_row.${quoteIdentifier(layer.geometryColumn)}${
    geometryColumn.udtName.toLowerCase() === "geography" ? "::geometry" : ""
  }`
  const geometry4326 =
    layer.srid === 4326 ? geometry : `ST_Transform(${geometry}, 4326)`
  const statusExpression = statusColumn
    ? `tap_row.${quoteIdentifier(statusColumn)}::text`
    : "NULL::text"
  const blockExpression = blockColumn
    ? `tap_row.${quoteIdentifier(blockColumn)}::text`
    : "NULL::text"
  const qualifiedTable =
    `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`

  const result = await pool.query<{
    id: string
    block: string | null
    operationalStatus: string | null
    geometry: { type?: unknown; coordinates?: unknown } | null
  }>(
    `SELECT
       tap_row.${quoteIdentifier(idColumn)}::text AS id,
       ${blockExpression} AS block,
       ${statusExpression} AS "operationalStatus",
       ST_AsGeoJSON(${geometry4326})::json AS geometry
     FROM ${qualifiedTable} AS tap_row
     WHERE tap_row.${quoteIdentifier(idColumn)}::text = $1
       AND tap_row.${quoteIdentifier(layer.geometryColumn)} IS NOT NULL
     LIMIT 2`,
    [waterPointId],
  )

  if (result.rows.length === 0) {
    throw new IsochroneError(
      "The selected water point was not found in the taps dataset.",
      404,
    )
  }
  if (result.rows.length > 1) {
    throw new IsochroneError(
      "The selected water-point identifier is not unique.",
      409,
    )
  }
  const row = result.rows[0]
  if (!row || row.geometry?.type !== "Point" || !Array.isArray(row.geometry.coordinates)) {
    throw new IsochroneError(
      "The selected tap does not have a usable point geometry.",
      422,
    )
  }
  const longitude = Number(row.geometry.coordinates[0])
  const latitude = Number(row.geometry.coordinates[1])
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new IsochroneError(
      "The selected tap has invalid geographic coordinates.",
      422,
    )
  }

  return {
    metadata: {
      id: row.id,
      block: row.block,
      operationalStatus: row.operationalStatus,
    },
    coordinates: [longitude, latitude],
  }
}

function parseProviderFeatures(
  value: unknown,
  requestedContours: number[],
): IsochroneFeature[] {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as { type?: unknown }).type !== "FeatureCollection" ||
    !Array.isArray((value as { features?: unknown }).features)
  ) {
    throw new IsochroneError(
      "The routing provider returned an invalid GeoJSON response.",
      502,
    )
  }

  const features: IsochroneFeature[] = []
  for (const candidate of (value as { features: unknown[] }).features) {
    if (typeof candidate !== "object" || candidate === null) {
      throw new IsochroneError(
        "The routing provider returned an invalid GeoJSON feature.",
        502,
      )
    }
    const feature = candidate as {
      type?: unknown
      geometry?: { type?: unknown; coordinates?: unknown } | null
      properties?: unknown
    }
    const properties = feature.properties
    const geometry = feature.geometry
    if (
      feature.type !== "Feature" ||
      typeof properties !== "object" ||
      properties === null ||
      !geometry ||
      (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") ||
      !Array.isArray(geometry.coordinates)
    ) {
      throw new IsochroneError(
        "The routing provider returned an invalid isochrone geometry.",
        502,
      )
    }
    const providerProperties = properties as Record<string, unknown>
    const contourSeconds = Number(providerProperties.value)
    if (
      !Number.isInteger(contourSeconds) ||
      !requestedContours.includes(contourSeconds)
    ) {
      throw new IsochroneError(
        "The routing provider returned an unrecognized contour value.",
        502,
      )
    }
    features.push({
      type: "Feature",
      geometry: {
        type: geometry.type,
        coordinates: geometry.coordinates,
      },
      properties: { ...providerProperties, contourSeconds },
    })
  }
  return features
}

const successfulCache = new Map<
  string,
  { expiresAt: number; features: IsochroneFeature[] }
>()

function cachedFeatures(key: string) {
  const entry = successfulCache.get(key)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    successfulCache.delete(key)
    return undefined
  }
  successfulCache.delete(key)
  successfulCache.set(key, entry)
  return entry.features
}

function cacheFeatures(key: string, features: IsochroneFeature[]) {
  successfulCache.set(key, {
    expiresAt: Date.now() + cacheTtlMs,
    features,
  })
  while (successfulCache.size > maximumCacheEntries) {
    const oldestKey = successfulCache.keys().next().value
    if (oldestKey === undefined) break
    successfulCache.delete(oldestKey)
  }
}

export async function createEmergencyWaterIsochrone(
  waterPointId: string,
  contours: number[],
  confirmUnverifiedStatus = false,
): Promise<EmergencyWaterIsochrone> {
  const { metadata, coordinates } = await findWaterPoint(waterPointId)
  if (isKnownNonOperational(metadata.operationalStatus)) {
    throw new IsochroneError(
      `Water point ${metadata.id} is marked "${metadata.operationalStatus}" and cannot be used as an operational source.`,
      409,
    )
  }
  if (!isKnownOperational(metadata.operationalStatus) && !confirmUnverifiedStatus) {
    throw new IsochroneError(
      "The tap's dataset status does not confirm that it is operational. Verify it and explicitly confirm before analysis.",
      409,
    )
  }

  const cacheKey = `${metadata.id}:${contours.join(",")}`
  let features = cachedFeatures(cacheKey)
  if (!features) {
    if (!env.openRouteServiceApiKey) {
      throw new IsochroneError(
        "Isochrone analysis is unavailable because ORS_API_KEY is not configured.",
        503,
      )
    }
    let response: Response
    try {
      response = await fetch(providerEndpoint, {
        method: "POST",
        headers: {
          Authorization: env.openRouteServiceApiKey,
          "Content-Type": "application/json",
          Accept: "application/geo+json, application/json",
        },
        body: JSON.stringify({
          locations: [coordinates],
          range: contours,
          range_type: "time",
          location_type: "start",
        }),
        signal: AbortSignal.timeout(providerTimeoutMs),
      })
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new IsochroneError(
          "The routing provider timed out. Please try again.",
          504,
        )
      }
      throw new IsochroneError(
        "The routing provider could not be reached. Please try again.",
        502,
      )
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw new IsochroneError(
          "The routing provider is rate-limiting requests. Please wait and try again.",
          429,
          response.headers.get("retry-after") ?? undefined,
        )
      }
      if (response.status === 401 || response.status === 403) {
        throw new IsochroneError(
          "The routing provider rejected its API key. Check ORS_API_KEY.",
          502,
        )
      }
      throw new IsochroneError(
        "The routing provider could not calculate an isochrone for this water point.",
        502,
      )
    }

    let providerResult: unknown
    try {
      providerResult = await response.json()
    } catch {
      throw new IsochroneError(
        "The routing provider returned an unreadable response.",
        502,
      )
    }
    features = parseProviderFeatures(providerResult, contours)
    cacheFeatures(cacheKey, features)
  }

  return {
    type: "FeatureCollection",
    features,
    waterPoint: metadata,
    profile: "foot-walking",
    contours,
  }
}
