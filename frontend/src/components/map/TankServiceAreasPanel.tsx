import type {
  TankServiceAreaStatus,
  TankServiceGroup,
} from "@/components/map/useTankServiceAreas"

type SelectedServiceArea = {
  serviceCode: string
  tanks: TankServiceGroup[]
}

type TankServiceAreasPanelProps = {
  tanks: TankServiceGroup[]
  status: TankServiceAreaStatus
  error: string | null
  selected: SelectedServiceArea | null
}

function TankServiceAreasPanel({
  tanks,
  status,
  error,
  selected,
}: TankServiceAreasPanelProps) {
  return (
    <div aria-label="Tank Service Areas legend" className="space-y-2">
      {status === "loading" && (
        <p className="text-[10px] text-muted-foreground" role="status">
          Loading tank service areas…
        </p>
      )}
      {status === "error" && (
        <p className="text-[10px] text-destructive" role="alert">
          {error ?? "Unable to load tank service areas."}
        </p>
      )}
      {status === "loaded" && tanks.length === 0 && (
        <p className="text-[10px] text-muted-foreground" role="status">
          No tank service-area relationships are recorded.
        </p>
      )}
      {status === "loaded" && tanks.length > 0 && (
        <ul className="max-h-[min(34dvh,280px)] space-y-1 overflow-y-auto">
          {tanks.map((tank) => (
            <li
              className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground"
              key={tank.tankId}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: tank.color }}
                />
                <span className="truncate text-foreground">Tank {tank.tankId}</span>
              </span>
              <span className="shrink-0">
                {tank.serviceCodes.length}{" "}
                {tank.serviceCodes.length === 1 ? "area" : "areas"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <div className="border-t border-border pt-2.5" role="status">
          <p className="text-[10px] font-medium text-foreground">
            Service area {selected.serviceCode}
          </p>
          <p className="mt-1 text-[9px] text-muted-foreground">
            {selected.tanks.length > 0
              ? `Serviced by ${selected.tanks.map((tank) => `Tank ${tank.tankId}`).join(", ")}`
              : "No tank relationship is available."}
          </p>
        </div>
      )}
    </div>
  )
}

export default TankServiceAreasPanel
export type { SelectedServiceArea }
