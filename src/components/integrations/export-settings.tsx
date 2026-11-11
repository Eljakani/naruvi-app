import { DownloadIcon, SheetIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useTranslations } from "next-intl"

/** Spreadsheet and full-data exports, side by side. */
export function ExportSettings() {
  const t = useTranslations("integrations.export")
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SheetIcon className="size-4" /> {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {t("body")}
      </CardContent>
      <CardFooter className="border-t">
        <Button size="sm" variant="outline" nativeButton={false} render={<a href="/api/export/applications" download />}>
          <DownloadIcon /> {t("download")}
        </Button>
      </CardFooter>
    </Card>
  )
}
