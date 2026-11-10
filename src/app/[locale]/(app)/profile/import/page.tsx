import { ProfileImport } from "@/components/profile/profile-import"
import { titled } from "@/i18n/metadata"

export const generateMetadata = titled("importCv")

export default function ImportPage() {
  return <ProfileImport />
}
