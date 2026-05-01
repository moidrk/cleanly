import { NextResponse } from "next/server"

import { getAnonymousActor } from "@/lib/activity-db"
import { updateLeadWorkspace } from "@/lib/workspace-db"

interface RouteContext {
  params: Promise<{
    id: string
    leadId: string
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

export async function PATCH(request: Request, context: RouteContext) {
  if (!process.env.DATABASE_URL) {
    return databaseUnavailableResponse()
  }

  try {
    const { id, leadId } = await context.params
    const payload = (await request.json()) as { workspace?: unknown }
    const project = await updateLeadWorkspace(
      id,
      leadId,
      payload.workspace,
      getAnonymousActor(request)
    )

    if (!project) {
      return NextResponse.json(
        {
          ok: false,
          error: "Lead not found.",
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
        error: "Unable to update lead.",
      },
      { status: 500 }
    )
  }
}
