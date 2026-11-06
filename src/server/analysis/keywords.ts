/**
 * Skill vocabulary: canonical keyword → patterns (EN/FR, synonyms). Pure.
 * Domain-neutral on purpose (tech, business, care, education, trades…); the
 * term detector below covers everything the vocabulary does not know.
 * Matching is on canonical keys, so "k8s" in a job and "Kubernetes" in a fact
 * meet each other. Extend this list rather than adding ad-hoc regexes.
 */

const RAW: Record<string, string[]> = {
  // cloud & platforms
  AWS: ["aws", "amazon web services", "ec2", "s3", "lambda"],
  Azure: ["azure", "entra id"],
  GCP: ["gcp", "google cloud"],
  OCI: ["oci", "oracle cloud"],
  "Cloud security": ["cloud security", "sécurité (?:du )?cloud", "cspm", "cnapp", "landing zones?"],
  Kubernetes: ["kubernetes", "k8s", "eks", "aks", "gke", "openshift", "helm"],
  Docker: ["docker", "containers?", "conteneurs?", "podman"],
  Terraform: ["terraform", "opentofu"],
  Ansible: ["ansible"],
  "Infrastructure as code": ["infrastructure as code", "iac", "pulumi", "cloudformation"],
  Linux: ["linux", "unix", "bash"],
  // "networking" alone usually means meeting people; require a technical context.
  Networking: ["network (?:security|engineering|protocols|segmentation)", "sécurité réseaux?", "réseaux? informatiques?", "tcp/ip", "\\bdns\\b", "\\bvpn\\b", "firewalls?", "pare-feu"],
  Nginx: ["nginx", "reverse proxy", "api gateway"],
  // devsecops & appsec
  DevSecOps: ["devsecops"],
  SDLC: ["\\bsdlc\\b", "s-sdlc", "software development life ?cycle", "secure development lifecycle", "cycle de vie (?:du )?(?:logiciel|développement)", "shift[- ]left"],
  DevOps: ["devops", "sre", "site reliability"],
  "CI/CD": ["ci/cd", "cicd", "ci-cd", "pipelines?", "github actions", "gitlab ci", "jenkins", "argo ?cd"],
  SAST: ["sast", "static analysis", "semgrep", "sonarqube", "codeql"],
  DAST: ["dast", "dynamic analysis", "burp", "zap"],
  "Application security": ["application security", "appsec", "sécurité applicative", "secure coding", "owasp"],
  "API security": ["api security", "sécurité des api", "rest api", "graphql"],
  "Threat modeling": ["threat model(?:l)?ing", "modélisation des menaces", "stride"],
  "Supply chain security": ["software supply chain", "supply chain security", "sbom", "dependency scanning", "sca", "trivy", "grype", "syft", "snyk"],
  "Vulnerability management": ["vulnerability management", "gestion des vulnérabilités", "vulnerabilit(?:y|ies)", "vulnérabilités?", "cve", "patch management", "remediation", "remédiation"],
  "Penetration testing": ["pentest(?:ing)?", "penetration test(?:ing)?", "tests? d'intrusion", "red team(?:ing)?", "offensive security", "ethical hacking"],
  "Security architecture": ["security architecture", "architecture (?:de )?sécurité", "secure architecture", "design reviews?", "security by design"],
  // identity
  IAM: ["iam", "identity and access", "gestion des identités", "access management", "rbac"],
  "OAuth/OIDC": ["oauth2?", "oidc", "openid connect", "jwt"],
  SAML: ["saml"],
  SSO: ["sso", "single sign-on", "authentification unique"],
  SCIM: ["scim"],
  Passkeys: ["passkeys?", "webauthn", "fido2?"],
  // detection & operations
  SIEM: ["siem", "splunk", "elastic", "elk", "opensearch", "sentinel", "qradar", "wazuh"],
  SOC: ["soc", "security operations", "blue team"],
  "Incident response": ["incident response", "réponse (?:aux|à) incidents?", "dfir", "forensics?"],
  "Detection engineering": ["detection (?:engineering|rules?)", "sigma", "suricata", "ids", "edr", "xdr"],
  Monitoring: ["monitoring", "supervision", "observability", "observabilité", "prometheus", "grafana", "datadog"],
  // governance
  Compliance: ["compliance", "conformité", "soc ?2", "iso ?27001", "gdpr", "rgpd", "nis ?2", "dora", "pci[- ]dss", "hds"],
  "Risk assessment": ["risk assessments?", "analyse de risques?", "risk management", "ebios"],
  Cryptography: ["cryptograph(?:y|ie)", "pki", "encryption", "chiffrement", "tls", "hsm", "zero[- ]knowledge"],
  "Zero trust": ["zero trust"],
  // languages & frameworks
  Python: ["python"],
  Go: ["golang", "\\bgo\\b(?= |,|\\.|/|$)"],
  TypeScript: ["typescript", "\\bts\\b"],
  JavaScript: ["javascript", "node\\.?js", "\\bnode\\b"],
  React: ["react", "next\\.?js"],
  Java: ["\\bjava\\b(?!script)", "spring ?boot", "spring framework"],
  "C/C++": ["c\\+\\+", "\\bc\\b(?= language| programming)"],
  Rust: ["\\brust\\b"],
  PHP: ["php", "laravel", "symfony"],
  SQL: ["sql", "postgres(?:ql)?", "mysql"],
  Kafka: ["kafka"],
  // AI
  "AI/LLM": ["\\bllms?\\b", "large language models?", "genai", "generative ai", "\\bai\\b", "\\bia\\b", "machine learning", "rag", "agents?"],
  // ── general business & office ─────────────────────────────────────
  "Microsoft Office": ["microsoft office", "ms office", "office 365", "microsoft 365", "word", "outlook", "powerpoint"],
  Excel: ["excel", "spreadsheets?", "tableurs?", "google sheets"],
  ERP: ["\\berp\\b", "\\bsap\\b", "oracle (?:ebs|netsuite)", "netsuite", "odoo", "dynamics 365"],
  CRM: ["\\bcrm\\b", "salesforce", "hubspot", "pipedrive"],
  "Project management": ["project management", "gestion de projets?", "chef de projet", "pmp", "prince2", "agile", "scrum", "kanban", "jira", "asana"],
  "Stakeholder management": ["stakeholders?", "parties prenantes"],
  Negotiation: ["negotiat(?:e|ion|ing)", "négociation", "négocier"],
  Procurement: ["procurement", "purchasing", "buyer", "achats?", "acheteu(?:r|se)", "sourcing", "supplier management", "fournisseurs?"],
  "Logistics & supply chain": ["logistics", "logistique", "supply chain (?:management|planning)", "inventory", "stocks?", "warehouse", "entrepôt", "transport"],
  Sales: ["\\bsales\\b", "business development", "ventes?", "commercial(?:e)?", "account management", "prospect(?:ing|ion)", "quota"],
  Marketing: ["marketing", "\\bseo\\b", "\\bsem\\b", "content strategy", "social media", "réseaux sociaux", "brand(?:ing)?", "campaigns?", "google ads"],
  "Customer service": ["customer (?:service|support|success)", "service client", "relation client", "help ?desk", "call cent(?:er|re)"],
  Accounting: ["accounting", "comptabilit[ée]", "bookkeeping", "ifrs", "gaap", "accounts (?:payable|receivable)", "reconciliation", "rapprochement"],
  Finance: ["financial (?:analysis|planning|modell?ing|reporting)", "fp&a", "budget(?:ing|s)?", "forecast(?:ing)?", "contrôle de gestion", "controlling", "trésorerie", "treasury"],
  "Data analysis": ["data analysis", "analyse de données", "analytics", "tableau", "power ?bi", "looker", "statistics", "statistiques", "dashboards?", "reporting", "kpis?"],
  "Human resources": ["human resources", "\\bhr\\b", "ressources humaines", "\\brh\\b", "recruit(?:ing|ment)", "recrutement", "talent acquisition", "onboarding", "payroll", "paie"],
  "Administrative support": ["administrative", "administratif", "scheduling", "calendar management", "travel arrangements?", "itinerar(?:y|ies)", "expense reports?", "notes de frais", "office management"],
  Legal: ["legal", "juridique", "contracts? (?:drafting|review|law)", "compliance law", "droit des", "paralegal"],
  // ── design & content ─────────────────────────────────────────────────
  Figma: ["figma", "sketch", "adobe xd"],
  "Adobe Creative Suite": ["adobe", "photoshop", "illustrator", "indesign", "premiere", "after effects"],
  "UX/UI design": ["\\bux\\b", "\\bui\\b", "user research", "wireframes?", "prototyp(?:e|es|ing)", "design systems?"],
  Writing: ["copywriting", "technical writing", "rédaction", "editing", "proofreading", "content writing"],
  // ── healthcare & care ─────────────────────────────────────────────────
  "Patient care": ["patient care", "soins? (?:aux )?patients?", "nursing", "infirmi(?:er|ère)", "clinical", "clinique", "bedside"],
  "Medical records": ["\\behr\\b", "\\bemr\\b", "electronic (?:health|medical) records?", "dossier (?:patient|médical)", "epic", "cerner"],
  "First aid": ["first aid", "cpr", "bls", "acls", "premiers secours", "sst"],
  // ── education ─────────────────────────────────────────────────────────
  Teaching: ["teaching", "enseignement", "lesson plans?", "curriculum", "classroom", "pédagogie", "tutoring", "training delivery", "formation (?:de|des) (?:équipes|collaborateurs)"],
  // ── trades, operations & safety ───────────────────────────────────────
  "Health & safety": ["health (?:and|&) safety", "hse", "qhse", "osha", "haccp", "sécurité au travail", "risk prevention"],
  "Quality management": ["quality (?:assurance|control|management)", "qualité", "iso ?9001", "lean", "six sigma", "kaizen", "5s"],
  "Driving licence": ["driving licen[cs]e", "driver'?s licen[cs]e", "permis (?:b|de conduire)"],
  // ── human languages ───────────────────────────────────────────────────
  English: ["english", "anglais"],
  French: ["french", "français", "francais"],
  Spanish: ["spanish", "espagnol", "español"],
  German: ["german", "allemand", "deutsch"],
  Italian: ["italian", "italien"],
  Portuguese: ["portuguese", "portugais"],
  Arabic: ["arabic", "arabe"],
  Mandarin: ["mandarin", "chinese", "chinois"],
  Dutch: ["dutch", "néerlandais"],
}

export type Keyword = { key: string; patterns: RegExp[] }

export const KEYWORDS: Keyword[] = Object.entries(RAW).map(([key, patterns]) => ({
  key,
  patterns: patterns.map((pattern) => new RegExp(pattern.startsWith("\\b") ? pattern : `(?<![\\w])${pattern}(?![\\w])`, "i")),
}))

/** Canonical keywords present in a text. */
export function keywordsIn(text: string): string[] {
  const value = String(text ?? "")
  return KEYWORDS.filter((keyword) => keyword.patterns.some((pattern) => pattern.test(value))).map((keyword) => keyword.key)
}

/** Keywords with a frequency, most frequent first (for "what matters most"). */
export function keywordFrequency(text: string): { key: string; count: number }[] {
  const value = String(text ?? "")
  return KEYWORDS.map((keyword) => ({
    key: keyword.key,
    count: keyword.patterns.reduce((sum, pattern) => sum + (value.match(new RegExp(pattern.source, "gi"))?.length ?? 0), 0),
  }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
}

const COMMON_CAPS = new Set(
  ("engineering business administration management science sciences arts master masters bachelor bachelors degree diploma university école school college faculty department office team teams group global international national europe european world remote hybrid valid strong excellent proven solid good great new senior junior lead head chief "+"a an the and or of to in for with on at by we you our your their they he she it this that these those i is are be will can may must should what who why how when where which if as all any each about from into over under per via plus also not no yes etc eg ie january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday nous vous votre notre les des une un le la et ou pour avec dans sur au aux par en de du il elle ils elles ce cette ces qui que quoi job role team company position candidate candidates experience requirements responsibilities benefits about apply equal opportunity employer h/f f/h m/f "+
    // Contract and work-arrangement words describe the offer, never a skill to prove.
    "cdi cdd cdi/cdd interim intérim alternance apprentissage stage freelance freelancer contractor contract permanent temporary internship apprenticeship fulltime full-time parttime part-time vie v.i.e télétravail teletravail onsite on-site esn ssii f/h/nb h/f/nb nb k€ befristet unbefristet vollzeit teilzeit indefinido").split(" "),
)

/**
 * Domain-agnostic term detection: tools, products, acronyms and certifications
 * written as proper nouns (SAP, HACCP, Salesforce, Power BI, CPA, Epic…).
 * Returned as lower-case strings prefixed with "term:" so they never collide
 * with vocabulary keys. Words that only appear capitalised at the start of a
 * sentence or bullet are ignored.
 */
export function termsIn(text: string): string[] {
  const value = String(text ?? "")
  const found = new Set<string>()
  const pattern = /(?<![\w.@/])([A-Z][A-Za-z0-9+#&.-]*[A-Za-z0-9+#]|[A-Z]{2,}[0-9]*)(?:\s+([A-Z][A-Za-z0-9+#&-]*[A-Za-z0-9+#]))?(?![\w@])/g
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0
    const before = value.slice(0, index)
    const sentenceStart = index === 0 || /(?:[.!?:;•–—(\n]|^-)\s*$/.test(before)
    // The whole phrase is a known skill ("Power BI", "Microsoft Office"): skip.
    if (KEYWORDS.some((keyword) => keyword.patterns.some((p) => p.test(match[0])))) continue
    const words = [match[1], match[2]].filter(Boolean) as string[]
    // A capitalised first word of a sentence is just grammar, unless an acronym.
    if (sentenceStart && !/^[A-Z0-9+#&]{2,}$/.test(words[0])) words.shift()
    const kept = words.filter((word) => word.length >= 2 && !/^\d/.test(word) && !COMMON_CAPS.has(word.toLowerCase()))
    if (!kept.length) continue
    if (kept.length === 2) found.add(`term:${kept.join(" ").toLowerCase()}`)
    else found.add(`term:${kept[0].toLowerCase()}`)
  }
  // Terms the vocabulary already recognises add nothing.
  return [...found].filter((term) => !KEYWORDS.some((keyword) => keyword.patterns.some((p) => p.test(term.slice(5)))))
}

/** Does a text contain a detected term (case-insensitive, whole word)? */
export function hasTerm(text: string, term: string): boolean {
  const word = term.slice(5).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(?<![\\w])${word}(?![\\w])`, "i").test(text)
}

/** Human label for a keyword or term. */
export function keywordLabel(key: string, source = ""): string {
  if (!key.startsWith("term:")) return key
  const raw = key.slice(5)
  return source.match(new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))?.[0] ?? raw
}

/**
 * Related skills: evidence for one makes the other "partly" shown, never
 * "proven". Keeps the analysis honest without being blunt ("no SDLC") when
 * the candidate demonstrably did CI/CD security work.
 */
export const RELATED: Record<string, string[]> = {
  SDLC: ["CI/CD", "SAST", "DAST", "DevSecOps", "Application security"],
  DevSecOps: ["CI/CD", "SAST", "DAST", "Supply chain security"],
  "Threat modeling": ["Security architecture", "Risk assessment", "Penetration testing"],
  IAM: ["OAuth/OIDC", "SAML", "SSO", "SCIM"],
  SSO: ["OAuth/OIDC", "SAML"],
  "Cloud security": ["AWS", "Azure", "GCP", "OCI", "Kubernetes"],
  Kubernetes: ["Docker"],
  "Infrastructure as code": ["Terraform", "Ansible"],
  "Detection engineering": ["SIEM", "SOC"],
  "Data analysis": ["Excel", "SQL", "Python"],
  CRM: ["Sales", "Customer service"],
  ERP: ["Procurement", "Accounting", "Logistics & supply chain"],
  "Project management": ["Stakeholder management"],
  "UX/UI design": ["Figma", "Adobe Creative Suite"],
}

/**
 * The specific names a requirement used for a keyword, when they are proper
 * names (Power BI, Tableau, Excel, AWS…). Generic phrases ("dashboards",
 * "monitoring") return nothing, so the canonical key is enough for those.
 */
export function namedTools(key: string, text: string): string[] {
  const keyword = KEYWORDS.find((item) => item.key === key)
  if (!keyword) return []
  const names = new Set<string>()
  for (const pattern of keyword.patterns) {
    for (const match of String(text).matchAll(new RegExp(pattern.source, "gi"))) {
      // Product names are capitalised words ("Tableau", "Power BI"); all-caps
      // acronyms name concepts ("CI/CD", "SAST") and stay matched by the key.
      if (/^[A-Z][a-z]/.test(match[0].trim())) names.add(match[0].trim())
    }
  }
  return [...names]
}
