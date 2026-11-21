import { useState } from "react"
import { Button } from "@/components/ui/button"
import { contourColors } from "@/components/map/isochrone-styles"
import type {
  EmergencyWaterIsochrone,
  EmergencyWaterPoint,
} from "@/lib/api"

const availableThresholds = [5, 10, 15]

function normalizedStatus(status: string | null) {
  return (status ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_")
}

function isOperational(status: string | null) {
  return ["operational", "active", "working", "functional", "true", "yes", "1"].includes(
    normalizedStatus(status),
  )
}

function isUnavailable(status: string | null) {
  return [
    "damaged",
    "broken",
    "dry",
    "inactive",
    "non_operational",
    "not_operational",
    "not_working",
    "unavailable",
    "false",
    "no",
    "0",
  ].includes(normalizedStatus(status))
}

type EmergencyWaterAccessibilityPanelProps = {
  selectedPoint: EmergencyWaterPoint | null
  onGenerate: (contours: number[], confirmUnverifiedStatus: boolean) => void
  onClear: () => void
  isLoading: boolean
  error: string | null
  result: EmergencyWaterIsochrone | null
}

function EmergencyWaterAccessibilityPanel({
  selectedPoint,
  onGenerate,
  onClear,
  isLoading,
  error,
  result,
}: EmergencyWaterAccessibilityPanelProps) {
  const [selectedThresholds, setSelectedThresholds] = useState(availableThresholds)
  const [confirmedPoint, setConfirmedPoint] = useState<{
    id: string
    confirmed: boolean
  } | null>(null)
  const knownOperational = isOperational(selectedPoint?.operationalStatus ?? null)
  const unavailable = isUnavailable(selectedPoint?.operationalStatus ?? null)
  const needsConfirmation = selectedPoint !== null && !knownOperational && !unavailable
  const confirmed =
    selectedPoint !== null &&
    confirmedPoint?.id === selectedPoint.id &&
    confirmedPoint.confirmed

  const toggleThreshold = (minutes: number) => {
    setSelectedThresholds((current) =>
      current.includes(minutes)
        ? current.filter((value) => value !== minutes)
        : [...current, minutes].sort((a, b) => a - b),
    )
  }

  const canGenerate =
    Boolean(selectedPoint?.id) &&
    selectedThresholds.length > 0 &&
    !isLoading &&
    !unavailable &&
    (!needsConfirmation || confirmed)

  return (
    <div className="space-y-3 text-[10px]">
      <p className="text-muted-foreground">
        Select an existing tap marker on the map. The walking-time polygons show
        modeled areas reachable along the pedestrian network—not guaranteed
        water availability or circular distances.
      </p>

      <div
        aria-label="Selected water point"
        className="space-y-1.5 border-t border-border pt-2.5"
        data-tour="selected-water-point"
      >
        <p className="font-medium text-foreground">Selected water point</p>
        {selectedPoint ? (
          <>
            <p className="text-foreground">
              ID: {selectedPoint.id || "No supported identifier found"}
            </p>
            <p className="text-muted-foreground">
              Block: {selectedPoint.block ?? "Not recorded"}
            </p>
            <p className="text-muted-foreground">
              Status: {selectedPoint.operationalStatus ?? "Not recorded"}
            </p>
            {unavailable && (
              <p className="text-destructive" role="alert">
                This tap is marked unavailable. Select a different tap.
              </p>
            )}
            {needsConfirmation && (
              <div className="space-y-1.5">
                <p className="text-amber-600 dark:text-amber-300">
                  The dataset does not confirm that this tap is operational.
                  Verify its status before using this result.
                </p>
                <label className="flex cursor-pointer items-start gap-2 text-muted-foreground">
                  <input
                    checked={confirmed}
                    className="mt-0.5 accent-sky-400"
                    onChange={(event) =>
                      setConfirmedPoint({
                        id: selectedPoint.id,
                        confirmed: event.target.checked,
                      })
                    }
                    type="checkbox"
                  />
                  I have confirmed this tap is currently working
                </label>
              </div>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">
            Click a tap marker to choose an existing water point.
          </p>
        )}
      </div>

      <fieldset
        className="space-y-1.5 border-t border-border pt-2.5"
        data-tour="isochrone-contours"
      >
        <legend className="mb-1 font-medium text-foreground">
          Walking-time thresholds
        </legend>
        <div className="flex flex-wrap gap-2">
          {availableThresholds.map((minutes) => (
            <label
              className="flex cursor-pointer items-center gap-1.5 border border-border px-2 py-1 text-muted-foreground"
              key={minutes}
            >
              <input
                checked={selectedThresholds.includes(minutes)}
                className="accent-sky-400"
                onChange={() => toggleThreshold(minutes)}
                type="checkbox"
              />
              {minutes} min
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex gap-2">
        <Button
          className="flex-1"
          data-tour="generate-isochrone"
          disabled={!canGenerate}
          onClick={() =>
            onGenerate(
              selectedThresholds.map((minutes) => minutes * 60),
              needsConfirmation && confirmed,
            )
          }
          size="sm"
        >
          {isLoading ? "Generating…" : "Generate isochrone"}
        </Button>
        <Button
          data-tour="clear-isochrone"
          onClick={onClear}
          size="sm"
          variant="outline"
        >
          Clear & exit
        </Button>
      </div>

      {error && (
        <p
          className="border-t border-border pt-2 text-destructive"
          data-tour="isochrone-result"
          role="alert"
        >
          {error}
        </p>
      )}
      {result && (
        <div
          className="space-y-2 border-t border-border pt-2"
          data-tour="isochrone-result"
          role="status"
        >
          {result.features.length === 0 ? (
            <p className="text-muted-foreground">
              No walking isochrone polygons were returned for this tap.
            </p>
          ) : (
            <p className="text-foreground">
              Showing pedestrian-network areas reachable from tap{" "}
              {result.waterPoint.id}.
            </p>
          )}
        </div>
      )}

      <div
        aria-label="Walking isochrone legend"
        className="space-y-1.5 border-t border-border pt-2"
        data-tour="isochrone-legend"
      >
        <p className="font-medium text-foreground">Walking-time bands</p>
        {availableThresholds.map((minutes) => (
          <div className="flex items-center gap-2 text-muted-foreground" key={minutes}>
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 border"
              style={{
                backgroundColor: `${contourColors[minutes]}55`,
                borderColor: contourColors[minutes],
              }}
            />
            Up to {minutes} minutes
          </div>
        ))}
        <p className="pt-1 text-[9px] text-muted-foreground">
          Overlapping bands are nested: the inner contour is the shorter walk.
          Results depend on routing-network coverage and do not confirm a tap
          has water or capacity.
        </p>
      </div>
    </div>
  )
}

export default EmergencyWaterAccessibilityPanel
