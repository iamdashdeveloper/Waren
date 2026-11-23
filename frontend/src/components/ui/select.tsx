import { Select as SelectPrimitive } from "@base-ui/react/select"
import { RiArrowDownSLine, RiCheckLine } from "@remixicon/react"
import { cn } from "cn"

type SelectOption = {
  value: string
  label: string
  group?: string
}

type SelectProps = {
  value: string
  options: SelectOption[]
  onValueChange: (value: string) => void
  "aria-label": string
  className?: string
  popupClassName?: string
  positionerClassName?: string
}

function Select({
  value,
  options,
  onValueChange,
  className,
  popupClassName,
  positionerClassName,
  ...props
}: SelectProps) {
  const groups = Array.from(new Set(options.map((option) => option.group ?? "")))

  return (
    <SelectPrimitive.Root
      items={Object.fromEntries(options.map((option) => [option.value, option.label]))}
      value={value}
      onValueChange={(nextValue) => {
        if (typeof nextValue === "string") onValueChange(nextValue)
      }}
    >
      <SelectPrimitive.Trigger
        aria-label={props["aria-label"]}
        className={cn(
          "inline-flex h-9 min-w-0 items-center gap-2 border bg-background px-2.5 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/40",
          className,
        )}
      >
        <SelectPrimitive.Value className="min-w-0 flex-1 truncate" />
        <SelectPrimitive.Icon>
          <RiArrowDownSLine className="size-4 shrink-0 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          alignItemWithTrigger={false}
          className={positionerClassName}
          sideOffset={4}
        >
          <SelectPrimitive.Popup className={cn(
            "z-[var(--waren-z-dropdown)] min-w-[220px] max-w-[min(320px,calc(100vw-2rem))] border bg-popover p-1 text-popover-foreground shadow-lg outline-none",
            popupClassName,
          )}>
            <SelectPrimitive.List className="max-h-[min(65dvh,420px)] overflow-y-auto">
              {groups.map((group, groupIndex) => {
                const groupOptions = options.filter(
                  (option) => (option.group ?? "") === group,
                )
                if (groupOptions.length === 0) return null
                return (
                  <SelectPrimitive.Group key={group || "ungrouped"}>
                    {groupIndex > 0 && (
                      <SelectPrimitive.Separator className="my-1 h-px bg-border" />
                    )}
                    {group && (
                      <SelectPrimitive.GroupLabel className="px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {group}
                      </SelectPrimitive.GroupLabel>
                    )}
                    {groupOptions.map((option) => (
                      <SelectPrimitive.Item
                        className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                        key={option.value}
                        value={option.value}
                      >
                        <SelectPrimitive.ItemText className="flex-1">
                          {option.label}
                        </SelectPrimitive.ItemText>
                        <SelectPrimitive.ItemIndicator>
                          <RiCheckLine className="size-3.5" />
                        </SelectPrimitive.ItemIndicator>
                      </SelectPrimitive.Item>
                    ))}
                  </SelectPrimitive.Group>
                )
              })}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

export type { SelectOption }
export { Select }
