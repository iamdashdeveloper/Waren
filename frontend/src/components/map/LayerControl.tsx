import { RiStackLine } from "@remixicon/react"
import {
  infrastructureCategories,
  infrastructureCategory,
  type InfrastructureCategory,
  type LayerStatus,
  type MapLayer,
} from "@/components/map/layers"

type LayerControlProps = {
  layers: MapLayer[]
  activeCategories: InfrastructureCategory[]
  layerStatuses: Record<string, LayerStatus>
  contextualTapStatus: "idle" | "loading" | "empty" | "error"
  onToggleCategory: (category: InfrastructureCategory) => void
}

function categoryStatus(
  layers: MapLayer[],
  statuses: Record<string, LayerStatus>,
): LayerStatus {
  const values = layers.map((layer) => statuses[layer.id] ?? "loading")
  if (values.some((status) => status === "loading")) return "loading"
  if (values.some((status) => status === "loaded")) return "loaded"
  if (values.some((status) => status === "error")) return "error"
  return "empty"
}

function LayerControl({
  layers,
  activeCategories,
  layerStatuses,
  contextualTapStatus,
  onToggleCategory,
}: LayerControlProps) {
  const availableCategories = infrastructureCategories.filter((category) =>
    layers.some((layer) => infrastructureCategory(layer) === category.id),
  )

  return (
    <div className="space-y-0.5">
      <div className="mb-1 flex items-center gap-2 border-b border-border pb-2 text-[9px] text-muted-foreground">
        <RiStackLine className="size-3.5" />
        Toggle visible map layers
      </div>
        {availableCategories.length === 0 && (
          <p className="px-1.5 py-2 text-[10px] text-muted-foreground">No infrastructure layers found.</p>
        )}
        {availableCategories.map((category) => {
          const categoryLayers = layers.filter(
            (layer) => infrastructureCategory(layer) === category.id,
          )
          const status = categoryStatus(categoryLayers, layerStatuses)
          return (
            <label className="flex cursor-pointer items-center gap-2.5 px-1.5 py-1.5 text-[10px] text-foreground transition-colors hover:bg-muted/60" key={category.id}>
              <input
                checked={activeCategories.includes(category.id)}
                className="size-3.5 accent-sky-400"
                onChange={() => onToggleCategory(category.id)}
                type="checkbox"
              />
              <span className={`size-2 shrink-0 ${category.className}`} />
              <span className="min-w-0 flex-1">{category.label}</span>
              {category.id === "taps" && contextualTapStatus === "loading" && (
                <span className="shrink-0 text-[9px] text-muted-foreground">Updating…</span>
              )}
              {status === "loading" && (
                <span className="shrink-0 text-[9px] text-muted-foreground">Loading…</span>
              )}
              {status === "error" && (
                <span className="shrink-0 text-[9px] text-destructive">Unavailable</span>
              )}
              {status === "empty" && (
                <span className="shrink-0 text-[9px] text-muted-foreground">No data</span>
              )}
            </label>
          )
        })}
    </div>
  )
}

export default LayerControl
