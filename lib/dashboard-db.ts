import { format } from "date-fns"

import { getPrisma } from "@/lib/db"
import {
  CleanlyStatus,
  EnrichmentStatus,
  OutreachStatus,
  ResponseStatus,
} from "@/lib/generated/prisma/client"

export interface DashboardTotals {
  files: number
  totalLeads: number
  enrichedLeads: number
  invalidFailed: number
  needsReview: number
  readyForOutreach: number
  followUpsDue: number
  contacted: number
  responded: number
}

export interface DashboardTimePoint {
  key: string
  label: string
  imported: number
  enriched: number
  needsReview: number
  ready: number
  contacted: number
  responded: number
  enrichmentRate: number
  outreachRate: number
}

export interface DashboardDistributionPoint {
  key: string
  label: string
  value: number
  fill: string
}

export interface DashboardQualityPoint {
  metric: string
  score: number
  count: number
  total: number
}

export interface DashboardRankPoint {
  label: string
  value: number
  detail?: string
}

export interface DashboardFollowUpPoint {
  id: string
  name: string
  fileName: string
  date: string
  status: string
}

export interface DashboardFileReviewPoint {
  id: string
  name: string
  projectName: string
  uploadWeek: string
  needsReview: number
  failed: number
  total: number
}

export interface DashboardAnalytics {
  generatedAt: string
  totals: DashboardTotals
  timeSeries: DashboardTimePoint[]
  outreachDistribution: DashboardDistributionPoint[]
  responseDistribution: DashboardDistributionPoint[]
  enrichmentDistribution: DashboardDistributionPoint[]
  qualityRadar: DashboardQualityPoint[]
  topStates: DashboardRankPoint[]
  topSpecialties: DashboardRankPoint[]
  followUpsDue: DashboardFollowUpPoint[]
  filesNeedingReview: DashboardFileReviewPoint[]
}

const EMPTY_TOTALS: DashboardTotals = {
  files: 0,
  totalLeads: 0,
  enrichedLeads: 0,
  invalidFailed: 0,
  needsReview: 0,
  readyForOutreach: 0,
  followUpsDue: 0,
  contacted: 0,
  responded: 0,
}

const OUTREACH_META: Record<
  OutreachStatus,
  { label: string; fill: string }
> = {
  [OutreachStatus.NOT_CONTACTED]: {
    label: "Not contacted",
    fill: "#64748b",
  },
  [OutreachStatus.CONTACTED]: { label: "Contacted", fill: "#2563eb" },
  [OutreachStatus.FOLLOW_UP_NEEDED]: {
    label: "Follow-up needed",
    fill: "#f59e0b",
  },
  [OutreachStatus.RESPONDED]: { label: "Responded", fill: "#10b981" },
  [OutreachStatus.NOT_INTERESTED]: {
    label: "Not interested",
    fill: "#78716c",
  },
  [OutreachStatus.BAD_CONTACT]: { label: "Bad contact", fill: "#ef4444" },
  [OutreachStatus.DO_NOT_CONTACT]: {
    label: "Do not contact",
    fill: "#991b1b",
  },
}

const RESPONSE_META: Record<
  ResponseStatus,
  { label: string; fill: string }
> = {
  [ResponseStatus.UNKNOWN]: { label: "Unknown", fill: "#64748b" },
  [ResponseStatus.NO_RESPONSE]: { label: "No response", fill: "#94a3b8" },
  [ResponseStatus.POSITIVE]: { label: "Positive", fill: "#10b981" },
  [ResponseStatus.NEGATIVE]: { label: "Negative", fill: "#ef4444" },
  [ResponseStatus.NEEDS_FOLLOW_UP]: {
    label: "Needs follow-up",
    fill: "#f59e0b",
  },
}

const ENRICHMENT_META: Record<
  EnrichmentStatus,
  { label: string; fill: string }
> = {
  [EnrichmentStatus.NOT_ENRICHED]: {
    label: "Not enriched",
    fill: "#64748b",
  },
  [EnrichmentStatus.ENRICHED]: { label: "Enriched", fill: "#10b981" },
  [EnrichmentStatus.NOT_FOUND]: { label: "Not found", fill: "#f59e0b" },
  [EnrichmentStatus.INVALID_NPI]: { label: "Invalid NPI", fill: "#f97316" },
  [EnrichmentStatus.ERROR]: { label: "Error", fill: "#ef4444" },
}

function emptyDistribution<T extends string>(
  meta: Record<T, { label: string; fill: string }>
): DashboardDistributionPoint[] {
  return (Object.keys(meta) as T[]).map((key) => ({
    key,
    label: meta[key].label,
    value: 0,
    fill: meta[key].fill,
  }))
}

export function createEmptyDashboardAnalytics(): DashboardAnalytics {
  return {
    generatedAt: new Date().toISOString(),
    totals: EMPTY_TOTALS,
    timeSeries: [],
    outreachDistribution: emptyDistribution(OUTREACH_META),
    responseDistribution: emptyDistribution(RESPONSE_META),
    enrichmentDistribution: emptyDistribution(ENRICHMENT_META),
    qualityRadar: [
      { metric: "NPI Validity", score: 0, count: 0, total: 0 },
      { metric: "Phone Coverage", score: 0, count: 0, total: 0 },
      { metric: "Fax Coverage", score: 0, count: 0, total: 0 },
      { metric: "Address Coverage", score: 0, count: 0, total: 0 },
      { metric: "Enrichment Success", score: 0, count: 0, total: 0 },
      { metric: "Follow-up Readiness", score: 0, count: 0, total: 0 },
    ],
    topStates: [],
    topSpecialties: [],
    followUpsDue: [],
    filesNeedingReview: [],
  }
}

function percentage(count: number, total: number) {
  if (!total) return 0
  return Math.round((count / total) * 100)
}

function incrementMap(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount)
}

function mapToTopList(map: Map<string, number>, limit: number): DashboardRankPoint[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }))
}

function isFailedEnrichment(status: EnrichmentStatus) {
  return (
    status === EnrichmentStatus.INVALID_NPI ||
    status === EnrichmentStatus.NOT_FOUND ||
    status === EnrichmentStatus.ERROR
  )
}

function isContacted(status: OutreachStatus) {
  return status !== OutreachStatus.NOT_CONTACTED
}

function isResponded(outreach: OutreachStatus, response: ResponseStatus) {
  return (
    outreach === OutreachStatus.RESPONDED ||
    response === ResponseStatus.POSITIVE ||
    response === ResponseStatus.NEGATIVE
  )
}

function isReadyForOutreach(status: CleanlyStatus, enrichment: EnrichmentStatus) {
  return (
    status === CleanlyStatus.CLEANED ||
    status === CleanlyStatus.APPROVED ||
    enrichment === EnrichmentStatus.ENRICHED
  )
}

function getTimeKey(date: Date) {
  return format(date, "yyyy-MM")
}

function getTimeLabel(date: Date) {
  return format(date, "MMM yyyy")
}

export async function getDashboardAnalytics(): Promise<DashboardAnalytics> {
  const prisma = getPrisma()
  const now = new Date()

  const [files, leads] = await Promise.all([
    prisma.leadFile.findMany({
      include: {
        project: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        uploadDate: "asc",
      },
    }),
    prisma.lead.findMany({
      include: {
        file: {
          select: {
            displayName: true,
            originalFilename: true,
            uploadDate: true,
            uploadWeek: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
  ])

  const totalLeads = leads.length
  const totals: DashboardTotals = {
    files: files.length,
    totalLeads,
    enrichedLeads: leads.filter(
      (lead) => lead.enrichmentStatus === EnrichmentStatus.ENRICHED
    ).length,
    invalidFailed: leads.filter((lead) => isFailedEnrichment(lead.enrichmentStatus))
      .length,
    needsReview: leads.filter(
      (lead) => lead.cleanlyStatus === CleanlyStatus.NEEDS_REVIEW
    ).length,
    readyForOutreach: leads.filter((lead) =>
      isReadyForOutreach(lead.cleanlyStatus, lead.enrichmentStatus)
    ).length,
    followUpsDue: leads.filter(
      (lead) => lead.nextFollowUpAt && lead.nextFollowUpAt <= now
    ).length,
    contacted: leads.filter((lead) => isContacted(lead.outreachStatus)).length,
    responded: leads.filter((lead) =>
      isResponded(lead.outreachStatus, lead.responseStatus)
    ).length,
  }

  const timeMap = new Map<
    string,
    {
      label: string
      imported: number
      enriched: number
      needsReview: number
      ready: number
      contacted: number
      responded: number
    }
  >()
  const outreachCounts = new Map<OutreachStatus, number>()
  const responseCounts = new Map<ResponseStatus, number>()
  const enrichmentCounts = new Map<EnrichmentStatus, number>()
  const stateCounts = new Map<string, number>()
  const specialtyCounts = new Map<string, number>()
  const fileReviewCounts = new Map<string, { needsReview: number; failed: number }>()

  for (const lead of leads) {
    const date = lead.file.uploadDate ?? lead.createdAt
    const key = getTimeKey(date)
    const current = timeMap.get(key) ?? {
      label: getTimeLabel(date),
      imported: 0,
      enriched: 0,
      needsReview: 0,
      ready: 0,
      contacted: 0,
      responded: 0,
    }

    current.imported += 1
    if (lead.enrichmentStatus === EnrichmentStatus.ENRICHED) current.enriched += 1
    if (lead.cleanlyStatus === CleanlyStatus.NEEDS_REVIEW) current.needsReview += 1
    if (isReadyForOutreach(lead.cleanlyStatus, lead.enrichmentStatus)) {
      current.ready += 1
    }
    if (isContacted(lead.outreachStatus)) current.contacted += 1
    if (isResponded(lead.outreachStatus, lead.responseStatus)) current.responded += 1
    timeMap.set(key, current)

    incrementMap(outreachCounts, lead.outreachStatus)
    incrementMap(responseCounts, lead.responseStatus)
    incrementMap(enrichmentCounts, lead.enrichmentStatus)
    incrementMap(stateCounts, lead.state.trim() || "Unknown")
    incrementMap(
      specialtyCounts,
      lead.primaryTaxonomy.trim() || lead.specialty.trim() || "Unknown"
    )

    if (
      lead.cleanlyStatus === CleanlyStatus.NEEDS_REVIEW ||
      isFailedEnrichment(lead.enrichmentStatus)
    ) {
      const currentFileCounts = fileReviewCounts.get(lead.fileId) ?? {
        needsReview: 0,
        failed: 0,
      }
      if (lead.cleanlyStatus === CleanlyStatus.NEEDS_REVIEW) {
        currentFileCounts.needsReview += 1
      }
      if (isFailedEnrichment(lead.enrichmentStatus)) {
        currentFileCounts.failed += 1
      }
      fileReviewCounts.set(lead.fileId, currentFileCounts)
    }
  }

  const timeSeries = [...timeMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({
      key,
      ...value,
      enrichmentRate: percentage(value.enriched, value.imported),
      outreachRate: percentage(value.contacted, value.imported),
    }))

  const qualityRadar: DashboardQualityPoint[] = [
    {
      metric: "NPI Validity",
      count: leads.filter((lead) => /^\d{10}$/.test(lead.npiNumber)).length,
      total: totalLeads,
      score: 0,
    },
    {
      metric: "Phone Coverage",
      count: leads.filter((lead) => Boolean(lead.phone.trim())).length,
      total: totalLeads,
      score: 0,
    },
    {
      metric: "Fax Coverage",
      count: leads.filter((lead) => Boolean(lead.fax.trim())).length,
      total: totalLeads,
      score: 0,
    },
    {
      metric: "Address Coverage",
      count: leads.filter((lead) =>
        Boolean(
          lead.address.trim() || lead.city.trim() || lead.state.trim() || lead.zip.trim()
        )
      ).length,
      total: totalLeads,
      score: 0,
    },
    {
      metric: "Enrichment Success",
      count: totals.enrichedLeads,
      total: totalLeads,
      score: 0,
    },
    {
      metric: "Follow-up Readiness",
      count: leads.filter(
        (lead) =>
          Boolean(lead.nextFollowUpAt) ||
          lead.outreachStatus === OutreachStatus.FOLLOW_UP_NEEDED
      ).length,
      total: totalLeads,
      score: 0,
    },
  ].map((item) => ({ ...item, score: percentage(item.count, item.total) }))

  const followUpsDue = leads
    .filter((lead) => Boolean(lead.nextFollowUpAt))
    .sort(
      (a, b) =>
        (a.nextFollowUpAt?.getTime() ?? 0) - (b.nextFollowUpAt?.getTime() ?? 0)
    )
    .slice(0, 8)
    .map((lead) => ({
      id: lead.id,
      name:
        lead.fullName ||
        `${lead.firstName} ${lead.lastName}`.trim() ||
        lead.organizationName ||
        lead.npiNumber ||
        "Untitled lead",
      fileName: lead.file.displayName || lead.file.originalFilename,
      date: lead.nextFollowUpAt?.toISOString() ?? "",
      status: OUTREACH_META[lead.outreachStatus].label,
    }))

  const filesNeedingReview = files
    .map((file) => {
      const counts = fileReviewCounts.get(file.id) ?? { needsReview: 0, failed: 0 }
      return {
        id: file.id,
        name: file.displayName,
        projectName: file.project.name,
        uploadWeek: file.uploadWeek,
        needsReview: counts.needsReview,
        failed: counts.failed,
        total: file.rowCount,
      }
    })
    .filter((file) => file.needsReview > 0 || file.failed > 0)
    .sort((a, b) => b.needsReview + b.failed - (a.needsReview + a.failed))
    .slice(0, 8)

  return {
    generatedAt: now.toISOString(),
    totals,
    timeSeries,
    outreachDistribution: emptyDistribution(OUTREACH_META).map((item) => ({
      ...item,
      value: outreachCounts.get(item.key as OutreachStatus) ?? 0,
    })),
    responseDistribution: emptyDistribution(RESPONSE_META).map((item) => ({
      ...item,
      value: responseCounts.get(item.key as ResponseStatus) ?? 0,
    })),
    enrichmentDistribution: emptyDistribution(ENRICHMENT_META).map((item) => ({
      ...item,
      value: enrichmentCounts.get(item.key as EnrichmentStatus) ?? 0,
    })),
    qualityRadar,
    topStates: mapToTopList(stateCounts, 8),
    topSpecialties: mapToTopList(specialtyCounts, 8),
    followUpsDue,
    filesNeedingReview,
  }
}
