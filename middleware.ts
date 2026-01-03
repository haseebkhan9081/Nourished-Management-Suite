import { withAuth } from "next-auth/middleware"

export default withAuth({
  // Protect all routes except login and public pages
  pages: {
    signIn: "/login", // redirect here if not authenticated
  },
  callbacks: {
    authorized: ({ token }) => !!token, // allow access if token exists
  },
})

// Define which paths the middleware runs on
export const config = {
  matcher: ["/((?!_next|favicon.ico|login).*)"], // protect everything except _next, favicon, login
}
