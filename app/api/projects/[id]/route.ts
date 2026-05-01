import { NextResponse } from "next/server"

import { getAnonymousActor } from "@/lib/activity-db"
import {
  deleteProjectSnapshot,
  getProjectSnapshot,
  saveProjectSnapshot,
  updateProjectWeek,
  type LeadProjectSnapshot,
} from "@/lib/workspace-db"

interface RouteContext {
  params: Promise<{
    id: string
  }>
}

function databaseUnavailableResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: "DATABASE_URL is not configured.",
    },
    { status: 503 }
  )
}

export async function GET(_request: Request, context: RouteContext) {
  if (!process.env.DATABASE_URL) {
    return databaseUnavailableResponse()
  }

  try {
    const { id } = await context.params
    const project = await getProjectSnapshot(id)

    if (!project) {
      return NextResponse.json(
        {
          ok: false,
          error: "Project not found.",
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ok: true,
      project,
    })
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to load project.",
      },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request, context: RouteContext) {
  if (!process.env.DATABASE_URL) {
    return databaseUnavailableResponse()
  }

  try {
    const { id } = await context.params
    const snapshot = (await request.json()) as LeadProjectSnapshot
    const project = await saveProjectSnapshot(
      {
        ...snapshot,
        id,
      },
      getAnonymousActor(request)
    )

    return NextResponse.json({
      ok: true,
      project,
    })
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to update project.",
      },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!process.env.DATABASE_URL) {
    return databaseUnavailableResponse()
  }

  try {
    const { id } = await context.params
    const payload = (await request.json()) as { uploadWeek?: string }
    const project = await updateProjectWeek(
      id,
      payload.uploadWeek ?? "unassigned",
      getAnonymousActor(request)
    )

    return NextResponse.json({
      ok: true,
      project,
    })
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to update project week.",
      },
      { status: 500 }
    )
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  if (!process.env.DATABASE_URL) {
    return databaseUnavailableResponse()
  }

  try {
    const { id } = await context.params
    await deleteProjectSnapshot(id, getAnonymousActor(_request))

    return NextResponse.json({
      ok: true,
    })
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to delete project.",
      },
      { status: 500 }
    )
  }
}
