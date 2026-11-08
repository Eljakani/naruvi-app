/** Cloud speech-to-text you connect with your own key. Shared by the settings card and the server. */
export const SPEECH_PROVIDERS = [
  { id: "google", name: "Google Speech-to-Text", logo: null, models: ["latest_long", "latest_short", "default"], help: "https://console.cloud.google.com/apis/credentials", note: "Strong for French and Moroccan Arabic (ar-MA). Enable the Speech-to-Text API on your key." },
  { id: "openai", name: "OpenAI", logo: "/provider-logos/openai.svg", models: ["gpt-4o-mini-transcribe", "gpt-4o-transcribe", "whisper-1"], help: "https://platform.openai.com/api-keys", note: "Very accurate in most languages." },
  { id: "groq", name: "Groq", logo: "/provider-logos/groq.svg", models: ["whisper-large-v3-turbo", "whisper-large-v3"], help: "https://console.groq.com/keys", note: "Whisper large, very fast and inexpensive." },
  { id: "deepgram", name: "Deepgram", logo: null, models: ["nova-3", "nova-2"], help: "https://console.deepgram.com/", note: "Fast, good for English and noisy audio." },
] as const
export type SpeechProviderId = (typeof SPEECH_PROVIDERS)[number]["id"]
export const speechProvider = (id: string) => SPEECH_PROVIDERS.find((provider) => provider.id === id)

/** Our language choice → each provider's code. Darija gets Google's Moroccan Arabic; others fall back to Arabic. */
export function providerLanguage(provider: SpeechProviderId, language: string): string | undefined {
  if (language === "auto") return undefined
  if (provider === "google") return { en: "en-US", fr: "fr-FR", ar: "ar-SA", ary: "ar-MA", es: "es-ES", de: "de-DE", it: "it-IT", pt: "pt-PT", nl: "nl-NL", tr: "tr-TR" }[language]
  return language === "ary" ? "ar" : language
}
