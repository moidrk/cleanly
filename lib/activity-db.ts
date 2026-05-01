import { createHash } from "crypto"

import { getPrisma } from "@/lib/db"

const ACTOR_NAMES = [
  "Northstar",
  "Beacon",
  "Atlas",
  "Harbor",
  "Summit",
  "Juniper",
  "Cobalt",
  "Pioneer",
]

export interface ActivityLogRecord {
  id: string
  entityType: string
  entityId: string
  action: string
  actor: string
  createdAt: string
  title: string
  description: string
  metadata: Record<string, unknown>
}

export function getAnonymousActor(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")
  const realIp = request.headers.get("x-real-ip")
  const forwardedHost = request.headers.get("x-forwarded-host")
  const source = forwardedFor?.split(",")[0]?.trim() || realIp || forwardedHost || "local"
  const hash = createHash("sha256").update(source).digest("hex")
  const index = Number.parseInt(hash.slice(0, 8), 16) % ACTOR_NAMES.length

  return `Operator ${ACTOR_NAMES[index]}`
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function titleForAction(action: string) {
  const labels: Record<string, string> = {
    "project.snapshot_saved": "Saved file snapshot",
    "project.deleted": "Deleted file",
    "file.week_assigned": "Changed workflow week",
    "lead.workspace_updated": "Updated lead workspace",
  }

  return labels[action] ?? action.replaceAll(".", " ")
}

function descriptionForAction(action: string, metadata: Record<string, unknown>) {
  if (action === "project.snapshot_saved") {
    return `Saved ${metadata.fileName ?? "a file"} with ${metadata.rowCount ?? 0} rows.`
  }

  if (action === "project.deleted") {
    return `Deleted ${metadata.name ?? "a saved file"}.`
  }

  if (action === "file.week_assigned") {
    const week = String(metadata.uploadWeek ?? "unassigned")
    return week === "unassigned"
      ? "Moved a file back to Unassigned."
      : `Assigned a file to ${week}.`
  }

  if (action === "lead.workspace_updated") {
    return `Changed lead fields: ${String(metadata.changedFields ?? "workspace")}.`
  }

  return "Workspace activity recorded."
}

export async function listActivityLogs(limit = 120): Promise<ActivityLogRecord[]> {
  const prisma = getPrisma()
  const logs = await prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  })

  return logs.map((log) => {
    const metadata = normalizeMetadata(log.metadata)

    return {
      id: log.id,
      entityType: log.entityType,
      entityId: log.entityId,
      action: log.action,
      actor: log.createdBy || "Operator System",
      createdAt: log.createdAt.toISOString(),
      title: titleForAction(log.action),
      description: descriptionForAction(log.action, metadata),
      metadata,
    }
  })
}
