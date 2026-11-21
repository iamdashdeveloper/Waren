import { Outlet } from "react-router"
import Header from "@/components/layout/Header"
import { SpatialContextProvider } from "@/components/map/SpatialContext"
import WorkspaceProvider from "@/components/workspace/WorkspaceProvider"
import WorkspaceRibbon from "@/components/workspace/WorkspaceRibbon"

function MainLayout() {
  return (
    <WorkspaceProvider>
      <SpatialContextProvider>
        <div className="flex h-dvh min-h-[560px] flex-col overflow-hidden bg-background text-foreground">
          <Header />
          <WorkspaceRibbon />
          <main className="min-h-0 flex-1 p-2 sm:p-3">
            <Outlet />
          </main>
        </div>
      </SpatialContextProvider>
    </WorkspaceProvider>
  )
}

export default MainLayout
