export const DEFAULT_SUPPLY_PLANNING_RADIUS_KM = 2
export const TARGET_LITRES_PER_PERSON_PER_DAY = 20
export const CUBIC_METRES_PER_PERSON_PER_DAY =
  TARGET_LITRES_PER_PERSON_PER_DAY / 1000

export type SupplyPlanningTank = {
  tankId: string
  balanceM3PerDay: number | null
  coordinates: [number, number]
}

export type SupplyPlanningRole =
  | "receiver"
  | "supplier"
  | "excluded"
  | "unknown"

export type SupplyPlanningAllocation = {
  tankId: string
  allocatedPopulation: number
  capacityPopulation: number
  distanceKm: number
  scenarioBalanceM3PerDay: number
}

export type SupplyPlanningScenario = {
  receiverBalanceM3PerDay: number
  receiverPopulationNeed: number
  allocatedPopulation: number
  remainingPopulationNeed: number
  allocations: SupplyPlanningAllocation[]
  hasInvalidAllocation: boolean
  exceedsReceiverNeed: boolean
  exceedsSupplierCapacity: boolean
  feasible: boolean
}

export type SupplyPlanningSelection = {
  receiverId: string | null
  supplierIds: string[]
}

export type SupplyPlanningSelectionResult = {
  selection: SupplyPlanningSelection
  notice: string | null
}

export type SupplyPlanningScenarioAllocation = {
  supplyingTankId: string
  receivingTankId: string
  allocatedPopulation: number
  allocatedWaterM3PerDay: number
  distanceM: number
}

export type SupplyPlanningTankResult = {
  tankId: string
  originalBalanceM3PerDay: number
  scenarioBalanceM3PerDay: number
  allocatedInM3PerDay: number
  allocatedOutM3PerDay: number
}

export type SupplyPlanningScenarioResults = {
  allocations: SupplyPlanningScenarioAllocation[]
  tankResults: SupplyPlanningTankResult[]
  totalAllocatedM3PerDay: number
  fullyResolvedDeficits: number
  partiallyResolvedDeficits: number
  remainingDeficits: number
  invalidAllocation: boolean
}

export function supplyPlanningAllocationKey(
  supplyingTankId: string,
  receivingTankId: string,
): string {
  return JSON.stringify([supplyingTankId, receivingTankId])
}

export function createSupplyPlanningScenarioAllocations(
  tanks: SupplyPlanningTank[],
  populationByPair: Readonly<Record<string, number>>,
): SupplyPlanningScenarioAllocation[] {
  const tanksById = new Map(tanks.map((tank) => [tank.tankId, tank]))
  const allocations: SupplyPlanningScenarioAllocation[] = []
  for (const [key, allocatedPopulation] of Object.entries(populationByPair)) {
    let pair: unknown
    try {
      pair = JSON.parse(key)
    } catch {
      continue
    }
    if (
      !Array.isArray(pair) ||
      typeof pair[0] !== "string" ||
      typeof pair[1] !== "string"
    ) {
      continue
    }
    const supplyingTank = tanksById.get(pair[0])
    const receivingTank = tanksById.get(pair[1])
    if (!supplyingTank || !receivingTank || allocatedPopulation <= 0) continue
    const distanceM =
      getDistanceKm(supplyingTank.coordinates, receivingTank.coordinates) * 1000
    allocations.push({
      supplyingTankId: pair[0],
      receivingTankId: pair[1],
      allocatedPopulation,
      allocatedWaterM3PerDay:
        allocatedPopulation * CUBIC_METRES_PER_PERSON_PER_DAY,
      distanceM,
    })
  }
  return allocations
}

export function getSupplyPlanningRole(
  balanceM3PerDay: number | null,
): SupplyPlanningRole {
  if (balanceM3PerDay === null || !Number.isFinite(balanceM3PerDay)) {
    return "unknown"
  }
  if (balanceM3PerDay < 0) return "receiver"
  if (balanceM3PerDay > 0) return "supplier"
  return "excluded"
}

export function getPopulationEquivalent(
  balanceM3PerDay: number | null,
): number | null {
  if (balanceM3PerDay === null || !Number.isFinite(balanceM3PerDay)) {
    return null
  }
  return Math.abs(balanceM3PerDay) / CUBIC_METRES_PER_PERSON_PER_DAY
}

export function getDistanceKm(
  first: [number, number],
  second: [number, number],
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const [firstLongitude, firstLatitude] = first
  const [secondLongitude, secondLatitude] = second
  const latitudeDifference = radians(secondLatitude - firstLatitude)
  const longitudeDifference = radians(secondLongitude - firstLongitude)
  const haversine = Math.min(1, Math.max(0,
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(radians(firstLatitude)) *
      Math.cos(radians(secondLatitude)) *
      Math.sin(longitudeDifference / 2) ** 2,
  ))
  return (
    6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  )
}

export function selectSupplyPlanningTank(
  selection: SupplyPlanningSelection,
  tanks: SupplyPlanningTank[],
  tankId: string,
  maximumDistanceKm: number,
): SupplyPlanningSelectionResult {
  const tank = tanks.find((item) => item.tankId === tankId)
  if (!tank) {
    return {
      selection,
      notice:
        "This tank has no matching recorded water-balance row, so it cannot be used in the scenario.",
    }
  }

  const role = getSupplyPlanningRole(tank.balanceM3PerDay)
  if (role === "receiver") {
    return {
      selection:
        selection.receiverId === tankId
          ? selection
          : { receiverId: tankId, supplierIds: [] },
      notice: null,
    }
  }
  if (role !== "supplier") {
    return {
      selection,
      notice:
        role === "excluded"
          ? "A tank with exactly zero balance is excluded from scenario roles."
          : "This tank has no usable water_balance value.",
    }
  }

  const receiver = tanks.find(
    (item) => item.tankId === selection.receiverId,
  )
  if (!receiver) {
    return {
      selection,
      notice: "Select a deficient receiving tank before adding suppliers.",
    }
  }
  const distanceKm = getDistanceKm(receiver.coordinates, tank.coordinates)
  if (distanceKm > maximumDistanceKm) {
    return {
      selection,
      notice: `${tankId} is ${distanceKm.toFixed(2)} km away, outside the ${maximumDistanceKm} km proximity limit.`,
    }
  }
  return {
    selection: {
      ...selection,
      supplierIds: selection.supplierIds.includes(tankId)
        ? selection.supplierIds.filter((id) => id !== tankId)
        : [...selection.supplierIds, tankId],
    },
    notice: null,
  }
}

export function calculateSupplyPlanningResults(
  tanks: SupplyPlanningTank[],
  allocations: SupplyPlanningScenarioAllocation[],
  maximumDistanceKm: number,
): SupplyPlanningScenarioResults {
  const tanksById = new Map(tanks.map((tank) => [tank.tankId, tank]))
  const allocatedIn = new Map<string, number>()
  const allocatedOut = new Map<string, number>()
  let totalAllocatedM3PerDay = 0
  let invalidAllocation = false

  for (const allocation of allocations) {
    const supplyingTank = tanksById.get(allocation.supplyingTankId)
    const receivingTank = tanksById.get(allocation.receivingTankId)
    const allocatedWater =
      allocation.allocatedPopulation * CUBIC_METRES_PER_PERSON_PER_DAY
    const distanceKm =
      supplyingTank && receivingTank
        ? getDistanceKm(supplyingTank.coordinates, receivingTank.coordinates)
        : Number.POSITIVE_INFINITY
    const distanceMismatch =
      !Number.isFinite(allocation.distanceM) ||
      Math.abs(allocation.distanceM - distanceKm * 1000) > 5
    if (
      !supplyingTank ||
      !receivingTank ||
      allocation.supplyingTankId === allocation.receivingTankId ||
      !Number.isSafeInteger(allocation.allocatedPopulation) ||
      allocation.allocatedPopulation <= 0 ||
      distanceMismatch ||
      !Number.isFinite(allocation.allocatedWaterM3PerDay) ||
      Math.abs(allocation.allocatedWaterM3PerDay - allocatedWater) > 1e-8 ||
      distanceKm > maximumDistanceKm ||
      getSupplyPlanningRole(supplyingTank.balanceM3PerDay) !== "supplier" ||
      getSupplyPlanningRole(receivingTank.balanceM3PerDay) !== "receiver"
    ) {
      invalidAllocation = true
      continue
    }

    allocatedOut.set(
      supplyingTank.tankId,
      (allocatedOut.get(supplyingTank.tankId) ?? 0) + allocatedWater,
    )
    allocatedIn.set(
      receivingTank.tankId,
      (allocatedIn.get(receivingTank.tankId) ?? 0) + allocatedWater,
    )
    totalAllocatedM3PerDay += allocatedWater
  }

  const tankResults = tanks.flatMap((tank) => {
    const originalBalance = tank.balanceM3PerDay
    if (originalBalance === null || !Number.isFinite(originalBalance)) return []
    const allocatedInM3PerDay = allocatedIn.get(tank.tankId) ?? 0
    const allocatedOutM3PerDay = allocatedOut.get(tank.tankId) ?? 0
    if (allocatedOutM3PerDay > Math.max(0, originalBalance) + 1e-8) {
      invalidAllocation = true
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

  let fullyResolvedDeficits = 0
  let partiallyResolvedDeficits = 0
  let remainingDeficits = 0
  for (const result of tankResults) {
    if (result.originalBalanceM3PerDay >= 0) continue
    if (result.scenarioBalanceM3PerDay >= -1e-8) {
      fullyResolvedDeficits += 1
    } else if (result.allocatedInM3PerDay > 0) {
      partiallyResolvedDeficits += 1
    } else {
      remainingDeficits += 1
    }
  }

  return {
    allocations,
    tankResults,
    totalAllocatedM3PerDay,
    fullyResolvedDeficits,
    partiallyResolvedDeficits,
    remainingDeficits,
    invalidAllocation,
  }
}

export function calculateSupplyPlanningScenario(
  receiver: SupplyPlanningTank,
  suppliers: SupplyPlanningTank[],
  allocationsByTankId: Readonly<Record<string, number>>,
  maximumDistanceKm: number,
): SupplyPlanningScenario {
  const receiverBalance = receiver.balanceM3PerDay
  const receiverPopulationNeed = getPopulationEquivalent(receiverBalance) ?? 0
  const receiverIsValid = getSupplyPlanningRole(receiverBalance) === "receiver"
  const allocations: SupplyPlanningAllocation[] = []
  let allocatedPopulation = 0
  let hasInvalidAllocation = false
  let exceedsSupplierCapacity = false

  for (const supplier of suppliers) {
    const rawAllocation = allocationsByTankId[supplier.tankId] ?? 0
    const allocation = Number.isFinite(rawAllocation) ? rawAllocation : 0
    const distanceKm = getDistanceKm(receiver.coordinates, supplier.coordinates)
    const capacityPopulation = getPopulationEquivalent(supplier.balanceM3PerDay) ?? 0
    if (
      !Number.isSafeInteger(rawAllocation) ||
      rawAllocation < 0 ||
      getSupplyPlanningRole(supplier.balanceM3PerDay) !== "supplier" ||
      !Number.isFinite(distanceKm) ||
      distanceKm > maximumDistanceKm
    ) {
      hasInvalidAllocation = true
    }
    if (allocation > capacityPopulation) exceedsSupplierCapacity = true
    allocatedPopulation += allocation
    allocations.push({
      tankId: supplier.tankId,
      allocatedPopulation: allocation,
      capacityPopulation,
      distanceKm,
      scenarioBalanceM3PerDay:
        (supplier.balanceM3PerDay ?? 0) -
        allocation * CUBIC_METRES_PER_PERSON_PER_DAY,
    })
  }

  const exceedsReceiverNeed = allocatedPopulation > receiverPopulationNeed
  const remainingPopulationNeed = Math.max(
    0,
    receiverPopulationNeed - allocatedPopulation,
  )
  const receiverBalanceM3PerDay =
    (receiverBalance ?? 0) +
    allocatedPopulation * CUBIC_METRES_PER_PERSON_PER_DAY
  return {
    receiverBalanceM3PerDay,
    receiverPopulationNeed,
    allocatedPopulation,
    remainingPopulationNeed,
    allocations,
    hasInvalidAllocation,
    exceedsReceiverNeed,
    exceedsSupplierCapacity,
    feasible:
      receiverIsValid &&
      allocations.length > 0 &&
      allocatedPopulation > 0 &&
      remainingPopulationNeed === 0 &&
      !hasInvalidAllocation &&
      !exceedsSupplierCapacity,
  }
}
