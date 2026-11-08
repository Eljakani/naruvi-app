export const BEDROCK_REGIONS = [
  { id: "us-east-1", label: "US East · N. Virginia" },
  { id: "us-east-2", label: "US East · Ohio" },
  { id: "us-west-2", label: "US West · Oregon" },
  { id: "eu-central-1", label: "Europe · Frankfurt" },
  { id: "eu-west-1", label: "Europe · Ireland" },
  { id: "eu-west-2", label: "Europe · London" },
  { id: "eu-south-1", label: "Europe · Milan" },
  { id: "eu-north-1", label: "Europe · Stockholm" },
  { id: "ap-south-1", label: "Asia Pacific · Mumbai" },
  { id: "ap-southeast-2", label: "Asia Pacific · Sydney" },
  { id: "ap-southeast-3", label: "Asia Pacific · Jakarta" },
  { id: "ap-northeast-1", label: "Asia Pacific · Tokyo" },
  { id: "sa-east-1", label: "South America · São Paulo" },
  { id: "us-gov-west-1", label: "AWS GovCloud · US West" },
] as const

export function bedrockEndpoint(region: (typeof BEDROCK_REGIONS)[number]["id"]) {
  return `https://bedrock-mantle.${region}.api.aws/v1`
}

export function bedrockRegionForEndpoint(endpoint: string) {
  const normalized = endpoint.trim().replace(/\/+$/, "")
  return BEDROCK_REGIONS.find(({ id }) => bedrockEndpoint(id) === normalized)
}

export const AI_PROVIDERS = [
  { id: "openai", name: "OpenAI", group: "Cloud", baseUrl: "https://api.openai.com/v1", help: "https://platform.openai.com/api-keys" },
  { id: "anthropic", name: "Anthropic Claude", group: "Cloud", baseUrl: "https://api.anthropic.com/v1", help: "https://platform.claude.com/settings/keys" },
  { id: "gemini", name: "Google Gemini", group: "Cloud", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", help: "https://aistudio.google.com/apikey" },
  { id: "bedrock", name: "Amazon Bedrock", group: "Cloud", baseUrl: bedrockEndpoint("us-east-1"), help: "https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html" },
  { id: "deepseek", name: "DeepSeek", group: "Cloud", baseUrl: "https://api.deepseek.com/v1", help: "https://platform.deepseek.com/api_keys" },
  { id: "mistral", name: "Mistral AI", group: "Cloud", baseUrl: "https://api.mistral.ai/v1", help: "https://console.mistral.ai/api-keys" },
  { id: "xai", name: "xAI Grok", group: "Cloud", baseUrl: "https://api.x.ai/v1", help: "https://console.x.ai" },
  { id: "groq", name: "Groq", group: "Cloud", baseUrl: "https://api.groq.com/openai/v1", help: "https://console.groq.com/keys" },
  { id: "together", name: "Together AI", group: "Cloud", baseUrl: "https://api.together.ai/v1", help: "https://api.together.ai/settings/api-keys" },
  { id: "fireworks", name: "Fireworks AI", group: "Cloud", baseUrl: "https://api.fireworks.ai/inference/v1", help: "https://app.fireworks.ai" },
  { id: "cerebras", name: "Cerebras", group: "Cloud", baseUrl: "https://api.cerebras.ai/v1", help: "https://cloud.cerebras.ai" },
  { id: "deepinfra", name: "DeepInfra", group: "Cloud", baseUrl: "https://api.deepinfra.com/v1/openai", help: "https://deepinfra.com/dash" },
  { id: "nvidia", name: "NVIDIA NIM", group: "Cloud", baseUrl: "https://integrate.api.nvidia.com/v1", help: "https://build.nvidia.com/" },
  { id: "perplexity", name: "Perplexity", group: "Cloud", baseUrl: "https://api.perplexity.ai", help: "https://www.perplexity.ai/account/api/keys" },
  { id: "cohere", name: "Cohere", group: "Cloud", baseUrl: "https://api.cohere.ai/compatibility/v1", help: "https://dashboard.cohere.com/api-keys" },
  { id: "qwen", name: "Alibaba Qwen", group: "Cloud", baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", help: "https://modelstudio.console.alibabacloud.com/" },
  { id: "moonshot", name: "Moonshot Kimi", group: "Cloud", baseUrl: "https://api.moonshot.ai/v1", help: "https://platform.moonshot.ai/console/api-keys" },
  { id: "zhipu", name: "Z.ai GLM", group: "Cloud", baseUrl: "https://api.z.ai/api/paas/v4", help: "https://z.ai/manage-apikey/apikey-list" },
  { id: "minimax", name: "MiniMax", group: "Cloud", baseUrl: "https://api.minimax.io/v1", help: "https://www.minimax.io/platform" },
  { id: "huggingface", name: "Hugging Face", group: "Gateways", baseUrl: "https://router.huggingface.co/v1", help: "https://huggingface.co/settings/tokens" },
  { id: "openrouter", name: "OpenRouter", group: "Gateways", baseUrl: "https://openrouter.ai/api/v1", help: "https://openrouter.ai/keys" },
  { id: "vercel", name: "Vercel AI Gateway", group: "Gateways", baseUrl: "https://ai-gateway.vercel.sh/v1", help: "https://vercel.com/ai-gateway" },
  { id: "ollama", name: "Ollama", group: "Local", baseUrl: "http://localhost:11434/v1", help: "https://docs.ollama.com/api/openai-compatibility" },
  { id: "lmstudio", name: "LM Studio", group: "Local", baseUrl: "http://localhost:1234/v1", help: "https://lmstudio.ai/docs/developer/openai-compat" },
  { id: "vllm", name: "vLLM", group: "Local", baseUrl: "http://localhost:8000/v1", help: "https://docs.vllm.ai/en/latest/serving/openai_compatible_server/" },
] as const

export function providerForEndpoint(endpoint: string) {
  const normalized = endpoint.trim().replace(/\/+$/, "")
  return AI_PROVIDERS.find((provider) => provider.baseUrl === normalized ||
    (provider.id === "bedrock" && bedrockRegionForEndpoint(normalized)) ||
    (provider.id === "deepseek" && normalized === "https://api.deepseek.com"))
}
