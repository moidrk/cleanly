import { NextResponse } from "next/server"

import { getPrisma } from "@/lib/db"

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: "DATABASE_URL is not configured.",
      },
      { status: 503 }
    )
  }

  try {
    await getPrisma().$queryRaw`SELECT 1`

    return NextResponse.json({
      ok: true,
      configured: true,
    })
  } catch {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        error: "Database connection failed.",
      },
      { status: 503 }
    )
  }
}
