import {
  ActivityEntityType,
  CleanlyStatus,
  EnrichmentStatus,
  LeadFileStatus,
  OutreachStatus,
  Prisma,
  ProjectStatus,
  ResponseStatus,
} from "@/lib/generated/prisma/client"
import { getPrisma } from "@/lib/db"
import {
  createEmptyEnrichedFields,
  NPI_FIELD_DEFINITIONS,
  type EnrichFieldKey,
  type EnrichedNpiFields,
} from "@/lib/npi"

type CsvRow = Record<string, string>
type ClientEnrichmentStatus =
  | "not_enriched"
  | "enriched"
  | "not_found"
  | "invalid_npi"
  | "error"
type ClientOutreachStatus =
  | "not_contacted"
  | "contacted"
  | "follow_up_needed"
  | "responded"
  | "not_interested"
  | "bad_contact"
  | "do_not_contact"
type ClientResponseStatus =
  | "unknown"
  | "no_response"
  | "positive"
  | "negative"
  | "needs_follow_up"

interface WorkspaceFields {
  status: "active" | "needs_review" | "clean" | "archived"
  enrichmentStatus: ClientEnrichmentStatus
  outreachStatus: ClientOutreachStatus
  responseStatus: ClientResponseStatus
  attemptCount: number
  lastContactedAt: string
  nextFollowUpAt: string
  notes: string
  tags: string
  owner: string
}

interface LeadRecord {
  id: string
  original: CsvRow
  enriched: EnrichedNpiFields
  workspace: WorkspaceFields
  normalizedNpi: string
  normalizedPhone: string
  normalizedZip: string
  normalizedState: string
  issues: string[]
  duplicateKeys: string[]
  qualityScore: number
  createdAt: string
  updatedAt: string
}

export interface LeadProjectSnapshot {
  id: string
  name: string
  fileName: string
  assignedWeek: string
  headers: string[]
  selectedNpiColumn: string
  selectedFields: EnrichFieldKey[]
  leads: LeadRecord[]
  createdAt: string
  updatedAt: string
}

export interface ProjectSummary {
  id: string
  name: string
  fileName: string
  rowCount: number
  status: string
  uploadWeek: string
  updatedAt: string
  createdAt: string
}

export type LeadWorkspacePatch = Partial<WorkspaceFields>

const enrichmentStatusToDb: Record<ClientEnrichmentStatus, EnrichmentStatus> = {
  not_enriched: EnrichmentStatus.NOT_ENRICHED,
  enriched: EnrichmentStatus.ENRICHED,
  not_found: EnrichmentStatus.NOT_FOUND,
  invalid_npi: EnrichmentStatus.INVALID_NPI,
  error: EnrichmentStatus.ERROR,
}

const enrichmentStatusFromDb: Record<EnrichmentStatus, ClientEnrichmentStatus> = {
  [EnrichmentStatus.NOT_ENRICHED]: "not_enriched",
  [EnrichmentStatus.ENRICHED]: "enriched",
  [EnrichmentStatus.NOT_FOUND]: "not_found",
  [EnrichmentStatus.INVALID_NPI]: "invalid_npi",
  [EnrichmentStatus.ERROR]: "error",
}

const outreachStatusToDb: Record<ClientOutreachStatus, OutreachStatus> = {
  not_contacted: OutreachStatus.NOT_CONTACTED,
  contacted: OutreachStatus.CONTACTED,
  follow_up_needed: OutreachStatus.FOLLOW_UP_NEEDED,
  responded: OutreachStatus.RESPONDED,
  not_interested: OutreachStatus.NOT_INTERESTED,
  bad_contact: OutreachStatus.BAD_CONTACT,
  do_not_contact: OutreachStatus.DO_NOT_CONTACT,
}

const outreachStatusFromDb: Record<OutreachStatus, ClientOutreachStatus> = {
  [OutreachStatus.NOT_CONTACTED]: "not_contacted",
  [OutreachStatus.CONTACTED]: "contacted",
  [OutreachStatus.FOLLOW_UP_NEEDED]: "follow_up_needed",
  [OutreachStatus.RESPONDED]: "responded",
  [OutreachStatus.NOT_INTERESTED]: "not_interested",
  [OutreachStatus.BAD_CONTACT]: "bad_contact",
  [OutreachStatus.DO_NOT_CONTACT]: "do_not_contact",
}

const responseStatusToDb: Record<ClientResponseStatus, ResponseStatus> = {
  unknown: ResponseStatus.UNKNOWN,
  no_response: ResponseStatus.NO_RESPONSE,
  positive: ResponseStatus.POSITIVE,
  negative: ResponseStatus.NEGATIVE,
  needs_follow_up: ResponseStatus.NEEDS_FOLLOW_UP,
}

const responseStatusFromDb: Record<ResponseStatus, ClientResponseStatus> = {
  [ResponseStatus.UNKNOWN]: "unknown",
  [ResponseStatus.NO_RESPONSE]: "no_response",
  [ResponseStatus.POSITIVE]: "positive",
  [ResponseStatus.NEGATIVE]: "negative",
  [ResponseStatus.NEEDS_FOLLOW_UP]: "needs_follow_up",
}

function toCleanlyStatus(status: WorkspaceFields["status"]) {
  if (status === "needs_review") return CleanlyStatus.NEEDS_REVIEW
  if (status === "clean") return CleanlyStatus.CLEANED
  if (status === "archived") return CleanlyStatus.ARCHIVED
  return CleanlyStatus.NEW
}

function fromCleanlyStatus(status: CleanlyStatus): WorkspaceFields["status"] {
  if (status === CleanlyStatus.NEEDS_REVIEW) return "needs_review"
  if (status === CleanlyStatus.CLEANED || status === CleanlyStatus.APPROVED) {
    return "clean"
  }
  if (status === CleanlyStatus.ARCHIVED) return "archived"
  return "active"
}

function toDate(value: string) {
  return value ? new Date(value) : null
}

function getFullName(lead: LeadRecord) {
  return `${lead.enriched.firstName} ${lead.enriched.lastName}`.trim()
}

function getLeadEmail(row: CsvRow) {
  const entry = Object.entries(row).find(([header]) =>
    header.toLowerCase().includes("email")
  )
  return entry?.[1] ?? ""
}

function getUploadWeek(dateValue: string) {
  if (!dateValue) return "unassigned"

  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return "unassigned"

  const year = date.getFullYear()
  const start = new Date(Date.UTC(year, 0, 1))
  const dayOffset = Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      start.getTime()) /
      86400000
  )
  const week = Math.ceil((dayOffset + start.getUTCDay() + 1) / 7)
  return `${year}-W${String(week).padStart(2, "0")}`
}

function normalizeSelectedFields(value: unknown): EnrichFieldKey[] {
  if (!Array.isArray(value)) return []

  return value.filter((field): field is EnrichFieldKey =>
    Object.hasOwn(NPI_FIELD_DEFINITIONS, String(field))
  )
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function normalizeCsvRow(value: unknown): CsvRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key, String(entryValue ?? "")])
  )
}

function normalizeEnrichedFields(value: unknown): EnrichedNpiFields {
  const empty = createEmptyEnrichedFields()
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty

  return {
    ...empty,
    ...Object.fromEntries(
      Object.keys(empty).map((key) => [
        key,
        String((value as Record<string, unknown>)[key] ?? ""),
      ])
    ),
  }
}

function normalizeWorkspacePatch(value: unknown): LeadWorkspacePatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  const patch = value as Record<string, unknown>
  const normalized: LeadWorkspacePatch = {}

  if (typeof patch.status === "string") {
    normalized.status = patch.status as WorkspaceFields["status"]
  }
  if (typeof patch.enrichmentStatus === "string") {
    normalized.enrichmentStatus = patch.enrichmentStatus as ClientEnrichmentStatus
  }
  if (typeof patch.outreachStatus === "string") {
    normalized.outreachStatus = patch.outreachStatus as ClientOutreachStatus
  }
  if (typeof patch.responseStatus === "string") {
    normalized.responseStatus = patch.responseStatus as ClientResponseStatus
  }
  if (typeof patch.attemptCount === "number") {
    normalized.attemptCount = patch.attemptCount
  }
  if (typeof patch.lastContactedAt === "string") {
    normalized.lastContactedAt = patch.lastContactedAt
  }
  if (typeof patch.nextFollowUpAt === "string") {
    normalized.nextFollowUpAt = patch.nextFollowUpAt
  }
  if (typeof patch.notes === "string") {
    normalized.notes = patch.notes
  }
  if (typeof patch.tags === "string") {
    normalized.tags = patch.tags
  }
  if (typeof patch.owner === "string") {
    normalized.owner = patch.owner
  }

  return normalized
}

function workspaceFromJson(
  value: unknown,
  fallback: {
    enrichmentStatus: ClientEnrichmentStatus
    cleanlyStatus: WorkspaceFields["status"]
    outreachStatus: ClientOutreachStatus
    responseStatus: ClientResponseStatus
    attemptCount: number
    lastContactedAt: string
    nextFollowUpAt: string
    notes: string
  }
): WorkspaceFields {
  const workspace =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>).workspace
      : undefined
  const workspaceObject =
    workspace && typeof workspace === "object" && !Array.isArray(workspace)
      ? (workspace as Partial<WorkspaceFields>)
      : {}

  return {
    status: workspaceObject.status ?? fallback.cleanlyStatus,
    enrichmentStatus:
      workspaceObject.enrichmentStatus ?? fallback.enrichmentStatus,
    outreachStatus: workspaceObject.outreachStatus ?? fallback.outreachStatus,
    responseStatus: workspaceObject.responseStatus ?? fallback.responseStatus,
    attemptCount: workspaceObject.attemptCount ?? fallback.attemptCount,
    lastContactedAt: workspaceObject.lastContactedAt ?? fallback.lastContactedAt,
    nextFollowUpAt: workspaceObject.nextFollowUpAt ?? fallback.nextFollowUpAt,
    notes: workspaceObject.notes ?? fallback.notes,
    tags: workspaceObject.tags ?? "",
    owner: workspaceObject.owner ?? "",
  }
}

export async function listProjectSummaries(): Promise<ProjectSummary[]> {
  const prisma = getPrisma()
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      files: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      _count: {
        select: { leads: true },
      },
    },
  })

  return projects.map((project) => {
    const file = project.files[0]
    return {
      id: project.id,
      name: project.name,
      fileName: file?.originalFilename ?? "",
      rowCount: project._count.leads,
      status: project.status,
      uploadWeek: file?.uploadWeek ?? "unassigned",
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    }
  })
}

export async function getProjectSnapshot(projectId: string) {
  const prisma = getPrisma()
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      files: {
        orderBy: { uploadDate: "asc" },
      },
      leads: {
        orderBy: { rowIndex: "asc" },
      },
    },
  })

  if (!project) return null

  const file = project.files[0]
  const projectMetadata = (file?.displayName
    ? file
    : null) as typeof file | null
  const firstLead = project.leads[0]
  const firstLeadData = firstLead?.enrichmentData as Record<string, unknown> | undefined
  const headers = normalizeStringArray(firstLeadData?.headers)
  const selectedNpiColumn =
    typeof firstLeadData?.selectedNpiColumn === "string"
      ? firstLeadData.selectedNpiColumn
      : ""
  const selectedFields =
    normalizeSelectedFields(firstLeadData?.selectedFields).length > 0
      ? normalizeSelectedFields(firstLeadData?.selectedFields)
      : (Object.keys(NPI_FIELD_DEFINITIONS) as EnrichFieldKey[])

  return {
    id: project.id,
    name: project.name,
    fileName: projectMetadata?.originalFilename ?? "",
    assignedWeek: projectMetadata?.uploadWeek ?? "unassigned",
    headers,
    selectedNpiColumn,
    selectedFields,
    leads: project.leads.map((lead): LeadRecord => {
      const enrichmentData = lead.enrichmentData as Record<string, unknown>
      const workspace = workspaceFromJson(enrichmentData, {
        enrichmentStatus: enrichmentStatusFromDb[lead.enrichmentStatus],
        cleanlyStatus: fromCleanlyStatus(lead.cleanlyStatus),
        outreachStatus: outreachStatusFromDb[lead.outreachStatus],
        responseStatus: responseStatusFromDb[lead.responseStatus],
        attemptCount: lead.attemptCount,
        lastContactedAt: lead.lastContactedAt?.toISOString().slice(0, 10) ?? "",
        nextFollowUpAt: lead.nextFollowUpAt?.toISOString().slice(0, 10) ?? "",
        notes: lead.notes,
      })

      return {
        id: lead.id,
        original: normalizeCsvRow(lead.rawRowData),
        enriched: normalizeEnrichedFields(enrichmentData.fields),
        workspace,
        normalizedNpi: lead.npiNumber,
        normalizedPhone: lead.phone,
        normalizedZip: lead.zip,
        normalizedState: lead.state,
        issues: normalizeStringArray(enrichmentData.issues),
        duplicateKeys: normalizeStringArray(enrichmentData.duplicateKeys),
        qualityScore:
          typeof enrichmentData.qualityScore === "number"
            ? enrichmentData.qualityScore
            : 0,
        createdAt: lead.createdAt.toISOString(),
        updatedAt: lead.updatedAt.toISOString(),
      }
    }),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  } satisfies LeadProjectSnapshot
}

export async function saveProjectSnapshot(snapshot: LeadProjectSnapshot) {
  const prisma = getPrisma()
  const now = new Date()
  const projectId = snapshot.id
  const fileId = `${projectId}-file`
  const uploadDate = snapshot.createdAt ? new Date(snapshot.createdAt) : now

  await prisma.$transaction(async (tx) => {
    await tx.project.upsert({
      where: { id: projectId },
      create: {
        id: projectId,
        name: snapshot.name,
        description: "",
        status: ProjectStatus.ACTIVE,
      },
      update: {
        name: snapshot.name,
        status: ProjectStatus.ACTIVE,
      },
    })

    await tx.leadFile.deleteMany({
      where: { projectId },
    })

    await tx.leadFile.create({
      data: {
        id: fileId,
        projectId,
        originalFilename: snapshot.fileName,
        displayName: snapshot.name,
        fileType: "csv",
        uploadDate,
        uploadWeek: snapshot.assignedWeek || getUploadWeek(snapshot.createdAt),
        uploadedBy: "",
        rowCount: snapshot.leads.length,
        status: LeadFileStatus.IMPORTED,
      },
    })

    if (snapshot.leads.length > 0) {
      await tx.lead.createMany({
        data: snapshot.leads.map((lead, index) => {
          const enrichmentData = {
            fields: lead.enriched,
            workspace: lead.workspace,
            issues: lead.issues,
            duplicateKeys: lead.duplicateKeys,
            qualityScore: lead.qualityScore,
            headers: snapshot.headers,
            selectedNpiColumn: snapshot.selectedNpiColumn,
            selectedFields: snapshot.selectedFields,
            assignedWeek: snapshot.assignedWeek,
          } as unknown as Prisma.InputJsonValue

          return {
            id: lead.id,
            projectId,
            fileId,
            rowIndex: index,
            npiNumber: lead.normalizedNpi,
            firstName: lead.enriched.firstName,
            lastName: lead.enriched.lastName,
            fullName: getFullName(lead),
            organizationName: lead.enriched.organizationName,
            email: getLeadEmail(lead.original),
            phone: lead.normalizedPhone || lead.enriched.practicePhone,
            fax: lead.enriched.practiceFax,
            address: lead.enriched.practiceAddress1,
            city: lead.enriched.practiceCity,
            state: lead.normalizedState || lead.enriched.practiceState,
            zip: lead.normalizedZip || lead.enriched.practiceZip,
            specialty: lead.enriched.primaryTaxonomy,
            primaryTaxonomy: lead.enriched.primaryTaxonomy,
            rawRowData: lead.original as Prisma.InputJsonValue,
            enrichmentData,
            enrichmentStatus:
              enrichmentStatusToDb[lead.workspace.enrichmentStatus],
            cleanlyStatus: toCleanlyStatus(lead.workspace.status),
            outreachStatus: outreachStatusToDb[lead.workspace.outreachStatus],
            responseStatus: responseStatusToDb[lead.workspace.responseStatus],
            attemptCount: lead.workspace.attemptCount,
            lastContactedAt: toDate(lead.workspace.lastContactedAt),
            nextFollowUpAt: toDate(lead.workspace.nextFollowUpAt),
            notes: lead.workspace.notes,
          }
        }),
      })
    }

    await tx.activityLog.create({
      data: {
        entityType: ActivityEntityType.PROJECT,
        entityId: projectId,
        action: "project.snapshot_saved",
        metadata: {
          fileName: snapshot.fileName,
          rowCount: snapshot.leads.length,
        },
      },
    })
  })

  return getProjectSnapshot(projectId)
}

export async function deleteProjectSnapshot(projectId: string) {
  const prisma = getPrisma()
  await prisma.project.delete({
    where: { id: projectId },
  })
}

export async function updateProjectWeek(projectId: string, uploadWeek: string) {
  const prisma = getPrisma()
  const nextWeek = uploadWeek || "unassigned"

  await prisma.$transaction([
    prisma.leadFile.updateMany({
      where: { projectId },
      data: {
        uploadWeek: nextWeek,
      },
    }),
    prisma.project.update({
      where: { id: projectId },
      data: {
        updatedAt: new Date(),
      },
    }),
    prisma.activityLog.create({
      data: {
        entityType: ActivityEntityType.FILE,
        entityId: projectId,
        action: "file.week_assigned",
        metadata: {
          uploadWeek: nextWeek,
        },
      },
    }),
  ])

  return getProjectSnapshot(projectId)
}

export async function updateLeadWorkspace(
  projectId: string,
  leadId: string,
  patchValue: unknown
) {
  const prisma = getPrisma()
  const patch = normalizeWorkspacePatch(patchValue)
  const existing = await prisma.lead.findFirst({
    where: {
      id: leadId,
      projectId,
    },
  })

  if (!existing) return null

  const existingEnrichmentData =
    existing.enrichmentData &&
    typeof existing.enrichmentData === "object" &&
    !Array.isArray(existing.enrichmentData)
      ? (existing.enrichmentData as Record<string, unknown>)
      : {}
  const workspace = workspaceFromJson(existingEnrichmentData, {
    enrichmentStatus: enrichmentStatusFromDb[existing.enrichmentStatus],
    cleanlyStatus: fromCleanlyStatus(existing.cleanlyStatus),
    outreachStatus: outreachStatusFromDb[existing.outreachStatus],
    responseStatus: responseStatusFromDb[existing.responseStatus],
    attemptCount: existing.attemptCount,
    lastContactedAt: existing.lastContactedAt?.toISOString().slice(0, 10) ?? "",
    nextFollowUpAt: existing.nextFollowUpAt?.toISOString().slice(0, 10) ?? "",
    notes: existing.notes,
  })
  const nextWorkspace: WorkspaceFields = {
    ...workspace,
    ...patch,
  }

  if (
    patch.outreachStatus &&
    patch.outreachStatus !== "not_contacted" &&
    nextWorkspace.attemptCount < 1
  ) {
    nextWorkspace.attemptCount = 1
  }

  const nextEnrichmentData = {
    ...existingEnrichmentData,
    workspace: nextWorkspace,
  } as unknown as Prisma.InputJsonValue

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: leadId },
      data: {
        enrichmentData: nextEnrichmentData,
        enrichmentStatus: enrichmentStatusToDb[nextWorkspace.enrichmentStatus],
        cleanlyStatus: toCleanlyStatus(nextWorkspace.status),
        outreachStatus: outreachStatusToDb[nextWorkspace.outreachStatus],
        responseStatus: responseStatusToDb[nextWorkspace.responseStatus],
        attemptCount: nextWorkspace.attemptCount,
        lastContactedAt: toDate(nextWorkspace.lastContactedAt),
        nextFollowUpAt: toDate(nextWorkspace.nextFollowUpAt),
        notes: nextWorkspace.notes,
      },
    }),
    prisma.project.update({
      where: { id: projectId },
      data: {
        updatedAt: new Date(),
      },
    }),
  ])

  return getProjectSnapshot(projectId)
}
