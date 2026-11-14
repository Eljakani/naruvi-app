import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Otter } from "@/components/naruvi/otter"
import { Suspense } from "react"
import { connection } from "next/server"
import { FileUpIcon, KeyRoundIcon, MailIcon, MessageSquareTextIcon, PaletteIcon, PencilIcon, PlusIcon, PuzzleIcon, ScanSearchIcon } from "lucide-react"
import { AddJobDialog } from "@/components/jobs/add-job-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert"
import { ModelSettings } from "@/components/settings/model-settings"
import { DecisionRecommendation } from "@/components/setup/decision-recommendation"
import { ProgressBadge, Reveal, SetupChoice, SetupSteps, type SetupStep } from "@/components/setup/setup-guide"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { setupStatus } from "@/server/queries/setup"
import { titled } from "@/i18n/metadata"
import { skipSetupAction } from "./actions"

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
  const { steps, extras } = status
  const complete = status.done === status.total
  const order = ["model", "profile", "job"] as const
  const next = order.findIndex((key) => !steps[key])
  const suggestDecision = !extras.decision && !status.choices.decisionDismissed
  const guide: SetupStep[] = [
    { key: "model", title: t("model"), short: t("modelShort"), why: t("modelWhy"), done: steps.model, bare: true, content: <ModelSettings initial={status.llm} /> },
    {
      key: "profile", title: t("profile"), short: t("profileShort"), why: t("profileWhy"), done: steps.profile,
      note: status.verifiedFacts ? t("facts", { count: status.verifiedFacts }) : undefined,
      content: (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <SetupChoice href="/profile/import" icon={<FileUpIcon />} title={t("import")} text={t("importHint")} />
            <SetupChoice href="/profile/new" icon={<MessageSquareTextIcon />} title={t("questions")} text={t("questionsHint")} />
            <SetupChoice href="/profile" icon={<PencilIcon />} title={t("manual")} text={t("manualHint")} />
          </div>
          <p className="text-xs text-muted-foreground">{t("verify")}</p>
        </>
      ),
    },
    {
      key: "job", title: t("job"), short: t("jobShort"), why: t("jobWhy"), done: steps.job,
      content: <AddJobDialog trigger={<Button size="sm" className="w-fit"><PlusIcon /> {t("addJob")}</Button>} />,
    },
  ]
  return (
    <>
      <Reveal>
        <header className="grid gap-3">
          <div className="flex items-end gap-4">
            <Otter pose={complete ? "celebrating-progress" : "concept"} height={104} className="-mb-1" priority />
            <div className="grid gap-1 pb-1">
              <h1 className="text-2xl font-semibold tracking-tight text-balance">{complete ? t("complete") : t("welcome")}</h1>
              <p className="text-sm text-pretty text-muted-foreground">{t("intro")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ProgressBadge complete={complete}>{t("progress", { done: status.done, total: status.total })}</ProgressBadge>
            {complete ? null : <p className="min-w-0 flex-1 basis-56 text-xs text-muted-foreground">{t("skipHint")}</p>}
            {complete || status.choices.skipped ? (
              <Button size="sm" variant={complete ? "default" : "outline"} className="ms-auto" nativeButton={false} render={<Link href="/" />}>{t("dashboard")}</Button>
            ) : (
              <form action={skipSetupAction} className="ms-auto">
                <Button size="sm" variant="outline" type="submit">{t("skip")}</Button>
              </form>
            )}
          </div>
        </header>
      </Reveal>

      {status.security ? null : (
        <Reveal order={1}>
          <Alert variant="warning" role="status">
            <KeyRoundIcon aria-hidden />
            <AlertTitle>{t("security")}</AlertTitle>
            <AlertDescription>
              <p>{t("securityWhy")} {t("runKey")}</p>
              <pre dir="ltr" className="max-w-full overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs text-foreground">npm run settings:key</pre>
              <p className="text-xs">{t.rich("docker", { code: (chunks) => <code dir="ltr">{chunks}</code> })}</p>
            </AlertDescription>
          </Alert>
        </Reveal>
      )}

      <Reveal order={2}>
        <SetupSteps steps={guide} initial={next === -1 ? 1 : next + 1} />
      </Reveal>

      {suggestDecision ? (
        <Reveal order={3}>
          <DecisionRecommendation canStoreKeys={status.security} llmOnOpenRouter={status.llmOnOpenRouter} />
        </Reveal>
      ) : null}

      <Reveal order={4}>
        <section className="grid gap-2">
          <h2 className="text-sm font-medium">{t("optional")}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {suggestDecision ? null : <SetupChoice href="/integrations#decision-model" icon={<ScanSearchIcon />} title={extras.decision ? t("decisionConnected") : t("decision")} text={t("decisionHint")} done={extras.decision} />}
            <SetupChoice href="/templates" icon={<PaletteIcon />} title={extras.look ? t("lookChosen") : t("look")} text={t("lookWhy")} done={extras.look} />
            <SetupChoice href="/integrations" icon={<MailIcon />} title={extras.email ? t("emailConnected") : t("emailConnect")} text={t("emailHint")} done={extras.email} />
            <SetupChoice href="/integrations" icon={<PuzzleIcon />} title={extras.extension ? t("extensionCreated") : t("extension")} text={t("extensionHint")} done={extras.extension} />
          </div>
        </section>
      </Reveal>
    </>
  )
}
