import { createContext, useContext } from "react"
import type { CampContext } from "@/lib/api"

type SpatialContextValue = {
  camps: CampContext[]
  selectedCampId: string
  selectedCamp: CampContext | null
  campsStatus: "loading" | "loaded" | "error"
  setSelectedCampId: (campId: string) => void
}

const SpatialContext = createContext<SpatialContextValue | null>(null)

function useSpatialContext() {
  const context = useContext(SpatialContext)
  if (!context) {
    throw new Error("useSpatialContext must be used within SpatialContextProvider.")
  }
  return context
}

export { SpatialContext, useSpatialContext }
export type { SpatialContextValue }
