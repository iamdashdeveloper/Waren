import {
  RiFullscreenLine,
  RiAddLine,
  RiCloseLine,
  RiSubtractLine,
} from "@remixicon/react"
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useWorkspace } from "@/components/workspace/workspace-context"
import {
  getTool,
  type PaneRegion,
  type ToolId,
} from "@/components/workspace/tool-registry"

const layoutStorageKey = "waren.workspace-layout.v4"

type PaneLayout = {
  x: number
  y: number
  width: number
  height?: number
  collapsed?: boolean
}

const defaultLayouts: Record<PaneRegion, PaneLayout> = {
  left: { x: 16, y: 96, width: 320 },
  right: { x: 16, y: 16, width: 320 },
  bottom: { x: 16, y: 16, width: 360 },
  overlay: { x: 240, y: 180, width: 360 },
  bottomLeft: { x: 16, y: 96, width: 320 },
  bottomCenter: { x: 16, y: 16, width: 320 },
  sankey: { x: 16, y: 16, width: 760, height: 620 },
  bottomRight: { x: 16, y: 16, width: 320 },
}

function defaultLayout(
  region: PaneRegion,
  containerWidth: number,
  toolId: ToolId,
): PaneLayout {
  const base = defaultLayouts[region]
  const isLeft =
    region === "left" ||
    region === "bottomLeft" ||
    toolId === "layers" ||
    toolId === "find"
  const isRight = region === "right" || region === "bottom" ||
    region === "bottomCenter" || region === "bottomRight" ||
    region === "sankey"
  if (containerWidth < 640) {
    return {
      x: 12,
      y: 16,
      width: containerWidth - 24,
    }
  }
  if (isLeft) {
    return {
      ...base,
      x: 16,
      y: toolId === "layers" ? 96 : 16,
    }
  }
  if (isRight) {
    return {
      ...base,
      x: Math.max(12, containerWidth - base.width - 16),
    }
  }
  return { ...base, x: Math.max(12, (containerWidth - base.width) / 2) }
}

function readLayouts(): Partial<Record<PaneRegion, PaneLayout>> {
  try {
    const parsed = JSON.parse(localStorage.getItem(layoutStorageKey) ?? "{}") as unknown
    if (!parsed || typeof parsed !== "object") return {}
    const validRegions = Object.keys(defaultLayouts) as PaneRegion[]
    const layouts: Partial<Record<PaneRegion, PaneLayout>> = {}
    for (const region of validRegions) {
      const saved = (parsed as Partial<Record<PaneRegion, PaneLayout>>)[region]
      if (
        saved &&
        Number.isFinite(saved.x) &&
        Number.isFinite(saved.y) &&
        Number.isFinite(saved.width) &&
        (saved.height === undefined ||
          (Number.isFinite(saved.height) && saved.height >= 180)) &&
        saved.width >= 260
      ) {
        layouts[region] = saved
      }
    }
    return layouts
  } catch {
    return {}
  }
}

type PaneManagerProps = {
  content: Partial<Record<ToolId, ReactNode>>
  onClose?: Partial<Record<ToolId, () => void>>
}

function PaneManager({ content, onClose = {} }: PaneManagerProps) {
  const { panes, closePane } = useWorkspace()
  const [layouts, setLayouts] = useState<Partial<Record<PaneRegion, PaneLayout>>>(() => readLayouts())
  const [maximizedRegions, setMaximizedRegions] = useState<Set<PaneRegion>>(
    () => new Set(),
  )
  const [frontRegion, setFrontRegion] = useState<PaneRegion | null>(null)
  const [workspaceSize, setWorkspaceSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  const workspaceRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    region: PaneRegion
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(layoutStorageKey, JSON.stringify(layouts))
    } catch {
      // Layout persistence is optional; the workspace remains usable in private storage modes.
    }
  }, [layouts])

  useEffect(() => {
    const clampLayouts = () => {
      const workspace = workspaceRef.current
      if (!workspace) return
      const bounds = workspace.getBoundingClientRect()
      setWorkspaceSize({ width: bounds.width, height: bounds.height })
      setLayouts((current) => {
        const next = { ...current }
        for (const [regionName, layout] of Object.entries(next)) {
          const region = regionName as PaneRegion
          if (!layout) continue
          const maxWidth = Math.max(260, bounds.width - 24)
          const width = Math.min(Math.max(layout.width, 260), maxWidth)
          const height =
            layout.height === undefined
              ? undefined
              : Math.min(Math.max(layout.height, 180), bounds.height - 24)
          next[region] = {
            ...layout,
            width,
            height,
            x: Math.min(Math.max(layout.x, 12), Math.max(12, bounds.width - width - 12)),
            y: Math.min(
              Math.max(layout.y, 12),
              Math.max(12, bounds.height - (height ?? 180) - 12),
            ),
          }
        }
        return next
      })
    }
    window.addEventListener("resize", clampLayouts)
    clampLayouts()
    return () => window.removeEventListener("resize", clampLayouts)
  }, [])

  const resetLayout = () => {
    setLayouts({})
    setMaximizedRegions(new Set())
    try {
      localStorage.removeItem(layoutStorageKey)
    } catch {
      // Ignore unavailable storage.
    }
  }

  const getLayout = (region: PaneRegion, toolId: ToolId): PaneLayout => {
    const saved = layouts[region]
    const layout = {
      ...defaultLayout(region, workspaceSize.width, toolId),
      ...saved,
    }
    const width = Math.min(layout.width, Math.max(260, workspaceSize.width - 24))
    const height = layout.height === undefined
      ? undefined
      : Math.min(layout.height, Math.max(180, workspaceSize.height - 24))
    return {
      ...layout,
      width,
      height,
      x: Math.min(Math.max(layout.x, 12), Math.max(12, workspaceSize.width - width - 12)),
      y: Math.min(Math.max(layout.y, 12), Math.max(12, workspaceSize.height - (height ?? 180) - 12)),
    }
  }

  const updateLayout = (region: PaneRegion, patch: Partial<PaneLayout>) => {
    setLayouts((current) => ({
      ...current,
      [region]: {
        ...getLayout(region, panes[region]?.toolId ?? "explore"),
        ...current[region],
        ...patch,
      },
    }))
  }

  const bringFront = (region: PaneRegion) => setFrontRegion(region)

  const renderPane = (region: PaneRegion, pane: NonNullable<(typeof panes)[PaneRegion]>) => {
    const tool = getTool(pane.toolId)
    const body = content[pane.toolId]
    if (!tool || body === undefined) return null

    const close = () => {
      onClose[pane.toolId]?.()
      setMaximizedRegions((current) => {
        if (!current.has(region)) return current
        const next = new Set(current)
        next.delete(region)
        return next
      })
      closePane(pane.toolId)
    }
    const layout = getLayout(region, pane.toolId)
    const collapsed = pane.collapsed || layout.collapsed
    const maximized = maximizedRegions.has(region)
    const style: CSSProperties = {
      position: maximized ? "fixed" : "absolute",
      left: maximized ? 0 : layout.x,
      top: maximized ? 0 : layout.y,
      right: maximized ? 0 : undefined,
      bottom: maximized ? 0 : undefined,
      width: maximized ? "auto" : layout.width,
      height: maximized
        ? "auto"
        : collapsed
          ? 38
          : layout.height ?? (pane.toolId === "tankServiceAreas" ? 460 : undefined),
      minWidth: maximized
        ? undefined
        : Math.min(260, Math.max(180, workspaceSize.width - 24)),
      minHeight: collapsed ? 38 : undefined,
      maxWidth: maximized ? undefined : "calc(100vw - 24px)",
      maxHeight: maximized
        ? undefined
        : Math.max(
            140,
            Math.min(
              window.innerHeight * (pane.toolId === "boreholeTankSankey" ? 0.86 : 0.72),
              workspaceSize.height - layout.y - 12,
            ),
          ),
      zIndex: maximized ? 200 : frontRegion === region ? 90 : 50,
      resize: collapsed || maximized ? "none" : "both",
    }

    const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      const target = event.target
      if (
        target instanceof Element &&
        target.closest("button, input, select, textarea, a, [role='button']")
      ) {
        return
      }
      event.preventDefault()
      bringFront(region)
      const layoutAtStart = getLayout(region, pane.toolId)
      dragRef.current = {
        region,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: layoutAtStart.x,
        originY: layoutAtStart.y,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    }

    const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || drag.region !== region || drag.pointerId !== event.pointerId) return
      const layoutAtStart = getLayout(region, pane.toolId)
      const width = layoutAtStart.width
      const height = layoutAtStart.height
      const x = Math.min(
        Math.max(drag.originX + event.clientX - drag.startX, 12),
        Math.max(12, (workspaceRef.current?.clientWidth ?? window.innerWidth) - width - 12),
      )
      const y = Math.min(
        Math.max(drag.originY + event.clientY - drag.startY, 12),
        Math.max(12, (workspaceRef.current?.clientHeight ?? window.innerHeight) - (height ?? 180) - 12),
      )
      updateLayout(region, { x, y })
    }

    const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragRef.current?.pointerId === event.pointerId) {
        dragRef.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      }
    }

    const handlePanelPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
      bringFront(region)
      const rect = event.currentTarget.getBoundingClientRect()
      if (
        !collapsed &&
        rect.right - event.clientX <= 22 &&
        rect.bottom - event.clientY <= 22
      ) {
        event.currentTarget.dataset.resizing = "true"
      }
    }

    const persistResize = (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.dataset.resizing !== "true") return
      delete event.currentTarget.dataset.resizing
      const rect = event.currentTarget.getBoundingClientRect()
      updateLayout(region, {
        width: Math.min(Math.max(rect.width, 260), (workspaceRef.current?.clientWidth ?? window.innerWidth) - 24),
        height: Math.min(Math.max(rect.height, 180), (workspaceRef.current?.clientHeight ?? window.innerHeight) - 24),
      })
    }

    return (
      <Card
        aria-label={`${tool.label} pane`}
        className="pointer-events-auto absolute flex flex-col overflow-hidden border-border/80 bg-card/95 text-card-foreground shadow-xl backdrop-blur-sm"
        key={region}
        onPointerDown={handlePanelPointerDown}
        role="region"
        style={style}
        onPointerUp={persistResize}
      >
        <CardHeader
          className="flex min-h-9 cursor-move touch-none flex-row items-center justify-between gap-2 space-y-0 border-b px-3 py-1.5"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          <CardTitle className="min-w-0 truncate text-[10px] font-semibold">
            {tool.label}
          </CardTitle>
          <div
            className="flex shrink-0 items-center"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
          >
            <Button
              aria-label="Reset floating panel layout"
              className="h-6 px-1 text-[9px] text-muted-foreground"
              onClick={resetLayout}
              size="sm"
              variant="ghost"
            >
              Reset
            </Button>
            {!collapsed && (
              <Button
                aria-label={`${maximized ? "Restore" : "Maximize"} ${tool.label}`}
                aria-pressed={maximized}
                className="size-6 text-muted-foreground"
                onClick={() =>
                  setMaximizedRegions((current) => {
                    const next = new Set(current)
                    if (next.has(region)) next.delete(region)
                    else next.add(region)
                    return next
                  })
                }
                size="icon-xs"
                variant="ghost"
              >
                <RiFullscreenLine className="size-3" />
              </Button>
            )}
            <Button
              aria-label={`${collapsed ? "Expand" : "Collapse"} ${tool.label}`}
              className="size-6 text-muted-foreground"
              onClick={() => {
                if (!collapsed && maximized) {
                  setMaximizedRegions((current) => {
                    const next = new Set(current)
                    next.delete(region)
                    return next
                  })
                }
                updateLayout(region, { collapsed: !collapsed })
              }}
              size="icon-xs"
              variant="ghost"
            >
              {collapsed ? <RiAddLine className="size-3" /> : <RiSubtractLine className="size-3" />}
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
        {!collapsed && (
          <CardContent
            className={
              pane.toolId === "boreholeTankSankey" ||
              pane.toolId === "tankServiceAreas"
                ? "flex min-h-0 flex-1 flex-col overflow-hidden p-3"
                : "min-h-0 overflow-y-auto p-3"
            }
          >
            {body}
          </CardContent>
        )}
      </Card>
    )
  }

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" ref={workspaceRef}>
      {Object.entries(panes).map(([regionName, pane]) => {
        const region = regionName as PaneRegion
        if (!pane) return null
        return renderPane(region, pane)
      })}
    </div>
  )
}

export default PaneManager
