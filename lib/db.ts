import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg" 
import { PrismaClient } from "@/lib/generated/prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to initialize Prisma.")
  }
const pool = new Pool({ connectionString,ssl: {
      rejectUnauthorized: false
    } })
  
  // 2. Pass the pool to the adapter
  const adapter = new PrismaPg(pool)  

  return new PrismaClient({ adapter })
}

export function getPrisma() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient()
  }

  return globalForPrisma.prisma
}
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = getPrisma()