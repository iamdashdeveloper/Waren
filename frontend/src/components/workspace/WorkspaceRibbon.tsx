import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { useWorkspace } from "@/components/workspace/workspace-context"
import {
  toolRegistry,
  type MapTool,
  type ToolDefinition,
  type ToolId,
} from "@/components/workspace/tool-registry"

const mapTools = new Set<MapTool>([
  "explore",
  "pan",
  "select",
  "rectangle",
  "polygon",
  "measureDistance",
  "measureArea",
  "identify",
  "locate",
])

function isMapTool(id: ToolId): id is MapTool {
  return mapTools.has(id as MapTool)
}

function WorkspaceRibbon() {
  const {
    activeTab,
    activeCategories,
    availableCategories,
    toggleCategory,
    togglePane,
    isPaneOpen,
    toolUiState,
    dispatchToolAction,
    activeMapTool,
    setActiveMapTool,
  } = useWorkspace()
  const groups = useMemo(() => {
    const result = new Map<string, ToolDefinition[]>()
    for (const tool of toolRegistry) {
      if (tool.tab !== activeTab || tool.showInRibbon === false) continue
      const items = result.get(tool.group) ?? []
      items.push(tool)
      result.set(tool.group, items)
    }
    return [...result.entries()]
  }, [activeTab])

  const activate = (tool: ToolDefinition) => {
    if (tool.comingSoon) return
    if (tool.paneRegion) {
      togglePane(tool.id)
    } else if (tool.category) {
      toggleCategory(tool.category)
    } else if (isMapTool(tool.id)) {
      setActiveMapTool(tool.id)
    } else {
      dispatchToolAction(tool.action ?? tool.id)
    }
  }

  const toolIsActive = (tool: ToolDefinition) =>
    tool.paneRegion
      ? isPaneOpen(tool.id)
      : tool.category
        ? activeCategories.includes(tool.category)
        : isMapTool(tool.id)
          ? activeMapTool === tool.id
          : (toolUiState[tool.action ?? tool.id]?.active ?? false)

  const toolIsDisabled = (tool: ToolDefinition) =>
    Boolean(
      tool.comingSoon ||
        (tool.category && !availableCategories.includes(tool.category)) ||
        (tool.action &&
          toolUiState[tool.action]?.disabled),
    )

  const renderTool = (tool: ToolDefinition, size = tool.size ?? "small") => (
    <RibbonTool
      active={toolIsActive(tool)}
      disabled={toolIsDisabled(tool)}
      key={tool.id}
      onActivate={() => activate(tool)}
      size={size}
      tool={tool}
    />
  )
  const renderCompact = (tool: ToolDefinition) => (
    <CompactRibbonTool
      active={toolIsActive(tool)}
      disabled={toolIsDisabled(tool)}
      key={tool.id}
      onActivate={() => activate(tool)}
      tool={tool}
    />
  )

  const renderGroup = (groupName: string, tools: ToolDefinition[]) => {
    const byId = (id: ToolId) => tools.find((tool) => tool.id === id)
    const compactStack = (ids: ToolId[]) => (
      <div className="flex flex-col gap-px">
        {ids.map(byId).filter((tool): tool is ToolDefinition => Boolean(tool)).map(renderCompact)}
      </div>
    )

    if (groupName === "Navigate") {
      return (
        <div className="flex items-center gap-1">
          {byId("explore") && renderTool(byId("explore")!, "large")}
          {compactStack(["zoomIn", "zoomOut", "pan"])}
        </div>
      )
    }
    if (groupName === "Map View") {
      return (
        <div className="flex items-center gap-1">
          {byId("fullExtent") && renderTool(byId("fullExtent")!, "medium")}
          {compactStack(["homeExtent"])}
          {compactStack(["previousExtent", "nextExtent"])}
        </div>
      )
    }
    if (groupName === "Selection") {
      return (
        <div className="flex items-center gap-1">
          {byId("select") && renderTool(byId("select")!, "large")}
          {compactStack(["rectangle", "polygon", "clearSelection"])}
        </div>
      )
    }
    if (groupName === "Measure") {
      return (
        <div className="flex items-center gap-1">
          {byId("measureDistance") && renderTool(byId("measureDistance")!, "large")}
          {compactStack(["measureArea", "clearMeasurement"])}
        </div>
      )
    }
    if (groupName === "Inquiry") {
      return (
        <div className="flex items-center gap-1">
          {byId("identify") && renderTool(byId("identify")!, "large")}
          {compactStack(["locate", "find"])}
        </div>
      )
    }
    if (groupName === "Layers") {
      return (
        <div className="flex items-center gap-1">
          {byId("layers") && renderTool(byId("layers")!, "large")}
          {compactStack(["legend", "basemap"])}
        </div>
      )
    }
    if (groupName === "Extent") {
      return (
        <div className="flex items-center gap-1">
          {byId("campExtent") && renderTool(byId("campExtent")!, "medium")}
          {compactStack(["zoomToSelection"])}
        </div>
      )
    }
    if (groupName === "Population & Demand") {
      return (
        <div className="flex items-center gap-1">
          {byId("populationMap") && renderTool(byId("populationMap")!, "large")}
          {compactStack(["populationProjection", "demandCalculator"])}
        </div>
      )
    }
    if (groupName === "Water Balance") {
      return (
        <div className="flex items-center gap-1">
          {byId("waterBalance") && renderTool(byId("waterBalance")!, "medium")}
          {compactStack(["supplyDemand", "deficiency", "supplyByPlanningUnit"])}
        </div>
      )
    }
    if (groupName === "Accessibility") {
      return (
        <div className="flex items-center gap-1">
          {byId("accessibility") && renderTool(byId("accessibility")!, "medium")}
          {compactStack(["isochrone", "walkingDistance", "accessibilityThresholds"])}
        </div>
      )
    }
    return (
      <div className="flex items-center gap-0.5">
        {tools.map((tool) => renderTool(tool, tool.size ?? "small"))}
      </div>
    )
  }

  return (
    <div
      aria-label={`${activeTab} ribbon`}
      className="waren-context-ribbon flex min-h-[88px] shrink-0 items-stretch gap-0 overflow-x-auto border-b bg-muted/20 px-1.5 sm:min-h-[98px] sm:px-3"
      role="toolbar"
    >
      {groups.map(([groupName, groupTools]) => (
        <section
          aria-label={`${groupName} tools`}
          className="flex shrink-0 flex-col items-center justify-between border-r border-border/70 px-1 py-1 last:border-r-0 sm:px-1.5"
          key={groupName}
        >
          <div className="flex min-h-0 flex-1 items-center justify-center">
            {renderGroup(groupName, groupTools)}
          </div>
          <span className="mt-0.5 w-full border-t border-border/60 pt-0.5 text-center text-[8px] font-medium uppercase tracking-[0.1em] text-muted-foreground sm:text-[9px]">
            {groupName}
          </span>
        </section>
      ))}
      {groups.length === 0 && (
        <div className="flex items-center px-4 text-[10px] text-muted-foreground">
          Tools for this workspace are being prepared.
        </div>
      )}
    </div>
  )
}

function RibbonTool({
  tool,
  size,
  active,
  disabled,
  onActivate,
}: {
  tool: ToolDefinition
  size: "large" | "medium" | "small"
  active: boolean
  disabled: boolean
  onActivate: () => void
}) {
  const Icon = tool.icon
  const large = size === "large"
  const medium = size === "medium"
  const description = tool.comingSoon
    ? `${tool.description} Coming soon.`
    : tool.description
  return (
    <Button
      aria-label={tool.comingSoon ? `${tool.label}, coming soon` : tool.label}
      aria-pressed={active}
      data-tour={
        tool.id === "layers"
          ? "layers-tool"
          : tool.id === "waterBalance"
            ? "water-balance-tool"
            : undefined
      }
      className={`relative h-auto shrink-0 flex-col justify-center gap-1 rounded-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring ${large ? "min-w-[54px] px-1.5 py-1 sm:min-w-[64px] sm:px-2.5" : medium ? "min-w-[45px] px-1 py-1 sm:min-w-[52px] sm:px-1.5" : "min-w-[36px] px-0.5 py-1 sm:min-w-[40px] sm:px-1"} ${active ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/35" : ""} ${tool.comingSoon ? "opacity-55" : ""}`}
      disabled={disabled}
      onClick={onActivate}
      title={`${tool.label} — ${description}`}
      type="button"
      variant="ghost"
    >
      {active && (
        <span aria-hidden="true" className="absolute inset-x-2 top-0 h-0.5 rounded-full bg-primary" />
      )}
      <Icon className={`shrink-0 ${large ? "size-6 sm:size-7" : medium ? "size-5" : "size-4"}`} />
      <span className={`max-w-[76px] truncate leading-none ${large ? "text-[9px] font-medium sm:text-[10px]" : medium ? "text-[8px] sm:text-[9px]" : "text-[7px] sm:text-[8px]"}`}>
        {tool.label}
      </span>
      {tool.comingSoon && (
        <span className="text-[6px] uppercase leading-none tracking-wide text-muted-foreground">
          Soon
        </span>
      )}
    </Button>
  )
}

function CompactRibbonTool({
  tool,
  active,
  disabled,
  onActivate,
}: {
  tool: ToolDefinition
  active: boolean
  disabled: boolean
  onActivate: () => void
}) {
  const Icon = tool.icon
  return (
    <Button
      aria-label={tool.comingSoon ? `${tool.label}, coming soon` : tool.label}
      aria-pressed={active}
      data-tour={
        tool.id === "layers"
          ? "layers-tool"
          : tool.id === "waterBalance"
            ? "water-balance-tool"
            : undefined
      }
      className={`h-[23px] min-w-0 justify-start gap-1 rounded-sm px-1.5 text-[8px] text-muted-foreground hover:bg-muted/80 hover:text-foreground sm:h-6 sm:px-2 sm:text-[9px] ${active ? "bg-primary/10 text-primary" : ""} ${tool.comingSoon ? "opacity-55" : ""}`}
      disabled={disabled}
      onClick={onActivate}
      title={`${tool.label} — ${tool.description}${tool.comingSoon ? " Coming soon." : ""}`}
      type="button"
      variant="ghost"
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="max-w-[90px] truncate">{tool.label}</span>
      {tool.comingSoon && (
        <span className="text-[6px] uppercase text-muted-foreground">Soon</span>
      )}
    </Button>
  )
}

export default WorkspaceRibbon
