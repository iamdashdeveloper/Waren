import { RiContrastDrop2Line } from "@remixicon/react"
import GuidedTour from "@/components/layout/GuidedTour"
import ThemeToggle from "@/components/layout/ThemeToggle"
import { Select, type SelectOption } from "@/components/ui/select"
import { useSpatialContext } from "@/components/map/spatial-context"
import { useWorkspace } from "@/components/workspace/workspace-context"
import { ribbonTabs } from "@/components/workspace/tool-registry"

function Header() {
  const {
    camps,
    selectedCampId,
    setSelectedCampId,
  } = useSpatialContext()
  const { activeTab, setActiveTab } = useWorkspace()
  const campOptions: SelectOption[] = [
    { value: "all", label: "All Camps" },
    ...camps
      .filter((camp) => camp.kind === "kakuma")
      .map((camp) => ({
        value: camp.id,
        label: camp.name,
        group: "Kakuma",
      })),
    ...camps
      .filter((camp) => camp.kind === "village")
      .map((camp) => ({
        value: camp.id,
        label: camp.name,
        group: "Kalobeyei",
      })),
  ]

  return (
    <header className="relative z-[var(--waren-z-header)] flex h-11 shrink-0 items-center gap-1.5 border-b bg-background px-2 sm:gap-2.5 sm:px-4">
      <a
        aria-label="WAREN Dashboard"
        className="grid size-7 shrink-0 place-items-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        href="/dashboard"
        title="WAREN Dashboard"
      >
        <RiContrastDrop2Line className="size-4" />
      </a>

      <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />

      <nav
        aria-label="Workspace"
        className="waren-workspace-tabs flex min-w-0 flex-1 items-center gap-0 overflow-x-auto"
      >
        {ribbonTabs.map((tab) => {
          const active = activeTab === tab.id
          return (
            <button
              aria-label={tab.label}
              aria-pressed={active}
              data-tour={`tab-${tab.id}`}
              className={`relative h-8 shrink-0 px-1.5 text-[8px] font-semibold uppercase tracking-[0.06em] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:px-2.5 sm:text-[10px] sm:tracking-[0.08em] ${active ? "text-foreground after:absolute after:inset-x-1.5 after:-bottom-[7px] after:h-px after:bg-primary sm:after:inset-x-2.5" : "text-muted-foreground"}`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
              type="button"
            >
              {tab.label}
            </button>
          )
        })}
      </nav>

      <div className="ml-auto flex min-w-0 items-center gap-1.5">
        <GuidedTour />
        <div data-tour="camp-selector">
          <Select
            aria-label="Select camp context"
            className="h-7 w-[min(25vw,160px)] min-w-[84px] px-1.5 text-[10px] sm:w-[170px]"
            onValueChange={setSelectedCampId}
            options={campOptions}
            value={selectedCampId}
          />
        </div>
        <ThemeToggle />
      </div>
    </header>
  )
}

export default Header
