import { NextResponse } from "next/server"

import { listActivityLogs } from "@/lib/activity-db"

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      ok: false,
      error: "DATABASE_URL is not configured.",
      logs: [],
    })
  }

  try {
    const logs = await listActivityLogs()

    return NextResponse.json({
      ok: true,
      logs,
    })
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to load activity logs.",
        logs: [],
      },
      { status: 500 }
    )
  }
}
