// auth.ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "default_dev_secret_nehvigation_12345",
  pages: {
    error: "/auth/error",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || "MOCK_CLIENT_ID",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "MOCK_CLIENT_SECRET",
    }),
  ],
  callbacks: {
    authorized({ auth }) {
      // If GOOGLE_CLIENT_ID is not configured, pass authorization check
      if (!process.env.GOOGLE_CLIENT_ID) return true;
      return !!auth;
    },
    async signIn({ user }) {
      if (!process.env.ALLOWED_EMAILS) return true;
      const allowedEmails = (process.env.ALLOWED_EMAILS || "")
        .split(",")
        .map((email) => email.trim().toLowerCase());

      if (user.email && allowedEmails.includes(user.email.toLowerCase())) {
        return true;
      }
      return false;
    },
  },
});
