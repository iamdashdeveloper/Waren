import type { SpatialLayerMetadata } from "@/lib/api"

export type MapLayer = SpatialLayerMetadata & {
  id: string
  label: string
  color: string
}

export type InfrastructureCategory = "wells" | "tanks" | "taps"

export type LayerStatus = "loading" | "loaded" | "empty" | "error"

export const infrastructureCategories: {
  id: InfrastructureCategory
  label: string
  color: string
  className: string
  symbol: "circle" | "square" | "diamond"
}[] = [
  { id: "wells", label: "Wells / Boreholes", color: "#38bdf8", className: "bg-sky-300", symbol: "circle" },
  { id: "tanks", label: "Tanks", color: "#fbbf24", className: "bg-amber-300", symbol: "square" },
  { id: "taps", label: "Taps", color: "#34d399", className: "bg-emerald-300", symbol: "diamond" },
]

export function spatialLayerKey(layer: SpatialLayerMetadata): string {
  return `${layer.schema}.${layer.table}.${layer.geometryColumn}`
}

export function humanizeTableName(tableName: string): string {
  return tableName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const layerPalette = [
  { color: "bg-amber-300", fill: "rgba(251, 191, 36, 0.04)", stroke: "rgba(251, 191, 36, 0.48)" },
  { color: "bg-sky-300", fill: "rgba(56, 189, 248, 0.04)", stroke: "rgba(56, 189, 248, 0.48)" },
  { color: "bg-emerald-300", fill: "rgba(52, 211, 153, 0.04)", stroke: "rgba(52, 211, 153, 0.48)" },
  { color: "bg-rose-300", fill: "rgba(251, 113, 133, 0.04)", stroke: "rgba(251, 113, 133, 0.48)" },
  { color: "bg-violet-300", fill: "rgba(167, 139, 250, 0.04)", stroke: "rgba(196, 181, 253, 0.5)" },
  { color: "bg-cyan-300", fill: "rgba(103, 232, 249, 0.04)", stroke: "rgba(103, 232, 249, 0.48)" },
  { color: "bg-orange-300", fill: "rgba(251, 146, 60, 0.04)", stroke: "rgba(251, 146, 60, 0.48)" },
  { color: "bg-fuchsia-300", fill: "rgba(232, 121, 249, 0.04)", stroke: "rgba(232, 121, 249, 0.48)" },
]

const zonePalette = [
  { color: "bg-sky-300", fill: "rgba(56, 189, 248, 0.035)", stroke: "rgba(56, 189, 248, 0.55)", focusFill: "rgba(56, 189, 248, 0.10)", focusStroke: "rgba(56, 189, 248, 0.92)" },
  { color: "bg-amber-300", fill: "rgba(251, 191, 36, 0.035)", stroke: "rgba(251, 191, 36, 0.55)", focusFill: "rgba(251, 191, 36, 0.10)", focusStroke: "rgba(251, 191, 36, 0.92)" },
  { color: "bg-emerald-300", fill: "rgba(52, 211, 153, 0.035)", stroke: "rgba(52, 211, 153, 0.55)", focusFill: "rgba(52, 211, 153, 0.10)", focusStroke: "rgba(52, 211, 153, 0.92)" },
  { color: "bg-violet-300", fill: "rgba(167, 139, 250, 0.035)", stroke: "rgba(167, 139, 250, 0.58)", focusFill: "rgba(167, 139, 250, 0.10)", focusStroke: "rgba(167, 139, 250, 0.94)" },
]

export function infrastructureCategory(
  layer: Pick<SpatialLayerMetadata, "table">,
): InfrastructureCategory | null {
  const name = layer.table.toLowerCase()
  if (/\b(boreholes?|wells?)\b/.test(name)) return "wells"
  if (/\btanks?\b/.test(name)) return "tanks"
  if (/\b(taps?|tapstands?|water_points?)\b/.test(name)) return "taps"
  return null
}

export function isZoneLayer(layer: Pick<SpatialLayerMetadata, "table">): boolean {
  return /_zone_\d+_blocks$/i.test(layer.table)
}

function zoneStyle(layer: Pick<SpatialLayerMetadata, "table">, focused: boolean) {
  const match = /_zone_(\d+)_blocks$/i.exec(layer.table)
  const zoneNumber = Number(match?.[1] ?? 1)
  const palette = zonePalette[(zoneNumber - 1) % zonePalette.length] ?? zonePalette[0]!
  return {
    fill: focused ? palette.focusFill : palette.fill,
    stroke: focused ? palette.focusStroke : palette.stroke,
    color: palette.color,
  }
}

export function describeSpatialLayers(
  layers: SpatialLayerMetadata[],
): MapLayer[] {
  return layers.map((layer) => {
    const category = infrastructureCategory(layer)
    const thematicStyle = isZoneLayer(layer)
      ? zoneStyle(layer, false)
      : /compound|neighborhood/i.test(layer.table)
        ? layerPalette[5]!
        : category
          ? {
                color: infrastructureCategories.find((item) => item.id === category)?.className ?? "bg-slate-300",
            }
          : layerPalette[0]

    return {
      ...layer,
      id: spatialLayerKey(layer),
      label: category
        ? infrastructureCategories.find((item) => item.id === category)?.label ?? humanizeTableName(layer.table)
        : humanizeTableName(layer.table),
      color: thematicStyle?.color ?? "bg-slate-300",
    }
  })
}

export function layerStyle(layer: MapLayer, focused = false) {
  if (isZoneLayer(layer)) return zoneStyle(layer, focused)
  const category = infrastructureCategory(layer)
  if (category) {
    const item = infrastructureCategories.find((candidate) => candidate.id === category)
    const color = item?.color ?? "#94a3b8"
    return {
      fill: color,
      stroke: "#0f172a",
      color,
    }
  }
  const index = Math.abs(
    Array.from(layer.id).reduce((hash, character) => hash + character.charCodeAt(0), 0),
  ) % layerPalette.length
  const palette = /compound|neighborhood/i.test(layer.table)
    ? layerPalette[5]
    : layerPalette[index]
  return {
    fill: palette?.fill ?? "rgba(148, 163, 184, 0.09)",
    stroke: palette?.stroke ?? "rgba(148, 163, 184, 0.78)",
    color: palette?.color ?? "#94a3b8",
  }
}
