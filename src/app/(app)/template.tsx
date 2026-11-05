/** Remounts on every navigation, so each page gets a short, quiet entrance. */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="cb-page flex flex-1 flex-col gap-6">{children}</div>
}
