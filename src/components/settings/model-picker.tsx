"use client"

import { useMemo } from "react"
import { CheckIcon, RefreshCwIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { Autocomplete, AutocompleteContent, AutocompleteEmpty, AutocompleteInput, AutocompleteItem, AutocompleteList } from "@/components/reui/autocomplete"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export type ModelOption = { id: string; label: string }
export type ModelListState = "idle" | "loading" | "ready" | "error"

/**
 * Model ID field backed by the provider's model list. The list is a suggestion,
 * never a gate: any ID can be typed, so providers without a list still work.
 */
export function ModelPicker({ id, value, onValueChange, models, state, onReload, disabled, describedBy }: {
  id: string
  value: string
  onValueChange: (value: string) => void
  models: ModelOption[]
  state: ModelListState
  /** Omit when the endpoint can't be listed (custom servers). */
  onReload?: () => void
  disabled?: boolean
  describedBy?: string
}) {
  const t = useTranslations("modelSettings")
  const loading = state === "loading"
  const query = value.trim().toLowerCase()
  // An exact match means the user is browsing, not searching: show the whole list.
  const visible = useMemo(() => {
    if (!query || models.some((item) => item.id.toLowerCase() === query)) return models
    return models.filter((item) => item.id.toLowerCase().includes(query) || item.label.toLowerCase().includes(query))
  }, [models, query])

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Autocomplete
        items={models}
        filteredItems={visible}
        value={value}
        onValueChange={onValueChange}
        itemToStringValue={(item: unknown) => (item as ModelOption).id}
        openOnInputClick={models.length > 0}
        autoHighlight={false}
      >
        <AutocompleteInput
          id={id}
          size="lg"
          required
          maxLength={160}
          disabled={disabled}
          showTrigger={models.length > 0}
          placeholder={models.length ? t("searchModels") : loading ? t("loadingModels") : t("modelPlaceholder")}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={describedBy}
          className={cn("font-mono text-sm", models.length > 0 && "pe-9")}
        />
        {models.length ? (
          <AutocompleteContent>
            <AutocompleteEmpty>{t("noMatchCustom")}</AutocompleteEmpty>
            <AutocompleteList>
              {(item: ModelOption) => (
                <AutocompleteItem key={item.id} value={item} className="min-h-9 justify-between gap-3">
                  <span className="grid min-w-0">
                    <span className="truncate">{item.label}</span>
                    {item.label !== item.id ? <span className="truncate font-mono text-xs text-muted-foreground">{item.id}</span> : null}
                  </span>
                  {item.id === value ? <CheckIcon className="text-foreground" aria-hidden /> : null}
                </AutocompleteItem>
              )}
            </AutocompleteList>
          </AutocompleteContent>
        ) : null}
      </Autocomplete>
      {onReload ? (
        <Tooltip>
          <TooltipTrigger render={<Button type="button" variant="outline" size="icon-lg" disabled={disabled || loading} onClick={onReload} aria-label={t("reloadModels")} />}>
            {loading ? <Spinner className="motion-reduce:animate-none" aria-hidden /> : <RefreshCwIcon aria-hidden />}
          </TooltipTrigger>
          <TooltipContent>{t("reloadModels")}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}
