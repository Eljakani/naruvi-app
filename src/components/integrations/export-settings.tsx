import { DownloadIcon, SheetIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

/** Spreadsheet and full-data exports, side by side. */
export function ExportSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SheetIcon className="size-4" /> Spreadsheets &amp; export
        </CardTitle>
        <CardDescription>Share your search with a coach or an employment agency, or keep your own records. Opens in Excel, Google Sheets, Numbers and LibreOffice.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        One row per application: company, role, stage, fit, date applied, next step, emails, tags and links. For everything (profile, documents, settings) use the full JSON export in Settings → Your data.
      </CardContent>
      <CardFooter className="border-t">
        <Button size="sm" variant="outline" nativeButton={false} render={<a href="/api/export/applications" download />}>
          <DownloadIcon /> Download applications (.csv)
        </Button>
      </CardFooter>
    </Card>
  )
}
