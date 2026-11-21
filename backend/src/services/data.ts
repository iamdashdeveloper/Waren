import { pool } from "../db/client.js"

export type TableColumn = {
  name: string
  dataType: string
  udtName: string
  isNullable: boolean
}

export type ApplicationTable = {
  schema: string
  name: string
  columns: TableColumn[]
}

export type GeoJSONFeatureCollection = {
  type: "FeatureCollection"
  features: {
    type: "Feature"
    geometry: unknown
    properties: Record<string, unknown>
  }[]
}

export type SpatialGeoJSONResult = {
  collection: GeoJSONFeatureCollection
  geometryColumn: string
  srid: number | null
}

export type SpatialLayer = {
  schema: string
  table: string
  geometryColumn: string
  geometryType: string | null
  srid: number | null
}

export type CampContext = {
  id: string
  name: string
  kind: "kakuma" | "village"
  extent: [number, number, number, number] | null
  tables: string[]
}

export class SpatialDataError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message)
    this.name = "SpatialDataError"
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}

export async function listApplicationTables(): Promise<ApplicationTable[]> {
  const result = await pool.query<{
    schema: string
    name: string
    columns: TableColumn[]
  }>(
    `SELECT
       c.table_schema AS schema,
       c.table_name AS name,
       json_agg(
         json_build_object(
           'name', c.column_name,
           'dataType', c.data_type,
           'udtName', c.udt_name,
           'isNullable', c.is_nullable = 'YES'
         )
         ORDER BY c.ordinal_position
       ) AS columns
     FROM information_schema.columns AS c
     JOIN information_schema.tables AS t
       ON t.table_schema = c.table_schema
       AND t.table_name = c.table_name
     WHERE t.table_type IN ('BASE TABLE', 'VIEW')
       AND c.table_schema <> 'information_schema'
       AND c.table_schema NOT LIKE 'pg\\_%' ESCAPE '\\'
       AND has_table_privilege(
         pg_catalog.format('%I.%I', c.table_schema, c.table_name),
         'SELECT'
       )
     GROUP BY c.table_schema, c.table_name
     ORDER BY c.table_schema, c.table_name`,
  )

  return result.rows
}

export async function listSpatialLayers(): Promise<SpatialLayer[]> {
  const result = await pool.query<SpatialLayer>(
    `SELECT
       c.table_schema AS schema,
       c.table_name AS table,
       c.column_name AS "geometryColumn",
       COALESCE(gc.type, geog.type) AS "geometryType",
       COALESCE(gc.srid, geog.srid) AS srid
     FROM information_schema.columns AS c
     JOIN information_schema.tables AS t
       ON t.table_schema = c.table_schema
       AND t.table_name = c.table_name
     LEFT JOIN geometry_columns AS gc
       ON gc.f_table_schema = c.table_schema
       AND gc.f_table_name = c.table_name
       AND gc.f_geometry_column = c.column_name
     LEFT JOIN geography_columns AS geog
       ON geog.f_table_schema = c.table_schema
       AND geog.f_table_name = c.table_name
       AND geog.f_geography_column = c.column_name
     WHERE t.table_type IN ('BASE TABLE', 'VIEW')
       AND c.udt_name IN ('geometry', 'geography')
       AND c.table_schema <> 'information_schema'
       AND c.table_schema NOT LIKE 'pg\\_%' ESCAPE '\\'
       AND has_table_privilege(
         pg_catalog.format('%I.%I', c.table_schema, c.table_name),
         'SELECT'
       )
     ORDER BY c.table_schema, c.table_name, c.ordinal_position`,
  )

  return result.rows
}

function campForSpatialTable(
  layer: SpatialLayer,
): Pick<CampContext, "id" | "name" | "kind"> | null {
  const kakumaMatch = /^Kak_(\d+)_Zone_\d+_Blocks$/i.exec(layer.table)
  if (kakumaMatch?.[1]) {
    return {
      id: `kakuma-${kakumaMatch[1]}`,
      name: `Kakuma ${kakumaMatch[1]}`,
      kind: "kakuma",
    }
  }

  const villageMatch = /^Village_(\d+)_(?:Compounds?|Neighborhoods?)$/i.exec(
    layer.table,
  )
  if (villageMatch?.[1]) {
    return {
      id: `village-${villageMatch[1]}`,
      name: `Village ${villageMatch[1]}`,
      kind: "village",
    }
  }
  return null
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function geometryAs4326(layer: SpatialLayer): string {
  const geometry = `camp_layer.${quoteIdentifier(layer.geometryColumn)}`
  if (layer.geometryType === "geography") return `${geometry}::geometry`
  if (layer.srid === null || layer.srid === 0) {
    throw new SpatialDataError(
      `Spatial reference information is unavailable for ${layer.table}.`,
      422,
    )
  }
  return layer.srid === 4326
    ? geometry
    : `ST_Transform(${geometry}, 4326)`
}

export async function listCampContexts(): Promise<CampContext[]> {
  const spatialLayers = await listSpatialLayers()
  const campGroups = new Map<
    string,
    { camp: Pick<CampContext, "id" | "name" | "kind">; layers: SpatialLayer[] }
  >()

  for (const layer of spatialLayers) {
    const camp = campForSpatialTable(layer)
    if (!camp) continue
    const group = campGroups.get(camp.id) ?? { camp, layers: [] }
    group.layers.push(layer)
    campGroups.set(camp.id, group)
  }

  return Promise.all(
    Array.from(campGroups.values(), async ({ camp, layers }) => {
      const selects = layers.map((layer) => {
        const qualifiedTable = `${quoteIdentifier(layer.schema)}.${quoteIdentifier(layer.table)}`
        const geometry = geometryAs4326(layer)
        return `SELECT ST_Transform(${geometry}, 3857) AS geom
                FROM ${qualifiedTable} AS camp_layer
                WHERE camp_layer.${quoteIdentifier(layer.geometryColumn)} IS NOT NULL`
      })
      const result = await pool.query<{
        minX: number | string | null
        minY: number | string | null
        maxX: number | string | null
        maxY: number | string | null
      }>(
        `SELECT
           ST_XMin(extent)::float8 AS "minX",
           ST_YMin(extent)::float8 AS "minY",
           ST_XMax(extent)::float8 AS "maxX",
           ST_YMax(extent)::float8 AS "maxY"
         FROM (
           SELECT ST_Extent(geom) AS extent
           FROM (${selects.join(" UNION ALL ")}) AS camp_geometries
         ) AS camp_extent`,
      )
      const bounds = result.rows[0]
      const extent =
        bounds?.minX !== null &&
        bounds?.minX !== undefined &&
        bounds.minY !== null &&
        bounds.minY !== undefined &&
        bounds.maxX !== null &&
        bounds.maxX !== undefined &&
        bounds.maxY !== null &&
        bounds.maxY !== undefined
          ? ([
              Number(bounds.minX),
              Number(bounds.minY),
              Number(bounds.maxX),
              Number(bounds.maxY),
            ] as [number, number, number, number])
          : null

      return {
        ...camp,
        extent,
        tables: layers.map((layer) => layer.table),
      }
    }),
  )
}

export async function fetchTapsForCamp(
  campId: string,
): Promise<SpatialGeoJSONResult> {
  const [tables, spatialLayers] = await Promise.all([
    listApplicationTables(),
    listSpatialLayers(),
  ])
  const tapLayer = spatialLayers.find(
    (layer) => layer.table.toLowerCase() === "taps",
  )
  if (!tapLayer) {
    throw new SpatialDataError("The taps spatial layer is unavailable.", 404)
  }
  const tapTable = tables.find(
    (table) =>
      table.schema === tapLayer.schema && table.name === tapLayer.table,
  )
  if (!tapTable) {
    throw new SpatialDataError("The taps spatial layer is unavailable.", 404)
  }
  if (!/^(?:kakuma|village)-\d+$/.test(campId)) {
    throw new SpatialDataError("The selected camp is not available.", 404)
  }

  const matchingLayers = spatialLayers.filter(
    (layer) => campForSpatialTable(layer)?.id === campId,
  )
  if (matchingLayers.length === 0) {
    throw new SpatialDataError("The selected camp has no spatial boundaries.", 404)
  }

  const tapGeometryColumn = tapTable.columns.find(
    (column) =>
      column.name === tapLayer.geometryColumn &&
      ["geometry", "geography"].includes(column.udtName.toLowerCase()),
  )
  if (!tapGeometryColumn) {
    throw new SpatialDataError(
      "The taps spatial geometry column is unavailable.",
      422,
    )
  }

  const tapGeometry = `tap_row.${quoteIdentifier(tapLayer.geometryColumn)}`
  const tapGeometryAsGeometry =
    tapGeometryColumn.udtName.toLowerCase() === "geography"
      ? `${tapGeometry}::geometry`
      : tapGeometry
  if (tapLayer.srid === null || tapLayer.srid === 0) {
    throw new SpatialDataError(
      "The taps spatial reference information is unavailable.",
      422,
    )
  }
  const tapGeometry4326 =
    tapLayer.srid === 4326
      ? tapGeometryAsGeometry
      : `ST_Transform(${tapGeometryAsGeometry}, 4326)`
  const areaSelects = matchingLayers.map((layer) => {
    const qualifiedTable = `${quoteIdentifier(layer.schema)}.${quoteIdentifier(layer.table)}`
    const geometry = geometryAs4326(layer)
    return `SELECT ${geometry} AS geom
            FROM ${qualifiedTable} AS camp_layer
            WHERE camp_layer.${quoteIdentifier(layer.geometryColumn)} IS NOT NULL`
  })
  const propertyColumns = tapTable.columns.filter(
    (column) =>
      !["geometry", "geography"].includes(column.udtName.toLowerCase()),
  )
  const propertiesExpression =
    propertyColumns.length === 0
      ? "'{}'::jsonb"
      : `jsonb_build_object(${propertyColumns
          .map(
            (column) =>
              `${quoteLiteral(column.name)}, tap_row.${quoteIdentifier(column.name)}`,
          )
          .join(", ")})`

  try {
    const qualifiedTapTable = `${quoteIdentifier(tapTable.schema)}.${quoteIdentifier(tapTable.name)}`
    const result = await pool.query<{
      features: GeoJSONFeatureCollection["features"] | null
    }>(
      `WITH camp_area AS (
         SELECT ST_UnaryUnion(ST_Collect(geom)) AS geom
         FROM (${areaSelects.join(" UNION ALL ")}) AS camp_geometries
       )
       SELECT COALESCE(
         json_agg(
           json_build_object(
             'type', 'Feature',
             'geometry', ST_AsGeoJSON(${tapGeometry4326})::json,
             'properties', ${propertiesExpression}
           )
         ),
         '[]'::json
       ) AS features
       FROM ${qualifiedTapTable} AS tap_row
       CROSS JOIN camp_area
       WHERE tap_row.${quoteIdentifier(tapLayer.geometryColumn)} IS NOT NULL
         AND camp_area.geom IS NOT NULL
         AND ST_Covers(camp_area.geom, ${tapGeometry4326})`,
    )

    return {
      collection: {
        type: "FeatureCollection",
        features: result.rows[0]?.features ?? [],
      },
      geometryColumn: tapLayer.geometryColumn,
      srid: tapLayer.srid,
    }
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string" &&
      error.code.startsWith("22")
    ) {
      throw new SpatialDataError(
        "Spatial filtering of taps failed for this camp.",
        422,
      )
    }
    throw error
  }
}

export async function fetchTablePage(
  schema: string,
  table: string,
  limit: number,
  offset: number,
): Promise<unknown[]> {
  const qualifiedTable = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`
  const result = await pool.query(
    `SELECT * FROM ${qualifiedTable} LIMIT $1 OFFSET $2`,
    [limit, offset],
  )
  return result.rows
}

export async function fetchTableGeoJSON(
  table: ApplicationTable,
  requestedGeometryColumn?: string,
): Promise<SpatialGeoJSONResult> {
  const geometryColumns = table.columns.filter((column) =>
    ["geometry", "geography"].includes(column.udtName.toLowerCase()),
  )
  if (geometryColumns.length === 0) {
    throw new SpatialDataError(
      "The requested table does not have a spatial geometry column.",
      422,
    )
  }
  if (requestedGeometryColumn) {
    const requestedColumn = geometryColumns.find(
      (column) => column.name === requestedGeometryColumn,
    )
    if (!requestedColumn) {
      throw new SpatialDataError(
        "The requested geometry column was not found on the spatial table.",
        404,
      )
    }
  } else if (geometryColumns.length > 1) {
    throw new SpatialDataError(
      "The requested table has multiple geometry columns.",
      422,
    )
  }

  const geometryColumn =
    geometryColumns.find(
      (column) => column.name === requestedGeometryColumn,
    ) ?? geometryColumns[0]
  if (!geometryColumn) {
    throw new SpatialDataError(
      "The requested table does not have a spatial geometry column.",
      422,
    )
  }

  const qualifiedTable = `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`
  const geometryIdentifier = quoteIdentifier(geometryColumn.name)
  const geometryExpression =
    geometryColumn.udtName.toLowerCase() === "geography"
      ? `row_data.${geometryIdentifier}::geometry`
      : `row_data.${geometryIdentifier}`
  const sridResult = await pool.query<{ srid: number | string }>(
    `SELECT DISTINCT ST_SRID(${geometryExpression}) AS srid
     FROM ${qualifiedTable}
       AS row_data
     WHERE row_data.${geometryIdentifier} IS NOT NULL
     LIMIT 2`,
  )

  let srids = sridResult.rows.map((row) => Number(row.srid))
  if (srids.length === 0) {
    const metadataResult = await pool.query<{ srid: number | string }>(
      `SELECT srid
       FROM geometry_columns
       WHERE f_table_schema = $1
         AND f_table_name = $2
         AND f_geometry_column = $3
       UNION
       SELECT srid
       FROM geography_columns
       WHERE f_table_schema = $1
         AND f_table_name = $2
         AND f_geography_column = $3
       LIMIT 2`,
      [table.schema, table.name, geometryColumn.name],
    )
    srids = metadataResult.rows.map((row) => Number(row.srid))
  }

  if (srids.length > 1) {
    throw new SpatialDataError(
      "The spatial column contains mixed coordinate reference systems.",
      422,
    )
  }

  const srid = srids[0]
  if (srid !== undefined && (!Number.isInteger(srid) || srid < 0)) {
    throw new SpatialDataError(
      "The spatial column has an invalid coordinate reference system.",
      422,
    )
  }
  if (srid === 0) {
    throw new SpatialDataError(
      "The spatial column has no defined coordinate reference system.",
      422,
    )
  }

  const geometryColumnNames = geometryColumns.map((column) => column.name)
  const geometryColumnNamesExpression = geometryColumnNames
    .map((column) => quoteLiteral(column))
    .join(", ")
  const propertiesExpression =
    geometryColumnNamesExpression.length === 0
      ? "to_jsonb(row_data)"
      : `to_jsonb(row_data) - ARRAY[${geometryColumnNamesExpression}]::text[]`
  const transformedGeometry =
    srid === undefined || srid === 4326
      ? geometryExpression
      : `ST_Transform(${geometryExpression}, 4326)`
  const geometryJSON =
    srid === undefined
      ? "NULL::json"
      : `ST_AsGeoJSON(${transformedGeometry})::json`

  try {
    const result = await pool.query<{
      features: GeoJSONFeatureCollection["features"] | null
    }>(
      `SELECT COALESCE(
         json_agg(
           json_build_object(
             'type', 'Feature',
             'geometry', ${geometryJSON},
             'properties', ${propertiesExpression}
           )
         ),
         '[]'::json
       ) AS features
       FROM ${qualifiedTable} AS row_data
       WHERE row_data.${geometryIdentifier} IS NOT NULL`,
    )

    return {
      collection: {
        type: "FeatureCollection",
        features: result.rows[0]?.features ?? [],
      },
      geometryColumn: geometryColumn.name,
      srid: srid ?? null,
    }
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string" &&
      error.code.startsWith("22")
    ) {
      throw new SpatialDataError(
        "Spatial data could not be converted to GeoJSON.",
        422,
      )
    }
    throw error
  }
}
