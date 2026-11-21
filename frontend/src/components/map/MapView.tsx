import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import OLMap from "ol/Map"
import View from "ol/View"
import Feature, { type FeatureLike } from "ol/Feature"
import GeoJSON from "ol/format/GeoJSON"
import { defaults as defaultControls } from "ol/control"
import { createEmpty, extend, intersects } from "ol/extent"
import Overlay from "ol/Overlay"
import { unByKey } from "ol/Observable"
import LineString from "ol/geom/LineString"
import Point from "ol/geom/Point"
import Polygon from "ol/geom/Polygon"
import { getCenter } from "ol/extent"
import Draw, { createBox } from "ol/interaction/Draw"
import VectorLayer from "ol/layer/Vector"
import VectorSource from "ol/source/Vector"
import { getArea, getLength } from "ol/sphere"
import { toLonLat } from "ol/proj"
import {
  Circle as CircleStyle,
  Fill,
  RegularShape,
  Stroke,
  Style,
  Text,
} from "ol/style"
import { apply } from "ol-mapbox-style"
import InfrastructureDetailsCard, {
  type InfrastructureDetails,
} from "@/components/map/InfrastructureDetailsCard"
import InfrastructureSummary from "@/components/dashboard/InfrastructureSummary"
import type { InfrastructureMetrics } from "@/components/dashboard/InfrastructureSummary"
import LayerControl from "@/components/map/LayerControl"
import MapLegend from "@/components/map/MapLegend"
import TankServiceAreasPanel, {
  type SelectedServiceArea,
} from "@/components/map/TankServiceAreasPanel"
import WaterBalancePanel from "@/components/map/WaterBalancePanel"
import PaneManager from "@/components/workspace/PaneManager"
import { useWorkspace } from "@/components/workspace/workspace-context"
import useTankServiceAreas, {
  type TankServiceGroup,
} from "@/components/map/useTankServiceAreas"
import useTankWaterBalances, {
  type WaterBalanceStatus,
} from "@/components/map/useTankWaterBalances"
import {
  describeSpatialLayers,
  infrastructureCategories,
  infrastructureCategory,
  layerStyle,
  type LayerStatus,
  type MapLayer,
} from "@/components/map/layers"
import {
  getSpatialLayerGeoJSON,
  getSpatialLayers,
  getSupplyRelationships,
  type CampContext,
  type SpatialFeatureCollection,
  type SpatialLayerMetadata,
  type SupplyRelationshipColumns,
} from "@/lib/api"
import { useSpatialContext } from "@/components/map/spatial-context"
import {
  playConnectionViewSounds,
  playInfrastructureSelectionSounds,
} from "@/lib/sounds"
import { formatMeasurement } from "@/lib/measurement-format"
import { Button } from "@/components/ui/button"

const CARTO_DARK_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
const geoJSONFormat = new GeoJSON()
const waterBalanceColors: Record<WaterBalanceStatus, string> = {
  excess: "#22c55e",
  balanced: "#eab308",
  deficient: "#ef4444",
  unknown: "#94a3b8",
}
type ConnectionFeatureType = "boreholes" | "tanks"
type SupplyConnection = {
  boreholeId: string
  tankId: string
  amount: number
}
type ConnectionViewState = {
  selectedType: ConnectionFeatureType
  selectedId: string | null
  connections: SupplyConnection[]
  loading: boolean
  error: string | null
}
const infrastructureDetailsFields = {
  boreholes: [
    { key: "water_supp", label: "Water supply" },
    { key: "depth__m_", label: "Depth" },
    { key: "reported_s", label: "Reported yield" },
    { key: "energy_sou", label: "Energy source" },
    { key: "status", label: "Status" },
    { key: "drilling", label: "Drilling date" },
    { key: "longitude", label: "Longitude" },
    { key: "latitude", label: "Latitude" },
  ],
  tanks: [
    { key: "no", label: "Tank number" },
    { key: "area", label: "Area" },
    { key: "capacity__", label: "Capacity" },
    { key: "height__m_", label: "Height" },
    { key: "condition", label: "Condition" },
    { key: "longitude", label: "Longitude" },
    { key: "latitude", label: "Latitude" },
  ],
} as const

function displayValue(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === "") {
    return "Not recorded"
  }
  return String(value)
}

function normalizedId(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const id = String(value).trim()
  return id.length > 0 ? id : null
}

function featureIdentifier(
  feature: FeatureLike,
  type: ConnectionFeatureType,
): string | null {
  return normalizedId(feature.get(type === "boreholes" ? "bh_id" : "id"))
}

function resolveConnections(
  rows: Record<string, unknown>[],
  columns: SupplyRelationshipColumns,
  selectedType: ConnectionFeatureType,
  selectedId: string | null,
): SupplyConnection[] {
  const connections: SupplyConnection[] = []
  for (const row of rows) {
    const boreholeId = normalizedId(row[columns.borehole])
    const tankId = normalizedId(row[columns.tank])
    const amount = Number(row[columns.amount])
    if (!boreholeId || !tankId || !Number.isFinite(amount) || amount <= 0) {
      continue
    }
    if (
      (selectedId !== null &&
        ((selectedType === "boreholes" && boreholeId !== selectedId) ||
          (selectedType === "tanks" && tankId !== selectedId)))
    ) {
      continue
    }
    connections.push({ boreholeId, tankId, amount })
  }
  return connections
}

function normalizedOperationalStatus(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
}

function areaWaterBalanceStatus(
  tanks: TankServiceGroup[],
  balances: Map<string, WaterBalanceStatus>,
): WaterBalanceStatus {
  const statuses = tanks
    .map((tank) => balances.get(tank.tankId))
    .filter((status): status is WaterBalanceStatus => status !== undefined)
  if (statuses.includes("deficient")) return "deficient"
  if (statuses.includes("balanced")) return "balanced"
  if (statuses.includes("excess")) return "excess"
  return "unknown"
}

function infrastructureMetrics(
  layers: Record<string, VectorLayer>,
  selectedCamp: CampContext | null,
): InfrastructureMetrics {
  const metrics: InfrastructureMetrics = {
    taps: 0,
    operationalTaps: 0,
    damagedTaps: 0,
    boreholes: 0,
    tanks: 0,
  }
  for (const layer of Object.values(layers)) {
    const category = infrastructureCategory({
      table: String(layer.get("table")),
    })
    const sourceFeatures = layer.getSource()?.getFeatures() ?? []
    const features =
      selectedCamp?.extent && category !== "taps"
        ? sourceFeatures.filter((feature) => {
            const geometry = feature.getGeometry()
            return geometry
              ? intersects(geometry.getExtent(), selectedCamp.extent!)
              : false
          })
        : sourceFeatures
    if (category === "tanks") metrics.tanks += features.length
    if (category === "wells") metrics.boreholes += features.length
    if (category === "taps") {
      metrics.taps += features.length
      for (const feature of features) {
        const status = normalizedOperationalStatus(
          feature.get("operational_status"),
        )
        if (status === "operational") metrics.operationalTaps += 1
        if (status === "damaged") metrics.damagedTaps += 1
      }
    }
  }
  return metrics
}

function withOpacity(color: string, opacity: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)
  if (hex?.[1]) {
    const value = hex[1]
    const red = Number.parseInt(value.slice(0, 2), 16)
    const green = Number.parseInt(value.slice(2, 4), 16)
    const blue = Number.parseInt(value.slice(4, 6), 16)
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(color)
  if (rgba?.[1]) {
    const channels = rgba[1].split(",").map((channel) => channel.trim())
    const existingOpacity = channels.length > 3 ? Number(channels[3]) : 1
    return `rgba(${channels.slice(0, 3).join(", ")}, ${existingOpacity * opacity})`
  }
  return color
}

function connectionColor(amount: number, minimum: number, maximum: number) {
  const lower = [30, 64, 175]
  const upper = [56, 189, 248]
  const ratio =
    maximum === minimum
      ? 0.55
      : Math.max(
          0,
          Math.min(
            1,
            (Math.log1p(amount) - Math.log1p(minimum)) /
              (Math.log1p(maximum) - Math.log1p(minimum)),
          ),
        )
  const [red, green, blue] = lower.map((value, index) =>
    Math.round(value + ((upper[index] ?? value) - value) * ratio),
  )
  return `rgb(${red}, ${green}, ${blue})`
}

function connectionLabel(amount: number) {
  const formatted = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(amount)
  return `${formatted} m³/day`
}

function geometryCoordinate(feature: FeatureLike): number[] | null {
  const geometry = feature.getGeometry()
  if (!geometry) return null
  const extent = geometry.getExtent()
  return extent.every(Number.isFinite) ? getCenter(extent) : null
}

function infrastructureDetails(
  table: string,
  feature: FeatureLike,
): InfrastructureDetails | null {
  const type = table.toLowerCase()
  if (type !== "boreholes" && type !== "tanks") return null
  const identifier =
    type === "boreholes" ? feature.get("bh_id") : feature.get("id")
  return {
    type: type === "boreholes" ? "Borehole" : "Tank",
    id: displayValue(identifier),
    fields: infrastructureDetailsFields[type]
      .map(({ key, label }) => {
        const value = displayValue(feature.get(key))
        if (value === "Not recorded") return null
        const unit =
          key === "depth__m_" || key === "height__m_"
            ? "m"
            : key === "capacity__"
              ? "m³"
              : key === "reported_s"
                ? "m³/hr"
                : null
        return {
          label,
          value: unit ? formatMeasurement(value, unit) : value,
        }
      })
      .filter((field) => field !== null),
  }
}

function isSpatialLayerMetadata(value: unknown): value is SpatialLayerMetadata {
  if (typeof value !== "object" || value === null) return false
  const layer = value as Partial<SpatialLayerMetadata>
  return (
    typeof layer.schema === "string" &&
    typeof layer.table === "string" &&
    typeof layer.geometryColumn === "string" &&
    (typeof layer.geometryType === "string" || layer.geometryType === null) &&
    (typeof layer.srid === "number" || layer.srid === null)
  )
}

function isFeatureCollection(value: unknown): value is SpatialFeatureCollection {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { type?: unknown; features?: unknown }
  if (candidate.type !== "FeatureCollection" || !Array.isArray(candidate.features)) {
    return false
  }
  return candidate.features.every((feature: unknown) => {
    if (typeof feature !== "object" || feature === null) return false
    const item = feature as { type?: unknown; geometry?: unknown; properties?: unknown }
    return (
      item.type === "Feature" &&
      (item.geometry === null || typeof item.geometry === "object") &&
      typeof item.properties === "object" &&
      item.properties !== null
    )
  })
}

function createStyle(
  layer: MapLayer,
  focused: boolean,
  connectionView: ConnectionViewState | null = null,
  serviceAreasActive = false,
  tankColors: Map<string, string> = new Map(),
  tapStatusMode = false,
) {
  const category = infrastructureCategory(layer)
  const colors = layerStyle(layer, focused)
  const pointType: ConnectionFeatureType | null =
    category === "wells" ? "boreholes" : category === "tanks" ? "tanks" : null
  const connectedBoreholeIds = new Set(
    connectionView?.connections.map((connection) => connection.boreholeId) ?? [],
  )
  const connectedTankIds = new Set(
    connectionView?.connections.map((connection) => connection.tankId) ?? [],
  )
  const featureLabels = new Map<string, Style>()
  if (connectionView) {
    const labeledFeatures = [
      ...(connectionView.selectedId
        ? [{ type: connectionView.selectedType, id: connectionView.selectedId }]
        : []),
      ...connectionView.connections.flatMap((connection) => [
        { type: "boreholes" as const, id: connection.boreholeId },
        { type: "tanks" as const, id: connection.tankId },
      ]),
    ]
    for (const { type, id } of labeledFeatures) {
      const key = `${type}:${id}`
      if (featureLabels.has(key)) continue
      featureLabels.set(
        key,
        new Style({
          text: new Text({
            text: `${type === "boreholes" ? "Borehole" : "Tank"} ${id}`,
            font: '500 10px "Oxanium Variable", sans-serif',
            offsetY: type === "boreholes" ? -16 : -15,
            fill: new Fill({ color: "#eaf6ff" }),
            stroke: new Stroke({ color: "rgba(2, 6, 12, 0.95)", width: 3 }),
            backgroundFill: new Fill({ color: "rgba(8, 15, 24, 0.82)" }),
            padding: [2, 4, 2, 4],
          }),
        }),
      )
    }
  }

  const createFeatureStyles = (opacity: number, emphasized: boolean) => {
    const fillColor = withOpacity(colors.fill, opacity)
    const strokeColor = emphasized
      ? "rgba(255, 255, 255, 0.98)"
      : withOpacity(colors.stroke, opacity)
    const pointImage =
      category === "wells"
        ? new CircleStyle({
            radius: emphasized ? 6.5 : 4.5,
            fill: new Fill({
              color: withOpacity("#38bdf8", opacity),
            }),
            stroke: new Stroke({
              color: emphasized
                ? "rgba(224, 242, 254, 0.98)"
                : withOpacity("#0f172a", opacity),
              width: emphasized ? 2 : 1.2,
            }),
          })
        : category === "tanks"
          ? new RegularShape({
              points: 4,
              radius: emphasized ? 8 : 6,
              angle: Math.PI / 4,
              fill: new Fill({ color: fillColor }),
              stroke: new Stroke({
                color: strokeColor,
                width: emphasized ? 2.5 : 1.4,
              }),
            })
          : category === "taps"
            ? new RegularShape({
                points: 4,
                radius: 5,
                fill: new Fill({ color: fillColor }),
                stroke: new Stroke({
                  color: strokeColor,
                  width: emphasized ? 2 : 1.2,
                }),
              })
            : new CircleStyle({
                radius: 4.5,
                fill: new Fill({ color: fillColor }),
                stroke: new Stroke({
                  color: strokeColor,
                  width: emphasized ? 2 : 1.4,
                }),
              })

    return {
      point: new Style({ image: pointImage }),
      geometry: new Style({
        fill: new Fill({ color: fillColor }),
        stroke: new Stroke({
          color: strokeColor,
          width: emphasized ? 2.5 : focused ? 1.8 : 1.2,
        }),
      }),
    }
  }

  const normalStyles = createFeatureStyles(1, false)
  const mutedStyles = createFeatureStyles(0.14, false)
  const emphasizedStyles = createFeatureStyles(1, true)
  const tankStyles = new Map<string, Style>()
  const tapStatusStyles = new Map<string, Style>()

  return (feature: FeatureLike) => {
    const geometry = feature.getGeometry()
    if (!geometry) return undefined
    if (category === "taps") {
      const status = normalizedOperationalStatus(
        feature.get("operational_status"),
      )
      if (!tapStatusMode && status !== "operational") {
        return undefined
      }
      if (tapStatusMode) {
        if (status !== "operational" && status !== "damaged") {
          return undefined
        }
        const color =
          status === "operational"
            ? "#34d399"
            : "#fb7185"
        let style = tapStatusStyles.get(color)
        if (!style) {
          style = new Style({
            image: new RegularShape({
              points: 4,
              radius: 5.5,
              fill: new Fill({ color }),
              stroke: new Stroke({ color: "#0f172a", width: 1.2 }),
            }),
          })
          tapStatusStyles.set(color, style)
        }
        return style
      }
    }
    if (category === "tanks" && serviceAreasActive) {
      const tankId = featureIdentifier(feature, "tanks")
      const color = tankId ? tankColors.get(tankId) : undefined
      if (!tankId || !color) return mutedStyles.point
      let style = tankStyles.get(tankId)
      if (!style) {
        style = new Style({
          image: new RegularShape({
            points: 4,
            radius: 7,
            angle: Math.PI / 4,
            fill: new Fill({ color }),
            stroke: new Stroke({ color: "#f8fafc", width: 1.5 }),
          }),
        })
        tankStyles.set(tankId, style)
      }
      return style
    }
    let prominent = false
    if (connectionView && pointType) {
      const id = featureIdentifier(feature, pointType)
      prominent =
        id === connectionView.selectedId &&
        pointType === connectionView.selectedType
      if (!prominent) {
        prominent =
          pointType === "boreholes"
            ? connectedBoreholeIds.has(id ?? "")
            : connectedTankIds.has(id ?? "")
      }
    }
    const styles = serviceAreasActive
      ? mutedStyles
      : connectionView
      ? prominent
        ? emphasizedStyles
        : mutedStyles
      : normalStyles
    let labelStyle: Style | undefined
    if (prominent && pointType) {
      const identifier = featureIdentifier(feature, pointType)
      if (identifier) labelStyle = featureLabels.get(`${pointType}:${identifier}`)
    }
    if (category) {
      return labelStyle ? [styles.point, labelStyle] : styles.point
    }
    return geometry.getType() === "Point" || geometry.getType() === "MultiPoint"
      ? styles.point
      : styles.geometry
  }
}

function setConnectionFeatureStyle(
  feature: Feature,
  isHovered: boolean,
  hasHoveredFeature: boolean,
) {
  const color = String(feature.get("lineColor"))
  const opacity = hasHoveredFeature && !isHovered ? 0.3 : 1
  const width = 0.75
  const stroke = new Stroke({
    color: withOpacity(color, opacity),
    width,
    lineDash: [2, 7],
  })
  feature.setStyle(
    new Style({
      stroke,
      text: new Text({
        text: String(feature.get("label")),
        font: `${isHovered ? "600 10px" : "500 9px"} "Oxanium Variable", sans-serif`,
        placement: "line",
        overflow: true,
        keepUpright: true,
        fill: new Fill({
          color: isHovered ? "#ffffff" : withOpacity("#ffffff", opacity),
        }),
        stroke: new Stroke({
          color: withOpacity("rgba(2, 6, 12, 0.96)", opacity),
          width: 2,
        }),
        backgroundFill: new Fill({
          color: withOpacity("rgba(8, 15, 24, 0.94)", opacity),
        }),
        backgroundStroke: new Stroke({
          color: withOpacity(color, opacity),
          width: 0.7,
        }),
        padding: isHovered ? [2, 4, 2, 4] : [1, 3, 1, 3],
      }),
    }),
  )
}

function fitToSpatialContext(
  map: OLMap,
  camp: CampContext | null,
  mapLayers: Record<string, VectorLayer>,
  tapsOverviewSource: VectorSource | null,
  useInitialExtent = false,
) {
  const extent = createEmpty()
  if (camp?.extent?.every(Number.isFinite)) {
    extend(extent, camp.extent)
  } else {
    for (const layer of Object.values(mapLayers)) {
      const source =
        layer.get("table") === "taps" && tapsOverviewSource
          ? tapsOverviewSource
          : layer.getSource()
      extend(extent, source?.getExtent() ?? createEmpty())
    }
  }

  if (extent.every(Number.isFinite)) {
    map.getView().fit(extent, {
      padding: [useInitialExtent ? 32 : 132, 32, useInitialExtent ? 32 : 190, 32],
      maxZoom: 16,
      duration: 300,
    })
  }
}

function MapView() {
  const { selectedCamp, selectedCampId } = useSpatialContext()
  const {
    activeCategories,
    setActiveCategories,
    setAvailableCategories,
    toggleCategory,
    openPane,
    closePane,
    registerToolAction,
    setToolUiState,
    mapMode,
    toggleMapMode,
    activeMapTool,
    setActiveMapTool,
    measurementResult,
    setMeasurementResult,
  } = useWorkspace()
  const tankServiceAreasActive = mapMode === "tankServiceAreas"
  const waterBalanceActive = mapMode === "waterBalance"
  const tankServiceAreas = useTankServiceAreas(
    tankServiceAreasActive || waterBalanceActive,
  )
  const waterBalances = useTankWaterBalances(waterBalanceActive)
  const mapElement = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<OLMap | null>(null)
  const mapModeRef = useRef(mapMode)
  const didFitInitialExtentRef = useRef(false)
  const mapLayersRef = useRef<Record<string, VectorLayer>>({})
  const connectionLayerRef = useRef<VectorLayer | null>(null)
  const serviceAreaLayerRef = useRef<VectorLayer | null>(null)
  const selectedBoreholePulseRef = useRef<Overlay | null>(null)
  const hoveredConnectionRef = useRef<Feature | null>(null)
  const hoveredServiceAreaRef = useRef<Feature | null>(null)
  const cancelConnectionSoundRef = useRef<(() => void) | null>(null)
  const connectionRequestRef = useRef<AbortController | null>(null)
  const connectionsActionRef = useRef<() => void>(() => undefined)
  const resetViewActionRef = useRef<() => void>(() => undefined)
  const zoomInActionRef = useRef<() => void>(() => undefined)
  const zoomOutActionRef = useRef<() => void>(() => undefined)
  const fullscreenActionRef = useRef<() => void>(() => undefined)
  const toolActionsRef = useRef<Record<string, () => void>>({})
  const selectionSourceRef = useRef<VectorSource | null>(null)
  const measurementSourceRef = useRef<VectorSource | null>(null)
  const drawInteractionRef = useRef<Draw | null>(null)
  const measurementOverlayRef = useRef<Overlay | null>(null)
  const measurementTooltipElementRef = useRef<HTMLDivElement | null>(null)
  const selectionExtentRef = useRef<number[] | null>(null)
  const homeExtentRef = useRef<number[] | null>(null)
  const extentHistoryRef = useRef<number[][]>([])
  const extentHistoryIndexRef = useRef(-1)
  const historyNavigationRef = useRef(false)
  const supplyRelationshipsRef =
    useRef<Awaited<ReturnType<typeof getSupplyRelationships>> | null>(null)
  const tapsOverviewSourceRef = useRef<VectorSource | null>(null)
  const selectedCampRef = useRef(selectedCamp)
  const [layers, setLayers] = useState<MapLayer[]>([])
  const [layerStatuses, setLayerStatuses] = useState<Record<string, LayerStatus>>({})
  const [metrics, setMetrics] = useState<InfrastructureMetrics | null>(null)
  const [catalogStatus, setCatalogStatus] = useState<LayerStatus>("loading")
  const [tapsLoaded, setTapsLoaded] = useState(false)
  const [contextualTapStatus, setContextualTapStatus] =
    useState<"idle" | "loading" | "empty" | "error">("idle")
  const [selectedInfrastructure, setSelectedInfrastructure] =
    useState<InfrastructureDetails | null>(null)
  const [selectedServiceArea, setSelectedServiceArea] =
    useState<SelectedServiceArea | null>(null)
  const [connectionView, setConnectionView] =
    useState<ConnectionViewState | null>(null)
  const [isConnectionSoundPending, setIsConnectionSoundPending] =
    useState(false)
  const [basemapError, setBasemapError] = useState(false)
  const [locationLabel, setLocationLabel] = useState("")
  const [findQuery, setFindQuery] = useState("")
  const [findResults, setFindResults] = useState<
    { feature: FeatureLike; table: string; label: string }[]
  >([])
  const [basemapStyle, setBasemapStyle] = useState<"dark" | "light">("dark")
  const waterBalanceAreaCount = useMemo(
    () =>
      [...tankServiceAreas.byServiceCode.values()].filter((groups) =>
        groups.some((tank) => {
          const status = waterBalances.byTankId.get(tank.tankId)
          return status !== undefined && status !== "unknown"
        }),
      ).length,
    [tankServiceAreas.byServiceCode, waterBalances.byTankId],
  )
  const waterBalanceTankCount = useMemo(
    () =>
      [...waterBalances.byTankId.values()].filter(
        (status) => status !== "unknown",
      ).length,
    [waterBalances.byTankId],
  )
  const activeMapToolRef = useRef(activeMapTool)
  const closeInfrastructureCard = useCallback(() => {
    cancelConnectionSoundRef.current?.()
    cancelConnectionSoundRef.current = null
    setIsConnectionSoundPending(false)
    if (mapModeRef.current !== "boreholeTankConnections") {
      connectionRequestRef.current?.abort()
      connectionRequestRef.current = null
      setConnectionView(null)
    }
    setSelectedInfrastructure(null)
    closePane("infrastructureDetails")
    if (selectedBoreholePulseRef.current) {
      mapInstance.current?.removeOverlay(selectedBoreholePulseRef.current)
      selectedBoreholePulseRef.current = null
    }
  }, [closePane])

  function serviceAreaStyle(feature: FeatureLike, hovered: boolean) {
    const color = String(feature.get("serviceColor") ?? "#38bdf8")
    const isWaterBalanceFeature =
      feature.get("waterBalanceStatus") !== undefined
    return new Style({
      fill: new Fill({
        color: withOpacity(
          color,
          isWaterBalanceFeature
            ? hovered
              ? 0.48
              : 0.34
            : hovered
              ? 0.3
              : 0.18,
        ),
      }),
      stroke: new Stroke({
        color: hovered ? withOpacity(color, 1) : withOpacity(color, 0.88),
        width: hovered ? 2.5 : 1.5,
      }),
      text: new Text({
        text: String(feature.get("serviceCode") ?? ""),
        font: `${hovered ? "600" : "500"} 10px "Oxanium Variable", sans-serif`,
        fill: new Fill({ color: "#f8fafc" }),
        stroke: new Stroke({ color: "rgba(2, 6, 12, 0.95)", width: 3 }),
        backgroundFill: new Fill({ color: "rgba(8, 15, 24, 0.78)" }),
        backgroundStroke: new Stroke({
          color: withOpacity(color, hovered ? 0.9 : 0.5),
          width: 0.8,
        }),
        padding: [2, 4, 2, 4],
      }),
    })
  }

  const openConnectionView = useCallback(async (
    selectedType: ConnectionFeatureType,
    selectedId: string | null,
  ) => {
    connectionRequestRef.current?.abort()
    const controller = new AbortController()
    connectionRequestRef.current = controller
    setConnectionView({
      selectedType,
      selectedId,
      connections: [],
      loading: true,
      error: null,
    })
    try {
      const { rows, columns } =
        supplyRelationshipsRef.current ??
        (await getSupplyRelationships(controller.signal))
      if (controller.signal.aborted) return
      supplyRelationshipsRef.current ??= { rows, columns }
      setConnectionView({
        selectedType,
        selectedId,
        connections: resolveConnections(rows, columns, selectedType, selectedId),
        loading: false,
        error: null,
      })
    } catch (error) {
      if (controller.signal.aborted) return
      console.error("Unable to load borehole–tank supply relationships.", error)
      setConnectionView({
        selectedType,
        selectedId,
        connections: [],
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load supply relationships.",
      })
    }
  }, [])

  const toggleConnectionView = useCallback((item: InfrastructureDetails) => {
    const selectedType: ConnectionFeatureType =
      item.type === "Tank" ? "tanks" : "boreholes"
    const selectedId = item.id
    if (
      connectionView?.selectedType === selectedType &&
      connectionView.selectedId === selectedId
    ) {
      connectionRequestRef.current?.abort()
      connectionRequestRef.current = null
      setConnectionView(null)
      return
    }

    setIsConnectionSoundPending(true)
    cancelConnectionSoundRef.current = playConnectionViewSounds(() => {
      cancelConnectionSoundRef.current = null
      setIsConnectionSoundPending(false)
      void openConnectionView(selectedType, selectedId)
    })
  }, [connectionView, openConnectionView])

  useEffect(() => {
    selectedCampRef.current = selectedCamp
  }, [selectedCamp])

  useEffect(() => {
    mapModeRef.current = mapMode
  }, [mapMode])

  useEffect(() => {
    activeMapToolRef.current = activeMapTool
  }, [activeMapTool])

  useEffect(() => {
    if (!mapElement.current) return

    let disposed = false
    const abortController = new AbortController()
    const map = new OLMap({
      target: mapElement.current,
      controls: defaultControls({ zoom: false, rotate: false }),
      view: new View({ zoom: 2, minZoom: 2, maxZoom: 19 }),
    })
    mapInstance.current = map
    const measurementTooltip = document.createElement("div")
    measurementTooltip.className = "waren-measurement-tooltip"
    measurementTooltip.hidden = true
    const measurementOverlay = new Overlay({
      element: measurementTooltip,
      positioning: "bottom-center",
      offset: [0, -12],
      stopEvent: false,
    })
    map.addOverlay(measurementOverlay)
    measurementOverlayRef.current = measurementOverlay
    measurementTooltipElementRef.current = measurementTooltip
    const connectionLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 20,
    })
    map.addLayer(connectionLayer)
    connectionLayerRef.current = connectionLayer
    const serviceAreaLayer = new VectorLayer({
      source: new VectorSource(),
      style: (feature) =>
        serviceAreaStyle(
          feature,
          feature === hoveredServiceAreaRef.current,
        ),
      zIndex: 25,
      visible: false,
    })
    map.addLayer(serviceAreaLayer)
    serviceAreaLayer.set("table", "tank_service_areas")
    serviceAreaLayerRef.current = serviceAreaLayer
    const selectionSource = new VectorSource()
    const selectionLayer = new VectorLayer({
      source: selectionSource,
      style: new Style({
        fill: new Fill({ color: "rgba(56, 189, 248, 0.18)" }),
        stroke: new Stroke({ color: "#38bdf8", width: 2 }),
        image: new CircleStyle({
          radius: 8,
          fill: new Fill({ color: "rgba(56, 189, 248, 0.35)" }),
          stroke: new Stroke({ color: "#7dd3fc", width: 2 }),
        }),
      }),
      zIndex: 40,
    })
    map.addLayer(selectionLayer)
    selectionSourceRef.current = selectionSource
    const measurementSource = new VectorSource()
    const measurementLayer = new VectorLayer({
      source: measurementSource,
      style: new Style({
        fill: new Fill({ color: "rgba(45, 212, 191, 0.06)" }),
        stroke: new Stroke({
          color: "#5eead4",
          width: 1.2,
          lineDash: [2, 5],
        }),
        image: new CircleStyle({
          radius: 4,
          fill: new Fill({ color: "#2dd4bf" }),
          stroke: new Stroke({ color: "#ecfeff", width: 1 }),
        }),
      }),
      zIndex: 39,
    })
    map.addLayer(measurementLayer)
    measurementSourceRef.current = measurementSource
    const handleSingleClick = (event: { pixel: number[]; coordinate: number[] }) => {
      const mapTool = activeMapToolRef.current
      if (mapTool === "pan" || mapTool === "rectangle" || mapTool === "polygon" ||
          mapTool === "measureDistance" || mapTool === "measureArea") {
        return
      }
      if (mapTool === "locate") {
        const [longitude, latitude] = toLonLat(event.coordinate)
        setLocationLabel(
          `Longitude ${longitude.toFixed(5)} · Latitude ${latitude.toFixed(5)}`,
        )
        openPane("measurementReadout")
        return
      }
      const selectedArea: { value: Feature | null } = { value: null }
      map.forEachFeatureAtPixel(
        event.pixel,
        (feature, layer) => {
          if (layer !== serviceAreaLayer || !(feature instanceof Feature)) {
            return undefined
          }
          selectedArea.value = feature
          return feature
        },
        { layerFilter: (layer) => layer === serviceAreaLayer, hitTolerance: 5 },
      )
      if (selectedArea.value) {
        const serviceCode = String(selectedArea.value.get("serviceCode") ?? "")
        const tanks = selectedArea.value.get("tankGroups") as TankServiceGroup[]
        const areaGeometry = selectedArea.value.getGeometry()
        if (areaGeometry) {
          selectionExtentRef.current = areaGeometry.getExtent()
          selectionSourceRef.current?.clear(true)
          selectionSourceRef.current?.addFeature(selectedArea.value.clone())
          setToolUiState("zoomToSelection", { active: false, disabled: false })
          setToolUiState("clearSelection", { active: false, disabled: false })
        }
        setSelectedServiceArea({ serviceCode, tanks })
        return
      }
      setSelectedServiceArea(null)
      let selected: InfrastructureDetails | null = null
      const selectedFeature: { value: Feature | null } = { value: null }
      let selectedTable = ""
      map.forEachFeatureAtPixel(
        event.pixel,
        (feature, layer) => {
          if (
            !(layer instanceof VectorLayer) ||
            !["boreholes", "tanks"].includes(
              String(layer.get("table")).toLowerCase(),
            )
          ) {
            return undefined
          }
          selectedTable = String(layer.get("table")).toLowerCase()
          selectedFeature.value =
            feature instanceof Feature ? feature : null
          selected = infrastructureDetails(selectedTable, feature)
          return feature
        },
        {
          layerFilter: (layer) =>
            ["boreholes", "tanks"].includes(
              String(layer.get("table")).toLowerCase(),
            ),
          hitTolerance: 12,
        },
      )
      const selectedGeometry = selectedFeature.value?.getGeometry()
      selectionSourceRef.current?.clear(true)
      if (selectedGeometry && selectedFeature.value) {
        selectionExtentRef.current = selectedGeometry.getExtent()
        selectionSourceRef.current?.addFeature(selectedFeature.value.clone())
        setToolUiState("zoomToSelection", { active: false, disabled: false })
        setToolUiState("clearSelection", { active: false, disabled: false })
      } else {
        selectionExtentRef.current = null
        setToolUiState("zoomToSelection", { active: false, disabled: true })
        setToolUiState("clearSelection", { active: false, disabled: true })
      }
      cancelConnectionSoundRef.current?.()
      cancelConnectionSoundRef.current = null
      setIsConnectionSoundPending(false)
      if (mapModeRef.current !== "boreholeTankConnections") {
        connectionRequestRef.current?.abort()
        connectionRequestRef.current = null
        setConnectionView(null)
      }
      if (selectedBoreholePulseRef.current) {
        map.removeOverlay(selectedBoreholePulseRef.current)
        selectedBoreholePulseRef.current = null
      }
      if (
        selectedTable === "boreholes" &&
        selectedFeature.value
      ) {
        const geometry = selectedFeature.value.getGeometry()
        if (geometry instanceof Point) {
          const pulse = document.createElement("span")
          pulse.className = "waren-borehole-pulse-active"
          pulse.setAttribute("aria-hidden", "true")
          const overlay = new Overlay({
            element: pulse,
            position: geometry.getCoordinates(),
            positioning: "center-center",
            stopEvent: false,
          })
          map.addOverlay(overlay)
          selectedBoreholePulseRef.current = overlay
        }
      }
      if (selected) playInfrastructureSelectionSounds()
      setSelectedInfrastructure(selected)
      if (selected) {
        openPane("infrastructureDetails")
      } else {
        closePane("infrastructureDetails")
      }
    }
    const handlePointerMove = (event: {
      pixel: number[]
      coordinate: number[]
      dragging?: boolean
    }) => {
      if (event.dragging) return
      const currentTool = activeMapToolRef.current
      if (currentTool === "measureDistance" || currentTool === "measureArea") {
        const sketch = drawInteractionRef.current
          ?.getOverlay()
          .getSource()
          ?.getFeatures()[0]
        const geometry = sketch?.getGeometry()
        const tooltip = measurementTooltipElementRef.current
        if (geometry && tooltip) {
          if (currentTool === "measureDistance" && geometry instanceof LineString) {
            const distance = getLength(geometry, {
              projection: map.getView().getProjection(),
            })
            tooltip.textContent =
              distance >= 1000
                ? `${(distance / 1000).toFixed(2)} km`
                : `${distance.toFixed(1)} m`
            tooltip.hidden = false
            measurementOverlayRef.current?.setPosition(event.coordinate)
          } else if (
            currentTool === "measureArea" &&
            geometry instanceof Polygon
          ) {
            const area = getArea(geometry, {
              projection: map.getView().getProjection(),
            })
            tooltip.textContent =
              area >= 10_000
                ? `${(area / 10_000).toFixed(2)} ha`
                : `${area.toFixed(0)} m²`
            tooltip.hidden = false
            measurementOverlayRef.current?.setPosition(event.coordinate)
          }
        }
      }
      let hoveredArea: Feature | null = null
      map.forEachFeatureAtPixel(
        event.pixel,
        (feature, layer) => {
          if (layer !== serviceAreaLayer || !(feature instanceof Feature)) {
            return undefined
          }
          hoveredArea = feature
          return feature
        },
        { layerFilter: (layer) => layer === serviceAreaLayer, hitTolerance: 5 },
      )
      if (hoveredServiceAreaRef.current !== hoveredArea) {
        hoveredServiceAreaRef.current = hoveredArea
        serviceAreaLayer.changed()
      }
      let hovered: Feature | null = null
      map.forEachFeatureAtPixel(
        event.pixel,
        (feature, layer) => {
          if (layer !== connectionLayer || !(feature instanceof Feature)) {
            return undefined
          }
          hovered = feature
          return feature
        },
        { layerFilter: (layer) => layer === connectionLayer, hitTolerance: 7 },
      )
      if (hoveredConnectionRef.current !== hovered) {
        hoveredConnectionRef.current = hovered
        const features = connectionLayer.getSource()?.getFeatures() ?? []
        for (const feature of features) {
          setConnectionFeatureStyle(
            feature,
            feature === hovered,
            hovered !== null,
          )
        }
      }
      const target = map.getTargetElement()
      if (target) {
        target.style.cursor =
          activeMapToolRef.current === "pan"
            ? "grab"
            : hovered || hoveredArea
              ? "pointer"
              : ""
      }
    }
    map.on("singleclick", handleSingleClick)
    map.on("pointermove", handlePointerMove)
    map.on("moveend", () => {
      const extent = map.getView().calculateExtent(map.getSize())
      if (!extent.every(Number.isFinite)) return
      if (!homeExtentRef.current) homeExtentRef.current = extent
      if (historyNavigationRef.current) return
      const current = extentHistoryRef.current[extentHistoryIndexRef.current]
      if (
        current &&
        current.every((value, index) => Math.abs(value - (extent[index] ?? value)) < 1)
      ) {
        return
      }
      extentHistoryRef.current = [
        ...extentHistoryRef.current.slice(0, extentHistoryIndexRef.current + 1),
        extent,
      ].slice(-30)
      extentHistoryIndexRef.current = extentHistoryRef.current.length - 1
      setToolUiState("previousExtent", { active: false, disabled: extentHistoryIndexRef.current <= 0 })
      setToolUiState("nextExtent", {
        active: false,
        disabled: extentHistoryIndexRef.current >= extentHistoryRef.current.length - 1,
      })
    })

    void apply(map, CARTO_DARK_STYLE)
      .then(() => {
        if (mapModeRef.current === "boreholeTankConnections") {
          map.getLayers().forEach((layer) => {
            if (!(layer instanceof VectorLayer)) layer.setVisible(false)
          })
        }
      })
      .catch((error: unknown) => {
        if (disposed) return
        console.error("Unable to load the CARTO Dark Matter basemap.", error)
        setBasemapError(true)
      })

    const loadLayer = async (layer: MapLayer) => {
      try {
        const response = await getSpatialLayerGeoJSON(
          layer.table,
          { schema: layer.schema, geometryColumn: layer.geometryColumn },
          abortController.signal,
        )
        if (!isFeatureCollection(response)) {
          throw new Error("The spatial endpoint did not return valid GeoJSON.")
        }

        const features = geoJSONFormat.readFeatures(response, {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        })
        const vectorLayer = new VectorLayer({
          source: new VectorSource({ features }),
          style: createStyle(
            layer,
            selectedCampRef.current !== null,
            null,
            false,
            new Map(),
            mapModeRef.current === "tapStatus",
          ),
          zIndex: 10,
        })

        if (disposed) return

        map.addLayer(vectorLayer)
        vectorLayer.set("table", layer.table)
        mapLayersRef.current[layer.id] = vectorLayer
        if (layer.table.toLowerCase() === "taps") {
          tapsOverviewSourceRef.current = vectorLayer.getSource() ?? null
          setTapsLoaded(true)
        }
        setLayerStatuses((current) => ({
          ...current,
          [layer.id]: features.length > 0 ? "loaded" : "empty",
        }))

        if (!selectedCampRef.current) {
          fitToSpatialContext(
            map,
            null,
            mapLayersRef.current,
            tapsOverviewSourceRef.current,
          )
        }
      } catch (error) {
        if (disposed || abortController.signal.aborted) return
        console.error(`Unable to load spatial layer ${layer.table}.`, error)
        setLayerStatuses((current) => ({ ...current, [layer.id]: "error" }))
      }
    }

    void getSpatialLayers(abortController.signal)
      .then(({ layers: metadata }) => {
        if (disposed) return
        if (!Array.isArray(metadata) || !metadata.every(isSpatialLayerMetadata)) {
          throw new Error("The spatial layer catalog response is invalid.")
        }
        const discovered = describeSpatialLayers(metadata)
        setLayers(discovered)
          const categories = infrastructureCategories
            .filter((category) =>
              discovered.some(
                (layer) => infrastructureCategory(layer) === category.id,
              ),
            )
            .map((category) => category.id)
          setAvailableCategories(categories)
          setActiveCategories(categories)
        setLayerStatuses(
          Object.fromEntries(discovered.map((layer) => [layer.id, "loading"])),
        )
        setCatalogStatus(discovered.length > 0 ? "loaded" : "empty")
        for (const layer of discovered) void loadLayer(layer)
      })
      .catch((error: unknown) => {
        if (disposed || abortController.signal.aborted) return
        console.error("Unable to discover PostGIS spatial layers.", error)
        setCatalogStatus("error")
      })

    return () => {
      disposed = true
      abortController.abort()
      map.un("singleclick", handleSingleClick)
      map.un("pointermove", handlePointerMove)
      connectionRequestRef.current?.abort()
      connectionRequestRef.current = null
      cancelConnectionSoundRef.current?.()
      cancelConnectionSoundRef.current = null
      map.setTarget(undefined)
      mapInstance.current = null
      mapLayersRef.current = {}
      connectionLayerRef.current = null
      serviceAreaLayerRef.current = null
      selectedBoreholePulseRef.current = null
      hoveredConnectionRef.current = null
      hoveredServiceAreaRef.current = null
      tapsOverviewSourceRef.current = null
      selectionSourceRef.current = null
      measurementSourceRef.current = null
      drawInteractionRef.current?.abortDrawing()
      drawInteractionRef.current = null
      measurementOverlayRef.current = null
      measurementTooltipElementRef.current = null
    }
  }, [closePane, openPane, setActiveCategories, setAvailableCategories, setToolUiState])

  useEffect(() => {
    const tapsLayer = Object.values(mapLayersRef.current).find(
      (layer) => String(layer.get("table")).toLowerCase() === "taps",
    )
    const tapMetadata = layers.find(
      (layer) => layer.table.toLowerCase() === "taps",
    )
    if (!tapsLoaded || !tapsLayer || !tapsOverviewSourceRef.current) return

    if (selectedCampId === "all" || !selectedCamp) {
      tapsLayer.setSource(tapsOverviewSourceRef.current)
      return
    }

    if (!tapMetadata) return

    const controller = new AbortController()
    tapsLayer.setSource(new VectorSource())
    void Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) return null
        setContextualTapStatus("loading")
        return getSpatialLayerGeoJSON(
          tapMetadata.table,
          {
            schema: tapMetadata.schema,
            geometryColumn: tapMetadata.geometryColumn,
            camp: selectedCampId,
          },
          controller.signal,
        )
      })
      .then((response) => {
        if (controller.signal.aborted || response === null) return
        if (!isFeatureCollection(response)) {
          throw new Error("The contextual tap endpoint did not return valid GeoJSON.")
        }
        const features = geoJSONFormat.readFeatures(response, {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        })
        tapsLayer.setSource(new VectorSource({ features }))
        setContextualTapStatus(features.length > 0 ? "idle" : "empty")
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        console.error(`Unable to load taps for ${selectedCamp.name}.`, error)
        setContextualTapStatus("error")
      })

    return () => controller.abort()
  }, [layers, selectedCamp, selectedCampId, tapsLoaded])

  useEffect(() => {
    const map = mapInstance.current
    if (!map) return
    const previous = drawInteractionRef.current
    if (previous) {
      map.removeInteraction(previous)
      drawInteractionRef.current = null
    }
    if (
      activeMapTool !== "rectangle" &&
      activeMapTool !== "polygon" &&
      activeMapTool !== "measureDistance" &&
      activeMapTool !== "measureArea"
    ) {
      return
    }

    const selecting =
      activeMapTool === "rectangle" || activeMapTool === "polygon"
    const drawSource = selecting
      ? new VectorSource()
      : measurementSourceRef.current
    if (!drawSource) return
    const drawLayer = selecting
      ? new VectorLayer({
          source: drawSource,
          style: new Style({
            fill: new Fill({ color: "rgba(56, 189, 248, 0.12)" }),
            stroke: new Stroke({ color: "#7dd3fc", width: 1.5, lineDash: [5, 4] }),
          }),
          zIndex: 41,
        })
      : null
    if (drawLayer) map.addLayer(drawLayer)
    const draw = new Draw({
      source: drawSource,
      type:
        activeMapTool === "rectangle"
          ? "Circle"
          : activeMapTool === "polygon" || activeMapTool === "measureArea"
            ? "Polygon"
            : "LineString",
      ...(activeMapTool === "rectangle" ? { geometryFunction: createBox() } : {}),
      ...(selecting ? { stopClick: true } : {}),
      ...(!selecting
        ? {
            style: new Style({
              fill: new Fill({ color: "rgba(45, 212, 191, 0.07)" }),
              stroke: new Stroke({
                color: "rgba(94, 234, 212, 0.9)",
                width: 1.2,
                lineDash: [2, 5],
              }),
              image: new CircleStyle({
                radius: 3,
                fill: new Fill({ color: "#5eead4" }),
                stroke: new Stroke({ color: "#e6fffb", width: 1 }),
              }),
            }),
          }
        : {}),
    })
    let liveGeometry: Polygon | LineString | null = null
    let liveGeometryListener: (() => void) | null = null
    const drawStartKey = draw.on("drawstart", ({ feature }) => {
      if (selecting) return
      const geometry = feature.getGeometry()
      if (!geometry) return
      const updateLiveTooltip = () => {
        const element = measurementTooltipElementRef.current
        const overlay = measurementOverlayRef.current
        if (!element || !overlay) return
        let coordinate: number[] | undefined
        if (geometry instanceof LineString) {
          const coordinates = geometry.getCoordinates()
          coordinate = coordinates[coordinates.length - 1]
          const value = getLength(geometry, {
            projection: map.getView().getProjection(),
          })
          element.textContent =
            value >= 1000
              ? `${(value / 1000).toFixed(2)} km`
              : `${value.toFixed(1)} m`
        } else if (geometry instanceof Polygon) {
          const ring = geometry.getCoordinates()[0] ?? []
          coordinate = ring[ring.length - 1]
          const value = getArea(geometry, {
            projection: map.getView().getProjection(),
          })
          element.textContent =
            value >= 10_000
              ? `${(value / 10_000).toFixed(2)} ha`
              : `${value.toFixed(0)} m²`
        }
        if (coordinate) {
          element.hidden = false
          overlay.setPosition(coordinate)
        }
      }
      if (geometry instanceof LineString || geometry instanceof Polygon) {
        liveGeometry = geometry
        liveGeometryListener = updateLiveTooltip
        geometry.on("change", updateLiveTooltip)
      }
    })
    const drawEndKey = draw.on("drawend", ({ feature }) => {
      if (liveGeometry && liveGeometryListener) {
        liveGeometry.un("change", liveGeometryListener)
        liveGeometry = null
        liveGeometryListener = null
      }
      if (measurementTooltipElementRef.current) {
        measurementTooltipElementRef.current.hidden = true
      }
      measurementOverlayRef.current?.setPosition(undefined)
      const geometry = feature.getGeometry()
      if (!geometry) return
      if (selecting) {
        selectionSourceRef.current?.clear(true)
        const selectedExtent = geometry.getExtent()
        selectionExtentRef.current = selectedExtent
        for (const layer of Object.values(mapLayersRef.current)) {
          for (const candidate of layer.getSource()?.getFeatures() ?? []) {
            const candidateGeometry = candidate.getGeometry()
            if (
              candidateGeometry &&
              candidateGeometry.intersectsExtent(selectedExtent)
            ) {
              selectionSourceRef.current?.addFeature(candidate.clone())
            }
          }
        }
        setToolUiState("zoomToSelection", { active: false, disabled: false })
        setToolUiState("clearSelection", { active: false, disabled: false })
        if (drawLayer) map.removeLayer(drawLayer)
        drawSource.clear(true)
        setActiveMapTool("select")
        return
      }

      if (activeMapTool === "measureDistance" && geometry instanceof LineString) {
        const coordinates = geometry.getCoordinates()
        const total = getLength(geometry, {
          projection: map.getView().getProjection(),
        })
        const lastSegment =
          coordinates.length > 1
            ? getLength(
                new LineString([
                  coordinates[coordinates.length - 2]!,
                  coordinates[coordinates.length - 1]!,
                ]),
                { projection: map.getView().getProjection() },
              )
            : total
        const unit = (value: number) =>
          value >= 1000
            ? `${(value / 1000).toFixed(2)} km`
            : `${value.toFixed(1)} m`
        setMeasurementResult(
          `DISTANCE · Segment ${unit(lastSegment)} · Total ${unit(total)}`,
        )
        setToolUiState("clearMeasurement", {
          active: false,
          disabled: false,
        })
        setLocationLabel("")
        openPane("measurementReadout")
        return
      }
      if (activeMapTool === "measureArea" && geometry instanceof Polygon) {
        const area = getArea(geometry, {
          projection: map.getView().getProjection(),
        })
        const perimeter = getLength(geometry, {
          projection: map.getView().getProjection(),
        })
        const areaText =
          area >= 1_000_000
            ? `${(area / 1_000_000).toFixed(3)} km²`
            : `${area.toFixed(0)} m²`
        const perimeterText =
          perimeter >= 1000
            ? `${(perimeter / 1000).toFixed(2)} km`
            : `${perimeter.toFixed(1)} m`
        setMeasurementResult(`AREA · ${areaText} · Perimeter ${perimeterText}`)
        setToolUiState("clearMeasurement", {
          active: false,
          disabled: false,
        })
        setLocationLabel("")
        openPane("measurementReadout")
      }
    })
    map.addInteraction(draw)
    drawInteractionRef.current = draw
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, select, [contenteditable='true']"))
      ) {
        return
      }
      event.preventDefault()
      draw.abortDrawing()
      map.removeInteraction(draw)
      if (drawInteractionRef.current === draw) drawInteractionRef.current = null
      const tooltip = measurementTooltipElementRef.current
      if (tooltip) tooltip.hidden = true
      measurementOverlayRef.current?.setPosition(undefined)
      setActiveMapTool("explore")
    }
    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("keydown", handleEscape)
      unByKey(drawStartKey)
      unByKey(drawEndKey)
      if (liveGeometry && liveGeometryListener) {
        liveGeometry.un("change", liveGeometryListener)
      }
      draw.abortDrawing()
      map.removeInteraction(draw)
      if (drawLayer) map.removeLayer(drawLayer)
      if (measurementTooltipElementRef.current) {
        measurementTooltipElementRef.current.hidden = true
      }
      measurementOverlayRef.current?.setPosition(undefined)
      if (drawInteractionRef.current === draw) {
        drawInteractionRef.current = null
      }
    }
  }, [
    activeMapTool,
    openPane,
    setActiveMapTool,
    setMeasurementResult,
    setToolUiState,
  ])

  useEffect(() => {
    const map = mapInstance.current
    if (
      !map ||
      (selectedCampId !== "all" && !selectedCamp) ||
      (selectedCampId === "all" && !didFitInitialExtentRef.current)
    ) {
      return
    }
    fitToSpatialContext(
      map,
      selectedCampId === "all" ? null : selectedCamp,
      mapLayersRef.current,
      tapsOverviewSourceRef.current,
      !didFitInitialExtentRef.current,
    )
    if (!didFitInitialExtentRef.current) {
      homeExtentRef.current =
        selectedCamp?.extent ??
        map.getView().calculateExtent(map.getSize())
    }
    didFitInitialExtentRef.current = true
  }, [layerStatuses, selectedCamp, selectedCampId])

  useEffect(() => {
    setMetrics(infrastructureMetrics(mapLayersRef.current, selectedCamp))
  }, [
    contextualTapStatus,
    layerStatuses,
    selectedCamp,
    selectedCampId,
  ])

  useEffect(() => {
    const map = mapInstance.current
    if (!map) return
    if (mapMode === "boreholeTankConnections") {
      map.getLayers().forEach((layer) => {
        if (!(layer instanceof VectorLayer)) layer.setVisible(false)
      })
      const requestId = window.setTimeout(() => {
        if (mapModeRef.current === "boreholeTankConnections") {
          void openConnectionView("boreholes", null)
        }
      }, 0)
      return () => window.clearTimeout(requestId)
    } else {
      map.getLayers().forEach((layer) => {
        if (!(layer instanceof VectorLayer)) layer.setVisible(true)
      })
      connectionRequestRef.current?.abort()
      connectionRequestRef.current = null
      const resetId = window.setTimeout(() => {
        setConnectionView((current) =>
          current?.selectedId === null ? null : current,
        )
      }, 0)
      return () => window.clearTimeout(resetId)
    }
  }, [mapMode, openConnectionView])

  useEffect(() => {
    if (connectionView) {
      openPane("connectionScale")
    } else {
      closePane("connectionScale")
    }
  }, [closePane, connectionView, openPane])

  useEffect(() => {
    const layer = serviceAreaLayerRef.current
    const source = layer?.getSource()
    if (!layer || !source) return
    source.clear(true)
    layer.setVisible(tankServiceAreasActive || waterBalanceActive)
    hoveredServiceAreaRef.current = null
    if (
      (!tankServiceAreasActive && !waterBalanceActive) ||
      tankServiceAreas.status !== "loaded"
    ) return

    const serviceFeatures: Feature[] = []
    for (const spatialLayer of Object.values(mapLayersRef.current)) {
      const table = String(spatialLayer.get("table") ?? "")
      const isInSelectedCamp =
        selectedCamp?.tables.some(
          (campTable) => campTable.toLowerCase() === table.toLowerCase(),
        ) ?? false
      if (selectedCampId !== "all" && !isInSelectedCamp) continue
      for (const feature of spatialLayer.getSource()?.getFeatures() ?? []) {
        const geometry = feature.getGeometry()
        if (
          !geometry ||
          !["Polygon", "MultiPolygon"].includes(geometry.getType())
        ) {
          continue
        }
        const serviceCode = normalizedId(feature.get("service_code"))
        const groups = serviceCode
          ? tankServiceAreas.byServiceCode.get(serviceCode)
          : undefined
        const primaryTank = groups?.[0]
        if (!serviceCode || !groups || !primaryTank) continue
        const highlighted = feature.clone()
        const balanceStatus = waterBalanceActive
          ? areaWaterBalanceStatus(groups, waterBalances.byTankId)
          : null
        highlighted.set("serviceCode", serviceCode, true)
        highlighted.set(
          "serviceColor",
          balanceStatus ? waterBalanceColors[balanceStatus] : primaryTank.color,
          true,
        )
        if (balanceStatus) {
          highlighted.set("waterBalanceStatus", balanceStatus, true)
        }
        highlighted.set("tankGroups", groups, true)
        serviceFeatures.push(highlighted)
      }
    }
    source.addFeatures(serviceFeatures)
    layer.changed()
  }, [
    layers,
    layerStatuses,
    tankServiceAreas.byServiceCode,
    tankServiceAreas.status,
    tankServiceAreasActive,
    waterBalanceActive,
    waterBalances.byTankId,
    selectedCamp,
    selectedCampId,
  ])

  useEffect(() => {
    for (const metadata of layers) {
      const vectorLayer = mapLayersRef.current[metadata.id]
      if (!vectorLayer) continue
      const category = infrastructureCategory(metadata)
      if (category) {
        const categoryFeatureType: ConnectionFeatureType | null =
          category === "wells" ? "boreholes" : category === "tanks" ? "tanks" : null
        const categoryIsVisible =
          (activeCategories.includes(category) ||
            (mapMode === "tapStatus" && category === "taps") ||
          ((tankServiceAreasActive || waterBalanceActive) &&
            category === "tanks")) ||
          Boolean(
            connectionView && (category === "wells" || category === "tanks"),
          )
        vectorLayer.setVisible(categoryIsVisible)
        vectorLayer.setStyle(
          createStyle(
            metadata,
            selectedCamp !== null,
            connectionView,
            tankServiceAreasActive || waterBalanceActive,
            new Map(
              tankServiceAreas.tanks.map((tank) => [
                tank.tankId,
                waterBalanceActive
                  ? waterBalanceColors[
                      waterBalances.byTankId.get(tank.tankId) ?? "unknown"
                    ]
                  : tank.color,
              ]),
            ),
            mapMode === "tapStatus",
          ),
        )
        vectorLayer.setZIndex(
          (tankServiceAreasActive || waterBalanceActive) &&
          category === "tanks"
            ? 32
            : connectionView && categoryFeatureType
              ? 30
              : 10,
        )
        continue
      }

      const belongsToSelectedCamp =
        selectedCamp?.tables.some(
          (table) => table.toLowerCase() === metadata.table.toLowerCase(),
        ) ?? false
      vectorLayer.setVisible(
        selectedCampId === "all" || belongsToSelectedCamp,
      )
      vectorLayer.setStyle(
        createStyle(
          metadata,
          selectedCamp !== null,
          connectionView,
          tankServiceAreasActive || waterBalanceActive,
          new Map(),
          mapMode === "tapStatus",
        ),
      )
      vectorLayer.setZIndex(10)
    }
  }, [
    activeCategories,
    connectionView,
    layerStatuses,
    layers,
    selectedCamp,
    selectedCampId,
    tankServiceAreas.tanks,
    tankServiceAreasActive,
    waterBalanceActive,
    waterBalances.byTankId,
    mapMode,
  ])

  useEffect(() => {
    const source = connectionLayerRef.current?.getSource()
    if (!source) return
    source.clear(true)
    hoveredConnectionRef.current = null
    const target = mapInstance.current?.getTargetElement()
    if (target) target.style.cursor = ""
    if (!connectionView || connectionView.loading) return

    const featureIndex: Record<
      ConnectionFeatureType,
      globalThis.Map<string, FeatureLike>
    > = {
      boreholes: new globalThis.Map(),
      tanks: new globalThis.Map(),
    }
    for (const layer of Object.values(mapLayersRef.current)) {
      const category = infrastructureCategory({
        table: String(layer.get("table")),
      })
      const type: ConnectionFeatureType | null =
        category === "wells"
          ? "boreholes"
          : category === "tanks"
            ? "tanks"
            : null
      if (!type) continue
      for (const feature of layer.getSource()?.getFeatures() ?? []) {
        const id = featureIdentifier(feature, type)
        if (id) featureIndex[type].set(id, feature)
      }
    }
    const findFeature = (
      type: ConnectionFeatureType,
      id: string,
    ): FeatureLike | undefined => featureIndex[type].get(id)

    const connectedFeatures = connectionView.connections.flatMap((connection) => {
      const borehole = findFeature("boreholes", connection.boreholeId)
      const tank = findFeature("tanks", connection.tankId)
      const boreholeCoordinate = borehole ? geometryCoordinate(borehole) : null
      const tankCoordinate = tank ? geometryCoordinate(tank) : null
      if (!boreholeCoordinate || !tankCoordinate) return []
      const coordinates =
        connectionView.selectedType === "boreholes"
          ? [boreholeCoordinate, tankCoordinate]
          : [tankCoordinate, boreholeCoordinate]
      const feature = new Feature({
        geometry: new LineString(coordinates),
        amount: connection.amount,
        boreholeId: connection.boreholeId,
        tankId: connection.tankId,
      })
      return [feature]
    })
    if (connectedFeatures.length === 0) return

    const amounts = connectedFeatures.map((feature) =>
      Number(feature.get("amount")),
    )
    const minimum = Math.min(...amounts)
    const maximum = Math.max(...amounts)
    for (const feature of connectedFeatures) {
      const amount = Number(feature.get("amount"))
      const color = connectionColor(amount, minimum, maximum)
      feature.set("lineColor", color, true)
      feature.set("label", connectionLabel(amount), true)
      setConnectionFeatureStyle(feature, false, false)
    }
    source.addFeatures(connectedFeatures)
  }, [connectionView, layerStatuses])

  const zoomBy = useCallback((delta: number) => {
    const view = mapInstance.current?.getView()
    if (!view) return
    const currentZoom = view.getZoom() ?? 2
    view.animate({
      zoom: Math.max(2, Math.min(19, currentZoom + delta)),
      duration: 180,
    })
  }, [])

  const resetView = useCallback(() => {
    const map = mapInstance.current
    if (!map) return
    fitToSpatialContext(
      map,
      selectedCamp,
      mapLayersRef.current,
      tapsOverviewSourceRef.current,
    )
  }, [selectedCamp])
  const fitExtent = useCallback((extent: number[] | null) => {
    const map = mapInstance.current
    if (!map || !extent?.every(Number.isFinite)) return
    map.getView().fit(extent, { padding: [80, 40, 100, 40], maxZoom: 16, duration: 300 })
  }, [])
  const fullExtent = useCallback(() => {
    const map = mapInstance.current
    if (!map) return
    fitToSpatialContext(
      map,
      null,
      mapLayersRef.current,
      tapsOverviewSourceRef.current,
    )
  }, [])
  const homeExtent = useCallback(() => {
    fitExtent(homeExtentRef.current ?? selectedCamp?.extent ?? null)
  }, [fitExtent, selectedCamp])
  const previousExtent = useCallback(() => {
    const history = extentHistoryRef.current
    if (extentHistoryIndexRef.current <= 0) return
    extentHistoryIndexRef.current -= 1
    setToolUiState("previousExtent", {
      active: false,
      disabled: extentHistoryIndexRef.current <= 0,
    })
    setToolUiState("nextExtent", { active: false, disabled: false })
    historyNavigationRef.current = true
    fitExtent(history[extentHistoryIndexRef.current] ?? null)
    window.setTimeout(() => {
      historyNavigationRef.current = false
    }, 400)
  }, [fitExtent, setToolUiState])
  const nextExtent = useCallback(() => {
    const history = extentHistoryRef.current
    if (extentHistoryIndexRef.current >= history.length - 1) return
    extentHistoryIndexRef.current += 1
    setToolUiState("previousExtent", { active: false, disabled: false })
    setToolUiState("nextExtent", {
      active: false,
      disabled: extentHistoryIndexRef.current >= history.length - 1,
    })
    historyNavigationRef.current = true
    fitExtent(history[extentHistoryIndexRef.current] ?? null)
    window.setTimeout(() => {
      historyNavigationRef.current = false
    }, 400)
  }, [fitExtent, setToolUiState])
  const clearSelection = useCallback(() => {
    selectionSourceRef.current?.clear(true)
    selectionExtentRef.current = null
    setToolUiState("zoomToSelection", { active: false, disabled: true })
    setToolUiState("clearSelection", { active: false, disabled: true })
    setSelectedInfrastructure(null)
    setSelectedServiceArea(null)
    closePane("infrastructureDetails")
  }, [closePane, setToolUiState])
  const clearMeasurement = useCallback(() => {
    const map = mapInstance.current
    const draw = drawInteractionRef.current
    if (draw) {
      draw.abortDrawing()
      map?.removeInteraction(draw)
      drawInteractionRef.current = null
    }
    measurementSourceRef.current?.clear(true)
    setMeasurementResult("")
    setToolUiState("clearMeasurement", { active: false, disabled: true })
    setLocationLabel("")
    if (measurementTooltipElementRef.current) {
      measurementTooltipElementRef.current.hidden = true
    }
    measurementOverlayRef.current?.setPosition(undefined)
    closePane("measurementReadout")
    setActiveMapTool("explore")
  }, [closePane, setActiveMapTool, setMeasurementResult, setToolUiState])
  const zoomToSelection = useCallback(() => {
    fitExtent(selectionExtentRef.current)
  }, [fitExtent])
  const changeBasemap = useCallback((style: "dark" | "light") => {
    setBasemapStyle(style)
    const map = mapInstance.current
    if (!map) return
    const styleUrl =
      style === "dark"
        ? CARTO_DARK_STYLE
        : "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
    void apply(map, styleUrl)
      .then(() => {
        setBasemapError(false)
        if (mapModeRef.current === "boreholeTankConnections") {
          map.getLayers().forEach((layer) => {
            if (!(layer instanceof VectorLayer)) layer.setVisible(false)
          })
        }
      })
      .catch((error: unknown) => {
        console.error(`Unable to load the ${style} basemap.`, error)
        setBasemapError(true)
      })
  }, [])
  const zoomIn = useCallback(() => zoomBy(1), [zoomBy])
  const zoomOut = useCallback(() => zoomBy(-1), [zoomBy])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      void mapElement.current?.parentElement?.requestFullscreen()
    } else {
      void document.exitFullscreen()
    }
  }, [])

  const displayedTapStatus =
    selectedCampId === "all" || !selectedCamp ? "idle" : contextualTapStatus
  const selectedConnectionView =
    selectedInfrastructure &&
    connectionView?.selectedId === selectedInfrastructure.id &&
    connectionView.selectedType ===
      (selectedInfrastructure.type === "Tank" ? "tanks" : "boreholes")
      ? connectionView
      : null
  useEffect(() => {
    connectionsActionRef.current = () => {
      if (selectedInfrastructure) void toggleConnectionView(selectedInfrastructure)
    }
    resetViewActionRef.current = resetView
    zoomInActionRef.current = zoomIn
    zoomOutActionRef.current = zoomOut
    fullscreenActionRef.current = toggleFullscreen
    toolActionsRef.current = {
      fullExtent,
      homeExtent,
      previousExtent,
      nextExtent,
      clearSelection,
      clearMeasurement,
      campExtent: resetView,
      zoomToSelection,
    }
  }, [
    selectedInfrastructure,
    toggleConnectionView,
    resetView,
    zoomIn,
    zoomOut,
    toggleFullscreen,
    fullExtent,
    homeExtent,
    previousExtent,
    nextExtent,
    clearSelection,
    clearMeasurement,
    zoomToSelection,
  ])

  useEffect(() => {
    const unregisterConnections = registerToolAction("connections", () =>
      connectionsActionRef.current(),
    )
    const unregisterReset = registerToolAction("resetView", () =>
      resetViewActionRef.current(),
    )
    const unregisterZoomIn = registerToolAction("zoomIn", () =>
      zoomInActionRef.current(),
    )
    const unregisterZoomOut = registerToolAction("zoomOut", () =>
      zoomOutActionRef.current(),
    )
    const unregisterFullscreen = registerToolAction("toggleFullscreen", () =>
      fullscreenActionRef.current(),
    )
    const actionIds = [
      "fullExtent",
      "homeExtent",
      "previousExtent",
      "nextExtent",
      "clearSelection",
      "clearMeasurement",
      "campExtent",
      "zoomToSelection",
    ] as const
    const unregisterActions = actionIds.map((id) =>
      registerToolAction(id, () => toolActionsRef.current[id]?.()),
    )
    return () => {
      unregisterConnections()
      unregisterReset()
      unregisterZoomIn()
      unregisterZoomOut()
      unregisterFullscreen()
      unregisterActions.forEach((unregister) => unregister())
    }
  }, [registerToolAction])

  useEffect(() => {
    setToolUiState("previousExtent", {
      active: false,
      disabled: extentHistoryIndexRef.current <= 0,
    })
    setToolUiState("nextExtent", {
      active: false,
      disabled:
        extentHistoryIndexRef.current >= extentHistoryRef.current.length - 1,
    })
    setToolUiState("zoomToSelection", {
      active: false,
      disabled: selectionExtentRef.current === null,
    })
    setToolUiState("clearSelection", {
      active: false,
      disabled: (selectionSourceRef.current?.getFeatures().length ?? 0) === 0,
    })
    const measuring =
      activeMapTool === "measureDistance" || activeMapTool === "measureArea"
    setToolUiState("clearMeasurement", {
      active: false,
      disabled:
        !measuring &&
        (measurementSourceRef.current?.getFeatures().length ?? 0) === 0,
    })
    setToolUiState("connections", {
      active: selectedConnectionView !== null,
      disabled:
        selectedInfrastructure === null ||
        isConnectionSoundPending ||
        Boolean(selectedConnectionView?.loading),
    })
    setToolUiState("resetView", { active: false, disabled: false })
    setToolUiState("zoomIn", { active: false, disabled: false })
    setToolUiState("zoomOut", { active: false, disabled: false })
    setToolUiState("toggleFullscreen", { active: false, disabled: false })
  }, [
    isConnectionSoundPending,
    selectedConnectionView,
    selectedInfrastructure,
    setToolUiState,
    activeMapTool,
  ])

  const updateFindQuery = (queryValue: string) => {
    setFindQuery(queryValue)
    const query = queryValue.trim().toLowerCase()
    if (query.length < 2) {
      setFindResults([])
      return
    }
    const results: { feature: FeatureLike; table: string; label: string }[] = []
    for (const layer of Object.values(mapLayersRef.current)) {
      const table = String(layer.get("table"))
      for (const feature of layer.getSource()?.getFeatures() ?? []) {
        const properties = feature.getProperties()
        const match = Object.entries(properties).find(
          ([key, value]) =>
            key !== "geometry" &&
            value !== null &&
            value !== undefined &&
            String(value).toLowerCase().includes(query),
        )
        if (!match) continue
        results.push({
          feature,
          table,
          label: `${table} · ${String(match[1])}`,
        })
        if (results.length >= 12) {
          setFindResults(results)
          return
        }
      }
    }
    setFindResults(results)
  }

  const openFindResult = (result: (typeof findResults)[number]) => {
    const geometry = result.feature.getGeometry()
    if (geometry) {
      selectionExtentRef.current = geometry.getExtent()
      mapInstance.current?.getView().fit(geometry.getExtent(), {
        padding: [120, 80, 120, 80],
        maxZoom: 17,
        duration: 250,
      })
    }
    const details = infrastructureDetails(result.table, result.feature)
    if (details) {
      setSelectedInfrastructure(details)
      openPane("infrastructureDetails")
    }
    selectionSourceRef.current?.clear(true)
    selectionSourceRef.current?.addFeature(
      result.feature instanceof Feature
        ? result.feature.clone()
        : new Feature(result.feature.getProperties()),
    )
    setActiveMapTool("identify")
  }

  return (
    <section
      aria-label="Kakuma–Kalobeyei spatial workspace"
      className="relative h-full min-h-0 overflow-hidden border bg-[#121a1b]"
    >
      <div
        aria-label="Map of the Kakuma–Kalobeyei area"
        className={`absolute inset-0 ${activeCategories.includes("wells") || connectionView ? "" : "waren-wells-hidden"}`}
        data-tour="map-canvas"
        ref={mapElement}
        role="application"
      />

      <div className="absolute inset-x-3 right-14 top-3 z-10 sm:left-5 sm:right-16 sm:top-5 lg:left-6 lg:right-auto lg:w-[min(440px,calc(100%-3rem))]">
        <InfrastructureSummary
          activeMode={mapMode}
          campName={selectedCamp?.name ?? "All Camps"}
          isLoading={
            catalogStatus === "loading" ||
            metrics === null ||
            (selectedCampId !== "all" && contextualTapStatus === "loading")
          }
          metrics={metrics}
          onToggleBoreholeConnections={() =>
            toggleMapMode("boreholeTankConnections")
          }
          onToggleTankServiceAreas={() => toggleMapMode("tankServiceAreas")}
          onToggleTapStatus={() => toggleMapMode("tapStatus")}
        />
      </div>

      <PaneManager
        content={{
          layers: (
            <LayerControl
              activeCategories={activeCategories}
              contextualTapStatus={displayedTapStatus}
              layerStatuses={layerStatuses}
              layers={layers}
              onToggleCategory={toggleCategory}
            />
          ),
          tankServiceAreas: (
            <TankServiceAreasPanel
              error={tankServiceAreas.error}
              selected={selectedServiceArea}
              status={tankServiceAreas.status}
              tanks={tankServiceAreas.tanks}
            />
          ),
          waterBalance: (
            <WaterBalancePanel
              areaCount={waterBalanceAreaCount}
              error={waterBalances.error ?? tankServiceAreas.error}
              status={
                waterBalances.status === "loaded" &&
                tankServiceAreas.status === "error"
                  ? "error"
                  : waterBalances.status
              }
              tankCount={waterBalanceTankCount}
            />
          ),
          legend: (
            <MapLegend />
          ),
          connectionScale: connectionView ? (
            <div className="space-y-1 text-[9px] text-muted-foreground">
              {connectionView.loading ? (
                <span>Loading valid supply connections…</span>
              ) : connectionView.error ? (
                <span className="text-destructive">
                  Unable to load supply connections.
                </span>
              ) : connectionView.connections.length === 0 ? (
                <span>No valid supply connections found.</span>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span>Supply amount</span>
                    <span>Lower</span>
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-20 rounded-full"
                      style={{
                        background:
                          "linear-gradient(90deg, rgb(30, 64, 175), rgb(56, 189, 248))",
                      }}
                    />
                    <span>Higher m³/day</span>
                  </div>
                  <span>{connectionView.connections.length} connections</span>
                </>
              )}
            </div>
          ) : undefined,
          find: (
            <div className="space-y-2">
              <input
                aria-label="Find map features"
                className="h-8 w-full border border-input bg-background/70 px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onChange={(event) => updateFindQuery(event.target.value)}
                placeholder="Search infrastructure or attributes"
                type="search"
                value={findQuery}
              />
              <div className="max-h-52 space-y-1 overflow-y-auto">
                {findQuery.trim().length < 2 ? (
                  <p className="text-[10px] text-muted-foreground">
                    Enter at least two characters.
                  </p>
                ) : findResults.length ? (
                  findResults.map((result, index) => (
                    <Button
                      className="h-auto w-full justify-start whitespace-normal px-2 py-1.5 text-left text-[10px]"
                      key={`${result.table}-${index}`}
                      onClick={() => openFindResult(result)}
                      variant="ghost"
                    >
                      {result.label}
                    </Button>
                  ))
                ) : (
                  <p className="text-[10px] text-muted-foreground">
                    No matching features found.
                  </p>
                )}
              </div>
            </div>
          ),
          basemap: (
            <div className="flex gap-2">
              {(["dark", "light"] as const).map((style) => (
                <Button
                  aria-pressed={basemapStyle === style}
                  className="h-8 flex-1 text-[10px]"
                  key={style}
                  onClick={() => changeBasemap(style)}
                  variant={basemapStyle === style ? "secondary" : "outline"}
                >
                  {style === "dark" ? "Dark Matter" : "Positron"}
                </Button>
              ))}
            </div>
          ),
          measurementReadout: (
            <div className="space-y-1 text-[10px]">
              {measurementResult && <p>{measurementResult}</p>}
              {locationLabel && (
                <p>
                  LOCATION · {locationLabel}
                </p>
              )}
              {!measurementResult && !locationLabel && (
                <p className="text-muted-foreground">
                  Choose Distance, Area, or Locate to capture map information.
                </p>
              )}
            </div>
          ),
          infrastructureDetails: selectedInfrastructure ? (
            <InfrastructureDetailsCard
              item={selectedInfrastructure}
              key={`${selectedInfrastructure.type}:${selectedInfrastructure.id}`}
              onToggleConnectionView={() =>
                void toggleConnectionView(selectedInfrastructure)
              }
              isConnectionViewActive={selectedConnectionView !== null}
              isConnectionViewLoading={
                isConnectionSoundPending ||
                (selectedConnectionView?.loading ?? false)
              }
              connectionCount={selectedConnectionView?.connections.length ?? 0}
              connectionViewError={selectedConnectionView?.error ?? null}
            />
          ) : undefined,
        }}
        onClose={{ infrastructureDetails: closeInfrastructureCard }}
      />

      {displayedTapStatus === "empty" && (
        <div className="absolute bottom-12 right-3 z-10 border border-amber-300/20 bg-[#101722]/90 px-3 py-2 text-[10px] text-amber-200 shadow-lg backdrop-blur sm:bottom-14 sm:right-5">
          No taps found in {selectedCamp?.name}.
        </div>
      )}
      {displayedTapStatus === "error" && (
        <div className="absolute bottom-12 right-3 z-10 border border-rose-300/20 bg-[#101722]/90 px-3 py-2 text-[10px] text-rose-200 shadow-lg backdrop-blur sm:bottom-14 sm:right-5" role="status">
          Unable to load taps for {selectedCamp?.name}.
        </div>
      )}

      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2 text-[9px] text-slate-300 sm:bottom-4 sm:left-5 lg:left-6" role="status">
        <span className={`size-1.5 ${basemapError || catalogStatus === "error" ? "bg-rose-400" : "bg-emerald-400"}`} />
        <span>
          {basemapError
            ? "Unable to load dark basemap."
            : catalogStatus === "loading"
              ? "Discovering spatial layers..."
              : catalogStatus === "error"
                ? "Unable to load spatial layers."
                : `CARTO Dark Matter · ${layers.length} PostGIS layers`}
        </span>
      </div>
    </section>
  )
}

export default MapView
