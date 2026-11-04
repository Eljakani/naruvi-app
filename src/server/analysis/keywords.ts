/**
 * Skill vocabulary: canonical keyword → patterns (EN/FR, synonyms). Pure.
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
  Networking: ["networking", "réseaux?", "tcp/ip", "dns", "vpn", "firewall", "pare-feu"],
  Nginx: ["nginx", "reverse proxy", "api gateway"],
  // devsecops & appsec
  DevSecOps: ["devsecops"],
  DevOps: ["devops", "sre", "site reliability"],
  "CI/CD": ["ci/cd", "cicd", "ci-cd", "pipelines?", "github actions", "gitlab ci", "jenkins", "argo ?cd"],
  SAST: ["sast", "static analysis", "semgrep", "sonarqube", "codeql"],
  DAST: ["dast", "dynamic analysis", "burp", "zap"],
  "Application security": ["application security", "appsec", "sécurité applicative", "secure coding", "owasp"],
  "API security": ["api security", "sécurité des api", "rest api", "graphql"],
  "Threat modeling": ["threat model(?:l)?ing", "modélisation des menaces", "stride"],
  "Supply chain security": ["supply chain", "sbom", "dependency scanning", "sca", "trivy", "grype", "syft", "snyk"],
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
  Java: ["\\bjava\\b(?!script)", "spring"],
  "C/C++": ["c\\+\\+", "\\bc\\b(?= language| programming)"],
  Rust: ["\\brust\\b"],
  PHP: ["php", "laravel", "symfony"],
  SQL: ["sql", "postgres(?:ql)?", "mysql"],
  Kafka: ["kafka"],
  // AI
  "AI/LLM": ["\\bllms?\\b", "large language models?", "genai", "generative ai", "\\bai\\b", "\\bia\\b", "machine learning", "rag", "agents?"],
  // human languages
  English: ["english", "anglais"],
  French: ["french", "français", "francais"],
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
