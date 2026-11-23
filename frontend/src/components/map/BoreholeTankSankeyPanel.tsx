import { useLayoutEffect, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react"
import { RiAddLine, RiRefreshLine, RiSubtractLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import type { CampContext } from "@/lib/api"

type SupplyConnection = {
  boreholeId: string
  tankId: string
  amount: number
}

type Props = {
  camps: CampContext[]
  connections: SupplyConnection[]
  error: string | null
  initialCampId: string
  loading: boolean
  tankCampIds: Record<string, string>
}

type SankeyNode = {
  id: string
  label: string
  y: number
  height: number
}

type SankeyLink = SupplyConnection & {
  sourceY: number
  targetY: number
  width: number
  color: string
}

const numberFormat = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
})
const minimumDiagramWidth = 320

function BoreholeTankSankeyPanel({
  camps,
  connections,
  error,
  initialCampId,
  loading,
  tankCampIds,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<{
    pointerId: number
    x: number
    y: number
    scrollLeft: number
    scrollTop: number
  } | null>(null)
  const zoomRef = useRef(1)
  const [zoom, setZoom] = useState(1)
  const [viewportWidth, setViewportWidth] = useState(minimumDiagramWidth)
  const [selectedCampId, setSelectedCampId] = useState(initialCampId)
  const activeCampId = camps.some((camp) => camp.id === selectedCampId)
    ? selectedCampId
    : camps[0]?.id ?? ""
  const campConnections = connections.filter(
    (connection) => tankCampIds[connection.tankId] === activeCampId,
  )

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const measureViewport = () => {
      const measuredWidth = Math.max(minimumDiagramWidth, viewport.clientWidth)
      setViewportWidth((current) =>
        current === measuredWidth ? current : measuredWidth,
      )
    }
    measureViewport()
    const observer = new ResizeObserver(measureViewport)
    observer.observe(viewport)
    return () => {
      observer.disconnect()
    }
  }, [connections.length, error, loading])
  const total = campConnections.reduce(
    (sum, connection) => sum + connection.amount,
    0,
  )
  const boreholeTotals = new Map<string, number>()
  const tankTotals = new Map<string, number>()
  for (const connection of campConnections) {
    boreholeTotals.set(
      connection.boreholeId,
      (boreholeTotals.get(connection.boreholeId) ?? 0) + connection.amount,
    )
    tankTotals.set(
      connection.tankId,
      (tankTotals.get(connection.tankId) ?? 0) + connection.amount,
    )
  }

  const height = Math.max(
    360,
    Math.max(boreholeTotals.size, tankTotals.size) * 34 + 48,
  )
  const diagramWidth = viewportWidth
  const sideInset = Math.min(180, diagramWidth * 0.3)
  const sourceNodeX = sideInset
  const targetNodeX = diagramWidth - sideInset - 10
  const sourceLineX = sourceNodeX + 10
  const boreholeColors = new Map(
    [...boreholeTotals.keys()]
      .sort((first, second) => first.localeCompare(second))
      .map((id, index, boreholeIds) => [
        id,
        `hsl(${Math.round((index * 360) / boreholeIds.length)} 78% 62%)`,
      ]),
  )
  const top = 28
  const availableHeight = height - top * 2
  const scale = total > 0 ? availableHeight / total : 0
  const boreholes = layoutNodes(boreholeTotals, scale, top)
  const tanks = layoutNodes(tankTotals, scale, top)
  const outgoingOffset = new Map<string, number>()
  const incomingOffset = new Map<string, number>()
  const links: SankeyLink[] = [...campConnections]
    .sort(
      (first, second) =>
        first.boreholeId.localeCompare(second.boreholeId) ||
        first.tankId.localeCompare(second.tankId),
    )
    .map((connection) => {
      const source = boreholes.get(connection.boreholeId)
      const target = tanks.get(connection.tankId)
      const flowHeight = connection.amount * scale
      const sourceOffset = outgoingOffset.get(connection.boreholeId) ?? 0
      const targetOffset = incomingOffset.get(connection.tankId) ?? 0
      outgoingOffset.set(connection.boreholeId, sourceOffset + flowHeight)
      incomingOffset.set(connection.tankId, targetOffset + flowHeight)
      return {
        ...connection,
        sourceY: (source?.y ?? top) + sourceOffset + flowHeight / 2,
        targetY: (target?.y ?? top) + targetOffset + flowHeight / 2,
        width: Math.max(2, flowHeight),
        color: boreholeColors.get(connection.boreholeId) ?? "#38bdf8",
      }
    })
  const changeZoom = (nextZoom: number) => {
    const boundedZoom = Math.min(3, Math.max(0.5, nextZoom))
    zoomRef.current = boundedZoom
    setZoom(boundedZoom)
  }
  const resetDiagramView = () => {
    changeZoom(1)
    viewportRef.current?.scrollTo({ left: 0, top: 0 })
  }

  if (loading) {
    return <p className="text-xs text-muted-foreground">Loading borehole–tank connections…</p>
  }
  if (error) {
    return <p className="text-xs text-destructive" role="alert">{error}</p>
  }
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
          <span>{boreholes.size} boreholes</span>
          <span>{tanks.size} tanks</span>
          <span>{campConnections.length} connections</span>
          <span>Total {numberFormat.format(total)} m³/day</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
            Camp
            <Select
              aria-label="Select Sankey camp"
              className="h-7 w-[150px] px-1.5 text-[10px]"
              onValueChange={setSelectedCampId}
              options={camps.map((camp) => ({
                value: camp.id,
                label: camp.name,
              }))}
              popupClassName="z-[250]"
              positionerClassName="z-[250]"
              value={activeCampId}
            />
          </label>
          <div aria-label="Sankey diagram controls" className="flex items-center gap-1">
            <Button
              aria-label="Zoom out diagram"
              className="size-7"
              disabled={zoom <= 0.5}
              onClick={() => changeZoom(zoomRef.current / 1.2)}
              size="icon-xs"
              variant="outline"
            >
              <RiSubtractLine />
            </Button>
            <span aria-live="polite" className="w-10 text-center text-[10px] text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              aria-label="Zoom in diagram"
              className="size-7"
              disabled={zoom >= 3}
              onClick={() => changeZoom(zoomRef.current * 1.2)}
              size="icon-xs"
              variant="outline"
            >
              <RiAddLine />
            </Button>
            <Button
              aria-label="Reset diagram zoom and pan"
              className="size-7"
              onClick={resetDiagramView}
              size="icon-xs"
              variant="outline"
            >
              <RiRefreshLine />
            </Button>
          </div>
        </div>
      </div>
      <div
        aria-label="Borehole color legend"
        className="flex max-h-12 shrink-0 flex-wrap gap-x-3 gap-y-1 overflow-y-auto text-[9px] text-muted-foreground"
      >
        {[...boreholeColors.entries()].map(([id, color]) => (
          <span className="inline-flex items-center gap-1" key={id}>
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            {id}
          </span>
        ))}
      </div>
      <p className="shrink-0 text-[10px] text-muted-foreground">
        Recorded supply links; band width represents the reported amount. Drag to pan · Ctrl/⌘ + wheel to zoom.
      </p>
      {campConnections.length === 0 ? (
        <div
          className="grid min-h-[220px] flex-1 place-items-center rounded border border-border/70 text-xs text-muted-foreground"
          role="status"
        >
          No positive borehole–tank connections were found in {camps.find((camp) => camp.id === activeCampId)?.name ?? "this camp"}.
        </div>
      ) : (
        <div
          aria-label="Scrollable Sankey diagram viewport"
          className="min-h-[220px] min-w-0 flex-1 cursor-grab overflow-auto rounded border border-border/70 bg-background/40 active:cursor-grabbing"
          onPointerCancel={(event: ReactPointerEvent<HTMLDivElement>) => {
            panRef.current = null
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
          }}
          onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
            if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) return
            const viewport = event.currentTarget
            panRef.current = {
              pointerId: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              scrollLeft: viewport.scrollLeft,
              scrollTop: viewport.scrollTop,
            }
            viewport.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event: ReactPointerEvent<HTMLDivElement>) => {
            const pan = panRef.current
            if (!pan || pan.pointerId !== event.pointerId) return
            event.currentTarget.scrollLeft = pan.scrollLeft - (event.clientX - pan.x)
            event.currentTarget.scrollTop = pan.scrollTop - (event.clientY - pan.y)
          }}
          onPointerUp={(event: ReactPointerEvent<HTMLDivElement>) => {
            panRef.current = null
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
          }}
          onWheel={(event: ReactWheelEvent<HTMLDivElement>) => {
            if (!event.ctrlKey && !event.metaKey) return
            event.preventDefault()
            const viewport = event.currentTarget
            const rect = viewport.getBoundingClientRect()
            const pointerX = event.clientX - rect.left + viewport.scrollLeft
            const pointerY = event.clientY - rect.top + viewport.scrollTop
            const offsetX = event.clientX - rect.left
            const offsetY = event.clientY - rect.top
            const currentZoom = zoomRef.current
            const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1
            const nextZoom = Math.min(3, Math.max(0.5, currentZoom * factor))
            const ratio = nextZoom / currentZoom
            changeZoom(nextZoom)
            requestAnimationFrame(() => {
              const currentViewport = viewportRef.current
              if (!currentViewport) return
              currentViewport.scrollLeft = pointerX * ratio - offsetX
              currentViewport.scrollTop = pointerY * ratio - offsetY
            })
          }}
          ref={viewportRef}
          role="region"
          tabIndex={0}
        >
          <svg
            aria-label="Sankey diagram of borehole supply connections to tanks"
            className="block max-w-none"
            height={height * zoom}
            role="img"
            viewBox={`0 0 ${diagramWidth} ${height}`}
            width={diagramWidth * zoom}
            xmlns="http://www.w3.org/2000/svg"
          >
            <text fill="currentColor" fontSize="12" fontWeight="600" x="18" y="18">
              Boreholes
            </text>
            <text fill="currentColor" fontSize="12" fontWeight="600" textAnchor="end" x={diagramWidth - 4} y="18">
              Tanks
            </text>
            {links.map((link, index) => (
              <path
                d={`M ${sourceLineX} ${link.sourceY} C ${sourceLineX + (targetNodeX - sourceLineX) * 0.4} ${link.sourceY}, ${sourceLineX + (targetNodeX - sourceLineX) * 0.6} ${link.targetY}, ${targetNodeX} ${link.targetY}`}
                fill="none"
                key={`${link.boreholeId}:${link.tankId}:${index}`}
                opacity="0.58"
                stroke={link.color}
                strokeWidth={link.width}
              >
                <title>
                  {link.boreholeId} → {link.tankId}: {numberFormat.format(link.amount)} m³/day
                </title>
              </path>
            ))}
            {[...boreholes.values()].map((node) => (
              <SankeyNodeMark
                color={boreholeColors.get(node.id)}
                key={node.id}
                node={node}
                x={sourceNodeX}
                side="left"
                total={boreholeTotals.get(node.id) ?? 0}
                maxLabelWidth={sourceNodeX - 30}
              />
            ))}
            {[...tanks.values()].map((node) => (
              <SankeyNodeMark
                key={node.id}
                node={node}
                x={targetNodeX}
                side="right"
                total={tankTotals.get(node.id) ?? 0}
                maxLabelWidth={diagramWidth - targetNodeX - 24}
              />
            ))}
          </svg>
        </div>
      )}
    </div>
  )
}

function layoutNodes(
  totals: Map<string, number>,
  scale: number,
  top: number,
): Map<string, SankeyNode> {
  let y = top
  return new Map(
    [...totals.entries()]
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([id, value]) => {
        const node = {
          id,
          label: id,
          y,
          height: Math.max(2, value * scale),
        }
        y += value * scale
        return [id, node]
      }),
  )
}

function SankeyNodeMark({
  node,
  x,
  side,
  total,
  maxLabelWidth,
  color,
}: {
  node: SankeyNode
  x: number
  side: "left" | "right"
  total: number
  maxLabelWidth: number
  color?: string
}) {
  const maximumCharacters = Math.max(6, Math.floor(maxLabelWidth / 5.7) - 8)
  const label = node.label.length > maximumCharacters
    ? `${node.label.slice(0, maximumCharacters - 1)}…`
    : node.label
  return (
    <g>
      <rect
        fill={color ?? (side === "left" ? "#0ea5e9" : "#10b981")}
        height={node.height}
        rx="2"
        width="10"
        x={x}
        y={node.y}
      >
        <title>{node.label}: {numberFormat.format(total)} m³/day</title>
      </rect>
      <text
        dominantBaseline="middle"
        fill="currentColor"
        fontSize="10"
        paintOrder="stroke"
        stroke="rgba(10, 15, 20, 0.94)"
        strokeWidth="3"
        strokeLinejoin="round"
        textAnchor={side === "left" ? "end" : "start"}
        x={side === "left" ? x - 7 : x + 17}
        y={node.y + Math.max(5, node.height / 2)}
      >
        <title>{node.label}: {numberFormat.format(total)} m³/day</title>
        {label} · {numberFormat.format(total)}
      </text>
    </g>
  )
}

export default BoreholeTankSankeyPanel
