import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { notFound } from "next/navigation"
import { locale as rootLocale } from "next/root-params"
import { NextIntlClientProvider } from "next-intl"
import { getTranslations } from "next-intl/server"
import { ThemeProvider } from "next-themes"
import { DirectionProvider } from "@base-ui/react/direction-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { direction, isLocale, locales } from "@/i18n/config"
import "@fontsource/ibm-plex-sans-arabic/400.css"
import "@fontsource/ibm-plex-sans-arabic/500.css"
import "@fontsource/ibm-plex-sans-arabic/600.css"
import "@fontsource/ibm-plex-sans-arabic/700.css"
import "../globals.css"

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta")
  return {
    applicationName: "Naruvi",
    title: { default: "Naruvi", template: "%s · Naruvi" },
    description: t("description"),
  }
}

export default async function RootLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await rootLocale()
  if (!isLocale(locale)) notFound()
  const dir = direction(locale)
  return (
    <html lang={locale} dir={dir} suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <NextIntlClientProvider>
          <DirectionProvider direction={dir}>
            {/* System theme on first visit; the header switch remembers a choice. */}
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
              <TooltipProvider>{children}</TooltipProvider>
              <Toaster dir={dir} />
            </ThemeProvider>
          </DirectionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
