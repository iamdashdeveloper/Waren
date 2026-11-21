import {
  RiAddLine,
  RiFocus3Line,
  RiFullscreenLine,
  RiSubtractLine,
} from "@remixicon/react"
import { Button } from "@/components/ui/button"

type MapControlsProps = {
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  onFullscreen: () => void
}

function MapControls({ onZoomIn, onZoomOut, onReset, onFullscreen }: MapControlsProps) {
  return (
    <div aria-label="Map controls" className="flex flex-col overflow-hidden border border-white/10 bg-[#101722]/90 shadow-lg backdrop-blur">
      <Button aria-label="Zoom in" className="text-slate-200 hover:bg-white/10 hover:text-white" onClick={onZoomIn} size="icon" variant="ghost">
        <RiAddLine />
      </Button>
      <span className="mx-2 h-px bg-white/10" />
      <Button aria-label="Zoom out" className="text-slate-200 hover:bg-white/10 hover:text-white" onClick={onZoomOut} size="icon" variant="ghost">
        <RiSubtractLine />
      </Button>
      <span className="mx-2 h-px bg-white/10" />
      <Button aria-label="Reset map view" className="text-slate-200 hover:bg-white/10 hover:text-white" onClick={onReset} size="icon" variant="ghost">
        <RiFocus3Line />
      </Button>
      <span className="mx-2 h-px bg-white/10" />
      <Button aria-label="Toggle fullscreen" className="text-slate-200 hover:bg-white/10 hover:text-white" onClick={onFullscreen} size="icon" variant="ghost">
        <RiFullscreenLine />
      </Button>
    </div>
  )
}

export default MapControls
