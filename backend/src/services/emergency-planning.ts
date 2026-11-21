import { pool } from "../db/client.js"
import { env } from "../config/env.js"
import {
  listApplicationTables,
  listSpatialLayers,
  type ApplicationTable,
  type SpatialLayer,
} from "./data.js"
import {
  createEmergencyWaterIsochrone,
  IsochroneError,
  type EmergencyWaterIsochrone,
  type IsochroneOrigin,
} from "./isochrone.js"

const matrixEndpoint = "https://api.openrouteservice.org/v2/matrix/foot-walking"
const requestTimeoutMs = 20_000
const maximumAffectedTaps = 10
const maximumAlternativePoints = 20
const maximumCoverageSources = 5

type SourceType = "tap" | "tank"
type PointSource = SourceType | "borehole"

export type EmergencyAreaReference = {
  schema: string
  table: string
  serviceCode: string
}

export type EmergencyPoint = {
  id: string
  source: SourceType
  status: string | null
  coordinates: [number, number]
  onBoundary: boolean
}

export type EmergencyAreaDetails = {
  area: {
    schema: string
    table: string
    label: string
    serviceCode: string
    geometry: unknown
    areaSquareMeters: number
  }
  affectedTaps: EmergencyPoint[]
  alternativeTaps: EmergencyPoint[]
  alternativeTanks: EmergencyPoint[]
}

export type EmergencyRanking = {
  id: string
  source: SourceType
  status: string | null
  condition: string | null
  travelTimes: {
    affectedTapId: string
    durationSeconds: number | null
  }[]
  reachableAffectedTaps: number
  allAffectedTapsReachable: boolean
  longestReachableRouteSeconds: number | null
}

export type EmergencyCoverage = {
  type: "FeatureCollection"
  features: EmergencyWaterIsochrone["features"]
  area: {
    type: "Feature"
    geometry: unknown
    properties: { table: string; serviceCode: string }
  }
  coverage: {
    contourSeconds: number
    coverageGeometry: unknown
    uncoveredGeometry: unknown
    areaSquareMeters: number
    coveredSquareMeters: number
    uncoveredSquareMeters: number
    coveredPercent: number
  }[]
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`
}

function normalizedName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function findColumn(table: ApplicationTable, aliases: string[]) {
  const names = new Set(aliases.map(normalizedName))
  return table.columns.find((column) => names.has(normalizedName(column.name)))?.name
}

function qualifiedTable(table: ApplicationTable) {
  return `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`
}

function geometryExpression(
  layer: SpatialLayer,
  table: ApplicationTable,
  alias: string,
) {
  if (layer.srid === null || layer.srid < 1) {
    throw new IsochroneError(
      `Spatial reference information is unavailable for ${layer.table}.`,
      422,
    )
  }
  const raw = `${alias}.${quoteIdentifier(layer.geometryColumn)}`
  const column = table.columns.find(
    (candidate) => candidate.name === layer.geometryColumn,
  )
  if (!column || !["geometry", "geography"].includes(column.udtName.toLowerCase())) {
    throw new IsochroneError(
      `The polygon geometry column is unavailable for ${layer.table}.`,
      422,
    )
  }
  const geometry = column.udtName.toLowerCase() === "geography"
    ? `${raw}::geometry`
    : raw
  return layer.srid === 4326 ? geometry : `ST_Transform(${geometry}, 4326)`
}

async function findArea(reference: EmergencyAreaReference) {
  const [tables, layers] = await Promise.all([
    listApplicationTables(),
    listSpatialLayers(),
  ])
  const matchingLayers = layers.filter((layer) => {
    if (
      layer.schema !== reference.schema ||
      layer.table !== reference.table ||
      !/polygon/i.test(layer.geometryType ?? "")
    ) {
      return false
    }
    const table = tables.find(
      (candidate) =>
        candidate.schema === layer.schema && candidate.name === layer.table,
    )
    return table !== undefined && findColumn(table, ["service_code"]) !== undefined
  })
  if (matchingLayers.length !== 1) {
    throw new IsochroneError(
      "Select a polygon layer with a service_code field.",
      matchingLayers.length === 0 ? 400 : 409,
    )
  }

  const layer = matchingLayers[0]!
  const table = tables.find(
    (candidate) =>
      candidate.schema === layer.schema && candidate.name === layer.table,
  )
  if (!table) {
    throw new IsochroneError("The selected polygon layer is unavailable.", 404)
  }
  const serviceCodeColumn = findColumn(table, ["service_code"])
  if (!serviceCodeColumn) {
    throw new IsochroneError(
      "The selected polygon has no service_code field.",
      422,
    )
  }
  const geometry = geometryExpression(layer, table, "area_row")
  const result = await pool.query<{
    geometry: unknown
    serviceCode: string
    areaSquareMeters: number | string
  }>(
    `WITH matching_area AS (
       SELECT ST_UnaryUnion(ST_Collect(ST_MakeValid(${geometry}))) AS geom
       FROM ${qualifiedTable(table)} AS area_row
       WHERE area_row.${quoteIdentifier(layer.geometryColumn)} IS NOT NULL
         AND area_row.${quoteIdentifier(serviceCodeColumn)}::text = $1
     )
     SELECT
       ST_AsGeoJSON(geom)::json AS geometry,
       $1::text AS "serviceCode",
       ST_Area(geom::geography)::float8 AS "areaSquareMeters"
     FROM matching_area
     WHERE geom IS NOT NULL`,
    [reference.serviceCode],
  )
  if (result.rows.length === 0) {
    throw new IsochroneError(
      "The selected polygon service_code was not found.",
      404,
    )
  }
  const row = result.rows[0]!
  return {
    table,
    layer,
    serviceCodeColumn,
    geometry,
    geometryJson: row.geometry,
    serviceCode: row.serviceCode,
    areaSquareMeters: Number(row.areaSquareMeters),
  }
}

async function findPointSource(source: PointSource) {
  const expectedTable = source === "tap"
    ? "taps"
    : source === "tank"
      ? "tanks"
      : "boreholes"
  const [tables, layers] = await Promise.all([
    listApplicationTables(),
    listSpatialLayers(),
  ])
  const matches = layers.filter(
    (layer) => layer.table.toLowerCase() === expectedTable,
  )
  const publicMatches = matches.filter((layer) => layer.schema === "public")
  const candidates = publicMatches.length > 0 ? publicMatches : matches
  if (candidates.length !== 1) {
    throw new IsochroneError(
      `The ${expectedTable} spatial layer is unavailable or ambiguous.`,
      candidates.length === 0 ? 404 : 409,
    )
  }
  const layer = candidates[0]!
  const table = tables.find(
    (candidate) =>
      candidate.schema === layer.schema && candidate.name === layer.table,
  )
  if (!table) {
    throw new IsochroneError(`The ${expectedTable} table is unavailable.`, 404)
  }
  const idColumn = findColumn(
    table,
    source === "borehole"
      ? ["bh_id", "id", "borehole_id"]
      : ["id", source === "tap" ? "tap_id" : "tank_id"],
  )
  if (!idColumn) {
    throw new IsochroneError(
      `The ${expectedTable} table has no supported identifier column.`,
      422,
    )
  }
  const statusColumn = findColumn(
    table,
    source === "tap"
      ? ["operational_status", "status"]
      : source === "tank"
        ? ["condition"]
        : ["status"],
  )
  const geometryColumn = table.columns.find(
    (column) =>
      column.name === layer.geometryColumn &&
      ["geometry", "geography"].includes(column.udtName.toLowerCase()),
  )
  if (!geometryColumn) {
    throw new IsochroneError(
      `The ${expectedTable} point geometry is unavailable.`,
      422,
    )
  }
  const pointGeometry = `point_row.${quoteIdentifier(layer.geometryColumn)}${
    geometryColumn.udtName.toLowerCase() === "geography" ? "::geometry" : ""
  }`
  const point4326 =
    layer.srid === 4326
      ? pointGeometry
      : layer.srid && layer.srid > 0
        ? `ST_Transform(${pointGeometry}, 4326)`
        : null
  if (!point4326) {
    throw new IsochroneError(
      `The ${expectedTable} spatial reference information is unavailable.`,
      422,
    )
  }
  return {
    source,
    table,
    layer,
    idColumn,
    statusColumn,
    point4326,
  }
}

function pointFromRow(
  row: {
    id: string
    status: string | null
    longitude: number | string
    latitude: number | string
    onBoundary?: boolean
  },
  source: SourceType,
): EmergencyPoint {
  const longitude = Number(row.longitude)
  const latitude = Number(row.latitude)
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new IsochroneError(
      `The selected ${source} has invalid geographic coordinates.`,
      422,
    )
  }
  return {
    id: row.id,
    source,
    status: row.status,
    coordinates: [longitude, latitude],
    onBoundary: row.onBoundary ?? false,
  }
}

async function pointsInArea(
  area: Awaited<ReturnType<typeof findArea>>,
  source: PointSource,
) {
  const pointSource = await findPointSource(source)
  const status = pointSource.statusColumn
    ? `point_row.${quoteIdentifier(pointSource.statusColumn)}::text`
    : "NULL::text"
  const result = await pool.query<{
    id: string
    status: string | null
    longitude: number | string
    latitude: number | string
    onBoundary: boolean
  }>(
    `WITH selected_area AS (
      SELECT ST_UnaryUnion(ST_Collect(ST_MakeValid(${area.geometry}))) AS geom
      FROM ${qualifiedTable(area.table)} AS area_row
      WHERE area_row.${quoteIdentifier(area.layer.geometryColumn)} IS NOT NULL
        AND area_row.${quoteIdentifier(area.serviceCodeColumn)}::text = $1
    )
     SELECT
       point_row.${quoteIdentifier(pointSource.idColumn)}::text AS id,
       ${status} AS status,
       ST_X(${pointSource.point4326})::float8 AS longitude,
       ST_Y(${pointSource.point4326})::float8 AS latitude,
       NOT ST_Contains(selected_area.geom, ${pointSource.point4326}) AS "onBoundary"
     FROM ${qualifiedTable(pointSource.table)} AS point_row
     CROSS JOIN selected_area
     WHERE point_row.${quoteIdentifier(pointSource.layer.geometryColumn)} IS NOT NULL
       AND ST_GeometryType(${pointSource.point4326}) = 'ST_Point'
       AND ST_Covers(selected_area.geom, ${pointSource.point4326})
     ORDER BY point_row.${quoteIdentifier(pointSource.idColumn)}::text
     LIMIT 501`,
    [area.serviceCode],
  )
  if (result.rows.length > 500) {
    throw new IsochroneError(
      "This polygon contains more than 500 taps; select a smaller service area.",
      413,
    )
  }
  return result.rows.map((row) =>
    pointFromRow(row, source === "borehole" ? "tap" : source),
  )
}

async function nearbyPoints(
  area: Awaited<ReturnType<typeof findArea>>,
  source: SourceType,
) {
  const pointSource = await findPointSource(source)
  const status = pointSource.statusColumn
    ? `point_row.${quoteIdentifier(pointSource.statusColumn)}::text`
    : "NULL::text"
  const eligibility = source === "tap"
    ? `AND lower(btrim(${status})) = 'operational'`
    : ""
  const result = await pool.query<{
    id: string
    status: string | null
    longitude: number | string
    latitude: number | string
    onBoundary: boolean
  }>(
    `WITH selected_area AS (
      SELECT ST_UnaryUnion(ST_Collect(ST_MakeValid(${area.geometry}))) AS geom
      FROM ${qualifiedTable(area.table)} AS area_row
      WHERE area_row.${quoteIdentifier(area.layer.geometryColumn)} IS NOT NULL
        AND area_row.${quoteIdentifier(area.serviceCodeColumn)}::text = $1
    )
     SELECT
       point_row.${quoteIdentifier(pointSource.idColumn)}::text AS id,
       ${status} AS status,
       ST_X(${pointSource.point4326})::float8 AS longitude,
       ST_Y(${pointSource.point4326})::float8 AS latitude,
       false AS "onBoundary"
     FROM ${qualifiedTable(pointSource.table)} AS point_row
     CROSS JOIN selected_area
     WHERE point_row.${quoteIdentifier(pointSource.layer.geometryColumn)} IS NOT NULL
       AND ST_GeometryType(${pointSource.point4326}) = 'ST_Point'
       AND NOT ST_Covers(selected_area.geom, ${pointSource.point4326})
       ${eligibility}
     ORDER BY ST_Distance(
       ${pointSource.point4326}::geography,
       ST_PointOnSurface(selected_area.geom)::geography
     )
     LIMIT ${maximumAlternativePoints}`,
    [area.serviceCode],
  )
  return result.rows.map((row) => pointFromRow(row, source))
}

export async function getEmergencyAreaDetails(
  reference: EmergencyAreaReference,
): Promise<EmergencyAreaDetails> {
  const area = await findArea(reference)
  const [affectedTaps, alternativeTaps, alternativeTanks] = await Promise.all([
    pointsInArea(area, "tap"),
    nearbyPoints(area, "tap"),
    nearbyPoints(area, "tank"),
  ])
  return {
    area: {
      schema: area.table.schema,
      table: area.table.name,
      label: area.table.name.replace(/[_-]+/g, " "),
      serviceCode: area.serviceCode,
      geometry: area.geometryJson,
      areaSquareMeters: area.areaSquareMeters,
    },
    affectedTaps,
    alternativeTaps,
    alternativeTanks,
  }
}

async function findPointsByIds(
  source: SourceType,
  ids: string[],
  area: Awaited<ReturnType<typeof findArea>>,
  mustBeInside: boolean,
) {
  if (ids.length === 0) return []
  const pointSource = await findPointSource(source)
  const status = pointSource.statusColumn
    ? `point_row.${quoteIdentifier(pointSource.statusColumn)}::text`
    : "NULL::text"
  const locationPredicate = mustBeInside
    ? `ST_Covers(selected_area.geom, ${pointSource.point4326})`
    : `NOT ST_Covers(selected_area.geom, ${pointSource.point4326})`
  const eligibility = source === "tap"
    ? `AND lower(btrim(${status})) = 'operational'`
    : ""
  const result = await pool.query<{
    id: string
    status: string | null
    longitude: number | string
    latitude: number | string
  }>(
    `WITH selected_area AS (
       SELECT ST_UnaryUnion(ST_Collect(ST_MakeValid(${area.geometry}))) AS geom
       FROM ${qualifiedTable(area.table)} AS area_row
       WHERE area_row.${quoteIdentifier(area.layer.geometryColumn)} IS NOT NULL
         AND area_row.${quoteIdentifier(area.serviceCodeColumn)}::text = $1
     )
     SELECT
       point_row.${quoteIdentifier(pointSource.idColumn)}::text AS id,
       ${status} AS status,
       ST_X(${pointSource.point4326})::float8 AS longitude,
       ST_Y(${pointSource.point4326})::float8 AS latitude
     FROM ${qualifiedTable(pointSource.table)} AS point_row
     CROSS JOIN selected_area
     WHERE point_row.${quoteIdentifier(pointSource.layer.geometryColumn)} IS NOT NULL
       AND point_row.${quoteIdentifier(pointSource.idColumn)}::text = ANY($2::text[])
       AND ST_GeometryType(${pointSource.point4326}) = 'ST_Point'
       AND ${locationPredicate}
       ${eligibility}
     ORDER BY array_position($2::text[], point_row.${quoteIdentifier(pointSource.idColumn)}::text)
     LIMIT ${ids.length + 1}`,
    [area.serviceCode, ids],
  )
  if (result.rows.length !== ids.length) {
    throw new IsochroneError(
      source === "tap" && !mustBeInside
        ? "Every alternative tap must be outside the selected polygon and explicitly operational."
        : "Every selected affected tap must be inside the selected polygon.",
      400,
    )
  }
  return result.rows.map((row) => pointFromRow(row, source))
}

async function requestProvider(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  if (!env.openRouteServiceApiKey) {
    throw new IsochroneError(
      "Emergency routing is unavailable because ORS_API_KEY is not configured.",
      503,
    )
  }
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: env.openRouteServiceApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(requestTimeoutMs),
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
      "The routing provider could not calculate emergency water accessibility.",
      502,
    )
  }
  try {
    return await response.json() as unknown
  } catch {
    throw new IsochroneError(
      "The routing provider returned an unreadable response.",
      502,
    )
  }
}

function validateIds(ids: string[], label: string, maximum: number) {
  if (
    ids.length === 0 ||
    ids.length > maximum ||
    ids.some((id) => !id.trim() || id.length > 200) ||
    new Set(ids).size !== ids.length
  ) {
    throw new IsochroneError(
      `${label} must contain 1 to ${maximum} unique identifiers.`,
      400,
    )
  }
}

export async function rankEmergencyAlternatives(
  reference: EmergencyAreaReference,
  affectedTapIds: string[],
  alternativeTapIds: string[],
  confirmedTankIds: string[],
): Promise<EmergencyRanking[]> {
  validateIds(affectedTapIds, "affectedTapIds", maximumAffectedTaps)
  if (alternativeTapIds.length + confirmedTankIds.length === 0) {
    throw new IsochroneError("Select at least one alternative water point.", 400)
  }
  if (alternativeTapIds.length > 0) {
    validateIds(alternativeTapIds, "alternativeTapIds", maximumAlternativePoints)
  }
  if (confirmedTankIds.length > 0) {
    validateIds(confirmedTankIds, "confirmedTankIds", maximumAlternativePoints)
  }
  if (alternativeTapIds.length + confirmedTankIds.length > maximumAlternativePoints) {
    throw new IsochroneError(
      `Select no more than ${maximumAlternativePoints} alternative water points.`,
      400,
    )
  }
  const area = await findArea(reference)
  const [origins, taps, tanks] = await Promise.all([
    findPointsByIds("tap", affectedTapIds, area, true),
    findPointsByIds("tap", alternativeTapIds, area, false),
    findPointsByIds("tank", confirmedTankIds, area, false),
  ])
  const destinations = [...taps, ...tanks]
  if (origins.length * destinations.length > 3500) {
    throw new IsochroneError(
      "The selected scenario exceeds the routing provider's matrix size limit.",
      400,
    )
  }
  const points = [...origins, ...destinations]
  const originIndexes = origins.map((_origin, index) => index)
  const destinationIndexes = destinations.map(
    (_destination, index) => origins.length + index,
  )
  const value = await requestProvider(matrixEndpoint, {
    locations: points.map((point) => point.coordinates),
    sources: originIndexes,
    destinations: destinationIndexes,
    metrics: ["duration"],
    resolve_locations: false,
  })
  if (
    typeof value !== "object" ||
    value === null ||
    !Array.isArray((value as { durations?: unknown }).durations)
  ) {
    throw new IsochroneError(
      "The routing provider returned an invalid travel-time matrix.",
      502,
    )
  }
  const durations = (value as { durations: unknown[] }).durations
  if (
    durations.length !== origins.length ||
    durations.some(
      (row) => !Array.isArray(row) || row.length !== destinations.length,
    )
  ) {
    throw new IsochroneError(
      "The routing provider returned an incomplete travel-time matrix.",
      502,
    )
  }
  const rankings = destinations.map((destination, index): EmergencyRanking => {
    const travelTimes = durations.map((row, originIndex) => {
      const time = (row as unknown[])[index]
      return {
        affectedTapId: origins[originIndex]!.id,
        durationSeconds:
          typeof time === "number" && Number.isFinite(time) && time >= 0
            ? time
            : null,
      }
    })
    const reachable = travelTimes.flatMap((route) =>
      route.durationSeconds === null ? [] : [route.durationSeconds],
    )
    const pointStatus = destination.source === "tap" ? destination.status : null
    return {
      id: destination.id,
      source: destination.source,
      status: pointStatus,
      condition: destination.source === "tank" ? destination.status : null,
      travelTimes,
      reachableAffectedTaps: reachable.length,
      allAffectedTapsReachable: reachable.length === origins.length,
      longestReachableRouteSeconds:
        reachable.length > 0 ? Math.max(...reachable) : null,
    }
  })
  return rankings.sort(
    (left, right) =>
      Number(right.allAffectedTapsReachable) -
        Number(left.allAffectedTapsReachable) ||
      right.reachableAffectedTaps - left.reachableAffectedTaps ||
      (left.longestReachableRouteSeconds ?? Number.POSITIVE_INFINITY) -
        (right.longestReachableRouteSeconds ?? Number.POSITIVE_INFINITY),
  )
}

export async function generateEmergencyCoverage(
  reference: EmergencyAreaReference,
  alternativeTapIds: string[],
  confirmedTankIds: string[],
  contours: number[],
): Promise<EmergencyCoverage> {
  if (alternativeTapIds.length + confirmedTankIds.length === 0) {
    throw new IsochroneError("Select at least one alternative water point.", 400)
  }
  if (alternativeTapIds.length > 0) {
    validateIds(alternativeTapIds, "alternativeTapIds", maximumCoverageSources)
  }
  if (confirmedTankIds.length > 0) {
    validateIds(confirmedTankIds, "confirmedTankIds", maximumCoverageSources)
  }
  if (alternativeTapIds.length + confirmedTankIds.length > maximumCoverageSources) {
    throw new IsochroneError(
      `Coverage supports no more than ${maximumCoverageSources} selected alternatives.`,
      400,
    )
  }
  if (
    contours.length === 0 ||
    contours.length > 5 ||
    contours.some(
      (contour) => !Number.isInteger(contour) || contour < 60 || contour > 3600,
    ) ||
    new Set(contours).size !== contours.length ||
    contours.some((contour, index) => index > 0 && contour <= contours[index - 1]!)
  ) {
    throw new IsochroneError(
      "contours must contain 1 to 5 unique ascending walking times between 60 and 3600 seconds.",
      400,
    )
  }
  const area = await findArea(reference)
  const [taps, tanks] = await Promise.all([
    findPointsByIds("tap", alternativeTapIds, area, false),
    findPointsByIds("tank", confirmedTankIds, area, false),
  ])
  const sources = [...taps, ...tanks]
  const isochrones = await Promise.all(
    sources.map((point) =>
      createEmergencyWaterIsochrone(
        {
          id: point.id,
          coordinates: point.coordinates,
          block: null,
          operationalStatus: point.source === "tap" ? point.status : null,
          source: point.source,
          label: `${point.source === "tap" ? "Tap" : "Tank"} · ${point.id}`,
        },
        contours,
      ),
    ),
  )
  const features = isochrones.flatMap((result) =>
    result.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        sourceId: result.waterPoint.id,
        sourceType: result.waterPoint.source,
      },
    })),
  )
  if (features.length === 0) {
    throw new IsochroneError(
      "The routing provider returned no coverage polygons for the selected alternatives.",
      502,
    )
  }

  const coverage = await Promise.all(
    contours.map(async (contourSeconds) => {
      const geometries = features
        .filter((feature) => feature.properties.contourSeconds === contourSeconds)
        .map((feature) => JSON.stringify(feature.geometry))
      if (geometries.length === 0) {
        throw new IsochroneError(
          `No coverage polygon was returned for the ${contourSeconds}-second contour.`,
          502,
        )
      }
      const result = await pool.query<{
        areaGeometry: unknown
        coverageGeometry: unknown
        uncoveredGeometry: unknown
        areaSquareMeters: number | string
        coveredSquareMeters: number | string
        uncoveredSquareMeters: number | string
      }>(
        `WITH selected_area AS (
           SELECT ST_UnaryUnion(ST_Collect(ST_MakeValid(${area.geometry}))) AS geom
           FROM ${qualifiedTable(area.table)} AS area_row
           WHERE area_row.${quoteIdentifier(area.layer.geometryColumn)} IS NOT NULL
             AND area_row.${quoteIdentifier(area.serviceCodeColumn)}::text = $1
         ),
         coverage_geometries AS (
           SELECT ST_SetSRID(ST_GeomFromGeoJSON(value), 4326) AS geom
           FROM unnest($2::text[]) AS value
         ),
         combined_coverage AS (
           SELECT ST_UnaryUnion(ST_Collect(ST_MakeValid(geom))) AS geom
           FROM coverage_geometries
         ),
         clipped AS (
           SELECT
             selected_area.geom AS area,
             ST_Intersection(selected_area.geom, combined_coverage.geom) AS covered,
             ST_Difference(selected_area.geom, combined_coverage.geom) AS uncovered
           FROM selected_area
           CROSS JOIN combined_coverage
         )
         SELECT
           ST_AsGeoJSON(area)::json AS "areaGeometry",
           ST_AsGeoJSON(covered)::json AS "coverageGeometry",
           ST_AsGeoJSON(uncovered)::json AS "uncoveredGeometry",
           ST_Area(area::geography)::float8 AS "areaSquareMeters",
           ST_Area(covered::geography)::float8 AS "coveredSquareMeters",
           ST_Area(uncovered::geography)::float8 AS "uncoveredSquareMeters"
         FROM clipped`,
        [area.serviceCode, geometries],
      )
      const row = result.rows[0]
      if (!row) {
        throw new IsochroneError(
          "Unable to calculate coverage within the selected polygon.",
          422,
        )
      }
      const areaSquareMeters = Number(row.areaSquareMeters)
      const coveredSquareMeters = Number(row.coveredSquareMeters)
      return {
        contourSeconds,
        coverageGeometry: row.coverageGeometry,
        uncoveredGeometry: row.uncoveredGeometry,
        areaSquareMeters,
        coveredSquareMeters,
        uncoveredSquareMeters: Number(row.uncoveredSquareMeters),
        coveredPercent:
          areaSquareMeters > 0
            ? Math.min(100, Math.max(0, (coveredSquareMeters / areaSquareMeters) * 100))
            : 0,
      }
    }),
  )
  return {
    type: "FeatureCollection",
    features,
    area: {
      type: "Feature",
      geometry: area.geometryJson,
      properties: {
        table: area.table.name,
        serviceCode: area.serviceCode,
      },
    },
    coverage,
  }
}

export async function resolveExistingWaterPoint(
  source: PointSource,
  id: string,
): Promise<IsochroneOrigin> {
  if (!id.trim() || id.length > 200) {
    throw new IsochroneError("A valid infrastructure point ID is required.", 400)
  }
  const pointSource = await findPointSource(source)
  const statusExpression = pointSource.statusColumn
    ? `point_row.${quoteIdentifier(pointSource.statusColumn)}::text`
    : "NULL::text"
  const result = await pool.query<{
    id: string
    status: string | null
    longitude: number | string
    latitude: number | string
  }>(
    `SELECT
       point_row.${quoteIdentifier(pointSource.idColumn)}::text AS id,
       ${statusExpression} AS status,
       ST_X(${pointSource.point4326})::float8 AS longitude,
       ST_Y(${pointSource.point4326})::float8 AS latitude
     FROM ${qualifiedTable(pointSource.table)} AS point_row
     WHERE point_row.${quoteIdentifier(pointSource.idColumn)}::text = $1
       AND point_row.${quoteIdentifier(pointSource.layer.geometryColumn)} IS NOT NULL
       AND ST_GeometryType(${pointSource.point4326}) = 'ST_Point'
     LIMIT 2`,
    [id],
  )
  if (result.rows.length === 0) {
    throw new IsochroneError(
      `The selected ${source} was not found in the infrastructure dataset.`,
      404,
    )
  }
  if (result.rows.length > 1) {
    throw new IsochroneError(
      `The selected ${source} identifier is not unique.`,
      409,
    )
  }
  const row = result.rows[0]!
  const longitude = Number(row.longitude)
  const latitude = Number(row.latitude)
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new IsochroneError(
      `The selected ${source} has invalid geographic coordinates.`,
      422,
    )
  }
  return {
    id: row.id,
    coordinates: [longitude, latitude],
    block: null,
    operationalStatus: row.status,
    source,
    label: `${source} · ${row.id}`,
  }
}
