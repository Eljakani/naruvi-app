export const decisionProviders = {
  typesafe: { label: "TypeSafe Jev", models: ["jev-latest"], keyUrl: "https://console.typesafe.ai/keys" },
  openrouter: { label: "Jev through OpenRouter", models: ["jev-latest"], keyUrl: "https://openrouter.ai/settings/keys" },
  cloudflare: { label: "Cloudflare Workers AI", models: ["clef", "clef-flash", "clef-omni"], keyUrl: "https://developers.cloudflare.com/workers-ai/get-started/rest-api/#1-get-api-token-and-account-id" },
  openai: { label: "OpenAI", models: ["gpt-6-luna"], keyUrl: "https://platform.openai.com/api-keys" },
}

export type DecisionProvider = keyof typeof decisionProviders
