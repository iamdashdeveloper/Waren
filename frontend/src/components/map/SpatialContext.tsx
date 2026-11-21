import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { getCamps, type CampContext } from "@/lib/api"
import { SpatialContext, type SpatialContextValue } from "@/components/map/spatial-context"

function SpatialContextProvider({ children }: { children: ReactNode }) {
  const [camps, setCamps] = useState<CampContext[]>([])
  const [selectedCampId, setSelectedCampId] = useState("all")
  const [campsStatus, setCampsStatus] =
    useState<SpatialContextValue["campsStatus"]>("loading")

  useEffect(() => {
    const controller = new AbortController()
    void getCamps(controller.signal)
      .then(({ camps: discoveredCamps }) => {
        setCamps(discoveredCamps)
        setSelectedCampId((current) => {
          if (current !== "all") return current
          return (
            discoveredCamps.find((camp) => camp.kind === "village")?.id ??
            discoveredCamps[0]?.id ??
            "all"
          )
        })
        setCampsStatus("loaded")
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        console.error("Unable to load available camp contexts.", error)
        setCampsStatus("error")
      })

    return () => controller.abort()
  }, [])

  const selectedCamp = useMemo(
    () => camps.find((camp) => camp.id === selectedCampId) ?? null,
    [camps, selectedCampId],
  )

  return (
    <SpatialContext.Provider
      value={{
        camps,
        selectedCampId,
        selectedCamp,
        campsStatus,
        setSelectedCampId,
      }}
    >
      {children}
    </SpatialContext.Provider>
  )
}

export { SpatialContextProvider }
