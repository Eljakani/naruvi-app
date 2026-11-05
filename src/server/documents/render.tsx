import "server-only"
import { Document, Font, Image, Link, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer"
import sharp from "sharp"
import { detectScripts, isRtl, type Script } from "@/lib/scripts"
import { readAsset } from "@/server/assets/store"
import { prepareFonts, type BaseFont } from "./fonts"
import type { LetterDocument } from "./letter"
import { documentText, type CvDocument, type CvItem, type CvSection, type TemplateId } from "./model"

// react-pdf only ships English hyphenation; applied to other languages it
// breaks words wrongly ("dé-ploiement"). No hyphenation is the safe default.
Font.registerHyphenationCallback((word) => [word])

const INK = "#111827"
const MUTED = "#4b5563"
const RULE = "#d1d5db"

/**
 * Templates differ in typography and accents only; layout stays a single
 * column of real text so applicant-tracking systems read every template.
 */
type Theme = { base: BaseFont; accentName: boolean; accentHeadings: boolean; headingCase: "upper" | "none"; size: number; italic: boolean; rule: boolean; bar: boolean }

const THEMES: Record<TemplateId, Theme> = {
  classic: { base: "sans", accentName: false, accentHeadings: false, headingCase: "upper", size: 9.6, italic: true, rule: true, bar: false },
  modern: { base: "inter", accentName: true, accentHeadings: true, headingCase: "none", size: 9.5, italic: false, rule: false, bar: true },
  serif: { base: "serif", accentName: false, accentHeadings: false, headingCase: "upper", size: 10, italic: true, rule: true, bar: false },
}

export type RenderResult = { buffer: Buffer; pages: number; missingScripts: Script[] }

function countPages(buffer: Buffer) {
  return (buffer.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length
}

/** react-pdf reads PNG/JPEG only: convert stored assets once per render. */
async function pngData(path: string | null, size: number, round = false) {
  if (!path) return null
  const asset = await readAsset(path)
  if (!asset) return null
  try {
    let image = sharp(asset.buffer, { density: 300 }).resize(size * 4, size * 4, { fit: round ? "cover" : "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    if (round) image = image.flatten({ background: "#ffffff" })
    return `data:image/png;base64,${(await image.png().toBuffer()).toString("base64")}`
  } catch {
    return null
  }
}

function makeStyles(theme: Theme, fontFamily: string[], accent: string, rtl: boolean) {
  const row = rtl ? "row-reverse" : "row"
  const align = rtl ? "right" : "left"
  return StyleSheet.create({
    page: { paddingTop: 34, paddingBottom: 34, paddingHorizontal: 40, fontFamily, fontSize: theme.size, color: INK, lineHeight: 1.38, textAlign: align },
    header: { flexDirection: row, alignItems: "center", marginBottom: 12 },
    photo: { width: 54, height: 54, borderRadius: 27, marginRight: rtl ? 0 : 12, marginLeft: rtl ? 12 : 0, objectFit: "cover" },
    name: { fontWeight: 700, fontSize: 20, lineHeight: 1.15, color: theme.accentName ? accent : INK },
    headline: { fontSize: theme.size + 1.4, color: MUTED, marginTop: 3, lineHeight: 1.2 },
    contact: { flexDirection: row, flexWrap: "wrap", marginTop: 5, fontSize: theme.size - 1, color: MUTED },
    contactItem: { marginRight: rtl ? 0 : 10, marginLeft: rtl ? 10 : 0 },
    section: { marginTop: 9 },
    sectionHead: { flexDirection: row, alignItems: "center", marginBottom: 5, paddingBottom: theme.rule ? 3 : 0, borderBottomWidth: theme.rule ? 0.8 : 0, borderBottomColor: RULE },
    bar: { width: 3, height: 11, backgroundColor: accent, marginRight: rtl ? 0 : 6, marginLeft: rtl ? 6 : 0, borderRadius: 1 },
    sectionTitle: { fontWeight: 700, fontSize: theme.size + 1, letterSpacing: theme.headingCase === "upper" ? 0.8 : 0.1, textTransform: theme.headingCase === "upper" ? "uppercase" : "none", color: theme.accentHeadings ? accent : INK },
    item: { marginBottom: 6 },
    itemRow: { flexDirection: row, alignItems: "flex-start" },
    logo: { width: 18, height: 18, marginRight: rtl ? 0 : 7, marginLeft: rtl ? 7 : 0, marginTop: 1, objectFit: "contain" },
    itemBody: { flex: 1 },
    line: { flexDirection: row, justifyContent: "space-between" },
    itemTitle: { fontWeight: 700, fontSize: theme.size + 0.4 },
    itemMeta: { fontSize: theme.size - 1, color: MUTED },
    org: { fontSize: theme.size - 0.6, color: MUTED, ...(theme.italic ? { fontStyle: "italic" as const } : {}) },
    bullets: { marginTop: 2 },
    bullet: { flexDirection: row, marginTop: 1.5 },
    dot: { width: 9, color: theme.accentHeadings ? accent : MUTED, textAlign: align },
    bulletText: { flex: 1 },
    group: { flexDirection: row, marginBottom: 2.5 },
    groupLabel: { fontWeight: 700, width: 120 },
    groupValues: { flex: 1 },
  })
}

type Styles = ReturnType<typeof makeStyles>

function Item({ item, logo, s }: { item: CvItem; logo: string | null; s: Styles }) {
  const bullets = item.bullets.filter((bullet) => bullet.included)
  return (
    <View style={s.item} wrap={bullets.length > 4}>
      <View style={s.itemRow}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
        {logo ? <Image src={logo} style={s.logo} /> : null}
        <View style={s.itemBody}>
          <View style={s.line}>
            <Text style={s.itemTitle}>{item.title}</Text>
            {item.dates ? <Text style={s.itemMeta}>{item.dates}</Text> : null}
          </View>
          {item.organization || item.location ? (
            <View style={s.line}>
              <Text style={s.org}>{item.organization}</Text>
              {item.location ? <Text style={s.itemMeta}>{item.location}</Text> : null}
            </View>
          ) : null}
          {bullets.length ? (
            <View style={s.bullets}>
              {bullets.map((bullet) => (
                <View key={bullet.id} style={s.bullet} wrap={false}>
                  <Text style={s.dot}>•</Text>
                  <Text style={s.bulletText}>{bullet.text}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  )
}

function Section({ section, logos, s, theme }: { section: CvSection; logos: Map<string, string | null>; s: Styles; theme: Theme }) {
  const items = section.items.filter((item) => item.included)
  if (!items.length && !section.groups.length) return null
  return (
    <View style={s.section}>
      <View style={s.sectionHead} minPresenceAhead={40}>
        {theme.bar ? <View style={s.bar} /> : null}
        <Text style={s.sectionTitle}>{section.title}</Text>
      </View>
      {items.map((item) => (
        <Item key={item.entryId} item={item} logo={logos.get(item.entryId) ?? null} s={s} />
      ))}
      {section.groups.map((group, index) => (
        <View key={index} style={s.group} wrap={false}>
          {group.label ? <Text style={s.groupLabel}>{group.label}</Text> : null}
          <Text style={s.groupValues}>{group.values.join(" · ")}</Text>
        </View>
      ))}
    </View>
  )
}

const RTL_LANGUAGES = ["ar", "he", "fa", "ur"]

export async function renderCvPdf(doc: CvDocument): Promise<RenderResult> {
  const theme = THEMES[doc.template] ?? THEMES.classic
  const scripts = detectScripts(documentText(doc), doc.language)
  const fonts = await prepareFonts(theme.base, scripts, doc.language)
  const s = makeStyles(theme, fonts.stack, doc.accent, isRtl(scripts) && RTL_LANGUAGES.includes(doc.language))
  const logos = new Map<string, string | null>()
  for (const section of doc.sections) {
    if (section.kind !== "experience" && section.kind !== "education") continue
    for (const item of section.items) logos.set(item.entryId, await pngData(item.logoPath, 18))
  }
  const photo = doc.header.showPhoto ? await pngData(doc.header.photoPath, 54, true) : null
  const contact = [doc.header.email, doc.header.phone, doc.header.location].filter(Boolean)

  const buffer = await renderToBuffer(
    <Document title={`${doc.header.name} — CV`} author={doc.header.name} language={doc.language} creator="Naruvi" producer="Naruvi">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
          {photo ? <Image src={photo} style={s.photo} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{doc.header.name}</Text>
            {doc.header.headline ? <Text style={s.headline}>{doc.header.headline}</Text> : null}
            <View style={s.contact}>
              {contact.map((value) => (
                <Text key={value} style={s.contactItem}>
                  {value}
                </Text>
              ))}
              {doc.header.links.map((link) => (
                <Link key={link.url} src={link.url} style={[s.contactItem, { color: MUTED, textDecoration: "none" }]}>
                  {link.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                </Link>
              ))}
            </View>
          </View>
        </View>
        {doc.sections
          .filter((section) => section.included)
          .map((section) => (
            <Section key={section.id} section={section} logos={logos} s={s} theme={theme} />
          ))}
      </Page>
    </Document>,
  )
  return { buffer, pages: countPages(buffer), missingScripts: fonts.missing }
}

export async function renderLetterPdf(doc: LetterDocument): Promise<RenderResult> {
  const theme = THEMES[doc.template] ?? THEMES.classic
  const text = [doc.header.name, doc.subject, doc.salutation, ...doc.paragraphs.map((p) => p.text), ...doc.highlights.map((h) => h.text), doc.signoff].join("\n")
  const scripts = detectScripts(text, doc.language)
  const fonts = await prepareFonts(theme.base, scripts, doc.language)
  const rtl = isRtl(scripts) && RTL_LANGUAGES.includes(doc.language)
  const row = rtl ? "row-reverse" : "row"
  const s = StyleSheet.create({
    page: { paddingTop: 48, paddingBottom: 48, paddingHorizontal: 56, fontFamily: fonts.stack, fontSize: theme.size + 0.9, color: INK, lineHeight: 1.5, textAlign: rtl ? "right" : "left" },
    name: { fontWeight: 700, fontSize: 17, lineHeight: 1.15, color: theme.accentName ? doc.accent : INK },
    contact: { flexDirection: row, flexWrap: "wrap", marginTop: 4, fontSize: theme.size - 0.8, color: MUTED },
    rule: { borderBottomWidth: theme.bar ? 2 : 0.8, borderBottomColor: theme.bar ? doc.accent : RULE, marginTop: 12, marginBottom: 18 },
    meta: { flexDirection: row, justifyContent: "space-between", marginBottom: 16 },
    strong: { fontWeight: 700 },
    muted: { color: MUTED },
    subject: { fontWeight: 700, marginBottom: 14, color: theme.accentHeadings ? doc.accent : INK },
    paragraph: { marginBottom: 10, textAlign: rtl ? "right" : "justify" },
    highlight: { flexDirection: row, marginTop: 3 },
    dot: { width: 12, color: theme.accentHeadings ? doc.accent : MUTED },
  })
  const contact = [doc.header.email, doc.header.phone, doc.header.location, ...doc.header.links.map((link) => link.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))].filter(Boolean)
  const highlights = doc.highlights.filter((h) => h.included)
  const buffer = await renderToBuffer(
    <Document title={`${doc.header.name} — ${doc.subject}`} author={doc.header.name} language={doc.language} creator="Naruvi" producer="Naruvi">
      <Page size="A4" style={s.page}>
        <Text style={s.name}>{doc.header.name}</Text>
        <View style={s.contact}>
          {contact.map((value) => (
            <Text key={value} style={{ marginRight: 10 }}>
              {value}
            </Text>
          ))}
        </View>
        <View style={s.rule} />
        <View style={s.meta}>
          <View>
            <Text style={s.strong}>{doc.recipient.company}</Text>
            {doc.recipient.location ? <Text style={s.muted}>{doc.recipient.location}</Text> : null}
          </View>
          <Text style={s.muted}>{doc.date}</Text>
        </View>
        <Text style={s.subject}>{doc.subject}</Text>
        <Text style={s.paragraph}>{doc.salutation}</Text>
        {doc.paragraphs
          .filter((paragraph) => paragraph.included)
          .map((paragraph) =>
            paragraph.kind === "highlights" ? (
              highlights.length ? (
                <View key={paragraph.id} style={{ marginBottom: 10 }} wrap={false}>
                  <Text>{doc.highlightsIntro}</Text>
                  {highlights.map((highlight) => (
                    <View key={highlight.id} style={s.highlight}>
                      <Text style={s.dot}>•</Text>
                      <Text style={{ flex: 1 }}>
                        {highlight.text}
                        {highlight.organization ? <Text style={s.muted}> ({highlight.organization})</Text> : null}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null
            ) : paragraph.text.trim() ? (
              <Text key={paragraph.id} style={s.paragraph}>
                {paragraph.text}
              </Text>
            ) : null,
          )}
        <Text style={{ marginTop: 6 }}>{doc.signoff}</Text>
        <Text style={[s.strong, { marginTop: 18 }]}>{doc.header.name}</Text>
      </Page>
    </Document>,
  )
  return { buffer, pages: countPages(buffer), missingScripts: fonts.missing }
}
