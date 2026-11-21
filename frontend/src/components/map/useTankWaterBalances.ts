import { useEffect, useMemo, useRef, useState } from "react"
import {
  getTankWaterBalances,
  type TankWaterBalance,
} from "@/lib/api"

export type WaterBalanceStatus =
  | "excess"
  | "balanced"
  | "deficient"
  | "unknown"

export type TankWaterBalanceIndex = {
  byTankId: Map<string, WaterBalanceStatus>
}

export type WaterBalanceLoadStatus = "idle" | "loading" | "loaded" | "error"

const statusPriority: Record<WaterBalanceStatus, number> = {
  unknown: 0,
  excess: 1,
  balanced: 2,
  deficient: 3,
}

export function classifyWaterBalance(
  balance: number | null,
  demand: number | null = null,
): WaterBalanceStatus {
  if (balance === null || !Number.isFinite(balance)) return "unknown"
  if (balance === 0 || (demand !== null && balance === demand)) {
    return "balanced"
  }
  return balance < 0 ? "deficient" : "excess"
}

export function buildTankWaterBalanceIndex(
  balances: TankWaterBalance[],
): TankWaterBalanceIndex {
  const byTankId = new Map<string, WaterBalanceStatus>()
  for (const balance of balances) {
    const tankId = balance.tankId.trim()
    if (!tankId) continue
    const status = classifyWaterBalance(balance.balance, balance.demand)
    const current = byTankId.get(tankId)
    if (
      current === undefined ||
      statusPriority[status] > statusPriority[current]
    ) {
      byTankId.set(tankId, status)
    }
  }
  return { byTankId }
}

function useTankWaterBalances(active: boolean) {
  const [status, setStatus] = useState<WaterBalanceLoadStatus>("idle")
  const [balances, setBalances] = useState<TankWaterBalance[]>([])
  const [error, setError] = useState<string | null>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!active || loadedRef.current) return
    const controller = new AbortController()
    setStatus("loading")
    setError(null)
    void getTankWaterBalances(controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return
        setBalances(rows)
        loadedRef.current = true
        setStatus("loaded")
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        console.error("Unable to load tank water-balance values.", cause)
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load tank water-balance values.",
        )
        setStatus("error")
      })
    return () => controller.abort()
  }, [active])

  const index = useMemo(
    () => buildTankWaterBalanceIndex(balances),
    [balances],
  )
  return { ...index, status, error }
}

export default useTankWaterBalances
