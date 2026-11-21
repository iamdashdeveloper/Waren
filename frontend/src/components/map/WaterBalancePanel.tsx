import type {
  WaterBalanceLoadStatus,
  WaterBalanceStatus,
} from "@/components/map/useTankWaterBalances"
import type { SelectedServiceArea } from "@/components/map/TankServiceAreasPanel"

type WaterBalancePanelProps = {
  status: WaterBalanceLoadStatus
  error: string | null
  tankCount: number
  areaCount: number
  selected: SelectedServiceArea | null
  supplyByTankId: Map<string, number | null>
}

const entries: {
  status: Exclude<WaterBalanceStatus, "unknown">
  label: string
  range: string
  color: string
}[] = [
  { status: "adequate", label: "Adequate supply", range: "20+ L/P/D", color: "#22c55e" },
  { status: "warning", label: "Near target", range: "17–<20 L/P/D", color: "#eab308" },
  { status: "danger", label: "At risk", range: "<17 L/P/D", color: "#ef4444" },
]

function WaterBalancePanel({
  status,
  error,
  tankCount,
  areaCount,
  selected,
  supplyByTankId,
}: WaterBalancePanelProps) {
  const selectedSupplies = selected?.tanks.map((tank) => ({
    tankId: tank.tankId,
    value: supplyByTankId.get(tank.tankId) ?? null,
  })) ?? []
  const recordedSelectedSupplies = selectedSupplies.flatMap((supply) =>
    supply.value === null ? [] : [supply.value],
  )
  const minimumSelectedSupply =
    recordedSelectedSupplies.length > 0
      ? Math.min(...recordedSelectedSupplies)
      : null

  return (
    <div aria-label="Water supply legend" className="space-y-2">
      {status === "loading" && (
        <p className="text-[10px] text-muted-foreground" role="status">
          Loading tank water supply…
        </p>
      )}
      {status === "error" && (
        <p className="text-[10px] text-destructive" role="alert">
          {error ?? "Unable to load tank water supply."}
        </p>
      )}
      {status === "loaded" && tankCount === 0 && (
        <p className="text-[10px] text-muted-foreground" role="status">
          No tank `water_supply` values are recorded.
        </p>
      )}
      <ul className="space-y-1">
        {entries.map((entry) => (
          <li
            className="flex items-center gap-2 text-[10px] text-muted-foreground"
            key={entry.status}
          >
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="flex-1">{entry.label}</span>
            <span>{entry.range}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full bg-slate-400"
          />
          No water supply data
        </li>
      </ul>
      {status === "loaded" && tankCount > 0 && (
        <p className="border-t border-border pt-2 text-[9px] text-muted-foreground">
          {tankCount} {tankCount === 1 ? "tank" : "tanks"} with supply values
          {" · "}
          {areaCount} {areaCount === 1 ? "service area" : "service areas"} colored
        </p>
      )}
      <p className="text-[9px] text-muted-foreground">
        Colors are based on the `water_supply` column in L/P/D relative to the
        20 L/P/D target. For areas linked to multiple tanks, the lowest linked
        value determines the color; values are not added together.
      </p>
      {selected && (
        <div className="space-y-1 border-t border-border pt-2" role="status">
          <p className="font-medium text-foreground">
            Service area {selected.serviceCode}
          </p>
          {selectedSupplies.length === 0 ? (
            <p className="text-muted-foreground">
              No linked tank supply records are available.
            </p>
          ) : (
            <>
              {selectedSupplies.map((supply) => (
                <p className="flex justify-between gap-2 text-muted-foreground" key={supply.tankId}>
                  <span>Tank {supply.tankId}</span>
                  <span>
                    {supply.value === null
                      ? "No supply data"
                      : `${supply.value.toFixed(1)} L/P/D`}
                  </span>
                </p>
              ))}
              {selectedSupplies.length > 1 && (
                <p className="pt-1 text-[9px] text-muted-foreground">
                  {recordedSelectedSupplies.length !== selectedSupplies.length
                    ? "The area is gray because at least one linked tank has no valid supply value."
                    : `Area color follows the lowest linked tank supply (${minimumSelectedSupply?.toFixed(1) ?? "—"} L/P/D); per-capita figures are not added.`}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default WaterBalancePanel