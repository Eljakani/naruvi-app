import Link from "next/link"
import { Suspense, type ReactNode } from "react"
import { connection } from "next/server"
import { BriefcaseBusinessIcon, CheckIcon, FileUpIcon, KeyRoundIcon, MailIcon, MessageSquareTextIcon, PaletteIcon, PencilIcon, PlusIcon, PuzzleIcon, SparklesIcon, UserRoundIcon, type LucideIcon } from "lucide-react"
import { AddJobDialog } from "@/components/jobs/job-reader"
import { ModelSettings } from "@/components/settings/model-settings"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { setupStatus } from "@/server/queries/setup"

export const metadata = { title: "Set up Naruvi" }

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
  const status = await setupStatus()
  const { steps } = status
  const next = (["security", "model", "profile", "look", "job"] as const).find((key) => !steps[key])
  return (
    <>
      <header className="grid gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{status.done === status.total ? "You’re all set" : "Set up Naruvi"}</h1>
          <p className="text-sm text-muted-foreground">A few minutes, once. Everything stays on this computer; you can change any of it later in Settings.</p>
        </div>
        <div className="flex items-center gap-3">
          <Progress value={(status.done / status.total) * 100} className="max-w-64" />
          <span className="text-sm text-muted-foreground tabular-nums">{status.done} of {status.total} done</span>
          {status.done === status.total ? (
            <Button size="sm" className="ml-auto" nativeButton={false} render={<Link href="/" />}>Go to your dashboard</Button>
          ) : null}
        </div>
      </header>

      <ol className="grid gap-3">
        <Step number={1} icon={KeyRoundIcon} title="Secure storage" done={steps.security} current={next === "security"} why="API keys and mailbox passwords are encrypted with a key that only this computer has.">
          <div className="grid gap-2 text-sm">
            <p>Run this once in the Naruvi folder, then restart Naruvi:</p>
            <pre className="w-fit rounded-md bg-muted px-3 py-2 text-xs">npm run settings:key</pre>
            <p className="text-xs text-muted-foreground">With Docker: <code>npm run settings:key -- .env</code>, then restart the containers. Back the key up: without it, saved keys must be entered again.</p>
          </div>
        </Step>

        <Step number={2} icon={SparklesIcon} title="Connect an AI model" done={steps.model} current={next === "model"} why="Choose a cloud provider, a gateway, or a local model. Naruvi uses it to analyze jobs, tailor CVs, and write letters.">
          {steps.security ? <ModelSettings initial={status.llm} /> : <p className="text-sm text-muted-foreground">Set up secure storage first, so your key can be saved encrypted.</p>}
        </Step>

        <Step number={3} icon={UserRoundIcon} title="Your profile" done={steps.profile} current={next === "profile"} why="Everything Naruvi writes comes from facts you’ve checked. Start from what you already have." note={status.verifiedFacts ? `${status.verifiedFacts} verified fact${status.verifiedFacts === 1 ? "" : "s"}` : undefined}>
          <div className="grid gap-2 sm:grid-cols-3">
            <Choice href="/profile/import" icon={FileUpIcon} title="Import" text="A PDF CV or your LinkedIn data export" />
            <Choice href="/profile/new" icon={MessageSquareTextIcon} title="Answer questions" text="Type or dictate, one question at a time" />
            <Choice href="/profile" icon={PencilIcon} title="By hand" text="Add your name, jobs and studies yourself" />
          </div>
          <p className="text-xs text-muted-foreground">Then verify the facts it found: only verified facts go into your documents.</p>
        </Step>

        <Step number={4} icon={PaletteIcon} title="Choose a look" done={steps.look} current={next === "look"} why="One theme styles your CV and cover letter as a pair. Atlas is used until you pick one.">
          <Button size="sm" variant="outline" className="w-fit" nativeButton={false} render={<Link href="/templates" />}>
            <PaletteIcon /> Pick a theme
          </Button>
        </Step>

        <Step number={5} icon={BriefcaseBusinessIcon} title="Add your first job" done={steps.job} current={next === "job"} why="Paste a link from any job board or careers page. Naruvi reads it, compares it with your profile and drafts your documents.">
          <AddJobDialog trigger={<Button size="sm" className="w-fit"><PlusIcon /> Add a job</Button>} />
        </Step>
      </ol>

      <section className="grid gap-2">
        <h2 className="text-sm font-medium">Optional, whenever you like</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice href="/integrations" icon={MailIcon} title={status.extras.email ? "Email connected" : "Connect your email"} text="Replies linked to applications, send from Naruvi" done={status.extras.email} />
          <Choice href="/integrations" icon={PuzzleIcon} title={status.extras.extension ? "Extension key created" : "Browser extension"} text="Save jobs and contacts from LinkedIn in one click" done={status.extras.extension} />
        </div>
      </section>
    </>
  )
}

function Step({ number, icon: Icon, title, why, done, current, note, children }: { number: number; icon: LucideIcon; title: string; why: string; done: boolean; current: boolean; note?: string; children: ReactNode }) {
  return (
    <li className={cn("grid gap-3 rounded-xl border p-4 transition-colors", current ? "border-foreground/20 bg-card shadow-sm" : "bg-card/50")}>
      <div className="flex items-start gap-3">
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums", done && "border-primary bg-primary text-primary-foreground")}>
          {done ? <CheckIcon className="size-4" /> : number}
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 className="flex flex-wrap items-center gap-2 font-medium">
            <Icon className="size-4 text-muted-foreground" /> {title}
            {done ? <Badge variant="secondary">Done</Badge> : current ? <Badge>Next</Badge> : null}
            {note ? <span className="text-xs font-normal text-muted-foreground">{note}</span> : null}
          </h2>
          <p className="text-sm text-muted-foreground">{why}</p>
        </div>
      </div>
      {!done || current ? <div className="grid gap-3 pl-10">{children}</div> : null}
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
