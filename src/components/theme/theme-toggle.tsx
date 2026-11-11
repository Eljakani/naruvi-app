"use client"

import { useTheme } from "next-themes"
import SwitchButton from "@/components/kokonutui/switch-button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useTranslations } from "next-intl"

/** Light / dark switch for the header. The first visit follows the system setting. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const t = useTranslations("theme")
  const theme = resolvedTheme === "dark" ? "dark" : resolvedTheme === "light" ? "light" : undefined
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <SwitchButton
            showLabel={false}
            size="sm"
            theme={theme}
            onThemeChange={setTheme}
            aria-label={t("dark")}
            // Blend with the header's ghost buttons instead of the component's own zinc chrome.
            className="border-transparent bg-transparent text-muted-foreground shadow-none hover:border-transparent hover:bg-muted hover:text-foreground active:bg-muted dark:border-transparent dark:bg-transparent dark:text-muted-foreground dark:hover:border-transparent dark:hover:bg-muted dark:hover:text-foreground dark:active:bg-muted focus-visible:ring-ring focus-visible:ring-offset-background dark:focus-visible:ring-ring dark:focus-visible:ring-offset-background"
          />
        }
      />
      <TooltipContent>{theme === "dark" ? t("toLight") : t("toDark")}</TooltipContent>
    </Tooltip>
  )
}
