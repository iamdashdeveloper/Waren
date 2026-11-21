import {
  RiAddLine,
  RiCloseLine,
  RiSubtractLine,
} from "@remixicon/react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useWorkspace } from "@/components/workspace/workspace-context"
import {
  getTool,
  type PaneRegion,
  type ToolId,
} from "@/components/workspace/tool-registry"

const fixedPosition: Partial<Record<PaneRegion, string>> = {
  left: "left-3 top-20 sm:left-5 sm:top-20",
  right: "right-3 top-3 sm:right-5 sm:top-5",
  bottom: "bottom-20 left-1/2 -translate-x-1/2 sm:bottom-24",
  overlay: "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
}

const fixedWidth: Partial<Record<PaneRegion, string>> = {
  left: "w-[min(320px,calc(100%-1.5rem))]",
  right: "w-[min(320px,calc(100%-1.5rem))]",
  bottom: "w-[min(560px,calc(100%-1.5rem))]",
  overlay: "w-[min(360px,calc(100%-1.5rem))]",
}

const bottomRegions: PaneRegion[] = [
  "bottomLeft",
  "bottomCenter",
  "bottomRight",
]

const bottomPosition: Record<PaneRegion, string> = {
  bottomLeft: "sm:col-start-1 sm:justify-self-start",
  bottomCenter: "sm:col-start-2 sm:justify-self-center",
  bottomRight: "sm:col-start-3 sm:justify-self-end",
  left: "",
  right: "",
  bottom: "",
  overlay: "",
}

type PaneManagerProps = {
  content: Partial<Record<ToolId, ReactNode>>
  onClose?: Partial<Record<ToolId, () => void>>
}

function PaneManager({ content, onClose = {} }: PaneManagerProps) {
  const { panes, closePane, togglePaneCollapsed } = useWorkspace()

  const renderPane = (region: PaneRegion, pane: NonNullable<(typeof panes)[PaneRegion]>) => {
    const tool = getTool(pane.toolId)
    const body = content[pane.toolId]
    if (!tool || body === undefined) return null
    const zIndex =
      tool.id === "layers"
        ? "z-[var(--waren-z-panel-controls)]"
        : "z-[var(--waren-z-floating-panels)]"
    const close = () => {
      onClose[pane.toolId]?.()
      closePane(pane.toolId)
    }
    const managedBottomRegion = bottomRegions.includes(region)

    return (
      <Card
        aria-label={`${tool.label} pane`}
        className={`${managedBottomRegion ? "pointer-events-auto w-full sm:w-[min(320px,100%)]" : `absolute ${fixedPosition[region] ?? ""} ${fixedWidth[region] ?? ""}`} ${zIndex} flex max-h-[min(45vh,calc(100%-1rem))] flex-col overflow-hidden border-border/80 bg-card/95 text-card-foreground shadow-lg backdrop-blur-sm`}
        key={region}
        role="region"
      >
        <CardHeader className="flex min-h-9 flex-row items-center justify-between gap-2 space-y-0 border-b px-3 py-1.5">
          <CardTitle className="min-w-0 truncate text-[10px] font-semibold">
            {tool.label}
          </CardTitle>
          <div className="flex shrink-0 items-center">
            <Button
              aria-label={`${pane.collapsed ? "Expand" : "Collapse"} ${tool.label}`}
              className="size-6 text-muted-foreground"
              onClick={() => togglePaneCollapsed(pane.toolId)}
              size="icon-xs"
              variant="ghost"
            >
              {pane.collapsed ? (
                <RiAddLine className="size-3" />
              ) : (
                <RiSubtractLine className="size-3" />
              )}
            </Button>
            <Button
              aria-label={`Close ${tool.label}`}
              className="size-6 text-muted-foreground"
              onClick={close}
              size="icon-xs"
              variant="ghost"
            >
              <RiCloseLine className="size-3" />
            </Button>
          </div>
        </CardHeader>
        {!pane.collapsed && (
          <CardContent className="min-h-0 overflow-y-auto p-3">
            {body}
          </CardContent>
        )}
      </Card>
    )
  }

  const bottomPanes = bottomRegions.flatMap((region) => {
    const pane = panes[region]
    return pane ? [{ region, pane }] : []
  })

  return (
    <>
      {Object.entries(panes).map(([regionName, pane]) => {
        const region = regionName as PaneRegion
        if (!pane || bottomRegions.includes(region)) return null
        return renderPane(region, pane)
      })}
      {bottomPanes.length > 0 && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[var(--waren-z-floating-panels)] grid max-h-[45%] grid-cols-1 items-end gap-2 overflow-y-auto sm:inset-x-5 sm:bottom-5 sm:grid-cols-3 lg:inset-x-6">
          {bottomPanes.map(({ region, pane }) => (
            <div
              className={`pointer-events-none w-full ${bottomPosition[region]}`}
              key={region}
            >
              {renderPane(region, pane)}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

export default PaneManager
