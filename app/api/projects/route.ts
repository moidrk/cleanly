import { NextResponse } from "next/server"

import { getAnonymousActor } from "@/lib/activity-db"
import {
  listProjectSummaries,
  saveProjectSnapshot,
  type LeadProjectSnapshot,
} from "@/lib/workspace-db"

function databaseUnavailableResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "DATABASE_URL is not configured.",
      projects: [],
    },
    { status: 503 }
  )
}

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return databaseUnavailableResponse()
  }

  try {
    const projects = await listProjectSummaries()

    return NextResponse.json({
      ok: true,
      projects,
    })
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to list projects.",
        projects: [],
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return databaseUnavailableResponse()
  }

  try {
    const snapshot = (await request.json()) as LeadProjectSnapshot

    if (!snapshot.id || !snapshot.name || !Array.isArray(snapshot.leads)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid project payload.",
        },
        { status: 400 }
      )
    }

    const project = await saveProjectSnapshot(snapshot, getAnonymousActor(request))

    return NextResponse.json({
      ok: true,
      project,
    })
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to save project.",
      },
      { status: 500 }
    )
  }
}
