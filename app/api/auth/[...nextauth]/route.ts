//@ts-nocheck
import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"

console.log("NEXTAUTH ROUTE LOADED")

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
    async signIn({ user, account, profile }) {
      console.log("SIGNIN CALLBACK HIT")
      console.log("User from Google:", user)
      console.log("Account from Google:", account)
      console.log("Profile from Google:", profile)

      if (!user.email) {
        console.error("User has no email. Rejecting.")
        return false
      }

      const payload = {
        email: user.email,
        name: user.name ?? null,
        imageUrl: user.image ?? null,
        provider: account?.provider ?? "google",
        providerId: account?.providerAccountId ?? null,
      }

      console.log("Sending payload to backend:", payload)

      try {
        const url = `${process.env.NEXT_PUBLIC_API_BASE_URL}/user/upsert`
        console.log("Calling backend:", url)

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        })

        console.log("Backend response status:", res.status)

        const text = await res.text()
        console.log("Backend response body:", text)

        if (!res.ok) {
          console.error("User service rejected upsert")
          return false
        }

        console.log("User upsert successful")
        return true
      } catch (err) {
        console.error("User service unreachable", err)
        return false
      }
    },

    async jwt({ token, user, account }) {
      console.log("JWT CALLBACK HIT")
      console.log("JWT token before:", token)
      console.log("JWT user:", user)
      console.log("JWT account:", account)

      if (user?.email) {
        token.email = user.email
      }

      console.log("JWT token after:", token)
      return token
    },

    async session({ session, token }) {
      console.log("SESSION CALLBACK HIT")
      console.log("Session before:", session)
      console.log("Token:", token)

      if (token?.email) {
        session.user.email = token.email as string
      }

      console.log("Session after:", session)
      return session
    },
  },

  events: {
    async signIn(message) {
      console.log("EVENT: signIn", message)
    },
    async signOut(message) {
      console.log("EVENT: signOut", message)
    },
    async createUser(message) {
      console.log("EVENT: createUser", message)
    },
  },

  debug: true,
})

export { handler as GET, handler as POST }