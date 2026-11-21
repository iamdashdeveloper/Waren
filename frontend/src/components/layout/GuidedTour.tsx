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
            "Open Water Balance to color service areas by supply status. Green means excess, yellow balanced, and red deficient.",
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
            "The map colors and legend help you spot areas with excess, balanced, or deficient water supply. That’s your WAREN tour—happy exploring!",
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
