import { randomUUID } from "node:crypto"
import type { PoolClient } from "pg"
import { pool } from "../db/client.js"

const calculationVersion = "supply-planning-v1"
const demandStandardLpd = 20
const cubicMetresPerPersonPerDay = demandStandardLpd / 1000
const maximumScenarioAllocations = 2000

export type SupplyPlanningMapState = {
  extent: [number, number, number, number] | null
  zoom: number | null
  campId: string
  visibleCategories: string[]
}

export type SupplyPlanningAllocationInput = {
  supplyingTankId: string
  receivingTankId: string
  allocatedPopulation: number
}

export type SupplyPlanningScenarioInput = {
  name: string
  description: string | null
  proximityThresholdM: number
  demandStandardLpd: 20
  mapState: SupplyPlanningMapState
  allocations: SupplyPlanningAllocationInput[]
}

type TankBalanceRow = {
  tankId: string
  balanceM3PerDay: string | number | null
  longitude: string | number | null
  latitude: string | number | null
}

type ScenarioRow = {
  id: string
  name: string
  description: string | null
  proximityThresholdM: string | number
  demandStandardLpd: string | number
  scenarioStatus: "saved"
  calculatedAt: Date
  sourceDataTimestamp: Date
  calculationVersion: string
  mapState: SupplyPlanningMapState
  createdAt: Date
  updatedAt: Date
}

type AllocationRow = {
  supplyingTankId: string
  receivingTankId: string
  allocatedPopulation: number
  allocatedWaterM3PerDay: string | number
  distanceM: string | number
}

type TankResultRow = {
  tankId: string
  originalBalanceM3PerDay: string | number
  scenarioBalanceM3PerDay: string | number
  allocatedInM3PerDay: string | number
  allocatedOutM3PerDay: string | number
}

export type SupplyPlanningScenarioDetail = ScenarioRow & {
  allocations: AllocationRow[]
  tankResults: TankResultRow[]
}

export type SupplyPlanningScenarioSummary = ScenarioRow & {
  totalAllocatedM3PerDay: string | number
  supplyingTankCount: number
  receivingTankCount: number
  fullyResolvedDeficits: number
  partiallyResolvedDeficits: number
  remainingDeficits: number
}

export class SupplyPlanningError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message)
    this.name = "SupplyPlanningError"
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requiredString(
  value: unknown,
  name: string,
  maximumLength: number,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximumLength
  ) {
    throw new SupplyPlanningError(
      `${name} must be a non-empty string of at most ${maximumLength} characters.`,
      400,
    )
  }
  return value.trim()
}

export function validateSupplyPlanningInput(
  value: unknown,
): SupplyPlanningScenarioInput {
  if (!isRecord(value)) {
    throw new SupplyPlanningError("A JSON request body is required.", 400)
  }

  const name = requiredString(value.name, "name", 160)
  const description =
    value.description === null || value.description === undefined
      ? null
      : typeof value.description === "string" && value.description.length <= 5000
        ? value.description.trim() || null
        : (() => {
            throw new SupplyPlanningError(
              "description must be a string of at most 5000 characters.",
              400,
            )
          })()
  const proximityThresholdM = Number(value.proximityThresholdM)
  if (
    !Number.isFinite(proximityThresholdM) ||
    proximityThresholdM < 250 ||
    proximityThresholdM > 20_000
  ) {
    throw new SupplyPlanningError(
      "proximityThresholdM must be between 250 and 20000 meters.",
      400,
    )
  }
  if (value.demandStandardLpd !== demandStandardLpd) {
    throw new SupplyPlanningError(
      "Only the 20 L/person/day demand standard is supported.",
      400,
    )
  }

  const mapStateValue = value.mapState
  if (
    !isRecord(mapStateValue) ||
    typeof mapStateValue.campId !== "string" ||
    mapStateValue.campId.length > 100 ||
    !Array.isArray(mapStateValue.visibleCategories) ||
    mapStateValue.visibleCategories.length > 20 ||
    mapStateValue.visibleCategories.some(
      (category) => typeof category !== "string" || category.length > 50,
    )
  ) {
    throw new SupplyPlanningError("mapState is invalid.", 400)
  }
  const extent = mapStateValue.extent
  if (
    extent !== null &&
    (!Array.isArray(extent) ||
      extent.length !== 4 ||
      extent.some((coordinate) => !Number.isFinite(coordinate)))
  ) {
    throw new SupplyPlanningError(
      "mapState.extent must be null or contain four finite coordinates.",
      400,
    )
  }
  const zoom = mapStateValue.zoom
  if (zoom !== null && (typeof zoom !== "number" || !Number.isFinite(zoom))) {
    throw new SupplyPlanningError("mapState.zoom must be null or finite.", 400)
  }

  if (
    !Array.isArray(value.allocations) ||
    value.allocations.length > maximumScenarioAllocations
  ) {
    throw new SupplyPlanningError(
      `allocations must be an array of at most ${maximumScenarioAllocations} tank pairs.`,
      400,
    )
  }
  const allocations = value.allocations.map((item, index) => {
    if (!isRecord(item)) {
      throw new SupplyPlanningError(`allocations[${index}] is invalid.`, 400)
    }
    const supplyingTankId = requiredString(
      item.supplyingTankId,
      `allocations[${index}].supplyingTankId`,
      200,
    )
    const receivingTankId = requiredString(
      item.receivingTankId,
      `allocations[${index}].receivingTankId`,
      200,
    )
    if (
      typeof item.allocatedPopulation !== "number" ||
      !Number.isSafeInteger(item.allocatedPopulation) ||
      item.allocatedPopulation <= 0
    ) {
      throw new SupplyPlanningError(
        `allocations[${index}].allocatedPopulation must be a positive whole number.`,
        400,
      )
    }
    return {
      supplyingTankId,
      receivingTankId,
      allocatedPopulation: item.allocatedPopulation,
    }
  })

  return {
    name,
    description,
    proximityThresholdM,
    demandStandardLpd,
    mapState: {
      extent:
        extent === null
          ? null
          : (extent as [number, number, number, number]),
      zoom: zoom as number | null,
      campId: mapStateValue.campId,
      visibleCategories: mapStateValue.visibleCategories as string[],
    },
    allocations,
  }
}

function numericValue(value: string | number | null): number | null {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function distanceMeters(
  first: [number, number],
  second: [number, number],
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const latitudeDifference = radians(second[1] - first[1])
  const longitudeDifference = radians(second[0] - first[0])
  const haversine = Math.min(
    1,
    Math.max(
      0,
      Math.sin(latitudeDifference / 2) ** 2 +
        Math.cos(radians(first[1])) *
          Math.cos(radians(second[1])) *
          Math.sin(longitudeDifference / 2) ** 2,
    ),
  )
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

async function loadTankBalances(client: PoolClient): Promise<TankBalanceRow[]> {
  const schemaResult = await client.query<{ tanksReady: boolean; balancesReady: boolean }>(
    `SELECT
       to_regclass('public.tanks') IS NOT NULL AS "tanksReady",
       to_regclass('public.water_supply_balance') IS NOT NULL AS "balancesReady"`,
  )
  if (!schemaResult.rows[0]?.tanksReady || !schemaResult.rows[0]?.balancesReady) {
    throw new SupplyPlanningError(
      "The public tanks or water_supply_balance source table is unavailable.",
      503,
    )
  }
  const columnsResult = await client.query<{
    tableName: string
    columnName: string
  }>(
    `SELECT table_name AS "tableName", column_name AS "columnName"
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND ((table_name = 'tanks' AND column_name IN ('id', 'geom'))
         OR (table_name = 'water_supply_balance'
           AND column_name IN ('tank_id', 'water_balance')))`,
  )
  const availableColumns = new Set(
    columnsResult.rows.map((column) => `${column.tableName}.${column.columnName}`),
  )
  for (const column of [
    "tanks.id",
    "tanks.geom",
    "water_supply_balance.tank_id",
    "water_supply_balance.water_balance",
  ]) {
    if (!availableColumns.has(column)) {
      throw new SupplyPlanningError(
        `The required source column ${column} is unavailable.`,
        503,
      )
    }
  }

  const result = await client.query<TankBalanceRow>(
    `SELECT
       tank_row.id AS "tankId",
       balance_row.water_balance AS "balanceM3PerDay",
       ST_X(tank_row.geom) AS longitude,
       ST_Y(tank_row.geom) AS latitude
     FROM public.tanks AS tank_row
     JOIN public.water_supply_balance AS balance_row
       ON balance_row.tank_id = tank_row.id
     WHERE tank_row.geom IS NOT NULL
     ORDER BY tank_row.id`,
  )
  return result.rows
}

function buildScenarioSnapshot(
  tanks: TankBalanceRow[],
  input: SupplyPlanningScenarioInput,
) {
  const tankById = new Map(
    tanks.map((tank) => [
      tank.tankId,
      {
        balance: numericValue(tank.balanceM3PerDay),
        coordinates: [
          numericValue(tank.longitude),
          numericValue(tank.latitude),
        ] as [number | null, number | null],
      },
    ]),
  )
  const pairs = new Set<string>()
  const inByTank = new Map<string, number>()
  const outByTank = new Map<string, number>()
  const storedAllocations: {
    supplyingTankId: string
    receivingTankId: string
    allocatedPopulation: number
    allocatedWaterM3PerDay: number
    distanceM: number
  }[] = []

  for (const allocation of input.allocations) {
    const supplier = tankById.get(allocation.supplyingTankId)
    const receiver = tankById.get(allocation.receivingTankId)
    if (!supplier || !receiver) {
      throw new SupplyPlanningError(
        "Every allocation must reference tanks with recorded balance and geometry rows.",
        422,
      )
    }
    const supplierBalance = supplier.balance
    const receiverBalance = receiver.balance
    if (
      supplierBalance === null ||
      receiverBalance === null ||
      supplierBalance <= 0 ||
      receiverBalance >= 0
    ) {
      throw new SupplyPlanningError(
        "Allocations require a positive-balance supplier and a negative-balance receiver.",
        422,
      )
    }
    if (allocation.supplyingTankId === allocation.receivingTankId) {
      throw new SupplyPlanningError("A tank cannot supply itself.", 422)
    }
    const pair = `${allocation.supplyingTankId}\u0000${allocation.receivingTankId}`
    if (pairs.has(pair)) {
      throw new SupplyPlanningError(
        "Each supplying and receiving tank pair can only be allocated once.",
        422,
      )
    }
    pairs.add(pair)
    const [supplierLongitude, supplierLatitude] = supplier.coordinates
    const [receiverLongitude, receiverLatitude] = receiver.coordinates
    if (
      supplierLongitude === null ||
      supplierLatitude === null ||
      receiverLongitude === null ||
      receiverLatitude === null
    ) {
      throw new SupplyPlanningError(
        "Tank coordinates could not be read from PostGIS.",
        422,
      )
    }
    const distanceM = distanceMeters(
      [supplierLongitude, supplierLatitude],
      [receiverLongitude, receiverLatitude],
    )
    if (distanceM > input.proximityThresholdM) {
      throw new SupplyPlanningError(
        `${allocation.supplyingTankId} is outside the configured proximity threshold from ${allocation.receivingTankId}.`,
        422,
      )
    }
    const allocatedWater = allocation.allocatedPopulation * cubicMetresPerPersonPerDay
    outByTank.set(
      allocation.supplyingTankId,
      (outByTank.get(allocation.supplyingTankId) ?? 0) + allocatedWater,
    )
    inByTank.set(
      allocation.receivingTankId,
      (inByTank.get(allocation.receivingTankId) ?? 0) + allocatedWater,
    )
    storedAllocations.push({
      ...allocation,
      allocatedWaterM3PerDay: allocatedWater,
      distanceM,
    })
  }

  const tankResults = tanks.flatMap((tank) => {
    const originalBalance = numericValue(tank.balanceM3PerDay)
    if (originalBalance === null) return []
    const allocatedInM3PerDay = inByTank.get(tank.tankId) ?? 0
    const allocatedOutM3PerDay = outByTank.get(tank.tankId) ?? 0
    if (
      allocatedInM3PerDay > Math.max(0, -originalBalance) + 1e-8 ||
      allocatedOutM3PerDay > Math.max(0, originalBalance) + 1e-8
    ) {
      throw new SupplyPlanningError(
        "An allocation exceeds a receiving deficit or supplying surplus.",
        422,
      )
    }
    return [{
      tankId: tank.tankId,
      originalBalanceM3PerDay: originalBalance,
      scenarioBalanceM3PerDay:
        originalBalance + allocatedInM3PerDay - allocatedOutM3PerDay,
      allocatedInM3PerDay,
      allocatedOutM3PerDay,
    }]
  })
  return { allocations: storedAllocations, tankResults }
}

function parseUuid(value: string): string {
  const id = value.trim()
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  ) {
    throw new SupplyPlanningError("Scenario ID must be a valid UUID.", 400)
  }
  return id
}

async function selectScenario(
  client: PoolClient,
  id: string,
): Promise<ScenarioRow | null> {
  const result = await client.query<ScenarioRow>(
    `SELECT
       id,
       name,
       description,
       proximity_threshold_m AS "proximityThresholdM",
       demand_standard_lpd AS "demandStandardLpd",
       scenario_status AS "scenarioStatus",
       calculated_at AS "calculatedAt",
       source_data_timestamp AS "sourceDataTimestamp",
       calculation_version AS "calculationVersion",
       map_state AS "mapState",
       created_at AS "createdAt",
       updated_at AS "updatedAt"
     FROM public.water_planning_scenarios
     WHERE id = $1`,
    [id],
  )
  return result.rows[0] ?? null
}

export async function listSupplyPlanningScenarios(): Promise<
  SupplyPlanningScenarioSummary[]
> {
  const result = await pool.query<SupplyPlanningScenarioSummary>(
    `SELECT
       scenario.id,
       scenario.name,
       scenario.description,
       scenario.proximity_threshold_m AS "proximityThresholdM",
       scenario.demand_standard_lpd AS "demandStandardLpd",
       scenario.scenario_status AS "scenarioStatus",
       scenario.calculated_at AS "calculatedAt",
       scenario.source_data_timestamp AS "sourceDataTimestamp",
       scenario.calculation_version AS "calculationVersion",
       scenario.map_state AS "mapState",
       scenario.created_at AS "createdAt",
       scenario.updated_at AS "updatedAt",
       COALESCE(results.total_allocated_m3_day, 0) AS "totalAllocatedM3PerDay",
       COALESCE(results.supplying_tank_count, 0)::integer AS "supplyingTankCount",
       COALESCE(results.receiving_tank_count, 0)::integer AS "receivingTankCount",
       COALESCE(results.fully_resolved_deficits, 0)::integer AS "fullyResolvedDeficits",
       COALESCE(results.partially_resolved_deficits, 0)::integer AS "partiallyResolvedDeficits",
       COALESCE(results.remaining_deficits, 0)::integer AS "remainingDeficits"
     FROM public.water_planning_scenarios AS scenario
     LEFT JOIN LATERAL (
       SELECT
         allocation_summary.total_allocated_m3_day,
         allocation_summary.supplying_tank_count,
         allocation_summary.receiving_tank_count,
         result_summary.fully_resolved_deficits,
         result_summary.partially_resolved_deficits,
         result_summary.remaining_deficits
       FROM (
         SELECT
           COALESCE(SUM(allocated_water_m3_day), 0) AS total_allocated_m3_day,
           COUNT(DISTINCT supplying_tank_id)::integer AS supplying_tank_count,
           COUNT(DISTINCT receiving_tank_id)::integer AS receiving_tank_count
         FROM public.water_planning_allocations
         WHERE scenario_id = scenario.id
       ) AS allocation_summary
       CROSS JOIN (
         SELECT
           COUNT(*) FILTER (
             WHERE original_balance_m3_day < 0
               AND scenario_balance_m3_day >= 0
           )::integer AS fully_resolved_deficits,
           COUNT(*) FILTER (
             WHERE original_balance_m3_day < 0
               AND scenario_balance_m3_day < 0
               AND allocated_in_m3_day > 0
           )::integer AS partially_resolved_deficits,
           COUNT(*) FILTER (
             WHERE original_balance_m3_day < 0
               AND allocated_in_m3_day = 0
           )::integer AS remaining_deficits
         FROM public.water_planning_tank_results
         WHERE scenario_id = scenario.id
       ) AS result_summary
     ) AS results ON true
     ORDER BY scenario.updated_at DESC, scenario.created_at DESC`,
  )
  return result.rows
}

export async function getSupplyPlanningScenario(
  scenarioId: string,
): Promise<SupplyPlanningScenarioDetail> {
  const id = parseUuid(scenarioId)
  const client = await pool.connect()
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
    const scenario = await selectScenario(client, id)
    if (!scenario) {
      throw new SupplyPlanningError("Planning scenario not found.", 404)
    }
    const [allocations, tankResults] = await Promise.all([
      client.query<AllocationRow>(
        `SELECT
           supplying_tank_id AS "supplyingTankId",
           receiving_tank_id AS "receivingTankId",
           allocated_population AS "allocatedPopulation",
           allocated_water_m3_day AS "allocatedWaterM3PerDay",
           distance_m AS "distanceM"
         FROM public.water_planning_allocations
         WHERE scenario_id = $1
         ORDER BY receiving_tank_id, supplying_tank_id`,
        [id],
      ),
      client.query<TankResultRow>(
        `SELECT
           tank_id AS "tankId",
           original_balance_m3_day AS "originalBalanceM3PerDay",
           scenario_balance_m3_day AS "scenarioBalanceM3PerDay",
           allocated_in_m3_day AS "allocatedInM3PerDay",
           allocated_out_m3_day AS "allocatedOutM3PerDay"
         FROM public.water_planning_tank_results
         WHERE scenario_id = $1
         ORDER BY tank_id`,
        [id],
      ),
    ])
    await client.query("COMMIT")
    return {
      ...scenario,
      allocations: allocations.rows,
      tankResults: tankResults.rows,
    }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

async function saveScenario(
  input: SupplyPlanningScenarioInput,
  scenarioId: string | null,
): Promise<SupplyPlanningScenarioDetail> {
  const client = await pool.connect()
  const id = scenarioId ?? randomUUID()
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ")
    const existing = scenarioId ? await selectScenario(client, id) : null
    if (scenarioId && !existing) {
      throw new SupplyPlanningError("Planning scenario not found.", 404)
    }

    const tanks = await loadTankBalances(client)
    if (tanks.length === 0) {
      throw new SupplyPlanningError(
        "No tank balance and geometry records are available.",
        422,
      )
    }
    const snapshot = buildScenarioSnapshot(tanks, input)
    const timestamp = await client.query<{ value: Date }>(
      "SELECT transaction_timestamp() AS value",
    )
    const sourceTimestamp = timestamp.rows[0]?.value
    if (!sourceTimestamp) {
      throw new Error("Unable to record the scenario calculation timestamp.")
    }

    if (existing) {
      await client.query(
        `UPDATE public.water_planning_scenarios
         SET name = $2,
             description = $3,
             proximity_threshold_m = $4,
             demand_standard_lpd = $5,
             scenario_status = 'saved',
             calculated_at = $6,
             source_data_timestamp = $6,
             calculation_version = $7,
             map_state = $8::jsonb,
             updated_at = $6
         WHERE id = $1`,
        [
          id,
          input.name,
          input.description,
          input.proximityThresholdM,
          demandStandardLpd,
          sourceTimestamp,
          calculationVersion,
          JSON.stringify(input.mapState),
        ],
      )
      await client.query(
        "DELETE FROM public.water_planning_allocations WHERE scenario_id = $1",
        [id],
      )
      await client.query(
        "DELETE FROM public.water_planning_tank_results WHERE scenario_id = $1",
        [id],
      )
    } else {
      await client.query(
        `INSERT INTO public.water_planning_scenarios (
           id, name, description, proximity_threshold_m,
           demand_standard_lpd, scenario_status, calculated_at,
           source_data_timestamp, calculation_version, map_state,
           created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, 'saved', $6, $6, $7, $8::jsonb, $6, $6)`,
        [
          id,
          input.name,
          input.description,
          input.proximityThresholdM,
          demandStandardLpd,
          sourceTimestamp,
          calculationVersion,
          JSON.stringify(input.mapState),
        ],
      )
    }

    for (const allocation of snapshot.allocations) {
      await client.query(
        `INSERT INTO public.water_planning_allocations (
           scenario_id, supplying_tank_id, receiving_tank_id,
           allocated_population, allocated_water_m3_day, distance_m
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          allocation.supplyingTankId,
          allocation.receivingTankId,
          allocation.allocatedPopulation,
          allocation.allocatedWaterM3PerDay.toFixed(4),
          allocation.distanceM.toFixed(2),
        ],
      )
    }
    for (const result of snapshot.tankResults) {
      await client.query(
        `INSERT INTO public.water_planning_tank_results (
           scenario_id, tank_id, original_balance_m3_day,
           scenario_balance_m3_day, allocated_in_m3_day,
           allocated_out_m3_day
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          result.tankId,
          result.originalBalanceM3PerDay.toFixed(4),
          result.scenarioBalanceM3PerDay.toFixed(4),
          result.allocatedInM3PerDay.toFixed(4),
          result.allocatedOutM3PerDay.toFixed(4),
        ],
      )
    }

    const scenario = await selectScenario(client, id)
    if (!scenario) throw new Error("Saved planning scenario was not returned.")
    await client.query("COMMIT")
    return {
      ...scenario,
      allocations: snapshot.allocations.map((allocation) => ({
        ...allocation,
        allocatedWaterM3PerDay: allocation.allocatedWaterM3PerDay.toFixed(4),
        distanceM: allocation.distanceM.toFixed(2),
      })),
      tankResults: snapshot.tankResults.map((result) => ({
        ...result,
        originalBalanceM3PerDay: result.originalBalanceM3PerDay.toFixed(4),
        scenarioBalanceM3PerDay: result.scenarioBalanceM3PerDay.toFixed(4),
        allocatedInM3PerDay: result.allocatedInM3PerDay.toFixed(4),
        allocatedOutM3PerDay: result.allocatedOutM3PerDay.toFixed(4),
      })),
    }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

export function createSupplyPlanningScenario(
  value: unknown,
): Promise<SupplyPlanningScenarioDetail> {
  return saveScenario(validateSupplyPlanningInput(value), null)
}

export function updateSupplyPlanningScenario(
  scenarioId: string,
  value: unknown,
): Promise<SupplyPlanningScenarioDetail> {
  return saveScenario(validateSupplyPlanningInput(value), parseUuid(scenarioId))
}

export async function renameSupplyPlanningScenario(
  scenarioId: string,
  value: unknown,
): Promise<Pick<ScenarioRow, "id" | "name" | "updatedAt">> {
  const id = parseUuid(scenarioId)
  if (!isRecord(value)) {
    throw new SupplyPlanningError("A JSON request body is required.", 400)
  }
  const name = requiredString(value.name, "name", 160)
  const result = await pool.query<Pick<ScenarioRow, "id" | "name" | "updatedAt">>(
    `UPDATE public.water_planning_scenarios
     SET name = $2, updated_at = now()
     WHERE id = $1
     RETURNING id, name, updated_at AS "updatedAt"`,
    [id, name],
  )
  const scenario = result.rows[0]
  if (!scenario) {
    throw new SupplyPlanningError("Planning scenario not found.", 404)
  }
  return scenario
}

export async function deleteSupplyPlanningScenario(
  scenarioId: string,
): Promise<void> {
  const id = parseUuid(scenarioId)
  const result = await pool.query(
    "DELETE FROM public.water_planning_scenarios WHERE id = $1",
    [id],
  )
  if (result.rowCount === 0) {
    throw new SupplyPlanningError("Planning scenario not found.", 404)
  }
}
