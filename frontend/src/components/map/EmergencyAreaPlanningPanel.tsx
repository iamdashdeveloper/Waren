import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { contourColors } from "@/components/map/isochrone-styles"
import type {
  EmergencyAlternativeRanking,
  EmergencyAreaDetails,
  EmergencyCoverage,
} from "@/lib/api"

const thresholds = [5, 10, 15]
const maximumAffectedTaps = 10
const maximumAlternatives = 20
const formatMinutes = (seconds: number | null) =>
  seconds === null ? "No route" : `${(seconds / 60).toFixed(1)} min`

type EmergencyAreaPlanningPanelProps = {
  area: EmergencyAreaDetails | null
  areaRevision: number
  rankings: EmergencyAlternativeRanking[]
  coverage: EmergencyCoverage | null
  isAreaLoading: boolean
  isRankingLoading: boolean
  isCoverageLoading: boolean
  error: string | null
  onRank: (
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

function EmergencyAreaPlanningPanel({
  area,
  areaRevision,
  rankings,
  coverage,
  isAreaLoading,
  isRankingLoading,
  isCoverageLoading,
  error,
  onRank,
  onGenerateCoverage,
  onScenarioChange,
  onClear,
}: EmergencyAreaPlanningPanelProps) {
  const areaKey = area
    ? `${areaRevision}:${area.area.table}:${area.area.serviceCode}`
    : ""
  const defaultSelection = {
    areaKey,
    affectedTapIds:
      area?.affectedTaps
        .filter((tap) => tap.status?.trim().toLowerCase() === "damaged")
        .slice(0, maximumAffectedTaps)
        .map((tap) => tap.id) ?? [],
    alternativeTapIds: area?.alternativeTaps.map((tap) => tap.id) ?? [],
    coverageSourceKeys: [] as string[],
  }
  const [selection, setSelection] = useState(defaultSelection)
  const activeSelection =
    selection.areaKey === areaKey ? selection : defaultSelection
  const { affectedTapIds, alternativeTapIds, coverageSourceKeys } = activeSelection
  const [selectedThresholds, setSelectedThresholds] = useState(thresholds)

  const updateSelection = (
    update: Partial<typeof defaultSelection>,
  ) => {
    setSelection((current) => ({
      ...(current.areaKey === areaKey ? current : defaultSelection),
      ...update,
      areaKey,
    }))
  }

  const candidateLookup = useMemo(() => {
    const candidates = area?.alternativeTaps ?? []
    return new Map(
      candidates.map((candidate) => [
        `${candidate.source}:${candidate.id}`,
        candidate,
      ]),
    )
  }, [area])

  const toggleId = (
    values: string[],
    key:
      | "affectedTapIds"
      | "alternativeTapIds"
      | "coverageSourceKeys",
    id: string,
  ) => {
    const nextValues = values.includes(id)
      ? values.filter((value) => value !== id)
      : [...values, id]
    updateSelection({
      [key]: nextValues,
      ...(key === "coverageSourceKeys" ? {} : { coverageSourceKeys: [] }),
    })
    if (key !== "coverageSourceKeys") onScenarioChange()
  }

  const selectedCoverageTapIds = coverageSourceKeys.flatMap((key) => {
    const candidate = candidateLookup.get(key)
    return candidate?.source === "tap" ? [candidate.id] : []
  })
  return (
    <div className="space-y-3 text-[10px]">
      <p className="text-muted-foreground">
        Select any mapped polygon by its service code, review the taps it
        contains, and compare nearby operational taps.
      </p>

      <div
        className="space-y-2 border-t border-border pt-2.5"
        data-tour="emergency-area-selection"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-foreground">Affected area</p>
          <Button onClick={onClear} size="sm" variant="outline">
            Clear plan
          </Button>
        </div>
        {isAreaLoading ? (
          <p className="text-muted-foreground">Loading polygon water points…</p>
        ) : area ? (
          <>
            <p className="text-foreground">
              {area.area.label} · Service code {area.area.serviceCode}
            </p>
            <p className="text-muted-foreground">
              {Math.round(area.area.areaSquareMeters).toLocaleString()} m²
              {" · "}{area.affectedTaps.length} taps inside
            </p>
            {area.affectedTaps.some((tap) => tap.onBoundary) && (
              <p className="text-amber-300">
                Boundary taps are included in this polygon; they may also touch
                a neighboring service area.
              </p>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">
            Click a polygon on the map that has a service_code value.
          </p>
        )}
      </div>

      {area && (
        <>
          <fieldset
            className="space-y-1.5 border-t border-border pt-2.5"
            data-tour="emergency-affected-taps"
          >
            <legend className="mb-1 font-medium text-foreground">
              Taps affected by this scenario
            </legend>
            {area.affectedTaps.length === 0 ? (
              <p className="text-muted-foreground">
                No taps were spatially matched. No affected points are assumed.
              </p>
            ) : (
              <>
                <p className="text-muted-foreground">
                  Damaged taps are preselected from recorded status. You can
                  adjust the outage scenario explicitly (up to{" "}
                  {maximumAffectedTaps} taps per route matrix).
                </p>
                {area.affectedTaps.filter(
                  (tap) => tap.status?.trim().toLowerCase() === "damaged",
                ).length > maximumAffectedTaps && (
                  <p className="text-amber-300">
                    More than {maximumAffectedTaps} taps are marked damaged;
                    review the capped selection before ranking.
                  </p>
                )}
                <div className="max-h-28 space-y-1 overflow-y-auto">
                  {area.affectedTaps.map((tap) => (
                    <label
                      className={`flex items-center gap-2 ${
                        !affectedTapIds.includes(tap.id) &&
                        affectedTapIds.length >= maximumAffectedTaps
                          ? "opacity-50"
                          : ""
                      }`}
                      key={tap.id}
                    >
                      <input
                        checked={affectedTapIds.includes(tap.id)}
                        className="accent-rose-400"
                        disabled={
                          !affectedTapIds.includes(tap.id) &&
                          affectedTapIds.length >= maximumAffectedTaps
                        }
                        onChange={() =>
                          toggleId(affectedTapIds, "affectedTapIds", tap.id)
                        }
                        type="checkbox"
                      />
                      <span className="text-foreground">Tap {tap.id}</span>
                      <span className="text-muted-foreground">
                        {tap.status ?? "Status not recorded"}
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </fieldset>

          <fieldset className="space-y-1.5 border-t border-border pt-2.5">
            <legend className="mb-1 font-medium text-foreground">
              Nearby operational taps
            </legend>
            {area.alternativeTaps.length === 0 ? (
              <p className="text-muted-foreground">
                No explicitly operational alternative taps were found.
              </p>
            ) : (
              <div className="max-h-28 space-y-1 overflow-y-auto">
                {area.alternativeTaps.map((tap) => (
                  <label className="flex items-center gap-2" key={tap.id}>
                    <input
                      checked={alternativeTapIds.includes(tap.id)}
                      className="accent-emerald-400"
                      disabled={
                        !alternativeTapIds.includes(tap.id) &&
                        alternativeTapIds.length >= maximumAlternatives
                      }
                      onChange={() =>
                        toggleId(alternativeTapIds, "alternativeTapIds", tap.id)
                      }
                      type="checkbox"
                    />
                    <span className="text-foreground">Tap {tap.id}</span>
                    <span className="text-muted-foreground">Operational</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <Button
            className="w-full"
            data-tour="emergency-rank"
            disabled={
              isRankingLoading ||
              affectedTapIds.length === 0 ||
              alternativeTapIds.length === 0
            }
            onClick={() => onRank(affectedTapIds, alternativeTapIds)}
            size="sm"
          >
            {isRankingLoading ? "Comparing routes…" : "Rank alternatives"}
          </Button>

          {rankings.length > 0 && (
            <fieldset
              className="space-y-1.5 border-t border-border pt-2.5"
              data-tour="emergency-rankings"
            >
              <legend className="mb-1 font-medium text-foreground">
                Ranked by walking time 🚶
              </legend>
              <p className="text-muted-foreground">
                Complete routes are prioritized, then ranked by the longest
                reachable route across affected taps. “No route” is not treated
                as zero minutes.
              </p>
              {rankings.map((ranking, index) => {
                const key = `${ranking.source}:${ranking.id}`
                return (
                  <label
                    className="flex items-start gap-2 border-b border-border/60 py-1.5"
                    key={key}
                  >
                    <input
                      checked={coverageSourceKeys.includes(key)}
                      className="mt-0.5 accent-sky-400"
                      disabled={
                        !candidateLookup.has(key) ||
                        (!coverageSourceKeys.includes(key) &&
                          coverageSourceKeys.length >= 5)
                      }
                      onChange={() =>
                        toggleId(
                          coverageSourceKeys,
                          "coverageSourceKeys",
                          key,
                        )
                      }
                      type="checkbox"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-foreground">
                        {index + 1}. Tap {ranking.id}
                      </span>
                      <span className="block text-muted-foreground">
                        {formatMinutes(ranking.longestReachableRouteSeconds)}
                        {" · "}
                        {ranking.reachableAffectedTaps}/
                        {affectedTapIds.length} affected taps reachable
                      </span>
                      <span className="block text-muted-foreground">
                        Operational status recorded
                      </span>
                      <details className="mt-1 text-muted-foreground">
                        <summary className="cursor-pointer">
                          Routes from affected taps
                        </summary>
                        <div className="space-y-0.5 pl-2 pt-1">
                          {ranking.travelTimes.map((route) => (
                            <p key={route.affectedTapId}>
                              Tap {route.affectedTapId}:{" "}
                              {formatMinutes(route.durationSeconds)}
                            </p>
                          ))}
                        </div>
                      </details>
                      {ranking.travelTimes.some(
                        (route) => route.durationSeconds === null,
                      ) && (
                        <span className="block text-amber-300">
                          At least one affected tap has no mapped route.
                        </span>
                      )}
                    </span>
                  </label>
                )
              })}
            </fieldset>
          )}

          <fieldset
            className="space-y-1.5 border-t border-border pt-2.5"
            data-tour="emergency-coverage-contours"
          >
            <legend className="mb-1 font-medium text-foreground">
              Coverage walking-time bands
            </legend>
            <div className="flex flex-wrap gap-2">
              {thresholds.map((minutes) => (
                <label
                  className="flex cursor-pointer items-center gap-1.5 border border-border px-2 py-1 text-muted-foreground"
                  key={minutes}
                >
                  <input
                    checked={selectedThresholds.includes(minutes)}
                    className="accent-sky-400"
                    onChange={() =>
                      setSelectedThresholds((current) =>
                        current.includes(minutes)
                          ? current.filter((value) => value !== minutes)
                          : [...current, minutes].sort((a, b) => a - b),
                      )
                    }
                    type="checkbox"
                  />
                  {minutes} min
                </label>
              ))}
            </div>
          </fieldset>

          <Button
            className="w-full"
            data-tour="emergency-coverage-generate"
            disabled={
              isCoverageLoading ||
              coverageSourceKeys.length === 0 ||
              selectedThresholds.length === 0 ||
              rankings.length === 0
            }
            onClick={() =>
              onGenerateCoverage(
                selectedCoverageTapIds,
                selectedThresholds.map((minutes) => minutes * 60),
              )
            }
            size="sm"
          >
            {isCoverageLoading ? "Generating coverage…" : "Visualize selected coverage"}
          </Button>
        </>
      )}

      {error && (
        <p
          className="border-t border-border pt-2 text-destructive"
          data-tour="emergency-error"
          role="alert"
        >
          {error}
        </p>
      )}

      {coverage && (
        <div
          className="space-y-1.5 border-t border-border pt-2.5"
          data-tour="emergency-coverage-results"
          role="status"
        >
          <p className="font-medium text-foreground">Geometric area coverage</p>
          {coverage.coverage.map((band) => (
            <p className="flex items-center gap-2 text-muted-foreground" key={band.contourSeconds}>
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 border"
                style={{
                  backgroundColor: `${contourColors[band.contourSeconds / 60]}55`,
                  borderColor: contourColors[band.contourSeconds / 60],
                }}
              />
              {band.contourSeconds / 60} min: {band.coveredPercent.toFixed(1)}%
              {" covered · "}
              {(band.uncoveredSquareMeters / 10_000).toFixed(2)} ha uncovered
            </p>
          ))}
          <p className="text-[9px] text-muted-foreground">
            Coverage is the geometric intersection of modeled walking areas
            with this polygon. It does not estimate residents, demand,
            passability, water availability, or capacity.
          </p>
        </div>
      )}
    </div>
  )
}

export default EmergencyAreaPlanningPanel
