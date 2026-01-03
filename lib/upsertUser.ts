export async function upsertUser({
  email,
  name,
  imageUrl,
  provider,
  providerId,
}: {
  email: string
  name: string | null
  imageUrl: string | null
  provider: string
  providerId: string | null
}) {
  const res = await fetch("/api/users/upsert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      name,
      imageUrl,
      provider,
      providerId,
    }),
  })

  if (!res.ok) {
    throw new Error("Failed to upsert user")
  }
}
