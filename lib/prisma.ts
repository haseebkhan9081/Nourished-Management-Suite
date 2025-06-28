import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const prisma =
  process.env.NODE_ENV === "production"
    ? new PrismaClient()
    : globalForPrisma.prisma ?? (globalForPrisma.prisma = new PrismaClient())

export default prisma
