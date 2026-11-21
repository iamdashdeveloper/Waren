import { useEffect, useState } from "react"
import { getApiHealth } from "@/lib/api"

type ConnectionState = "checking" | "online" | "offline"

function ApiStatus() {
  const [state, setState] = useState<ConnectionState>("checking")

  useEffect(() => {
    const controller = new AbortController()
    void getApiHealth(controller.signal)
      .then(() => setState("online"))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        console.error("Unable to reach the WAREN API.", error)
        setState("offline")
      })

    return () => controller.abort()
  }, [])

  const label = {
    checking: "Connecting to API",
    online: "API online",
    offline: "API unavailable",
  }[state]
  const color = {
    checking: "bg-amber-400",
    online: "bg-emerald-500",
    offline: "bg-rose-500",
  }[state]

  return (
    <span className="hidden items-center gap-1.5 px-1 text-[11px] text-muted-foreground lg:flex" role="status">
      <span className={`size-1.5 ${color}`} />
      {label}
    </span>
  )
}

export default ApiStatus
