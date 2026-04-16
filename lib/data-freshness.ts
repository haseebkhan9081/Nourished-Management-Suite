export function timeAgo(iso: string | null): string {
  if (!iso) return "never"
  const then = new Date(iso).getTime()
  if (isNaN(then)) return "unknown"
  const diff = Date.now() - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} min${mins !== 1 ? "s" : ""} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days} day${days !== 1 ? "s" : ""} ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months !== 1 ? "s" : ""} ago`
  const years = Math.floor(days / 365)
  return `${years} year${years !== 1 ? "s" : ""} ago`
}

export function formatShortDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}
