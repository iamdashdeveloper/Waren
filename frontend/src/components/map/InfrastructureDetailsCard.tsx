import { Button } from "@/components/ui/button"

type InfrastructureDetails = {
  type: "Borehole" | "Tank"
  id: string
  fields: { label: string; value: string }[]
}

type InfrastructureDetailsCardProps = {
  item: InfrastructureDetails
  onToggleConnectionView: () => void
  isConnectionViewActive: boolean
  isConnectionViewLoading: boolean
  connectionCount: number
  connectionViewError: string | null
}

function InfrastructureDetailsCard({
  item,
  onToggleConnectionView,
  isConnectionViewActive,
  isConnectionViewLoading,
  connectionCount,
  connectionViewError,
}: InfrastructureDetailsCardProps) {
  return (
    <div
      aria-label={`${item.type} details`}
      className="space-y-3"
      data-tour={`${item.type.toLowerCase()}-details`}
      role="group"
    >
      <p className="truncate text-[10px] text-muted-foreground">{item.id}</p>
        <dl className="grid grid-cols-[minmax(94px,0.7fr)_minmax(0,1.3fr)] gap-x-4 gap-y-2 border-t border-white/10 pt-3 text-[10px]">
          {item.fields.map(({ label, value }) => (
            <div className="contents" key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 whitespace-normal break-words text-right text-foreground">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 border-t border-white/10 pt-3">
          <Button
            className="w-full"
            data-tour={`${item.type.toLowerCase()}-connections`}
            data-ui-sound="off"
            disabled={isConnectionViewLoading}
            onClick={onToggleConnectionView}
            size="sm"
            variant="outline"
          >
            {isConnectionViewLoading
              ? "Loading connections..."
              : isConnectionViewActive
                ? "Close connection view"
                : item.type === "Tank"
                  ? "View sources"
                  : "View supplied tanks"}
          </Button>
          {connectionViewError && (
            <p className="mt-2 text-[10px] text-destructive" role="alert">
              {connectionViewError}
            </p>
          )}
          {isConnectionViewActive &&
            !isConnectionViewLoading &&
            !connectionViewError &&
            connectionCount === 0 && (
              <p className="mt-2 text-[10px] text-muted-foreground" role="status">
                No positive supply connections are recorded for this feature.
              </p>
            )}
        </div>
    </div>
  )
}

export default InfrastructureDetailsCard
export type { InfrastructureDetails }
