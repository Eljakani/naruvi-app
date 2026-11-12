import { ExtensionConnect } from "@/components/integrations/extension-connect"
import { titled } from "@/i18n/metadata"

export const generateMetadata = titled("connectExtension")

/** Opened by the browser extension's Connect button: approve here, and the extension picks up its key from this tab. */
export default function ConnectExtensionPage() {
  return <ExtensionConnect />
}
