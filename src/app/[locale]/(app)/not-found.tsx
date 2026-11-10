import Link from "next/link"
import { OtterEmpty } from "@/components/naruvi/otter"
import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"

export default function NotFound() {
  const t = useTranslations("notFound")
  return (
    <OtterEmpty
      pose="finding-opportunity"
      title={t("title")}
      className="mt-10"
      action={
        <>
          <Button nativeButton={false} render={<Link href="/" />}>{t("dashboard")}</Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/applications" />}>{t("applications")}</Button>
        </>
      }
    >
      {t("body")}
    </OtterEmpty>
  )
}
