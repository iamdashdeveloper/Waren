import {
  RiContrastDrop2Line,
  RiMapPin2Line,
  RiWaterFlashLine,
} from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export type InfrastructureMetrics = {
  taps: number
  operationalTaps: number
  damagedTaps: number
  boreholes: number
  tanks: number
}

type InfrastructureSummaryProps = {
  campName: string
  metrics: InfrastructureMetrics | null
  isLoading: boolean
  activeMode:
    | "normal"
    | "tapStatus"
    | "tankServiceAreas"
    | "waterBalance"
    | "boreholeTankConnections"
  onToggleTapStatus: () => void
  onToggleTankServiceAreas: () => void
  onToggleBoreholeConnections: () => void
}

function InfrastructureSummary({
  campName,
  metrics,
  isLoading,
  activeMode,
  onToggleTapStatus,
  onToggleTankServiceAreas,
  onToggleBoreholeConnections,
}: InfrastructureSummaryProps) {
  const operationalPercent =
    metrics && metrics.operationalTaps + metrics.damagedTaps > 0
      ? Math.round(
          (metrics.operationalTaps /
            (metrics.operationalTaps + metrics.damagedTaps)) *
            100,
        )
      : null
  const displayed = (value: number | undefined) =>
    isLoading ? "…" : value ?? "—"

  return (
    <section aria-label={`Infrastructure summary · ${campName}`}>
      <div className="grid w-fit max-w-full grid-cols-3 gap-1.5 sm:gap-2">
        <Card className="min-w-0 border-border/80 bg-card/95 shadow-sm backdrop-blur-sm">
          <Button
            aria-pressed={activeMode === "tapStatus"}
            className={`h-auto min-h-[58px] w-full justify-start gap-2 p-2 text-left hover:bg-muted/60 sm:min-h-[64px] sm:gap-2.5 sm:p-2.5 ${activeMode === "tapStatus" ? "bg-muted/70 ring-1 ring-inset ring-primary/40" : ""}`}
            onClick={onToggleTapStatus}
            title={`Tap operational status${activeMode === "tapStatus" ? " · active" : ""}`}
            variant="ghost"
          >
            <span
              className={`grid size-7 shrink-0 place-items-center ${activeMode === "tapStatus" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
            >
              <RiContrastDrop2Line className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block whitespace-nowrap font-heading text-base font-semibold leading-none tracking-tight sm:text-lg">
                {displayed(operationalPercent ?? undefined)}
                {!isLoading && operationalPercent !== null && (
                  <span className="ml-0.5 text-[10px]">%</span>
                )}{" "}
                <span className="text-[10px] font-medium">Operational</span>
              </span>
              <span className="mt-1 block truncate text-[9px] text-muted-foreground sm:text-[10px]">
                Tap operational status · {displayed(metrics?.taps)}
              </span>
            </span>
          </Button>
        </Card>

        <Card className="min-w-0 border-border/80 bg-card/95 shadow-sm backdrop-blur-sm">
          <Button
            aria-pressed={activeMode === "boreholeTankConnections"}
            className={`h-auto min-h-[58px] w-full justify-start gap-2 p-2 text-left hover:bg-muted/60 sm:min-h-[64px] sm:gap-2.5 sm:p-2.5 ${activeMode === "boreholeTankConnections" ? "bg-muted/70 ring-1 ring-inset ring-primary/40" : ""}`}
            onClick={onToggleBoreholeConnections}
            title="Show borehole-to-tank connections"
            variant="ghost"
          >
            <span className="grid size-7 shrink-0 place-items-center bg-muted text-muted-foreground">
              <RiMapPin2Line className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block whitespace-nowrap font-heading text-base font-semibold leading-none tracking-tight sm:text-lg">
                {displayed(metrics?.boreholes)}
              </span>
              <span className="mt-1 block truncate text-[9px] text-muted-foreground sm:text-[10px]">
                Boreholes
              </span>
            </span>
          </Button>
        </Card>

        <Card className="min-w-0 border-border/80 bg-card/95 shadow-sm backdrop-blur-sm">
          <Button
            aria-pressed={activeMode === "tankServiceAreas"}
            className={`h-auto min-h-[58px] w-full justify-start gap-2 p-2 text-left hover:bg-muted/60 sm:min-h-[64px] sm:gap-2.5 sm:p-2.5 ${activeMode === "tankServiceAreas" ? "bg-muted/70 ring-1 ring-inset ring-primary/40" : ""}`}
            onClick={onToggleTankServiceAreas}
            title="Show tank service areas"
            variant="ghost"
          >
            <span className="grid size-7 shrink-0 place-items-center bg-muted text-muted-foreground">
              <RiWaterFlashLine className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block whitespace-nowrap font-heading text-base font-semibold leading-none tracking-tight sm:text-lg">
                {displayed(metrics?.tanks)}
              </span>
              <span className="mt-1 block truncate text-[9px] text-muted-foreground sm:text-[10px]">
                Tanks
              </span>
            </span>
          </Button>
        </Card>
      </div>
    </section>
  )
}

export default InfrastructureSummary
