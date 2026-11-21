export type ApiHealth = {
  status: "ok"
  service: string
}

export type TableColumn = {
  name: string
  dataType: string
  udtName: string
  isNullable: boolean
}

export type ApiTable = {
  schema: string
  name: string
  columns: TableColumn[]
}

export type TablePage<Row = Record<string, unknown>> = {
  schema: string
  table: string
  limit: number
  offset: number
  rows: Row[]
}

export type SpatialFeatureCollection = {
  type: "FeatureCollection"
  features: {
    type: "Feature"
    geometry: unknown
    properties: Record<string, unknown>
  }[]
}

export type SpatialLayerMetadata = {
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

export type SupplyRelationshipColumns = {
  borehole: string
  tank: string
  amount: string
}

export type TankServiceRelationship = {
  tankId: string
  serviceCode: string
}

export type TankWaterBalance = {
  tankId: string
  balance: number | null
  demand: number | null
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "")

async function request<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { signal })
  if (!response.ok) {
    throw new Error(`WAREN API request failed with status ${response.status}.`)
  }
  return (await response.json()) as T
}

export function getApiHealth(signal?: AbortSignal) {
  return request<ApiHealth>("/health", signal)
}

export function getTables(signal?: AbortSignal) {
  return request<{ tables: ApiTable[] }>("/data/tables", signal)
}

const boreholeColumnNames = new Set([
  "bhid",
  "borehole",
  "boreholeid",
  "boreholeno",
  "well",
  "wellid",
  "wellno",
  "sourceid",
])
const tankColumnNames = new Set([
  "tank",
  "tankid",
  "tankno",
  "destinationid",
  "storageid",
])
const amountColumnNames = new Set([
  "amount",
  "supply",
  "watersupp",
  "watersupply",
  "wateramount",
  "supplyamount",
  "volume",
  "quantity",
  "m3day",
  "m3perday",
])

function normalizedColumnName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function findColumn(
  columns: TableColumn[],
  aliases: Set<string>,
  pattern: RegExp,
) {
  return columns.find((column) => aliases.has(normalizedColumnName(column.name)))
    ?.name ?? columns.find((column) => pattern.test(normalizedColumnName(column.name)))?.name
}

function numericValue(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function getSupplyRelationships(
  signal?: AbortSignal,
): Promise<{ rows: Record<string, unknown>[]; columns: SupplyRelationshipColumns }> {
  const { tables } = await getTables(signal)
  const candidates = tables.flatMap((table) => {
    const borehole = findColumn(
      table.columns,
      boreholeColumnNames,
      /borehole|well|^bh/,
    )
    const tank = findColumn(table.columns, tankColumnNames, /tank/)
    const amount = findColumn(
      table.columns,
      amountColumnNames,
      /amount|supply|volume|quantity|m3/,
    )
    return borehole && tank && amount
      ? [{ table, columns: { borehole, tank, amount } }]
      : []
  })
  const namedCandidates = candidates.filter(({ table }) => {
    const name = table.name.toLowerCase()
    return (
      /(borehole|well|^bh)/.test(name) &&
      /tank/.test(name) &&
      /(supply|water|connection|link|relationship)/.test(name)
    )
  })
  const matchingCandidates =
    namedCandidates.length > 0 ? namedCandidates : candidates
  if (matchingCandidates.length === 0) {
    throw new Error("The borehole–tank supply table could not be identified.")
  }
  if (matchingCandidates.length > 1) {
    throw new Error("More than one borehole–tank supply table was found.")
  }

  const candidate = matchingCandidates[0]
  if (!candidate) throw new Error("The borehole–tank supply table is unavailable.")

  const rows: Record<string, unknown>[] = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const page = await getTablePage<Record<string, unknown>>(
      candidate.table.name,
      { schema: candidate.table.schema, limit: pageSize, offset },
      signal,
    )
    rows.push(...page.rows)
    if (page.rows.length < pageSize) break
  }
  return { rows, columns: candidate.columns }
}

export async function getTankServiceRelationships(
  signal?: AbortSignal,
): Promise<TankServiceRelationship[]> {
  const { tables } = await getTables(signal)
  const candidates = tables.filter((table) => {
    if (table.name.toLowerCase() !== "tank_service") return false
    const columns = new Set(table.columns.map((column) => normalizedColumnName(column.name)))
    return columns.has("tankid") && columns.has("servicecode")
  })
  if (candidates.length === 0) {
    throw new Error("The tank_service relationship table could not be found.")
  }
  if (candidates.length > 1) {
    throw new Error("More than one tank_service relationship table was found.")
  }

  const table = candidates[0]
  if (!table) throw new Error("The tank_service relationship table is unavailable.")
  const tankColumn = findColumn(table.columns, new Set(["tankid"]), /^tankid$/)
  const serviceColumn = findColumn(
    table.columns,
    new Set(["servicecode"]),
    /^servicecode$/,
  )
  if (!tankColumn || !serviceColumn) {
    throw new Error("The tank_service table is missing tank_id or service_code.")
  }

  const relationships: TankServiceRelationship[] = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const page = await getTablePage<Record<string, unknown>>(
      table.name,
      { schema: table.schema, limit: pageSize, offset },
      signal,
    )
    for (const row of page.rows) {
      const tankId = row[tankColumn]
      const serviceCode = row[serviceColumn]
      if (tankId === null || tankId === undefined || serviceCode === null || serviceCode === undefined) {
        continue
      }
      const normalizedTankId = String(tankId).trim()
      const normalizedServiceCode = String(serviceCode).trim()
      if (normalizedTankId && normalizedServiceCode) {
        relationships.push({
          tankId: normalizedTankId,
          serviceCode: normalizedServiceCode,
        })
      }
    }
    if (page.rows.length < pageSize) break
  }
  return relationships
}

const waterBalanceTankColumnNames = new Set([
  "tank",
  "tankid",
  "tankno",
  "tanknumber",
])
const waterBalanceValueColumnNames = new Set([
  "balance",
  "balancevalue",
  "waterbalance",
  "waterbalancevalue",
  "netbalance",
])
const waterDemandColumnNames = new Set([
  "demand",
  "demandvalue",
  "waterdemand",
  "waterdemandvalue",
])

export async function getTankWaterBalances(
  signal?: AbortSignal,
): Promise<TankWaterBalance[]> {
  const { tables } = await getTables(signal)
  const candidates = tables.flatMap((table) => {
    const tank = findColumn(
      table.columns,
      waterBalanceTankColumnNames,
      /^tank(id|no|number)?$/,
    )
    const balance = findColumn(
      table.columns,
      waterBalanceValueColumnNames,
      /(^|water|net)balance(value)?$/,
    )
    if (!tank || !balance) return []
    return [{
      table,
      tank,
      balance,
      demand: findColumn(
        table.columns,
        waterDemandColumnNames,
        /demand/,
      ),
    }]
  })
  const namedCandidates = candidates.filter(({ table }) =>
    /water.?balance|tank.?balance/i.test(table.name),
  )
  const matches = namedCandidates.length > 0 ? namedCandidates : candidates
  if (matches.length === 0) {
    throw new Error("The tank water-balance table could not be identified.")
  }
  if (matches.length > 1) {
    throw new Error("More than one tank water-balance table was found.")
  }
  const candidate = matches[0]
  if (!candidate) {
    throw new Error("The tank water-balance table is unavailable.")
  }

  const balances: TankWaterBalance[] = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const page = await getTablePage<Record<string, unknown>>(
      candidate.table.name,
      {
        schema: candidate.table.schema,
        limit: pageSize,
        offset,
      },
      signal,
    )
    for (const row of page.rows) {
      const tankId = row[candidate.tank]
      if (tankId === null || tankId === undefined || !String(tankId).trim()) {
        continue
      }
      balances.push({
        tankId: String(tankId).trim(),
        balance: numericValue(row[candidate.balance]),
        demand: candidate.demand ? numericValue(row[candidate.demand]) : null,
      })
    }
    if (page.rows.length < pageSize) break
  }
  return balances
}

export function getTablePage<Row = Record<string, unknown>>(
  table: string,
  options: { schema?: string; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
) {
  const query = new URLSearchParams()
  if (options.schema) query.set("schema", options.schema)
  if (options.limit !== undefined) query.set("limit", String(options.limit))
  if (options.offset !== undefined) query.set("offset", String(options.offset))
  const suffix = query.size > 0 ? `?${query.toString()}` : ""

  return request<TablePage<Row>>(
    `/data/${encodeURIComponent(table)}${suffix}`,
    signal,
  )
}

export function getSpatialLayerGeoJSON(
  table: string,
  options: { schema?: string; geometryColumn?: string; camp?: string } = {},
  signal?: AbortSignal,
) {
  const query = new URLSearchParams()
  if (options.schema) query.set("schema", options.schema)
  if (options.geometryColumn) query.set("geometryColumn", options.geometryColumn)
  if (options.camp) query.set("camp", options.camp)
  const suffix = query.size > 0 ? `?${query.toString()}` : ""

  return request<unknown>(
    `/data/${encodeURIComponent(table)}/geojson${suffix}`,
    signal,
  )
}

export function getSpatialLayers(signal?: AbortSignal) {
  return request<{ layers: SpatialLayerMetadata[] }>("/data/spatial-layers", signal)
}

export function getCamps(signal?: AbortSignal) {
  return request<{ camps: CampContext[] }>("/data/camps", signal)
}
