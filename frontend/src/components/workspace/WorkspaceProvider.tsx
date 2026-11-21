import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { InfrastructureCategory } from "@/components/map/layers"
import {
  WorkspaceContext,
  type ToolUiState,
  type WorkspacePane,
  type DashboardMapMode,
} from "@/components/workspace/workspace-context"
import {
  getTool,
  type PaneRegion,
  type RibbonTabId,
  type ToolId,
  type MapTool,
} from "@/components/workspace/tool-registry"
import { playUIClick, playUITyping } from "@/lib/sounds"

function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [panes, setPanes] = useState<
    Partial<Record<PaneRegion, WorkspacePane>>
  >({})
  const [activeTab, setActiveTab] = useState<RibbonTabId>("map")
  const [mapMode, setMapMode] = useState<DashboardMapMode>("normal")
  const [activeMapTool, setActiveMapTool] = useState<MapTool>("explore")
  const [measurementResult, setMeasurementResult] = useState("")
  const [activeCategories, setActiveCategories] = useState<
    InfrastructureCategory[]
  >([])
  const [availableCategories, setAvailableCategories] = useState<
    InfrastructureCategory[]
  >([])
  const [toolUiState, setToolUiStateValue] = useState<
    Record<string, ToolUiState>
  >({})
  const actions = useRef(new Map<string, () => void>())

  useEffect(() => {
    let typingTimer: number | null = null
    const handleClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      if (event.target.closest("[data-ui-sound='off']")) return
      if (
        event.target.closest(
          "button, [role='button'], [role='option'], input[type='checkbox'], input[type='radio'], select",
        )
      ) {
        if (typingTimer !== null) {
          window.clearTimeout(typingTimer)
          typingTimer = null
        }
        playUIClick()
      }
    }
    const handleInput = (event: Event) => {
      const target = event.target
      const isTextArea = target instanceof HTMLTextAreaElement
      const isTextInput =
        target instanceof HTMLInputElement &&
        ["text", "search", "email", "url", "tel", "number", ""].includes(
          target.type,
        )
      if (!isTextArea && !isTextInput) {
        return
      }
      if (typingTimer !== null) window.clearTimeout(typingTimer)
      typingTimer = window.setTimeout(() => {
        typingTimer = null
        playUITyping()
      }, 450)
    }
    document.addEventListener("click", handleClick, true)
    document.addEventListener("input", handleInput, true)
    return () => {
      document.removeEventListener("click", handleClick, true)
      document.removeEventListener("input", handleInput, true)
      if (typingTimer !== null) window.clearTimeout(typingTimer)
    }
  }, [])

  const openPane = useCallback((toolId: ToolId, requestedRegion?: PaneRegion) => {
    const region = requestedRegion ?? getTool(toolId)?.paneRegion
    if (!region) return
    setPanes((current) => ({
      ...current,
      [region]: { toolId, collapsed: false },
    }))
  }, [])

  const toggleMapMode = useCallback(
    (mode: Exclude<DashboardMapMode, "normal">) => {
      setMapMode((current) => (current === mode ? "normal" : mode))
      setPanes((current) => {
        const hasModePane =
          mode === "tankServiceAreas" || mode === "waterBalance"
        if (!hasModePane) {
          if (
            current.bottomRight?.toolId !== "tankServiceAreas" &&
            current.bottomRight?.toolId !== "waterBalance"
          ) {
            return current
          }
          const next = { ...current }
          delete next.bottomRight
          return next
        }
        if (current.bottomRight?.toolId === mode) {
          const next = { ...current }
          delete next.bottomRight
          return next
        }
        return {
          ...current,
          bottomRight: { toolId: mode, collapsed: false },
        }
      })
    },
    [],
  )

  const togglePane = useCallback((toolId: ToolId) => {
    const region = getTool(toolId)?.paneRegion
    if (!region) return
    if (toolId === "tankServiceAreas") {
      setMapMode((current) =>
        current === toolId ? "normal" : toolId,
      )
    }
    setPanes((current) => {
      if (current[region]?.toolId === toolId) {
        const next = { ...current }
        delete next[region]
        return next
      }
      return { ...current, [region]: { toolId, collapsed: false } }
    })
  }, [])

  const closePane = useCallback((toolId: ToolId) => {
    if (toolId === "tankServiceAreas") {
      setMapMode("normal")
    }
    setPanes((current) => {
      const next = { ...current }
      for (const [region, pane] of Object.entries(next)) {
        if (pane?.toolId === toolId) {
          delete next[region as PaneRegion]
        }
      }
      return next
    })
  }, [])

  const togglePaneCollapsed = useCallback((toolId: ToolId) => {
    setPanes((current) => {
      const next = { ...current }
      for (const [region, pane] of Object.entries(next)) {
        if (pane?.toolId === toolId) {
          next[region as PaneRegion] = {
            ...pane,
            collapsed: !pane.collapsed,
          }
        }
      }
      return next
    })
  }, [])

  const isPaneOpen = useCallback(
    (toolId: string) =>
      Object.values(panes).some((pane) => pane?.toolId === toolId),
    [panes],
  )

  const toggleCategory = useCallback(
    (category: InfrastructureCategory) => {
      setActiveCategories((current) =>
        current.includes(category)
          ? current.filter((item) => item !== category)
          : [...current, category],
      )
    },
    [],
  )

  const registerToolAction = useCallback((toolId: string, action: () => void) => {
    actions.current.set(toolId, action)
    return () => {
      if (actions.current.get(toolId) === action) actions.current.delete(toolId)
    }
  }, [])

  const setToolUiState = useCallback((toolId: string, state: ToolUiState) => {
    setToolUiStateValue((current) => {
      const previous = current[toolId]
      if (previous?.active === state.active && previous.disabled === state.disabled) {
        return current
      }
      return { ...current, [toolId]: state }
    })
  }, [])

  const dispatchToolAction = useCallback((toolId: string) => {
    actions.current.get(toolId)?.()
  }, [])

  const value = useMemo(
    () => ({
      activeTab,
      setActiveTab,
      panes,
      openPane,
      togglePane,
      closePane,
      togglePaneCollapsed,
      isPaneOpen,
      activeCategories,
      availableCategories,
      setActiveCategories,
      setAvailableCategories,
      toggleCategory,
      toolUiState,
      registerToolAction,
      setToolUiState,
      dispatchToolAction,
      mapMode,
      toggleMapMode,
      activeMapTool,
      setActiveMapTool,
      measurementResult,
      setMeasurementResult,
    }),
    [
      activeTab,
      mapMode,
      activeMapTool,
      measurementResult,
      panes,
      openPane,
      togglePane,
      closePane,
      togglePaneCollapsed,
      isPaneOpen,
      activeCategories,
      availableCategories,
      toggleCategory,
      toolUiState,
      registerToolAction,
      setToolUiState,
      dispatchToolAction,
      toggleMapMode,
      setActiveMapTool,
      setMeasurementResult,
    ],
  )

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export default WorkspaceProvider
