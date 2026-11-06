/**
 * Contacts from a spreadsheet (CSV or Excel) or LinkedIn's Connections
 * export. Columns are matched by name in EN/FR/DE/ES, so most files work
 * without mapping. Pure.
 */
export type ContactRow = { name: string; title: string; companyName: string; email: string; linkedinUrl: string; phone: string; notes: string }

const normalize = (header: string) => header.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, " ").trim()

const COLUMNS: Record<keyof ContactRow | "first" | "last", RegExp> = {
  first: /^(first name|firstname|given name|prenom|vorname|nombre)$/,
  last: /^(last name|lastname|surname|family name|nom|nom de famille|nachname|apellidos?)$/,
  name: /^(name|full name|contact|contact name|nom complet|personne|vollstandiger name|nombre completo)$/,
  title: /^(title|job title|position|role|poste|fonction|intitule de poste|titre|berufsbezeichnung|position im unternehmen|cargo|puesto)$/,
  companyName: /^(company|company name|organization|organisation|employer|entreprise|societe|unternehmen|firma|empresa)$/,
  email: /^(e ?mail|email address|e ?mail address|adresse e ?mail|courriel|mail|correo|correo electronico)$/,
  linkedinUrl: /^(linkedin|linkedin url|linkedin profile|profile url|url|profil linkedin)$/,
  phone: /^(phone|phone number|mobile|telephone|tel|portable|telefon|handy|telefono|movil)$/,
  notes: /^(notes?|comments?|commentaire|remarques?|notizen|notas)$/,
}

/** Which header goes to which field. */
export function mapHeaders(headers: string[]) {
  const found: Partial<Record<keyof typeof COLUMNS, string>> = {}
  for (const header of headers) {
    const key = normalize(header)
    for (const [field, pattern] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, RegExp][]) {
      if (!found[field] && pattern.test(key)) {
        found[field] = header
        break
      }
    }
  }
  return found
}

const cleanUrl = (value: string) => {
  const url = value.trim()
  if (!/linkedin\.com\/in\//i.test(url)) return ""
  return url.startsWith("http") ? url.replace(/[?#].*$/, "").replace(/\/$/, "") : `https://${url.replace(/[?#].*$/, "").replace(/\/$/, "")}`
}

/** Rows → contacts; rows without a name are skipped, duplicates (same LinkedIn URL or email) kept once. */
export function contactsFromRows(rows: Record<string, string>[]): { contacts: ContactRow[]; skipped: number; columns: string[] } {
  const headers = Object.keys(rows[0] ?? {})
  const map = mapHeaders(headers)
  const get = (row: Record<string, string>, field: keyof typeof COLUMNS) => (map[field] ? String(row[map[field]!] ?? "").trim() : "")
  const seen = new Set<string>()
  const contacts: ContactRow[] = []
  let skipped = 0
  for (const row of rows) {
    const name = get(row, "name") || [get(row, "first"), get(row, "last")].filter(Boolean).join(" ")
    if (!name) {
      skipped += 1
      continue
    }
    const contact: ContactRow = {
      name: name.slice(0, 120),
      title: get(row, "title").slice(0, 160),
      companyName: get(row, "companyName").slice(0, 160),
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(get(row, "email")) ? get(row, "email").toLowerCase() : "",
      linkedinUrl: cleanUrl(get(row, "linkedinUrl")),
      phone: get(row, "phone").slice(0, 40),
      notes: get(row, "notes").slice(0, 2000),
    }
    const key = contact.linkedinUrl || contact.email || `${contact.name}|${contact.companyName}`.toLowerCase()
    if (seen.has(key)) {
      skipped += 1
      continue
    }
    seen.add(key)
    contacts.push(contact)
  }
  return { contacts, skipped, columns: Object.values(map) as string[] }
}
