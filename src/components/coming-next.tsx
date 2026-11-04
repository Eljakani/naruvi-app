import { navItems } from "@/components/nav"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/** Honest placeholder for sections that land in a later build step. */
export function ComingNext({ url, step, bullets }: { url: string; step: string; bullets: string[] }) {
  const item = navItems.find((nav) => nav.url === url)!
  return (
    <>
      <PageHeader title={item.title} description={item.description} />
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <item.icon className="size-4" /> Arrives in {step}
          </CardTitle>
          <CardDescription>What this section will do:</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  )
}
