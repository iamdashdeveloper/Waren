import { infrastructureCategories } from "@/components/map/layers"

function MapLegend() {
  return (
    <ul aria-label="Map legend" className="space-y-1.5">
      {infrastructureCategories.map((category) => (
        <li
          className="flex items-center gap-2 text-[9px] text-muted-foreground"
          key={category.id}
        >
          <span
            aria-hidden="true"
            className={`size-2 shrink-0 ${category.symbol === "circle" ? "rounded-full" : category.symbol === "diamond" ? "rotate-45" : ""}`}
            style={{ backgroundColor: category.color }}
          />
          {category.label}
        </li>
      ))}
    </ul>
  )
}

export default MapLegend
