import type { ComponentType } from "react"
import {
  RiArrowLeftLine,
  RiArrowRightLine,
  RiCheckboxMultipleLine,
  RiCloseCircleLine,
  RiContrastDrop2Line,
  RiCrosshair2Line,
  RiCursorLine,
  RiEraserLine,
  RiFocus3Line,
  RiFullscreenLine,
  RiHand,
  RiInformationLine,
  RiListCheck2,
  RiMap2Line,
  RiMapPin2Line,
  RiNodeTree,
  RiRulerLine,
  RiSearchLine,
  RiShapeLine,
  RiStackLine,
  RiWaterFlashLine,
  RiZoomInLine,
  RiZoomOutLine,
} from "@remixicon/react"
import type { InfrastructureCategory } from "@/components/map/layers"

export type PaneRegion =
  | "left"
  | "right"
  | "bottom"
  | "bottomLeft"
  | "bottomRight"
  | "bottomCenter"
  | "overlay"
export type RibbonTabId =
  | "map"
  | "infrastructure"
  | "analysis"
  | "simulation"
  | "view"

export type ToolId =
  | "explore"
  | "zoomIn"
  | "zoomOut"
  | "pan"
  | "fullExtent"
  | "homeExtent"
  | "previousExtent"
  | "nextExtent"
  | "select"
  | "rectangle"
  | "polygon"
  | "clearSelection"
  | "measureDistance"
  | "measureArea"
  | "clearMeasurement"
  | "identify"
  | "locate"
  | "find"
  | "layers"
  | "legend"
  | "basemap"
  | "campExtent"
  | "zoomToSelection"
  | "tanks"
  | "boreholes"
  | "taps"
  | "connections"
  | "tankServiceAreas"
  | "resetView"
  | "toggleFullscreen"
  | "infrastructureDetails"
  | "connectionScale"
  | "measurementReadout"
  | "populationMap"
  | "populationProjection"
  | "demandCalculator"
  | "waterBalance"
  | "isochrone"
  | "supplyDemand"
  | "deficiency"
  | "supplyByPlanningUnit"
  | "accessibility"
  | "walkingDistance"
  | "accessibilityThresholds"
  | "hydraulics"
  | "hydrology"

export type ToolIcon = ComponentType<{ className?: string }>
export type MapTool =
  | "explore"
  | "pan"
  | "select"
  | "rectangle"
  | "polygon"
  | "measureDistance"
  | "measureArea"
  | "identify"
  | "locate"

export type ToolDefinition = {
  id: ToolId
  label: string
  description: string
  tab: RibbonTabId
  group: string
  icon: ToolIcon
  size?: "large" | "medium" | "small"
  paneRegion?: PaneRegion
  category?: InfrastructureCategory
  action?: string
  showInRibbon?: boolean
  comingSoon?: boolean
}

export const ribbonTabs: { id: RibbonTabId; label: string }[] = [
  { id: "map", label: "Map" },
  { id: "infrastructure", label: "Infrastructure" },
  { id: "analysis", label: "Analysis" },
  { id: "simulation", label: "Simulation" },
  { id: "view", label: "View" },
]

const mapTool = (
  id: ToolId,
  label: string,
  description: string,
  group: string,
  icon: ToolIcon,
  size: ToolDefinition["size"] = "small",
  action?: string,
  paneRegion?: PaneRegion,
): ToolDefinition => ({
  id,
  label,
  description,
  tab: "map",
  group,
  icon,
  size,
  action,
  paneRegion,
})

export const toolRegistry: ToolDefinition[] = [
  mapTool("explore", "Explore", "Explore — identify and inspect map features.", "Navigate", RiCursorLine, "large"),
  mapTool("zoomIn", "Zoom In", "Zoom in on the map.", "Navigate", RiZoomInLine, "small", "zoomIn"),
  mapTool("zoomOut", "Zoom Out", "Zoom out on the map.", "Navigate", RiZoomOutLine, "small", "zoomOut"),
  mapTool("pan", "Pan", "Pan the map without selecting features.", "Navigate", RiHand, "small"),

  mapTool("fullExtent", "Full Extent", "Zoom to the full WAREN study area.", "Map View", RiFullscreenLine, "medium", "fullExtent"),
  mapTool("homeExtent", "Home Extent", "Return to the default useful camp extent.", "Map View", RiFocus3Line, "small", "homeExtent"),
  mapTool("previousExtent", "Previous Extent", "Return to the previous map extent.", "Map View", RiArrowLeftLine, "small", "previousExtent"),
  mapTool("nextExtent", "Next Extent", "Move to the next map extent.", "Map View", RiArrowRightLine, "small", "nextExtent"),

  mapTool("select", "Select", "Select map features.", "Selection", RiCheckboxMultipleLine, "large"),
  mapTool("rectangle", "Rectangle", "Select features by dragging a rectangle.", "Selection", RiFocus3Line, "small"),
  mapTool("polygon", "Polygon", "Select features by drawing a polygon.", "Selection", RiShapeLine, "small"),
  mapTool("clearSelection", "Clear", "Clear the current map selection.", "Selection", RiCloseCircleLine, "small", "clearSelection"),

  mapTool("measureDistance", "Distance", "Measure distance along one or more map segments.", "Measure", RiRulerLine, "large"),
  mapTool("measureArea", "Area", "Measure polygon area and perimeter.", "Measure", RiShapeLine, "medium"),
  mapTool("clearMeasurement", "Clear", "Clear temporary measurements.", "Measure", RiEraserLine, "small", "clearMeasurement"),

  mapTool("identify", "Identify", "Inspect a feature and view its information.", "Inquiry", RiInformationLine, "large"),
  mapTool("locate", "Locate", "Click the map to read geographic coordinates.", "Inquiry", RiCrosshair2Line, "small"),
  mapTool("find", "Find", "Search for features, infrastructure or locations.", "Inquiry", RiSearchLine, "small", undefined, "right"),

  mapTool("layers", "Layers", "Manage visible map layers.", "Layers", RiStackLine, "large", undefined, "right"),
  mapTool("legend", "Legend", "Open the map legend.", "Layers", RiListCheck2, "small", undefined, "bottomCenter"),
  mapTool("basemap", "Basemap", "Choose the map basemap.", "Layers", RiMap2Line, "medium", undefined, "right"),

  mapTool("campExtent", "Camp Extent", "Zoom to the currently selected camp.", "Extent", RiMapPin2Line, "medium", "campExtent"),
  mapTool("zoomToSelection", "Selection", "Zoom to the selected map feature(s).", "Extent", RiFocus3Line, "small", "zoomToSelection"),

  ...([
    ["populationMap", "Population Map", "Population & Demand", RiMap2Line, "large"],
    ["populationProjection", "Population Projection", "Population & Demand", RiFocus3Line, "small"],
    ["demandCalculator", "Demand Calculator", "Population & Demand", RiContrastDrop2Line, "small"],
    ["waterBalance", "Water Balance", "Water Balance", RiNodeTree, "medium"],
    ["supplyDemand", "Supply / Demand", "Water Balance", RiContrastDrop2Line, "small"],
    ["deficiency", "Deficiency", "Water Balance", RiFocus3Line, "small"],
    ["supplyByPlanningUnit", "Supply by Planning", "Water Balance", RiMapPin2Line, "small"],
    ["accessibility", "Accessibility", "Accessibility", RiMapPin2Line, "medium"],
    [
      "isochrone",
      "Emergency Water Accessibility Analysis",
      "Accessibility",
      RiFocus3Line,
      "medium",
    ],
    ["walkingDistance", "Walking Distance", "Accessibility", RiMap2Line, "small"],
    ["accessibilityThresholds", "Thresholds", "Accessibility", RiShapeLine, "small"],
    ["hydraulics", "Hydraulics", "Hydraulics", RiWaterFlashLine, "small"],
    ["hydrology", "Hydrology", "Hydrology", RiShapeLine, "small"],
  ] as const).map(([id, label, group, icon, size]): ToolDefinition => ({
    id,
    label,
    description:
      id === "waterBalance"
        ? "Color service areas by linked tank water supply in liters per person per day."
        : id === "supplyByPlanningUnit"
          ? "Explore temporary population allocations from nearby surplus tanks to a deficient tank."
        : id === "isochrone"
          ? "Identify alternatives and pedestrian coverage for an affected service area."
          : id === "accessibility"
            ? "Generate walking-time isochrones from any mapped location or feature."
            : `${label} analysis is not available yet.`,
    tab: "analysis",
    group,
    icon,
    size,
    ...(id === "waterBalance"
      ? { paneRegion: "left" as const }
      : id === "isochrone" || id === "accessibility"
        ? { paneRegion: "right" as const }
        : id === "supplyByPlanningUnit"
          ? { paneRegion: "overlay" as const }
      : { comingSoon: true }),
  })),

  {
    id: "tanks",
    label: "Tanks",
    description: "Show or hide tank markers.",
    tab: "infrastructure",
    group: "Storage",
    icon: RiWaterFlashLine,
    category: "tanks",
    size: "medium",
  },
  {
    id: "boreholes",
    label: "Boreholes",
    description: "Show or hide borehole markers.",
    tab: "infrastructure",
    group: "Water Sources",
    icon: RiMapPin2Line,
    category: "wells",
    size: "medium",
  },
  {
    id: "taps",
    label: "Taps",
    description: "Show or hide water-point markers.",
    tab: "infrastructure",
    group: "Distribution",
    icon: RiContrastDrop2Line,
    category: "taps",
    size: "medium",
  },
  {
    id: "connections",
    label: "Connections",
    description: "View supply connections for the selected tank or borehole.",
    tab: "infrastructure",
    group: "Network",
    icon: RiNodeTree,
    action: "connections",
    size: "medium",
  },
  {
    id: "tankServiceAreas",
    label: "Service Areas",
    description: "View which service areas are supplied by each tank.",
    tab: "infrastructure",
    group: "Network",
    icon: RiMap2Line,
    paneRegion: "bottomRight",
    size: "medium",
  },
  {
    id: "toggleFullscreen",
    label: "Fullscreen",
    description: "Toggle full-screen map view.",
    tab: "view",
    group: "Display",
    icon: RiFullscreenLine,
    action: "toggleFullscreen",
    size: "medium",
  },
  {
    id: "resetView",
    label: "Full extent",
    description: "Fit the map to the selected area.",
    tab: "view",
    group: "Map",
    icon: RiFocus3Line,
    action: "resetView",
    size: "medium",
  },
  {
    id: "infrastructureDetails",
    label: "Infrastructure Details",
    description: "Inspect the selected tank or borehole.",
    tab: "infrastructure",
    group: "Details",
    icon: RiWaterFlashLine,
    paneRegion: "bottomLeft",
    showInRibbon: false,
  },
  {
    id: "connectionScale",
    label: "Connection amount",
    description: "Connection line colour represents supply amount.",
    tab: "view",
    group: "Map",
    icon: RiNodeTree,
    paneRegion: "bottomCenter",
    showInRibbon: false,
  },
  {
    id: "measurementReadout",
    label: "Measurement",
    description: "Current measurement result.",
    tab: "map",
    group: "Measure",
    icon: RiRulerLine,
    paneRegion: "bottom",
    showInRibbon: false,
  },
]

export function getTool(toolId: string): ToolDefinition | undefined {
  return toolRegistry.find((tool) => tool.id === toolId)
}
