import { NextResponse } from "next/server"

import {
  createEmptyDashboardAnalytics,
  getCachedDashboardAnalytics,
} from "@/lib/dashboard-db"

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      ok: false,
      error:
        "DATABASE_URL is not configured. Dashboard analytics require saved workspace data in Postgres.",
      dashboard: createEmptyDashboardAnalytics(),
    })
  }

  try {
    const dashboard = await getCachedDashboardAnalytics()

    return NextResponse.json({
      ok: true,
      dashboard,
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to load dashboard analytics.",
      dashboard: createEmptyDashboardAnalytics(),
    })
  }
}
