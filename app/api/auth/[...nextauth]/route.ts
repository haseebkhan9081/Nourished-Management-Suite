//@ts-nocheck
import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  session: {
    strategy: "jwt",
  },

  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/user/upsert`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: user.email,
              name: user.name ?? null,
              imageUrl: user.image ?? null,
              provider: account?.provider ?? "google",
              providerId: account?.providerAccountId ?? null,
            }),
          }
        )

        if (!res.ok) {
          console.error("User service rejected upsert")
          return false
        }

        return true
      } catch (err) {
        console.error("User service unreachable", err)
        return false
      }
    },

    async jwt({ token, user }) {
      if (user?.email) {
        token.email = user.email
      }
      return token
    },

    async session({ session, token }) {
      if (token?.email) {
        session.user.email = token.email as string
      }
      return session
    },
  },
})

export { handler as GET, handler as POST }
