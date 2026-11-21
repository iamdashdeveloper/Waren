import { useEffect, useState } from "react"
import { RiMoonLine, RiSunLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"

function ThemeToggle() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains("dark"),
  )

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark)
    document.documentElement.classList.toggle("light", !isDark)
  }, [isDark])

  return (
    <Button
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      className="size-7 text-muted-foreground"
      onClick={() => setIsDark((current) => !current)}
      size="icon"
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      variant="ghost"
    >
      {isDark ? <RiSunLine /> : <RiMoonLine />}
    </Button>
  )
}

export default ThemeToggle
