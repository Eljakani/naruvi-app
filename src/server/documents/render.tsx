import "server-only"
import { Circle, Document, Font, Image, Line, Link, Page, Path, Polyline, Rect, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer"
import { PDF_ICONS, type PdfIcon } from "./pdf-icons"
import sharp from "sharp"
import { detectScripts, isRtl, type Script } from "@/lib/scripts"
import { readAsset } from "@/server/assets/store"
import { prepareFonts, type BaseFont } from "./fonts"
import type { LetterDocument } from "./letter"
import type { DesignTokens } from "@/lib/design"
import { documentText, resolveDesign, type CvDocument, type CvItem, type CvSection } from "./model"

// react-pdf only ships English hyphenation; applied to other languages it
// breaks words wrongly ("dé-ploiement"). No hyphenation is the safe default.
Font.registerHyphenationCallback((word) => [word])

const MUTED = "#4b5563"
const RULE = "#d1d5db"

/**
 * Designs come from tokens (src/lib/design.ts). Every layout is real text:
 * the sidebar layout is two flex columns, still read in order by ATS parsers.
 */
type Tokens = DesignTokens

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

const BULLETS: Record<Tokens["bullet"], string> = { dot: "•", dash: "–", arrow: "›", square: "▪", none: "" }

/** Light tint of a hex colour for bands and filled headings. */
function tint(hex: string, amount: number) {
  const n = Number.parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * amount)
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`
}

function makeStyles(t: Tokens, fontFamily: string[], headingFamily: string[], rtl: boolean) {
  const row = rtl ? "row-reverse" : "row"
  const align = rtl ? "right" : "left"
  const gap = (value: number) => value * t.spacing
  const headingColor = t.accentHeadings ? t.accent : t.ink
  const filled = t.headingStyle === "filled"
  const band = t.headerBand
  return StyleSheet.create({
    page: { paddingTop: band ? 0 : t.margin * 0.9, paddingBottom: t.margin * 0.9, paddingHorizontal: t.margin, fontFamily, fontSize: t.size, color: t.ink, lineHeight: t.lineHeight, textAlign: align },
    header: { flexDirection: t.headerAlign === "center" ? "column" : (t.photoPosition === "right") !== rtl ? "row-reverse" : "row", alignItems: "center", marginBottom: gap(12), ...(band ? { backgroundColor: tint(t.accent, 0.9), marginHorizontal: -t.margin, paddingHorizontal: t.margin, paddingTop: t.margin * 0.8, paddingBottom: gap(14) } : {}) },
    headerText: t.headerAlign === "center" ? { width: "100%", alignItems: "center" } : { flex: 1, alignItems: rtl ? "flex-end" : "flex-start" },
    photo: { width: t.photoSize, height: t.photoSize, borderRadius: t.photoShape === "circle" ? t.photoSize / 2 : t.photoShape === "rounded" ? t.photoSize / 5 : 0, objectFit: "cover", ...(t.headerAlign === "center" ? { marginBottom: 8 } : (t.photoPosition === "right") !== rtl ? { marginLeft: 12 } : { marginRight: 12 }) },
    name: { fontFamily: headingFamily, fontWeight: 700, fontSize: t.nameSize, lineHeight: 1.15, color: t.accentName ? t.accent : t.ink, textAlign: t.headerAlign === "center" ? "center" : align, textTransform: t.nameCase === "upper" ? "uppercase" : "none", letterSpacing: t.nameSpacing },
    headline: { fontSize: t.size + 1.4, color: MUTED, marginTop: 3, lineHeight: 1.2, textAlign: t.headerAlign === "center" ? "center" : align },
    contact: { flexDirection: t.contactLayout === "stacked" ? "column" : row, flexWrap: "wrap", marginTop: 5, fontSize: t.size - 1, color: MUTED, justifyContent: t.headerAlign === "center" ? "center" : "flex-start" },
    contactItem: t.headerAlign === "center" ? { marginHorizontal: 5 } : { marginRight: rtl ? 0 : 10, marginLeft: rtl ? 10 : 0 },
    summary: { marginBottom: gap(4), color: t.ink, lineHeight: t.lineHeight + 0.05, textAlign: t.textAlign === "justify" && !rtl ? "justify" : align },
    separator: { color: RULE, marginRight: rtl ? 0 : 10, marginLeft: rtl ? 10 : 0 },
    link: { color: t.accentLinks ? t.accent : MUTED, textDecoration: "none" },
    pageNumber: { position: "absolute", bottom: t.margin * 0.4, left: 0, right: 0, textAlign: "center", fontSize: t.size - 1.5, color: MUTED },
    tags: { flexDirection: row, flexWrap: "wrap", marginTop: 1.5 },
    tag: { fontSize: t.size - 1, borderWidth: 0.6, borderColor: tint(t.accent, 0.55), color: t.ink, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1, marginRight: 3, marginBottom: 3 },
    columns: { flexDirection: (t.sidebarSide === "left") !== rtl ? "row" : "row-reverse" },
    side: (() => {
      const onLeft = (t.sidebarSide === "left") !== rtl
      return {
        width: `${t.sidebarWidth}%`,
        ...(t.sidebarTint ? { backgroundColor: tint(t.accent, 0.93), padding: 10, borderRadius: 4 } : onLeft ? { paddingRight: 14, borderRightWidth: 0.6 } : { paddingLeft: 14, borderLeftWidth: 0.6 }),
        borderColor: RULE,
        ...(onLeft ? { marginRight: 14 } : { marginLeft: 14 }),
      }
    })(),
    main: { flex: 1 },
    section: { marginTop: gap(9) },
    sectionHead: {
      flexDirection: row, alignItems: "center", marginBottom: gap(5),
      paddingBottom: t.headingStyle === "rule" || t.headingStyle === "underline-accent" ? 3 : filled ? 2.5 : 0,
      paddingTop: filled ? 2.5 : 0, paddingHorizontal: filled ? 5 : 0,
      borderBottomWidth: t.headingStyle === "rule" ? 0.8 : t.headingStyle === "underline-accent" ? 1.4 : 0,
      borderBottomColor: t.headingStyle === "underline-accent" ? t.accent : RULE,
      ...(filled ? { backgroundColor: tint(t.accent, 0.88), borderRadius: 2 } : {}),
    },
    bar: { width: 3, height: t.size + 1.5, backgroundColor: t.accent, marginRight: rtl ? 0 : 6, marginLeft: rtl ? 6 : 0, borderRadius: 1 },
    sectionTitle: { fontFamily: headingFamily, fontWeight: 700, fontSize: t.size * t.headingSize, letterSpacing: t.headingCase === "upper" ? 0.8 : 0.1, textTransform: t.headingCase === "upper" ? "uppercase" : "none", color: headingColor },
    item: { marginBottom: gap(6) * t.itemSpacing },
    itemRow: { flexDirection: row, alignItems: "flex-start" },
    logo: { width: 18, height: 18, marginRight: rtl ? 0 : 7, marginLeft: rtl ? 7 : 0, marginTop: 1, objectFit: "contain" },
    itemBody: { flex: 1 },
    line: { flexDirection: row, justifyContent: "space-between" },
    itemTitle: { fontFamily: headingFamily, fontWeight: 700, fontSize: t.size + 0.4, flex: 1, paddingRight: rtl ? 0 : 8, paddingLeft: rtl ? 8 : 0 },
    orgText: { flex: 1, paddingRight: rtl ? 0 : 8, paddingLeft: rtl ? 8 : 0 },
    itemMeta: { fontSize: t.size - 1, color: MUTED },
    org: { fontSize: t.size - 0.6, color: MUTED, ...(t.orgItalic ? { fontStyle: "italic" as const } : {}) },
    bullets: { marginTop: 2 },
    bullet: { flexDirection: row, marginTop: t.bulletSpacing },
    dot: { width: t.bullet === "none" ? 0 : 9, color: t.accentBullets ? t.accent : MUTED, textAlign: align },
    bulletText: { flex: 1, textAlign: t.textAlign === "justify" && !rtl ? "justify" : align },
    group: { flexDirection: row, marginBottom: 2.5 },
    groupStacked: { marginBottom: gap(4) },
    groupLabel: { fontWeight: 700, width: 120 },
    groupValues: { flex: 1 },
  })
}

type Styles = ReturnType<typeof makeStyles>

/** A Lucide icon as PDF vector strokes (no fonts or images needed). */
function Icon({ name, size, color }: { name: PdfIcon; size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {PDF_ICONS[name].map(([tag, raw], index) => {
        const a = raw as Record<string, string>
        const stroke = { stroke: color, strokeWidth: 2, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
        if (tag === "path") return <Path key={index} d={a.d} {...stroke} />
        if (tag === "rect") return <Rect key={index} x={a.x} y={a.y} width={a.width} height={a.height} rx={a.rx} {...stroke} />
        if (tag === "circle") return <Circle key={index} cx={a.cx} cy={a.cy} r={a.r} {...stroke} />
        if (tag === "line") return <Line key={index} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} {...stroke} />
        if (tag === "polyline") return <Polyline key={index} points={a.points} {...stroke} />
        return null
      })}
    </Svg>
  )
}

const SECTION_ICON: Record<string, PdfIcon> = { experience: "experience", education: "education", project: "project", certification: "certification", skills: "skills", languages: "languages", achievement: "achievement" }

function Item({ item, logo, s, t, narrow = false }: { item: CvItem; logo: string | null; s: Styles; t: Tokens; narrow?: boolean }) {
  const bullets = item.bullets.filter((bullet) => bullet.included)
  // In a narrow column there is no room beside the title: dates go underneath.
  const below = narrow || t.datePosition === "below"
  return (
    <View style={s.item} wrap={bullets.length > 4}>
      <View style={s.itemRow}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
        {logo ? <Image src={logo} style={s.logo} /> : null}
        <View style={s.itemBody}>
          <View style={s.line}>
            <Text style={s.itemTitle}>{item.title}</Text>
            {item.dates && !below ? <Text style={s.itemMeta}>{item.dates}</Text> : null}
          </View>
          {item.organization || item.location || (below && item.dates) ? (
            <View style={s.line}>
              <Text style={[s.org, s.orgText]}>{[item.organization, below ? item.dates : ""].filter(Boolean).join(" · ")}</Text>
              {item.location ? <Text style={s.itemMeta}>{item.location}</Text> : null}
            </View>
          ) : null}
          {bullets.length ? (
            <View style={s.bullets}>
              {bullets.map((bullet) => (
                <View key={bullet.id} style={s.bullet} wrap={false}>
                  {t.bullet !== "none" ? <Text style={s.dot}>{BULLETS[t.bullet]}</Text> : null}
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

function Section({ section, logos, s, t, stacked = false }: { section: CvSection; logos: Map<string, string | null>; s: Styles; t: Tokens; stacked?: boolean }) {
  const items = section.items.filter((item) => item.included)
  if (!items.length && !section.groups.length) return null
  const head = (
    <View style={s.sectionHead}>
      {t.headingStyle === "bar" ? <View style={s.bar} /> : null}
      {t.sectionIcons && SECTION_ICON[section.kind] ? (
        <View style={{ marginRight: 5, marginLeft: 0 }}>
          <Icon name={SECTION_ICON[section.kind]} size={t.size * t.headingSize} color={t.accentHeadings ? t.accent : t.ink} />
        </View>
      ) : null}
      <Text style={s.sectionTitle}>{section.title}</Text>
    </View>
  )
  const values = (group: CvSection["groups"][number], color?: string) =>
    t.skillsStyle === "tags" ? (
      <View style={s.tags}>{group.values.map((value) => <Text key={value} style={s.tag}>{value}</Text>)}</View>
    ) : t.skillsStyle === "list" ? (
      <View>{group.values.map((value) => <Text key={value} style={color ? { color } : undefined}>{BULLETS[t.bullet === "none" ? "dot" : t.bullet]} {value}</Text>)}</View>
    ) : (
      <Text style={color ? { color } : undefined}>{group.values.join(" · ")}</Text>
    )
  const renderGroup = (group: CvSection["groups"][number], index: number) =>
        stacked || t.skillsStyle !== "inline" ? (
          <View key={index} style={s.groupStacked} wrap={false}>
            {group.label ? <Text style={{ fontWeight: 700 }}>{group.label}</Text> : null}
            {values(group, MUTED)}
          </View>
        ) : (
          <View key={index} style={s.group} wrap={false}>
            {group.label ? <Text style={s.groupLabel}>{group.label}</Text> : null}
            <Text style={s.groupValues}>{group.values.join(" · ")}</Text>
          </View>
        )
  const [first, ...rest] = items
  return (
    <View style={s.section}>
      {/* A heading never sits alone at the bottom of a page: it travels with its first entry. */}
      {first ? (
        <View wrap={false}>
          {head}
          <Item item={first} logo={stacked ? null : logos.get(first.entryId) ?? null} s={s} t={t} narrow={stacked} />
        </View>
      ) : (
        <View wrap={false}>
          {head}
          {section.groups[0] ? renderGroup(section.groups[0], 0) : null}
        </View>
      )}
      {rest.map((item) => (
        <Item key={item.entryId} item={item} logo={stacked ? null : logos.get(item.entryId) ?? null} s={s} t={t} narrow={stacked} />
      ))}
      {(first ? section.groups : section.groups.slice(1)).map(renderGroup)}
    </View>
  )
}

const RTL_LANGUAGES = ["ar", "he", "fa", "ur"]
const SIDE_KINDS = new Set(["skills", "languages", "certification"])

export async function renderCvPdf(doc: CvDocument): Promise<RenderResult> {
  const t = resolveDesign(doc)
  const scripts = detectScripts(documentText(doc), doc.language)
  const fonts = await prepareFonts(t.font as BaseFont, scripts, doc.language)
  const heading = t.headingFont !== "same" && t.headingFont !== t.font ? await prepareFonts(t.headingFont as BaseFont, scripts, doc.language) : fonts
  const rtl = isRtl(scripts) && RTL_LANGUAGES.includes(doc.language)
  const s = makeStyles(t, fonts.stack, heading.stack, rtl)
  const logos = new Map<string, string | null>()
  if (t.showLogos) {
    for (const section of doc.sections) {
      if (section.kind !== "experience" && section.kind !== "education") continue
      for (const item of section.items) logos.set(item.entryId, await pngData(item.logoPath, 18))
    }
  }
  const photo = doc.header.showPhoto ? await pngData(doc.header.photoPath, 56, t.photoShape !== "square") : null
  const contactFields = ([[doc.header.email, "mail"], [doc.header.phone, "phone"], [doc.header.location, "location"]] as const).filter(([value]) => value).map(([value, icon]) => ({ value, icon: icon as PdfIcon }))
  const visible = doc.sections.filter((section) => section.included)
  const side = t.layout === "sidebar" ? visible.filter((section) => SIDE_KINDS.has(section.kind)) : []
  const main = visible.filter((section) => !side.includes(section))

  const buffer = await renderToBuffer(
    <Document title={`${doc.header.name} — CV`} author={doc.header.name} language={doc.language} creator="Naruvi" producer="Naruvi">
      <Page size={t.pageSize} style={s.page}>
        {t.pageNumbers ? <Text style={s.pageNumber} fixed render={({ pageNumber, totalPages }) => (totalPages > 1 ? `${pageNumber} / ${totalPages}` : "")} /> : null}
        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
          {photo ? <Image src={photo} style={s.photo} /> : null}
          <View style={s.headerText}>
            <Text style={s.name}>{doc.header.name}</Text>
            {doc.header.headline ? <Text style={s.headline}>{doc.header.headline}</Text> : null}
            <View style={s.contact}>
              {[
                ...contactFields.map(({ value, icon }) => (
                  <View key={value} style={{ flexDirection: rtl ? "row-reverse" : "row", alignItems: "center" }}>
                    {t.contactIcons ? <View style={{ marginRight: rtl ? 0 : 3, marginLeft: rtl ? 3 : 0 }}><Icon name={icon} size={t.size - 1} color={t.accentLinks ? t.accent : MUTED} /></View> : null}
                    <Text>{value}</Text>
                  </View>
                )),
                ...doc.header.links.map((link) => (
                  <View key={link.url} style={{ flexDirection: rtl ? "row-reverse" : "row", alignItems: "center" }}>
                    {t.contactIcons ? <View style={{ marginRight: rtl ? 0 : 3, marginLeft: rtl ? 3 : 0 }}><Icon name={/github|gitlab|linkedin|twitter|x\.com/i.test(link.url) ? "link" : "globe"} size={t.size - 1} color={t.accentLinks ? t.accent : MUTED} /></View> : null}
                    <Link src={link.url} style={s.link}>
                      {t.linkStyle === "label" && link.label ? link.label : link.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                    </Link>
                  </View>
                )),
              ].map((node, index) => (
                <View key={index} style={{ flexDirection: rtl ? "row-reverse" : "row" }}>
                  {index > 0 && t.contactLayout === "inline" && t.contactSeparator !== "space" ? <Text style={s.separator}>{t.contactSeparator === "dot" ? "·" : "|"}</Text> : null}
                  <View style={t.contactLayout === "inline" ? s.contactItem : undefined}>{node}</View>
                </View>
              ))}
            </View>
          </View>
        </View>
        {doc.header.summary.trim() ? <Text style={s.summary}>{doc.header.summary.trim()}</Text> : null}
        {side.length ? (
          <View style={s.columns}>
            <View style={s.side}>
              {side.map((section) => (
                <Section key={section.id} section={section} logos={logos} s={s} t={t} stacked />
              ))}
            </View>
            <View style={s.main}>
              {main.map((section) => (
                <Section key={section.id} section={section} logos={logos} s={s} t={t} />
              ))}
            </View>
          </View>
        ) : (
          main.map((section) => <Section key={section.id} section={section} logos={logos} s={s} t={t} />)
        )}
      </Page>
    </Document>,
  )
  return { buffer, pages: countPages(buffer), missingScripts: fonts.missing }
}

export async function renderLetterPdf(doc: LetterDocument): Promise<RenderResult> {
  const t = resolveDesign(doc)
  const theme = { base: t.font as BaseFont, size: t.size, accentName: t.accentName, accentHeadings: t.accentHeadings, bar: t.headingStyle === "bar" || t.headingStyle === "filled" || t.headingStyle === "underline-accent" }
  const INK = t.ink
  const text = [doc.header.name, doc.subject, doc.salutation, ...doc.paragraphs.map((p) => p.text), ...doc.highlights.map((h) => h.text), doc.signoff].join("\n")
  const scripts = detectScripts(text, doc.language)
  const fonts = await prepareFonts(theme.base, scripts, doc.language)
  const rtl = isRtl(scripts) && RTL_LANGUAGES.includes(doc.language)
  const row = rtl ? "row-reverse" : "row"
  const s = StyleSheet.create({
    page: { paddingTop: 48, paddingBottom: 48, paddingHorizontal: Math.max(t.margin, 44), fontFamily: fonts.stack, fontSize: theme.size + 0.9, color: INK, lineHeight: 1.5, textAlign: rtl ? "right" : "left" },
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
