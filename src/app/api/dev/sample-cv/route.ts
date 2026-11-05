import { notFound } from "next/navigation"
import { cvDocument } from "@/server/documents/model"
import { renderCvPdf } from "@/server/documents/render"

/** Development only: render a multi-script sample CV to check fonts and templates. */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") notFound()
  const params = new URL(request.url).searchParams
  const template = params.get("template") ?? "classic"
  const language = params.get("lang") ?? "en"
  const doc = cvDocument.parse({
    version: 1,
    language,
    template,
    accent: params.get("accent") ?? "#0f766e",
    header: { name: "Łukasz Ivanov · محمد العلوي · 王小明", headline: "Multilingual sample — Пример · مثال · 示例 · 例 · 예시", email: "sample@example.org", phone: "+48 600 000 000", location: "Kraków · Москва · الرباط · 北京", links: [{ label: "Web", url: "https://example.org" }] },
    sections: [
      {
        id: "experience",
        kind: "experience",
        title: language === "ar" ? "الخبرة المهنية" : "Experience",
        items: [
          { entryId: "a", title: "Inżynier oprogramowania", organization: "Żabka Sp. z o.o.", dates: "2023 – obecnie", bullets: [{ id: "1", text: "Zwiększyłem wydajność o 40% — ąęłńóśźż.", source: "fact", factIds: ["x"] }] },
          { entryId: "b", title: "Инженер по безопасности", organization: "ООО «Пример»", dates: "2021 – 2023", bullets: [{ id: "2", text: "Сократил время реагирования на 30%.", source: "fact", factIds: ["x"] }, { id: "3", text: "Ελληνικά: μείωση κόστους 20%.", source: "fact", factIds: ["x"] }] },
          { entryId: "c", title: "مهندس برمجيات", organization: "شركة المثال", dates: "2019 – 2021", bullets: [{ id: "4", text: "خفضت زمن الاستجابة بنسبة 25٪.", source: "fact", factIds: ["x"] }, { id: "5", text: "हिंदी: लागत में 15% की कमी।", source: "fact", factIds: ["x"] }] },
          { entryId: "d", title: "软件工程师 · ソフトウェアエンジニア · 소프트웨어 엔지니어", organization: "示例公司", dates: "2017 – 2019", bullets: [{ id: "6", text: "将部署时间缩短了 50%。デプロイ時間を半減。배포 시간을 절반으로 줄임.", source: "fact", factIds: ["x"] }] },
        ],
      },
    ],
  })
  const { buffer, pages, missingScripts } = await renderCvPdf(doc)
  return new Response(new Uint8Array(buffer), { headers: { "content-type": "application/pdf", "x-pages": String(pages), "x-missing-scripts": missingScripts.join(",") } })
}
