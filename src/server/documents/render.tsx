import "server-only"
import { Document, Font, Image, Link, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer"
import sharp from "sharp"
import { readAsset } from "@/server/assets/store"
import type { CvDocument, CvItem, CvSection } from "./model"

/**
 * "Classic" template: one column, real text, standard headings — readable by
 * people and applicant-tracking systems alike. Built-in Helvetica covers Latin
 * scripts; other scripts need a registered font (see docs/adr/0001).
 */
// react-pdf only ships English hyphenation; applied to other languages it
// breaks words wrongly ("dé-ploiement"). No hyphenation is the safe default.
Font.registerHyphenationCallback((word) => [word])

const INK = "#111827"
const MUTED = "#4b5563"
const RULE = "#d1d5db"

const styles = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 34, paddingHorizontal: 40, fontFamily: "Helvetica", fontSize: 9.6, color: INK, lineHeight: 1.35 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  photo: { width: 54, height: 54, borderRadius: 27, marginRight: 12, objectFit: "cover" },
  name: { fontFamily: "Helvetica-Bold", fontSize: 19, letterSpacing: 0.2, lineHeight: 1.15 },
  headline: { fontSize: 11, color: MUTED, marginTop: 3, lineHeight: 1.2 },
  contact: { flexDirection: "row", flexWrap: "wrap", marginTop: 5, fontSize: 8.6, color: MUTED },
  contactItem: { marginRight: 10 },
  section: { marginTop: 9 },
  sectionTitle: { fontFamily: "Helvetica-Bold", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.8, paddingBottom: 3, marginBottom: 5, borderBottomWidth: 0.8, borderBottomColor: RULE },
  item: { marginBottom: 6 },
  itemRow: { flexDirection: "row", alignItems: "flex-start" },
  logo: { width: 18, height: 18, marginRight: 7, marginTop: 1, objectFit: "contain" },
  itemBody: { flex: 1 },
  line: { flexDirection: "row", justifyContent: "space-between" },
  itemTitle: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  itemMeta: { fontSize: 8.6, color: MUTED },
  org: { fontFamily: "Helvetica-Oblique", fontSize: 9, color: MUTED },
  bullets: { marginTop: 2 },
  bullet: { flexDirection: "row", marginTop: 1.5 },
  dot: { width: 9, color: MUTED },
  bulletText: { flex: 1 },
  group: { flexDirection: "row", marginBottom: 2.5 },
  groupLabel: { fontFamily: "Helvetica-Bold", width: 120 },
  groupValues: { flex: 1 },
})

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

function Item({ item, logo }: { item: CvItem; logo: string | null }) {
  const bullets = item.bullets.filter((bullet) => bullet.included)
  return (
    <View style={styles.item} wrap={bullets.length > 4}>
      <View style={styles.itemRow}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
        {logo ? <Image src={logo} style={styles.logo} /> : null}
        <View style={styles.itemBody}>
          <View style={styles.line}>
            <Text style={styles.itemTitle}>{item.title}</Text>
            {item.dates ? <Text style={styles.itemMeta}>{item.dates}</Text> : null}
          </View>
          {item.organization || item.location ? (
            <View style={styles.line}>
              <Text style={styles.org}>{item.organization}</Text>
              {item.location ? <Text style={styles.itemMeta}>{item.location}</Text> : null}
            </View>
          ) : null}
          {bullets.length ? (
            <View style={styles.bullets}>
              {bullets.map((bullet) => (
                <View key={bullet.id} style={styles.bullet} wrap={false}>
                  <Text style={styles.dot}>•</Text>
                  <Text style={styles.bulletText}>{bullet.text}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  )
}

function Section({ section, logos }: { section: CvSection; logos: Map<string, string | null> }) {
  const items = section.items.filter((item) => item.included)
  if (!items.length && !section.groups.length) return null
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} minPresenceAhead={40}>
        {section.title}
      </Text>
      {items.map((item) => (
        <Item key={item.entryId} item={item} logo={logos.get(item.entryId) ?? null} />
      ))}
      {section.groups.map((group, index) => (
        <View key={index} style={styles.group} wrap={false}>
          {group.label ? <Text style={styles.groupLabel}>{group.label}</Text> : null}
          <Text style={styles.groupValues}>{group.values.join(" · ")}</Text>
        </View>
      ))}
    </View>
  )
}

export async function renderCvPdf(doc: CvDocument): Promise<{ buffer: Buffer; pages: number }> {
  const logos = new Map<string, string | null>()
  for (const section of doc.sections) {
    if (section.kind !== "experience" && section.kind !== "education") continue
    for (const item of section.items) logos.set(item.entryId, await pngData(item.logoPath, 18))
  }
  const photo = doc.header.showPhoto ? await pngData(doc.header.photoPath, 54, true) : null
  const contact = [doc.header.email, doc.header.phone, doc.header.location].filter(Boolean)

  const buffer = await renderToBuffer(
    <Document title={`${doc.header.name} — CV`} author={doc.header.name} language={doc.language} creator="CareerBuddy" producer="CareerBuddy">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
          {photo ? <Image src={photo} style={styles.photo} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{doc.header.name}</Text>
            {doc.header.headline ? <Text style={styles.headline}>{doc.header.headline}</Text> : null}
            <View style={styles.contact}>
              {contact.map((value) => (
                <Text key={value} style={styles.contactItem}>
                  {value}
                </Text>
              ))}
              {doc.header.links.map((link) => (
                <Link key={link.url} src={link.url} style={[styles.contactItem, { color: MUTED, textDecoration: "none" }]}>
                  {link.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                </Link>
              ))}
            </View>
          </View>
        </View>
        {doc.sections
          .filter((section) => section.included)
          .map((section) => (
            <Section key={section.id} section={section} logos={logos} />
          ))}
      </Page>
    </Document>,
  )
  const pages = (buffer.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length
  return { buffer, pages }
}

const letterStyles = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 48, paddingHorizontal: 56, fontFamily: "Helvetica", fontSize: 10.5, color: INK, lineHeight: 1.5 },
  name: { fontFamily: "Helvetica-Bold", fontSize: 16, lineHeight: 1.15 },
  contact: { flexDirection: "row", flexWrap: "wrap", marginTop: 4, fontSize: 8.8, color: MUTED },
  rule: { borderBottomWidth: 0.8, borderBottomColor: RULE, marginTop: 12, marginBottom: 18 },
  meta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  recipient: { fontFamily: "Helvetica-Bold" },
  date: { color: MUTED },
  subject: { fontFamily: "Helvetica-Bold", marginBottom: 14 },
  paragraph: { marginBottom: 10, textAlign: "justify" },
  highlights: { marginBottom: 10 },
  highlight: { flexDirection: "row", marginTop: 3 },
  dot: { width: 12, color: MUTED },
  highlightText: { flex: 1 },
  org: { color: MUTED },
  signoff: { marginTop: 6 },
  signature: { fontFamily: "Helvetica-Bold", marginTop: 18 },
})

export async function renderLetterPdf(doc: import("./letter").LetterDocument): Promise<{ buffer: Buffer; pages: number }> {
  const contact = [doc.header.email, doc.header.phone, doc.header.location].filter(Boolean)
  const highlights = doc.highlights.filter((h) => h.included)
  const buffer = await renderToBuffer(
    <Document title={`${doc.header.name} — ${doc.subject}`} author={doc.header.name} language={doc.language} creator="CareerBuddy" producer="CareerBuddy">
      <Page size="A4" style={letterStyles.page}>
        <Text style={letterStyles.name}>{doc.header.name}</Text>
        <View style={letterStyles.contact}>
          {[...contact, ...doc.header.links.map((link) => link.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))].map((value) => (
            <Text key={value} style={{ marginRight: 10 }}>
              {value}
            </Text>
          ))}
        </View>
        <View style={letterStyles.rule} />
        <View style={letterStyles.meta}>
          <View>
            <Text style={letterStyles.recipient}>{doc.recipient.company}</Text>
            {doc.recipient.location ? <Text style={letterStyles.date}>{doc.recipient.location}</Text> : null}
          </View>
          <Text style={letterStyles.date}>{doc.date}</Text>
        </View>
        <Text style={letterStyles.subject}>{doc.subject}</Text>
        <Text style={letterStyles.paragraph}>{doc.salutation}</Text>
        {doc.paragraphs
          .filter((paragraph) => paragraph.included)
          .map((paragraph) =>
            paragraph.kind === "highlights" ? (
              highlights.length ? (
                <View key={paragraph.id} style={letterStyles.highlights} wrap={false}>
                  <Text>{doc.highlightsIntro}</Text>
                  {highlights.map((highlight) => (
                    <View key={highlight.id} style={letterStyles.highlight}>
                      <Text style={letterStyles.dot}>•</Text>
                      <Text style={letterStyles.highlightText}>
                        {highlight.text}
                        {highlight.organization ? <Text style={letterStyles.org}> ({highlight.organization})</Text> : null}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null
            ) : paragraph.text.trim() ? (
              <Text key={paragraph.id} style={letterStyles.paragraph}>
                {paragraph.text}
              </Text>
            ) : null,
          )}
        <Text style={letterStyles.signoff}>{doc.signoff}</Text>
        <Text style={letterStyles.signature}>{doc.header.name}</Text>
      </Page>
    </Document>,
  )
  const pages = (buffer.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length
  return { buffer, pages }
}
