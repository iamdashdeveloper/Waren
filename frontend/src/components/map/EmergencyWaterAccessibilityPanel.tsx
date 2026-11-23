import EmergencyAreaPlanningPanel from "@/components/map/EmergencyAreaPlanningPanel"
import type {
  EmergencyAlternativeRanking,
  EmergencyAreaDetails,
  EmergencyCoverage,
} from "@/lib/api"

type EmergencyWaterAccessibilityPanelProps = {
  emergencyArea: EmergencyAreaDetails | null
  emergencyAreaRevision: number
  rankings: EmergencyAlternativeRanking[]
  coverage: EmergencyCoverage | null
  isAreaLoading: boolean
  isRankingLoading: boolean
  isCoverageLoading: boolean
  error: string | null
  onRankAlternatives: (
    affectedTapIds: string[],
    alternativeTapIds: string[],
  ) => void
  onGenerateCoverage: (
    alternativeTapIds: string[],
    contours: number[],
  ) => void
  onScenarioChange: () => void
  onClear: () => void
}

function EmergencyWaterAccessibilityPanel({
  emergencyArea,
  emergencyAreaRevision,
  rankings,
  coverage,
  isAreaLoading,
  isRankingLoading,
  isCoverageLoading,
  error,
  onRankAlternatives,
  onGenerateCoverage,
  onScenarioChange,
  onClear,
}: EmergencyWaterAccessibilityPanelProps) {
  return (
    <div className="space-y-3 text-[10px]">
      <p className="text-muted-foreground">
        Select any mapped polygon with a service code to identify the affected
        area, review its taps, and compare nearby operational taps.
      </p>
      <EmergencyAreaPlanningPanel
        area={emergencyArea}
        areaRevision={emergencyAreaRevision}
        coverage={coverage}
        error={error}
        isAreaLoading={isAreaLoading}
        isCoverageLoading={isCoverageLoading}
        isRankingLoading={isRankingLoading}
        onClear={onClear}
        onGenerateCoverage={onGenerateCoverage}
        onRank={onRankAlternatives}
        onScenarioChange={onScenarioChange}
        rankings={rankings}
      />
    </div>
  )
}

export default EmergencyWaterAccessibilityPanel
