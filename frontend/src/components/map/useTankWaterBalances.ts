import { useEffect, useMemo, useRef, useState } from "react"
import {
  getTankWaterSupply,
  type TankWaterBalance,
} from "@/lib/api"

export type WaterBalanceStatus =
  | "adequate"
  | "warning"
  | "danger"
  | "unknown"

export type TankWaterBalanceIndex = {
  byTankId: Map<string, WaterBalanceStatus>
  supplyByTankId: Map<string, number | null>
  detailsByTankId: Map<string, TankWaterBalance>
}

export type WaterBalanceLoadStatus = "idle" | "loading" | "loaded" | "error"

const statusPriority: Record<WaterBalanceStatus, number> = {
  unknown: 0,
  adequate: 1,
  warning: 2,
  danger: 3,
}

export function classifyWaterSupply(
  waterSupply: number | null,
): WaterBalanceStatus {
  if (waterSupply === null || !Number.isFinite(waterSupply)) return "unknown"
  if (waterSupply >= 20) return "adequate"
  if (waterSupply >= 17) return "warning"
  return "danger"
}

export function buildTankWaterBalanceIndex(
  supplies: TankWaterBalance[],
): TankWaterBalanceIndex {
  const byTankId = new Map<string, WaterBalanceStatus>()
  const supplyByTankId = new Map<string, number | null>()
  const detailsByTankId = new Map<string, TankWaterBalance>()
  for (const supply of supplies) {
    const tankId = supply.tankId.trim()
    if (!tankId) continue
    const status = classifyWaterSupply(supply.waterSupply)
    const current = byTankId.get(tankId)
    const currentSupply = supplyByTankId.get(tankId)
    const currentDetails = detailsByTankId.get(tankId)
    if (
      !supplyByTankId.has(tankId) ||
      (supply.waterSupply !== null &&
        (currentSupply === null ||
          currentSupply === undefined ||
          supply.waterSupply < currentSupply))
    ) {
      supplyByTankId.set(tankId, supply.waterSupply)
    }
    if (
      !currentDetails ||
      (supply.waterSupply !== null &&
        (currentDetails.waterSupply === null ||
          supply.waterSupply < currentDetails.waterSupply))
    ) {
      detailsByTankId.set(tankId, supply)
    }
    if (
      current === undefined ||
      statusPriority[status] > statusPriority[current]
    ) {
      byTankId.set(tankId, status)
    }
  }
  return { byTankId, supplyByTankId, detailsByTankId }
}

function useTankWaterBalances(active: boolean) {
  const [status, setStatus] = useState<WaterBalanceLoadStatus>("idle")
  const [supplies, setSupplies] = useState<TankWaterBalance[]>([])
  const [error, setError] = useState<string | null>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!active || loadedRef.current) return
    const controller = new AbortController()
    setStatus("loading")
    setError(null)
    void getTankWaterSupply(controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return
        setSupplies(rows)
        loadedRef.current = true
        setStatus("loaded")
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        console.error("Unable to load tank water-supply values.", cause)
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load tank water-supply values.",
        )
        setStatus("error")
      })
    return () => controller.abort()
  }, [active])

  const index = useMemo(
    () => buildTankWaterBalanceIndex(supplies),
    [supplies],
  )
  return { ...index, status, error }
}

export default useTankWaterBalances
