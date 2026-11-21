import type {
  WaterBalanceLoadStatus,
  WaterBalanceStatus,
} from "@/components/map/useTankWaterBalances"

type WaterBalancePanelProps = {
  status: WaterBalanceLoadStatus
  error: string | null
  tankCount: number
  areaCount: number
}

const entries: {
  status: Exclude<WaterBalanceStatus, "unknown">
  label: string
  color: string
}[] = [
  { status: "excess", label: "Excess", color: "#22c55e" },
  { status: "balanced", label: "Balanced", color: "#eab308" },
  { status: "deficient", label: "Deficient", color: "#ef4444" },
]

function WaterBalancePanel({
  status,
  error,
  tankCount,
  areaCount,
}: WaterBalancePanelProps) {
  return (
    <div aria-label="Water balance legend" className="space-y-2">
      {status === "loading" && (
        <p className="text-[10px] text-muted-foreground" role="status">
          Loading tank water balances…
        </p>
      )}
      {status === "error" && (
        <p className="text-[10px] text-destructive" role="alert">
          {error ?? "Unable to load tank water balances."}
        </p>
      )}
      {status === "loaded" && tankCount === 0 && (
        <p className="text-[10px] text-muted-foreground" role="status">
          No tank water-balance data is recorded.
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
            {entry.label}
          </li>
        ))}
        <li className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full bg-slate-400"
          />
          No balance data
        </li>
      </ul>
      {status === "loaded" && tankCount > 0 && (
        <p className="border-t border-border pt-2 text-[9px] text-muted-foreground">
          {tankCount} {tankCount === 1 ? "tank" : "tanks"} with balance data
          {" · "}
          {areaCount} {areaCount === 1 ? "area" : "areas"} colored
        </p>
      )}
    </div>
  )
}

export default WaterBalancePanel