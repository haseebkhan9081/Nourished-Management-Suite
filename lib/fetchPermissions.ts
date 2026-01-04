// utils/fetchPermissions.ts
export async function fetchUserPermissions(email: string) {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/user/user-permissions?email=${encodeURIComponent(email)}`)
    if (!res.ok) throw new Error("Failed to fetch permissions")
    const data = await res.json()
    // returns array of permission keys like ["payment_insights:view", "payment_insights:export"]
    return data.permissions.map((p: { key: string; description: string }) => p.key)
  } catch (err) {
    console.error("❌ Error fetching permissions:", err)
    return []
  }
}
