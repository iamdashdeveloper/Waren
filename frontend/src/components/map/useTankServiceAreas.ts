import { useEffect, useMemo, useRef, useState } from "react"
import {
  getTankServiceRelationships,
  type TankServiceRelationship,
} from "@/lib/api"

export type TankServiceGroup = {
  tankId: string
  color: string
  serviceCodes: string[]
}

export type TankServiceAreaIndex = {
  tanks: TankServiceGroup[]
  byTankId: Map<string, TankServiceGroup>
  byServiceCode: Map<string, TankServiceGroup[]>
}

export type TankServiceAreaStatus = "idle" | "loading" | "loaded" | "error"

const tankColorPalette = [
  "#a78bfa",
  "#34d399",
  "#fb923c",
  "#38bdf8",
  "#f472b6",
  "#facc15",
  "#2dd4bf",
  "#818cf8",
  "#fb7185",
  "#a3e635",
  "#22d3ee",
  "#e879f9",
]

function tankColor(index: number): string {
  if (index < tankColorPalette.length) return tankColorPalette[index] ?? "#cbd5e1"
  const hue = (index * 137.508) % 360
  const saturation = 0.72
  const lightness = 0.62
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const offset = lightness - chroma / 2
  const channels =
    hue < 60
      ? [chroma, secondary, 0]
      : hue < 120
        ? [secondary, chroma, 0]
        : hue < 180
          ? [0, chroma, secondary]
          : hue < 240
            ? [0, secondary, chroma]
            : hue < 300
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary]
  const hex = channels
    .map((channel) =>
      Math.round(((channel ?? 0) + offset) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
  return `#${hex}`
}

export function buildTankServiceAreaIndex(
  relationships: TankServiceRelationship[],
): TankServiceAreaIndex {
  const servicesByTank = new Map<string, Set<string>>()
  for (const { tankId, serviceCode } of relationships) {
    const tank = tankId.trim()
    const service = serviceCode.trim()
    if (!tank || !service) continue
    const services = servicesByTank.get(tank) ?? new Set<string>()
    services.add(service)
    servicesByTank.set(tank, services)
  }

  const tanks = [...servicesByTank.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([tankId, serviceCodes], index) => ({
      tankId,
      color: tankColor(index),
      serviceCodes: [...serviceCodes].sort((left, right) => left.localeCompare(right)),
    }))
  const byTankId = new Map(tanks.map((tank) => [tank.tankId, tank]))
  const byServiceCode = new Map<string, TankServiceGroup[]>()
  for (const tank of tanks) {
    for (const serviceCode of tank.serviceCodes) {
      const groups = byServiceCode.get(serviceCode) ?? []
      groups.push(tank)
      byServiceCode.set(serviceCode, groups)
    }
  }
  return { tanks, byTankId, byServiceCode }
}

function useTankServiceAreas(active: boolean) {
  const [status, setStatus] = useState<TankServiceAreaStatus>("idle")
  const [relationships, setRelationships] = useState<TankServiceRelationship[]>([])
  const [error, setError] = useState<string | null>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!active || loadedRef.current) return
    const controller = new AbortController()
    setStatus("loading")
    setError(null)
    void getTankServiceRelationships(controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return
        setRelationships(rows)
        loadedRef.current = true
        setStatus("loaded")
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        console.error("Unable to load tank service-area relationships.", cause)
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load tank service-area relationships.",
        )
        setStatus("error")
      })
    return () => controller.abort()
  }, [active])

  const index = useMemo(
    () => buildTankServiceAreaIndex(relationships),
    [relationships],
  )
  return { ...index, status, error }
}

export default useTankServiceAreas
