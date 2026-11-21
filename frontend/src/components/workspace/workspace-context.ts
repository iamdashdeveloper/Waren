import { createContext, useContext } from "react"
import type { InfrastructureCategory } from "@/components/map/layers"
import type {
  PaneRegion,
  RibbonTabId,
  MapTool,
  ToolId,
} from "@/components/workspace/tool-registry"

export type WorkspacePane = {
  toolId: ToolId
  collapsed: boolean
}

export type ToolUiState = {
  active: boolean
  disabled: boolean
}

export type DashboardMapMode =
  | "normal"
  | "tapStatus"
  | "tankServiceAreas"
  | "waterBalance"
  | "boreholeTankConnections"

export type WorkspaceContextValue = {
  activeTab: RibbonTabId
  setActiveTab: (tab: RibbonTabId) => void
  panes: Partial<Record<PaneRegion, WorkspacePane>>
  openPane: (toolId: ToolId, region?: PaneRegion) => void
  togglePane: (toolId: ToolId) => void
  closePane: (toolId: ToolId) => void
  togglePaneCollapsed: (toolId: ToolId) => void
  isPaneOpen: (toolId: ToolId) => boolean
  activeCategories: InfrastructureCategory[]
  availableCategories: InfrastructureCategory[]
  setActiveCategories: (categories: InfrastructureCategory[]) => void
  setAvailableCategories: (categories: InfrastructureCategory[]) => void
  toggleCategory: (category: InfrastructureCategory) => void
  toolUiState: Record<string, ToolUiState>
  registerToolAction: (toolId: string, action: () => void) => () => void
  setToolUiState: (toolId: string, state: ToolUiState) => void
  dispatchToolAction: (toolId: string) => void
  mapMode: DashboardMapMode
  toggleMapMode: (mode: Exclude<DashboardMapMode, "normal">) => void
  activeMapTool: MapTool
  setActiveMapTool: (tool: MapTool) => void
  measurementResult: string
  setMeasurementResult: (result: string) => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error("useWorkspace must be used within WorkspaceProvider.")
  }
  return context
}

export { WorkspaceContext }
