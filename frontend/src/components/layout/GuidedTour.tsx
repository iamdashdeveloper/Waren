import { useEffect, useRef } from "react"
import {
  driver,
  type Driver,
  type DriveStep,
  type DriverHook,
} from "driver.js"
import "driver.js/dist/driver.css"
import { RiInformationLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { useWorkspace } from "@/components/workspace/workspace-context"

function GuidedTour() {
  const tourRef = useRef<Driver | null>(null)
  const {
    setActiveTab,
    openPane,
    closePane,
    togglePane,
    setActiveMapTool,
    activeCategories,
    availableCategories,
    toggleCategory,
  } = useWorkspace()

  useEffect(
    () => () => {
      tourRef.current?.destroy()
    },
    [],
  )

  const startTour = () => {
    tourRef.current?.destroy()
    setActiveTab("map")

    const advanceWhen = (
      isReady: () => boolean,
      hint: string,
    ): DriverHook =>
      (_element, _step, { driver: activeDriver }) => {
        if (!isReady()) {
          activeDriver.updatePopover({ description: hint })
          return
        }
        activeDriver.moveNext()
      }

    const hasConnectionView = (type: "tank" | "borehole") => {
      const details = document.querySelector(`[data-tour="${type}-details"]`)
      const button = details?.querySelector(`[data-tour="${type}-connections"]`)
      return button?.textContent?.includes("Close connection view") ?? false
    }

    const steps: DriveStep[] = [
      {
        popover: {
          title: "Welcome to WAREN 👋",
          description:
            "WAREN helps you explore water infrastructure across Kakuma and Kalobeyei. Let’s take a quick look around together!",
        },
      },
      {
        element: '[data-tour="camp-selector"]',
        allowPageInteraction: true,
        disableActiveInteraction: false,
        popover: {
          title: "Choose your camp 🏕️",
          description:
            "Use this dropdown to focus the map on a different camp, or keep All Camps in view.",
          side: "bottom" as const,
        },
      },
      {
        element: '[data-tour="layers-tool"]',
        popover: {
          title: "Make the map yours 🗺️",
          description:
            "Layers let you show or hide groups of infrastructure. Click Layers, then choose what you’d like to see.",
          side: "bottom" as const,
          onNextClick: (_element, _step, { driver: activeDriver }) => {
            if (!document.querySelector('[aria-label="Layers pane"]')) {
              openPane("layers")
            }
            activeDriver.moveNext()
          },
        },
      },
      {
        element: '[aria-label="Layers pane"]',
        waitForElement: 2000,
        popover: {
          title: "Toggle map layers ✨",
          description:
            "Switch infrastructure groups on or off here. The map and its legend update to match.",
          side: "left" as const,
          onNextClick: (_element, _step, { driver: activeDriver }) => {
            closePane("layers")
            activeDriver.moveNext()
          },
        },
      },
      {
        element: '[data-tour="map-canvas"]',
        popover: {
          title: "Explore the map 📍",
          description:
            "Click a tank marker to open its details. If this camp has no tanks, choose All Camps from the dropdown first. When the detail card appears, choose Next.",
          side: "top" as const,
          onNextClick: advanceWhen(
            () => Boolean(document.querySelector('[data-tour="tank-details"]')),
            "Click a tank marker first. If this camp has no tanks, choose All Camps from the dropdown, then click a tank and choose Next.",
          ),
        },
        allowPageInteraction: true,
        disableActiveInteraction: false,
      },
      {
        element: '[data-tour="tank-connections"]',
        popover: {
          title: "See where a tank gets water 💧",
          description:
            "Choose View sources to highlight the boreholes supplying this tank. Wait for the connection view to load, then choose Next.",
          side: "top" as const,
          onNextClick: advanceWhen(
            () => hasConnectionView("tank"),
            "Choose View sources on the tank card and wait for it to finish loading before continuing.",
          ),
        },
        allowPageInteraction: true,
        disableActiveInteraction: false,
      },
      {
        element: '[data-tour="map-canvas"]',
        popover: {
          title: "Now find a borehole ⛏️",
          description:
            "Click a borehole marker to open its details. If this camp has no boreholes, choose All Camps from the dropdown first. Once the card appears, choose Next.",
          side: "top" as const,
          onNextClick: advanceWhen(
            () => Boolean(document.querySelector('[data-tour="borehole-details"]')),
            "Click a borehole marker first. If this camp has no boreholes, choose All Camps from the dropdown, then click one and choose Next.",
          ),
        },
        allowPageInteraction: true,
        disableActiveInteraction: false,
      },
      {
        element: '[data-tour="borehole-connections"]',
        popover: {
          title: "Follow the supply network 🌊",
          description:
            "Choose View supplied tanks to see which tanks this borehole supplies. Wait for the connection view to load, then choose Next.",
          side: "top" as const,
          onNextClick: advanceWhen(
            () => hasConnectionView("borehole"),
            "Choose View supplied tanks on the borehole card and wait for it to finish loading before continuing.",
          ),
        },
        allowPageInteraction: true,
        disableActiveInteraction: false,
      },
      {
        element: '[data-tour="service-areas-control"]',
        popover: {
          title: "See each tank’s service area 🏘️",
          description:
            "Turn on the tank service-area view to color the areas supplied by each tank. Choose Next when it’s active.",
          side: "bottom" as const,
          onNextClick: advanceWhen(
            () =>
              document
                .querySelector('[data-tour="service-areas-control"]')
                ?.getAttribute("aria-pressed") === "true",
            "Click the Tanks service-area card to show the colored service areas, then choose Next.",
          ),
        },
        allowPageInteraction: true,
        disableActiveInteraction: false,
      },
      {
        element: '[aria-label="Service Areas pane"]',
        waitForElement: 2000,
        popover: {
          title: "Read the service-area colors 🎨",
          description:
            "This key links each color to its tank and lists the areas it serves. You can also click a colored area on the map for its tank relationship.",
          side: "left" as const,
        },
      },
      {
        element: '[data-tour="tab-analysis"]',
        popover: {
          title: "Time for a closer look 📊",
          description:
            "The Analysis tab brings together tools for understanding supply, demand, and access.",
          side: "bottom" as const,
          onNextClick: (_element, _step, { driver: activeDriver }) => {
            setActiveTab("analysis")
            activeDriver.moveNext()
          },
        },
      },
      {
        element: '[data-tour="water-balance-tool"]',
        waitForElement: 2000,
        popover: {
          title: "Visualize water balance 💦",
          description:
            "Open Water Balance to color service areas using the `water_supply` value in L/P/D: 20 or more is green, 17 to under 20 is yellow, and below 17 is red. Hover a service area to inspect its population, supply, demand, and excess or deficit against the 20 L/person/day target.",
          side: "bottom" as const,
          onNextClick: (_element, _step, { driver: activeDriver }) => {
            if (!document.querySelector('[aria-label="Water Balance pane"]')) {
              togglePane("waterBalance")
            }
            activeDriver.moveNext()
          },
        },
      },
      {
        element: '[aria-label="Water Balance pane"]',
        waitForElement: 2000,
        popover: {
          title: "Compare supply and need ✅",
          description:
            "The map and legend use linked tank supply values; areas with several linked tanks take the lowest recorded value, without adding per-capita figures. Leave this pane open while opening Emergency Water Accessibility on the other side of the map.",
          side: "left" as const,
        },
      },
      {
        element: '[data-tour="supply-planning-tool"]',
        popover: {
          title: "Try a temporary supply scenario 🧮",
          description:
            "Supply by Planning compares a tank with a recorded deficit against nearby tanks with a recorded surplus. Choose Next to explore a client-only scenario—no data is saved or changed.",
          side: "bottom" as const,
          onNextClick: (_element, _step, { driver: activeDriver }) => {
            if (
              !document.querySelector(
                '[aria-label="Supply by Planning pane"]',
              )
            ) {
              togglePane("supplyByPlanningUnit")
            }
            activeDriver.moveNext()
          },
        },
      },
      {
        element: '[aria-label="Supply by Planning pane"]',
        waitForElement: 2000,
        popover: {
          title: "Compare possible allocations 📍",
          description:
            "Pick a negative-balance receiver, keep the default 2 km radius or adjust it, then add nearby positive-balance suppliers and allocate people. The check uses recorded water_balance values and straight-line distance only; it does not establish operational or hydraulic feasibility.",
          side: "left" as const,
          onNextClick: (_element, _step, { driver: activeDriver }) => {
            closePane("supplyByPlanningUnit")
            activeDriver.moveNext()
          },
        },
      },
      {
        element: '[data-tour="emergency-water-tool"]',
        popover: {
          title: "Plan for water-point outages 🚰",
          description:
            "Open Emergency Water Accessibility Analysis from the Analysis tab. Its area-planning workflow can use any mapped polygon with a service_code, including neighborhood areas and blocks.",
          side: "bottom" as const,
          onNextClick: (_element, _step, { driver: activeDriver }) => {
            setActiveTab("analysis")
            setActiveMapTool("explore")
            if (
              availableCategories.includes("taps") &&
              !activeCategories.includes("taps")
            ) {
              toggleCategory("taps")
            }
            if (
              !document.querySelector(
                '[aria-label="Emergency Water Accessibility Analysis pane"]',
              )
            ) {
              togglePane("isochrone")
            }
            activeDriver.moveNext()
          },
        },
      },
      {
        element: '[aria-label="Emergency Water Accessibility Analysis pane"]',
        waitForElement: 2000,
        popover: {
          title: "Choose the affected service area 🗺️",
          description:
            "Click any polygon on the map that has a service_code. WAREN uses that code and the selected layer to identify the service unit; it does not assume every unit is a block.",
          side: "left" as const,
        },
      },
      {
        element: '[data-tour="map-canvas"]',
        popover: {
          title: "Select a polygon by its service code",
          description:
            "Click a polygon. Its service_code identifies the area, and the analysis finds taps spatially contained by it. Boundary taps are called out because they may touch a neighboring unit too.",
          side: "top" as const,
          onNextClick: advanceWhen(
            () =>
              Boolean(
                document
                  .querySelector('[data-tour="emergency-area-selection"]')
                  ?.textContent?.includes("Service code"),
              ),
            "Select a polygon with a service_code on the map first, then choose Next.",
          ),
        },
        allowPageInteraction: true,
        disableActiveInteraction: false,
      },
      {
        element: '[data-tour="emergency-affected-taps"]',
        popover: {
          title: "Set the outage scenario 🚰",
          description:
            "Taps marked damaged in the dataset are preselected. Review the list and explicitly choose which taps are affected; WAREN never assumes an entire polygon is out of service.",
          side: "left" as const,
        },
      },
      {
        element: '[data-tour="emergency-rank"]',
        popover: {
          title: "Compare alternative sources 🚶",
          description:
            "Select explicitly operational taps and, if you have verified them locally, tanks. The ORS pedestrian matrix ranks routes from each affected tap and keeps unreachable pairs as “No route.”",
          side: "top" as const,
          onNextClick: advanceWhen(
            () =>
              Boolean(
                document.querySelector('[data-tour="emergency-rankings"]') ||
                document.querySelector('[data-tour="emergency-error"]'),
              ),
            "Rank alternatives and wait for the results before continuing.",
          ),
        },
        allowPageInteraction: true,
        disableActiveInteraction: false,
      },
      {
        element: '[data-tour="emergency-coverage-contours"]',
        popover: {
          title: "Choose walking-time bands ⏱️",
          description:
            "Choose one or more 5, 10, and 15 minute bands. Select up to five ranked alternatives to compare their combined pedestrian coverage inside the chosen service area.",
          side: "left" as const,
        },
      },
      {
        element: '[data-tour="emergency-coverage-generate"]',
        popover: {
          title: "Visualize combined coverage 🌱",
          description:
            "Generate source isochrones and compare their union with the selected polygon. The uncovered overlay and area percentages are geometry-only—not estimates of population, demand, water availability, or capacity.",
          side: "top" as const,
          onNextClick: advanceWhen(
            () =>
              Boolean(
                document.querySelector('[data-tour="emergency-coverage-results"]') ||
                document.querySelector('[data-tour="emergency-error"]'),
              ),
            "Generate coverage and wait for the results before continuing.",
          ),
        },
        allowPageInteraction: true,
        disableActiveInteraction: false,
      },
      {
        element: '[data-tour="accessibility-tool"]',
        popover: {
          title: "Explore walking access from a point 📍",
          description:
            "Point isochrones now live under Accessibility, separate from emergency area planning. Open Accessibility to analyze a tap, tank, borehole, other map feature, or any location.",
          side: "left" as const,
          onNextClick: (_element, _step, { driver: activeDriver }) => {
            setActiveTab("analysis")
            setActiveMapTool("explore")
            if (
              availableCategories.includes("taps") &&
              !activeCategories.includes("taps")
            ) {
              toggleCategory("taps")
            }
            if (
              !document.querySelector('[aria-label="Accessibility pane"]')
            ) {
              togglePane("accessibility")
            }
            activeDriver.moveNext()
          },
        },
      },
      {
        element: '[aria-label="Accessibility pane"]',
        waitForElement: 2000,
        popover: {
          title: "Choose walking-time bands ⏱️",
          description:
            "Select a location on the map, choose one or more 5, 10, and 15 minute thresholds, then generate the pedestrian-network isochrone. Clear & exit closes this point-accessibility tool.",
          side: "left" as const,
        },
      },
    ]

    const tour = driver({
      steps,
      animate: true,
      allowClose: true,
      allowKeyboardControl: true,
      allowPageInteraction: false,
      disableActiveInteraction: true,
      overlayClickBehavior: "none",
      showProgress: true,
      progressText: "{{current}} of {{total}}",
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Let’s go!",
      closeBtnLabel: "Close tour",
      popoverClass: "waren-tour-popover",
      stagePadding: 6,
      stageRadius: 4,
      onDestroyed: () => {
        tourRef.current = null
      },
    })

    tourRef.current = tour
    tour.drive()
  }

  return (
    <Button
      aria-label="Start guided tour"
      className="h-7 gap-1 px-1.5 text-[9px] sm:px-2 sm:text-[10px]"
      onClick={startTour}
      title="Take a friendly tour of WAREN"
      type="button"
      variant="outline"
    >
      <RiInformationLine className="size-3.5" />
      <span className="hidden sm:inline">Tour ✨</span>
    </Button>
  )
}

export default GuidedTour
