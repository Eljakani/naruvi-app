import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Otter } from "@/components/naruvi/otter"
import { Suspense, type ReactNode } from "react"
import { connection } from "next/server"
import { BriefcaseBusinessIcon, CheckIcon, FileUpIcon, KeyRoundIcon, MailIcon, MessageSquareTextIcon, PaletteIcon, PencilIcon, PlusIcon, PuzzleIcon, SparklesIcon, UserRoundIcon, type LucideIcon } from "lucide-react"
import { AddJobDialog } from "@/components/jobs/add-job-dialog"
import { ModelSettings } from "@/components/settings/model-settings"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { setupStatus } from "@/server/queries/setup"
import { titled } from "@/i18n/metadata"

export const generateMetadata = titled("setup")

export default function SetupPage() {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <Setup />
      </Suspense>
    </div>
  )
}

async function Setup() {
  await connection()
  const [status, t] = await Promise.all([setupStatus(), getTranslations("setup")])
  const { steps } = status
  const next = (["security", "model", "profile", "look", "job"] as const).find((key) => !steps[key])
  return (
    <>
      <header className="grid gap-3">
        <div className="flex items-end gap-4">
          <Otter pose={status.done === status.total ? "celebrating-progress" : "concept"} height={104} className="-mb-1" priority />
          <div className="grid gap-1 pb-1">
            <h1 className="text-2xl font-semibold tracking-tight">{status.done === status.total ? t("complete") : t("welcome")}</h1>
            <p className="text-sm text-pretty text-muted-foreground">{t("intro")}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Progress value={(status.done / status.total) * 100} className="max-w-64" />
          <span className="text-sm text-muted-foreground tabular-nums">{t("progress", { done: status.done, total: status.total })}</span>
          {status.done === status.total ? (
            <Button size="sm" className="ms-auto" nativeButton={false} render={<Link href="/" />}>{t("dashboard")}</Button>
          ) : null}
        </div>
      </header>

      <ol className="grid gap-3">
        <Step number={1} icon={KeyRoundIcon} title={t("security")} done={steps.security} current={next === "security"} why={t("securityWhy")}>
          <div className="grid gap-2 text-sm">
            <p>{t("runKey")}</p>
            <pre className="w-fit rounded-md bg-muted px-3 py-2 text-xs">npm run settings:key</pre>
            <p className="text-xs text-muted-foreground">{t.rich("docker", { code: (chunks) => <code>{chunks}</code> })}</p>
          </div>
        </Step>

        <Step number={2} icon={SparklesIcon} title={t("model")} done={steps.model} current={next === "model"} why={t("modelWhy")}>
          {steps.security ? <ModelSettings initial={status.llm} /> : <p className="text-sm text-muted-foreground">{t("securityFirst")}</p>}
        </Step>

        <Step number={3} icon={UserRoundIcon} title={t("profile")} done={steps.profile} current={next === "profile"} why={t("profileWhy")} note={status.verifiedFacts ? t("facts", { count: status.verifiedFacts }) : undefined}>
          <div className="grid gap-2 sm:grid-cols-3">
            <Choice href="/profile/import" icon={FileUpIcon} title={t("import")} text={t("importHint")} />
            <Choice href="/profile/new" icon={MessageSquareTextIcon} title={t("questions")} text={t("questionsHint")} />
            <Choice href="/profile" icon={PencilIcon} title={t("manual")} text={t("manualHint")} />
          </div>
          <p className="text-xs text-muted-foreground">{t("verify")}</p>
        </Step>

        <Step number={4} icon={PaletteIcon} title={t("look")} done={steps.look} current={next === "look"} why={t("lookWhy")}>
          <Button size="sm" variant="outline" className="w-fit" nativeButton={false} render={<Link href="/templates" />}>
            <PaletteIcon /> {t("theme")}
          </Button>
        </Step>

        <Step number={5} icon={BriefcaseBusinessIcon} title={t("job")} done={steps.job} current={next === "job"} why={t("jobWhy")}>
          <AddJobDialog trigger={<Button size="sm" className="w-fit"><PlusIcon /> {t("addJob")}</Button>} />
        </Step>
      </ol>

      <section className="grid gap-2">
        <h2 className="text-sm font-medium">{t("optional")}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice href="/integrations" icon={MailIcon} title={status.extras.email ? t("emailConnected") : t("emailConnect")} text={t("emailHint")} done={status.extras.email} />
          <Choice href="/integrations" icon={PuzzleIcon} title={status.extras.extension ? t("extensionCreated") : t("extension")} text={t("extensionHint")} done={status.extras.extension} />
        </div>
      </section>
    </>
  )
}

async function Step({ number, icon: Icon, title, why, done, current, note, children }: { number: number; icon: LucideIcon; title: string; why: string; done: boolean; current: boolean; note?: string; children: ReactNode }) {
  const t = await getTranslations("setup")
  return (
    <li className={cn("grid gap-3 rounded-xl border p-4 transition-colors", current ? "border-foreground/20 bg-card shadow-sm" : "bg-card/50")}>
      <div className="flex items-start gap-3">
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums", done && "border-primary bg-primary text-primary-foreground")}>
          {done ? <CheckIcon className="size-4" /> : number}
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 className="flex flex-wrap items-center gap-2 font-medium">
            <Icon className="size-4 text-muted-foreground" /> {title}
            {done ? <Badge variant="secondary">{t("done")}</Badge> : current ? <Badge>{t("next")}</Badge> : null}
            {note ? <span className="text-xs font-normal text-muted-foreground">{note}</span> : null}
          </h2>
          <p className="text-sm text-muted-foreground">{why}</p>
        </div>
      </div>
      {!done || current ? <div className="grid gap-3 ps-10">{children}</div> : null}
    </li>
  )
}

function Choice({ href, icon: Icon, title, text, done }: { href: string; icon: LucideIcon; title: string; text: string; done?: boolean }) {
  return (
    <Link href={href} className="group grid gap-1 rounded-lg border bg-background p-3 text-sm transition-colors hover:bg-muted/40">
      <span className="flex items-center gap-2 font-medium">
        {done ? <CheckIcon className="size-4 text-primary" /> : <Icon className="size-4 text-muted-foreground" />} {title}
      </span>
      <span className="text-xs text-muted-foreground">{text}</span>
    </Link>
  )
}
