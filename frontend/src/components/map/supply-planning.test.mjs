import assert from "node:assert/strict"
import test from "node:test"
import {
  calculateSupplyPlanningScenario,
  calculateSupplyPlanningResults,
  getDistanceKm,
  getPopulationEquivalent,
  getSupplyPlanningRole,
  selectSupplyPlanningTank,
} from "./supply-planning.ts"

test("classifies tanks from their recorded water balance", () => {
  assert.equal(getSupplyPlanningRole(-12), "receiver")
  assert.equal(getSupplyPlanningRole(12), "supplier")
  assert.equal(getSupplyPlanningRole(0), "excluded")
  assert.equal(getSupplyPlanningRole(null), "unknown")
})

test("converts the balance to population at the 20 litre target", () => {
  assert.equal(getPopulationEquivalent(-98), 4900)
  assert.equal(getPopulationEquivalent(24), 1200)
  assert.equal(getPopulationEquivalent(null), null)
})

test("measures proximity geodesically in kilometres", () => {
  const oneDegreeAtEquator = getDistanceKm([0, 0], [1, 0])
  assert.ok(oneDegreeAtEquator > 111 && oneDegreeAtEquator < 112)
})

test("recalculates receiver and supplier balances for a temporary allocation", () => {
  const scenario = calculateSupplyPlanningScenario(
    { tankId: "Receiver", balanceM3PerDay: -10, coordinates: [0, 0] },
    [
      { tankId: "Supplier", balanceM3PerDay: 4, coordinates: [0.01, 0] },
      { tankId: "Supplier 2", balanceM3PerDay: 8, coordinates: [0.015, 0] },
    ],
    { Supplier: 200, "Supplier 2": 300 },
    2,
  )
  assert.equal(scenario.allocatedPopulation, 500)
  assert.equal(scenario.receiverBalanceM3PerDay, 0)
  assert.equal(scenario.remainingPopulationNeed, 0)
  assert.equal(scenario.allocations[0]?.scenarioBalanceM3PerDay, 0)
  assert.equal(scenario.allocations[1]?.scenarioBalanceM3PerDay, 2)
  assert.equal(scenario.feasible, true)
})

test("does not mark a partial population allocation feasible", () => {
  const scenario = calculateSupplyPlanningScenario(
    { tankId: "Receiver", balanceM3PerDay: -10, coordinates: [0, 0] },
    [{ tankId: "Supplier", balanceM3PerDay: 4, coordinates: [0.01, 0] }],
    { Supplier: 100 },
    2,
  )
  assert.equal(scenario.remainingPopulationNeed, 400)
  assert.equal(scenario.feasible, false)
})

test("reports allocations that exceed the receiver need or supplier capacity", () => {
  const tooMuchForReceiver = calculateSupplyPlanningScenario(
    { tankId: "Receiver", balanceM3PerDay: -1, coordinates: [0, 0] },
    [{ tankId: "Supplier", balanceM3PerDay: 10, coordinates: [0.01, 0] }],
    { Supplier: 60 },
    2,
  )
  const tooMuchForSupplier = calculateSupplyPlanningScenario(
    { tankId: "Receiver", balanceM3PerDay: -10, coordinates: [0, 0] },
    [{ tankId: "Supplier", balanceM3PerDay: 1, coordinates: [0.01, 0] }],
    { Supplier: 60 },
    2,
  )
  assert.equal(tooMuchForReceiver.exceedsReceiverNeed, true)
  assert.equal(tooMuchForReceiver.feasible, false)
  assert.equal(tooMuchForSupplier.exceedsSupplierCapacity, true)
  assert.equal(tooMuchForSupplier.feasible, false)
})

test("rejects suppliers outside the selected proximity radius", () => {
  const scenario = calculateSupplyPlanningScenario(
    { tankId: "Receiver", balanceM3PerDay: -10, coordinates: [0, 0] },
    [{ tankId: "Supplier", balanceM3PerDay: 4, coordinates: [0.1, 0] }],
    { Supplier: 100 },
    2,
  )
  assert.equal(scenario.hasInvalidAllocation, true)
  assert.equal(scenario.feasible, false)
})

test("map selection assigns a receiver, toggles eligible suppliers, and preserves limits", () => {
  const tanks = [
    { tankId: "Receiver", balanceM3PerDay: -10, coordinates: [0, 0] },
    { tankId: "Supplier", balanceM3PerDay: 4, coordinates: [0.01, 0] },
    { tankId: "Far", balanceM3PerDay: 4, coordinates: [0.1, 0] },
    { tankId: "Balanced", balanceM3PerDay: 0, coordinates: [0.01, 0] },
  ]
  const initial = { receiverId: null, supplierIds: [] }
  const receiverSelected = selectSupplyPlanningTank(
    initial,
    tanks,
    "Receiver",
    2,
  )
  assert.deepEqual(receiverSelected.selection, {
    receiverId: "Receiver",
    supplierIds: [],
  })

  const supplierSelected = selectSupplyPlanningTank(
    receiverSelected.selection,
    tanks,
    "Supplier",
    2,
  )
  assert.deepEqual(supplierSelected.selection.supplierIds, ["Supplier"])
  assert.equal(supplierSelected.notice, null)

  const supplierRemoved = selectSupplyPlanningTank(
    supplierSelected.selection,
    tanks,
    "Supplier",
    2,
  )
  assert.deepEqual(supplierRemoved.selection.supplierIds, [])

  const tooFar = selectSupplyPlanningTank(
    receiverSelected.selection,
    tanks,
    "Far",
    2,
  )
  assert.deepEqual(tooFar.selection, receiverSelected.selection)
  assert.match(tooFar.notice, /outside the 2 km proximity limit/)

  const zeroBalance = selectSupplyPlanningTank(
    receiverSelected.selection,
    tanks,
    "Balanced",
    2,
  )
  assert.deepEqual(zeroBalance.selection, receiverSelected.selection)
  assert.match(zeroBalance.notice, /exactly zero/)
})

test("scenario results aggregate allocations and classify deficit outcomes", () => {
  const tanks = [
    { tankId: "Receiver A", balanceM3PerDay: -2, coordinates: [0, 0] },
    { tankId: "Receiver B", balanceM3PerDay: -3, coordinates: [0.02, 0] },
    { tankId: "Supplier", balanceM3PerDay: 4, coordinates: [0.01, 0] },
    { tankId: "Unaffected", balanceM3PerDay: -1, coordinates: [0.03, 0] },
  ]
  const results = calculateSupplyPlanningResults(
    tanks,
    [
      {
        supplyingTankId: "Supplier",
        receivingTankId: "Receiver A",
        allocatedPopulation: 100,
        allocatedWaterM3PerDay: 2,
        distanceM: 1112,
      },
      {
        supplyingTankId: "Supplier",
        receivingTankId: "Receiver B",
        allocatedPopulation: 100,
        allocatedWaterM3PerDay: 2,
        distanceM: 1112,
      },
    ],
    2,
  )

  assert.equal(results.invalidAllocation, false)
  assert.equal(results.tankResults.length, 4)
  assert.equal(results.totalAllocatedM3PerDay, 4)
  assert.equal(results.fullyResolvedDeficits, 1)
  assert.equal(results.partiallyResolvedDeficits, 1)
  assert.equal(results.remainingDeficits, 1)
  assert.equal(results.tankResults.find((tank) => tank.tankId === "Supplier")?.scenarioBalanceM3PerDay, 0)
})

test("scenario result validation rejects oversubscribed suppliers and overfunded receivers", () => {
  const tanks = [
    { tankId: "Receiver", balanceM3PerDay: -1, coordinates: [0, 0] },
    { tankId: "Supplier", balanceM3PerDay: 1, coordinates: [0.01, 0] },
  ]
  const results = calculateSupplyPlanningResults(
    tanks,
    [
      {
        supplyingTankId: "Supplier",
        receivingTankId: "Receiver",
        allocatedPopulation: 60,
        allocatedWaterM3PerDay: 1.2,
        distanceM: 1112,
      },
    ],
    2,
  )
  assert.equal(results.invalidAllocation, true)
})
