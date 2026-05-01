"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import type { ChangeEvent, DragEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  addWeeks,
  eachWeekOfInterval,
  endOfWeek,
  format,
  getISOWeek,
  parseISO,
  startOfMonth,
  startOfWeek,
  subWeeks,
} from "date-fns"
import Papa from "papaparse"
import pLimit from "p-limit"
import {
  AlertCircle,
  ArrowUpDown,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Copy,
  Download,
  FileSpreadsheet,
  Filter,
  FolderKanban,
  LoaderCircle,
  PanelRight,
  RefreshCcw,
  Save,
  Search,
  Settings2,
  Table2,
  Upload,
  Workflow,
  X,
} from "lucide-react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Label,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from "recharts"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Progress } from "@/components/ui/progress"
import { Select } from "@/components/ui/select"
import {
  createEmptyEnrichedFields,
  DEFAULT_SELECTED_FIELDS,
  normalizeNpi,
  NPI_FIELD_DEFINITIONS,
  type EnrichFieldKey,
  type EnrichedNpiFields,
  type NpiLookupResponse,
} from "@/lib/npi"

type CsvRow = Record<string, string>
type EnrichmentStatus =
  | "not_enriched"
  | "enriched"
  | "not_found"
  | "invalid_npi"
  | "error"
type OutreachStatus =
  | "not_contacted"
  | "contacted"
  | "follow_up_needed"
  | "responded"
  | "not_interested"
  | "bad_contact"
  | "do_not_contact"
type ResponseStatus =
  | "unknown"
  | "no_response"
  | "positive"
  | "negative"
  | "needs_follow_up"
type ViewKey =
  | "all"
  | "cleanup"
  | "enrichment_issues"
  | "not_contacted"
  | "follow_ups"
  | "responded"
  | "missing_phone"
  | "high_priority"
type ExportMode = "all" | "filtered" | "clean" | "failed" | "follow_up"
type SortKey =
  | "qualityScore"
  | "outreachStatus"
  | "responseStatus"
  | "state"
  | "specialty"
  | "lastContactedAt"
  | "nextFollowUpAt"
type LeadColumnKey =
  | "lead"
  | "npi"
  | "phone"
  | "organization"
  | "specialty"
  | "address"
  | "city"
  | "state"
  | "zip"
  | "quality"
  | "enrichment"
  | "outreach"
  | "response"
  | "lastContacted"
  | "followUp"
  | "owner"
  | "attempts"
  | "tags"
  | "issues"
type TabKey =
  | "enrich"
  | "workspace"
  | "files"
  | "weekly"
  | "leads"
  | "dashboard"
  | "settings"

interface WorkspaceFields {
  status: "active" | "needs_review" | "clean" | "archived"
  enrichmentStatus: EnrichmentStatus
  outreachStatus: OutreachStatus
  responseStatus: ResponseStatus
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

interface LeadProject {
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

interface PendingImport {
  id: string
  name: string
  fileName: string
  headers: string[]
  rows: CsvRow[]
  selectedNpiColumn: string
  selectedFields: EnrichFieldKey[]
  createdAt: string
}

interface ProjectSummary {
  id: string
  name: string
  fileName: string
  rowCount: number
  status: string
  uploadWeek: string
  createdAt: string
  updatedAt: string
}

interface ProcessingStats {
  total: number
  processed: number
  success: number
  failed: number
}

interface DashboardTotals {
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

interface DashboardTimePoint {
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

interface DashboardDistributionPoint {
  key: string
  label: string
  value: number
  fill: string
}

interface DashboardQualityPoint {
  metric: string
  score: number
  count: number
  total: number
}

interface DashboardRankPoint {
  label: string
  value: number
  detail?: string
}

interface DashboardFollowUpPoint {
  id: string
  name: string
  fileName: string
  date: string
  status: string
}

interface DashboardFileReviewPoint {
  id: string
  name: string
  projectName: string
  uploadWeek: string
  needsReview: number
  failed: number
  total: number
}

interface DashboardAnalytics {
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

type EnrichmentToast =
  | { status: "idle" }
  | { status: "processing" }
  | { status: "complete"; stats: ProcessingStats }

const numberFormatter = new Intl.NumberFormat("en-US")
const WEEK_STARTS_ON = 1
const initialStats: ProcessingStats = {
  total: 0,
  processed: 0,
  success: 0,
  failed: 0,
}

const EMPTY_DASHBOARD_ANALYTICS: DashboardAnalytics = {
  generatedAt: "",
  totals: {
    files: 0,
    totalLeads: 0,
    enrichedLeads: 0,
    invalidFailed: 0,
    needsReview: 0,
    readyForOutreach: 0,
    followUpsDue: 0,
    contacted: 0,
    responded: 0,
  },
  timeSeries: [],
  outreachDistribution: [],
  responseDistribution: [],
  enrichmentDistribution: [],
  qualityRadar: [],
  topStates: [],
  topSpecialties: [],
  followUpsDue: [],
  filesNeedingReview: [],
}

const DASHBOARD_AREA_CONFIG = {
  imported: {
    label: "Imported",
    color: "#2563eb",
  },
  enriched: {
    label: "Enriched",
    color: "#10b981",
  },
  needsReview: {
    label: "Needs review",
    color: "#f59e0b",
  },
  ready: {
    label: "Ready",
    color: "#14b8a6",
  },
  contacted: {
    label: "Contacted",
    color: "#6366f1",
  },
} satisfies ChartConfig

const DASHBOARD_RATE_CONFIG = {
  enrichmentRate: {
    label: "Enrichment rate",
    color: "#10b981",
  },
  outreachRate: {
    label: "Outreach rate",
    color: "#2563eb",
  },
} satisfies ChartConfig

const DASHBOARD_QUALITY_CONFIG = {
  score: {
    label: "Score",
    color: "#2563eb",
  },
} satisfies ChartConfig

const DASHBOARD_RADIAL_CONFIG = {
  enrichment: {
    label: "Enrichment",
    color: "#10b981",
  },
  outreach: {
    label: "Outreach",
    color: "#2563eb",
  },
} satisfies ChartConfig

const WORKSPACE_HEADERS = [
  "Cleanly_Status",
  "Cleanly_Enrichment_Status",
  "Cleanly_Outreach_Status",
  "Cleanly_Response_Status",
  "Cleanly_Attempt_Count",
  "Cleanly_Last_Contacted_At",
  "Cleanly_Next_Follow_Up_At",
  "Cleanly_Notes",
  "Cleanly_Tags",
  "Cleanly_Owner",
  "Cleanly_Data_Quality",
  "Cleanly_Issues",
]

const OUTREACH_STATUS_LABELS: Record<OutreachStatus, string> = {
  not_contacted: "Not contacted",
  contacted: "Contacted",
  follow_up_needed: "Follow-up needed",
  responded: "Responded",
  not_interested: "Not interested",
  bad_contact: "Bad contact",
  do_not_contact: "Do not contact",
}

const RESPONSE_STATUS_LABELS: Record<ResponseStatus, string> = {
  unknown: "Unknown",
  no_response: "No response",
  positive: "Positive",
  negative: "Negative",
  needs_follow_up: "Needs follow-up",
}

const ENRICHMENT_STATUS_LABELS: Record<EnrichmentStatus, string> = {
  not_enriched: "Not enriched",
  enriched: "Enriched",
  not_found: "Not found",
  invalid_npi: "Invalid NPI",
  error: "Error",
}

const OUTREACH_STATUS_CLASSES: Record<OutreachStatus, string> = {
  not_contacted: "border-zinc-300 bg-zinc-50 text-zinc-700",
  contacted: "border-sky-300 bg-sky-50 text-sky-800",
  follow_up_needed: "border-amber-300 bg-amber-50 text-amber-800",
  responded: "border-emerald-300 bg-emerald-50 text-emerald-800",
  not_interested: "border-stone-300 bg-stone-50 text-stone-700",
  bad_contact: "border-rose-300 bg-rose-50 text-rose-800",
  do_not_contact: "border-red-300 bg-red-50 text-red-800",
}

const RESPONSE_STATUS_CLASSES: Record<ResponseStatus, string> = {
  unknown: "border-zinc-300 bg-zinc-50 text-zinc-700",
  no_response: "border-slate-300 bg-slate-50 text-slate-700",
  positive: "border-emerald-300 bg-emerald-50 text-emerald-800",
  negative: "border-red-300 bg-red-50 text-red-800",
  needs_follow_up: "border-amber-300 bg-amber-50 text-amber-800",
}

const ENRICHMENT_STATUS_CLASSES: Record<EnrichmentStatus, string> = {
  not_enriched: "border-zinc-300 bg-zinc-50 text-zinc-700",
  enriched: "border-emerald-300 bg-emerald-50 text-emerald-800",
  not_found: "border-amber-300 bg-amber-50 text-amber-800",
  invalid_npi: "border-orange-300 bg-orange-50 text-orange-800",
  error: "border-red-300 bg-red-50 text-red-800",
}

const LEAD_COLUMN_LABELS: Record<LeadColumnKey, string> = {
  lead: "Lead",
  npi: "NPI",
  phone: "Phone",
  organization: "Organization",
  specialty: "Specialty",
  address: "Address",
  city: "City",
  state: "State",
  zip: "ZIP",
  quality: "Quality",
  enrichment: "Enrichment",
  outreach: "Outreach",
  response: "Response",
  lastContacted: "Last Contacted",
  followUp: "Follow-Up",
  owner: "Owner",
  attempts: "Attempts",
  tags: "Tags",
  issues: "Issues",
}

const DEFAULT_VISIBLE_LEAD_COLUMNS: Record<LeadColumnKey, boolean> = {
  lead: true,
  npi: true,
  phone: false,
  organization: false,
  specialty: true,
  address: false,
  city: false,
  state: true,
  zip: false,
  quality: true,
  enrichment: true,
  outreach: true,
  response: true,
  lastContacted: true,
  followUp: true,
  owner: false,
  attempts: false,
  tags: false,
  issues: false,
}

const VIEW_LABELS: Record<ViewKey, string> = {
  all: "All Leads",
  cleanup: "Needs Cleanup",
  enrichment_issues: "Enrichment Issues",
  not_contacted: "Not Contacted",
  follow_ups: "Follow Ups",
  responded: "Responded",
  missing_phone: "Missing Phone",
  high_priority: "High Priority",
}

const TAB_LABELS: Record<TabKey, string> = {
  enrich: "Enrich",
  workspace: "Workspace",
  files: "Files",
  weekly: "Weekly Workflow",
  leads: "Leads",
  dashboard: "Dashboard",
  settings: "Settings",
}

const TAB_ROUTES: Record<TabKey, string> = {
  enrich: "/",
  workspace: "/workspace",
  files: "/files",
  weekly: "/weekly",
  leads: "/leads",
  dashboard: "/dashboard",
  settings: "/settings",
}

const TAB_ICONS: Record<TabKey, React.ComponentType<{ className?: string }>> = {
  enrich: Upload,
  workspace: FolderKanban,
  files: FileSpreadsheet,
  weekly: Workflow,
  leads: Table2,
  dashboard: ChartNoAxesCombined,
  settings: Settings2,
}

function makeHeadersUnique(rawHeaders: string[]) {
  const counts = new Map<string, number>()

  return rawHeaders.map((header, index) => {
    const baseHeader = header.trim() || `Column ${index + 1}`
    const nextCount = (counts.get(baseHeader) ?? 0) + 1
    counts.set(baseHeader, nextCount)

    return nextCount === 1 ? baseHeader : `${baseHeader} (${nextCount})`
  })
}

function isBlankRow(values: string[]) {
  return values.every((value) => value.trim() === "")
}

function toCsvRow(headers: string[], values: string[]) {
  return headers.reduce<CsvRow>((row, header, index) => {
    row[header] = values[index] ?? ""
    return row
  }, {})
}

function fileNameToProjectName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "") || "Healthcare Outreach List"
}

function detectNpiHeader(headers: string[]) {
  const normalizedTargets = new Set(["npi", "npinumber"])
  const exactMatch = headers.find((header) =>
    normalizedTargets.has(header.replace(/[\s_-]/g, "").toLowerCase())
  )

  if (exactMatch) return exactMatch

  return headers.find((header) => header.toLowerCase().includes("npi")) ?? headers[0] ?? ""
}

function getTabFromPath(pathname: string): TabKey | null {
  if (pathname === "/") return "enrich"

  const match = (Object.entries(TAB_ROUTES) as Array<[TabKey, string]>).find(
    ([, route]) => route !== "/" && pathname === route
  )

  return match?.[0] ?? null
}

function formatStat(value: number) {
  return numberFormatter.format(value)
}

function formatDateTime(value: string) {
  if (!value) return "-"

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatDateOnly(value: string) {
  if (!value) return "-"

  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatUploadDay(value: string) {
  if (!value) return "-"

  return new Date(value).toLocaleDateString([], {
    weekday: "long",
  })
}

function getWeekLabel(value: string) {
  if (!value) return "Unassigned"

  const weekStart = parseWeekKey(value) ?? startOfWeek(new Date(value), {
    weekStartsOn: WEEK_STARTS_ON,
  })
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: WEEK_STARTS_ON })

  return `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`
}

function getWeekKey(date: Date) {
  return format(startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON }), "yyyy-MM-dd")
}

function parseWeekKey(value: string) {
  if (!value || value === "unassigned") return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return startOfWeek(parseISO(value), { weekStartsOn: WEEK_STARTS_ON })
  }

  if (/^\d{4}-W\d{2}$/.test(value)) {
    const [yearText, weekText] = value.split("-W")
    const year = Number(yearText)
    const week = Number(weekText)
    const janFourth = new Date(year, 0, 4)
    return addWeeks(
      startOfWeek(janFourth, { weekStartsOn: WEEK_STARTS_ON }),
      week - 1
    )
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null

  return startOfWeek(parsed, { weekStartsOn: WEEK_STARTS_ON })
}

function getWeekMonthLabel(weekKey: string) {
  const weekStart = parseWeekKey(weekKey)
  if (!weekStart) return "Unassigned"

  return format(startOfMonth(weekStart), "MMMM yyyy")
}

function getWeekRangeLabel(weekKey: string) {
  const weekStart = parseWeekKey(weekKey)
  if (!weekStart) return "Unassigned"

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: WEEK_STARTS_ON })
  return `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`
}

function getWeekShortLabel(weekKey: string) {
  const weekStart = parseWeekKey(weekKey)
  if (!weekStart) return "Unassigned"

  return `Week ${getISOWeek(weekStart)}`
}

function getWeekOptions(projects: ProjectSummary[], activeProject?: LeadProject | null) {
  const today = new Date()
  const starts = new Set<string>()

  eachWeekOfInterval(
    {
      start: subWeeks(today, 8),
      end: addWeeks(today, 16),
    },
    { weekStartsOn: WEEK_STARTS_ON }
  ).forEach((weekStart) => {
    starts.add(getWeekKey(weekStart))
  })

  projects.forEach((project) => {
    const parsed = parseWeekKey(project.uploadWeek)
    if (parsed) starts.add(getWeekKey(parsed))
  })

  const activeParsed = parseWeekKey(activeProject?.assignedWeek ?? "")
  if (activeParsed) starts.add(getWeekKey(activeParsed))

  return [...starts].sort()
}

function getSelectedHeaderNames(selectedFields: EnrichFieldKey[]) {
  return selectedFields.map((fieldKey) => NPI_FIELD_DEFINITIONS[fieldKey].header)
}

function createWorkspaceFields(): WorkspaceFields {
  return {
    status: "active",
    enrichmentStatus: "not_enriched",
    outreachStatus: "not_contacted",
    responseStatus: "unknown",
    attemptCount: 0,
    lastContactedAt: "",
    nextFollowUpAt: "",
    notes: "",
    tags: "",
    owner: "",
  }
}

function findFirstValue(row: CsvRow, candidates: string[]) {
  const entry = Object.entries(row).find(([header]) => {
    const normalizedHeader = header.toLowerCase()
    return candidates.some((candidate) => normalizedHeader.includes(candidate))
  })

  return entry?.[1] ?? ""
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "")

  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1)
  }

  return digits.length >= 10 ? digits.slice(-10) : digits
}

function normalizeZip(value: string) {
  return value.replace(/\D/g, "").slice(0, 5)
}

function normalizeState(value: string) {
  return value.trim().slice(0, 2).toUpperCase()
}

function getLeadPhone(row: CsvRow, enriched: EnrichedNpiFields) {
  return (
    enriched.practicePhone ||
    findFirstValue(row, ["phone", "telephone", "tel", "mobile", "contact"])
  )
}

function getLeadZip(row: CsvRow, enriched: EnrichedNpiFields) {
  return enriched.practiceZip || findFirstValue(row, ["zip", "postal"])
}

function getLeadState(row: CsvRow, enriched: EnrichedNpiFields) {
  return enriched.practiceState || findFirstValue(row, ["state"])
}

function getLeadOrganization(row: CsvRow, enriched: EnrichedNpiFields) {
  return (
    enriched.organizationName ||
    findFirstValue(row, ["organization", "company", "practice", "facility", "name"])
  )
}

function getLeadDisplayName(lead: LeadRecord) {
  return (
    [lead.enriched.firstName, lead.enriched.lastName].filter(Boolean).join(" ") ||
    lead.enriched.organizationName ||
    getLeadOrganization(lead.original, lead.enriched) ||
    "Unnamed lead"
  )
}

function getLeadAddress(row: CsvRow, enriched: EnrichedNpiFields) {
  return (
    enriched.practiceAddress1 ||
    findFirstValue(row, ["address", "street", "location"])
  )
}

function qualityScoreForLead(lead: LeadRecord) {
  let score = 100

  if (!lead.normalizedNpi) score -= 24
  if (!lead.normalizedPhone || lead.normalizedPhone.length !== 10) score -= 18
  if (!lead.normalizedZip || lead.normalizedZip.length !== 5) score -= 10
  if (!lead.normalizedState || lead.normalizedState.length !== 2) score -= 8
  if (!getLeadOrganization(lead.original, lead.enriched)) score -= 10
  if (!lead.enriched.primaryTaxonomy) score -= 8
  if (lead.duplicateKeys.length > 0) score -= 14
  if (lead.workspace.enrichmentStatus === "not_found") score -= 12
  if (lead.workspace.enrichmentStatus === "error") score -= 10

  return Math.max(0, Math.min(100, score))
}

function buildLead(
  row: CsvRow,
  index: number,
  selectedNpiColumn: string,
  existing?: Partial<LeadRecord>
): LeadRecord {
  const now = new Date().toISOString()
  const enriched = existing?.enriched ?? createEmptyEnrichedFields()
  const original = existing?.original ?? row
  const normalizedNpi = normalizeNpi(original[selectedNpiColumn])
  const normalizedPhone = normalizePhone(getLeadPhone(original, enriched))
  const normalizedZip = normalizeZip(getLeadZip(original, enriched))
  const normalizedState = normalizeState(getLeadState(original, enriched))
  const enrichmentStatus =
    existing?.workspace?.enrichmentStatus ??
    (normalizedNpi ? "not_enriched" : "invalid_npi")

  return {
    id: existing?.id ?? `lead-${Date.now()}-${index}-${crypto.randomUUID()}`,
    original,
    enriched,
    workspace: {
      ...createWorkspaceFields(),
      ...existing?.workspace,
      enrichmentStatus,
    },
    normalizedNpi,
    normalizedPhone,
    normalizedZip,
    normalizedState,
    issues: existing?.issues ?? [],
    duplicateKeys: existing?.duplicateKeys ?? [],
    qualityScore: existing?.qualityScore ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

function withCleaningAnalysis(leads: LeadRecord[]) {
  const duplicateBuckets = new Map<string, string[]>()

  leads.forEach((lead) => {
    const organization = getLeadOrganization(lead.original, lead.enriched)
      .trim()
      .toLowerCase()
    const address = getLeadAddress(lead.original, lead.enriched).trim().toLowerCase()
    const keys = [
      lead.normalizedNpi ? `npi:${lead.normalizedNpi}` : "",
      organization && lead.normalizedPhone
        ? `org-phone:${organization}:${lead.normalizedPhone}`
        : "",
      organization && address ? `org-address:${organization}:${address}` : "",
    ].filter(Boolean)

    keys.forEach((key) => {
      duplicateBuckets.set(key, [...(duplicateBuckets.get(key) ?? []), lead.id])
    })
  })

  const duplicateIdsByLead = new Map<string, string[]>()
  duplicateBuckets.forEach((ids, key) => {
    if (ids.length < 2) return
    ids.forEach((id) => {
      duplicateIdsByLead.set(id, [...(duplicateIdsByLead.get(id) ?? []), key])
    })
  })

  return leads.map((lead) => {
    const duplicateKeys = duplicateIdsByLead.get(lead.id) ?? []
    const issues: string[] = []

    if (!lead.normalizedNpi) issues.push("Invalid or missing NPI")
    if (!lead.normalizedPhone || lead.normalizedPhone.length !== 10) {
      issues.push("Missing or invalid phone")
    }
    if (!lead.normalizedZip || lead.normalizedZip.length !== 5) {
      issues.push("Missing or invalid ZIP")
    }
    if (!lead.normalizedState || lead.normalizedState.length !== 2) {
      issues.push("Missing or invalid state")
    }
    if (duplicateKeys.length > 0) issues.push("Potential duplicate")

    const analyzedLead = {
      ...lead,
      duplicateKeys,
      issues,
      workspace: {
        ...lead.workspace,
        status:
          issues.length > 0 || lead.workspace.enrichmentStatus === "error"
            ? "needs_review"
            : "clean",
      },
    } satisfies LeadRecord

    return {
      ...analyzedLead,
      qualityScore: qualityScoreForLead(analyzedLead),
    }
  })
}

function getProgressValue(stats: ProcessingStats) {
  return stats.total === 0 ? 0 : (stats.processed / stats.total) * 100
}

function isDueOrEmpty(dateValue: string) {
  if (!dateValue) return false

  const today = new Date()
  today.setHours(23, 59, 59, 999)
  return new Date(dateValue).getTime() <= today.getTime()
}

function leadMatchesView(lead: LeadRecord, view: ViewKey) {
  switch (view) {
    case "cleanup":
      return lead.workspace.status === "needs_review" || lead.issues.length > 0
    case "enrichment_issues":
      return ["not_found", "invalid_npi", "error"].includes(
        lead.workspace.enrichmentStatus
      )
    case "not_contacted":
      return lead.workspace.outreachStatus === "not_contacted"
    case "follow_ups":
      return (
        lead.workspace.outreachStatus === "follow_up_needed" ||
        lead.workspace.responseStatus === "needs_follow_up" ||
        isDueOrEmpty(lead.workspace.nextFollowUpAt)
      )
    case "responded":
      return lead.workspace.outreachStatus === "responded"
    case "missing_phone":
      return !lead.normalizedPhone || lead.normalizedPhone.length !== 10
    case "high_priority":
      return (
        lead.qualityScore >= 78 &&
        lead.workspace.outreachStatus === "not_contacted" &&
        lead.workspace.enrichmentStatus === "enriched"
      )
    case "all":
    default:
      return true
  }
}

function getLeadSortValue(lead: LeadRecord, sortKey: SortKey) {
  switch (sortKey) {
    case "qualityScore":
      return lead.qualityScore
    case "outreachStatus":
      return lead.workspace.outreachStatus
    case "responseStatus":
      return lead.workspace.responseStatus
    case "state":
      return lead.normalizedState || "zz"
    case "specialty":
      return lead.enriched.primaryTaxonomy || "zz"
    case "lastContactedAt":
      return lead.workspace.lastContactedAt || "9999-12-31"
    case "nextFollowUpAt":
      return lead.workspace.nextFollowUpAt || "9999-12-31"
  }
}

function leadToExportRow(lead: LeadRecord, headers: string[], selectedFields: EnrichFieldKey[]) {
  const enrichment = selectedFields.reduce<CsvRow>((collection, fieldKey) => {
    collection[NPI_FIELD_DEFINITIONS[fieldKey].header] = lead.enriched[fieldKey]
    return collection
  }, {})

  const exportRow: CsvRow = {
    ...headers.reduce<CsvRow>((row, header) => {
      row[header] = lead.original[header] ?? ""
      return row
    }, {}),
    ...enrichment,
    Cleanly_Status: lead.workspace.status,
    Cleanly_Enrichment_Status: lead.workspace.enrichmentStatus,
    Cleanly_Outreach_Status: lead.workspace.outreachStatus,
    Cleanly_Response_Status: lead.workspace.responseStatus,
    Cleanly_Attempt_Count: String(lead.workspace.attemptCount),
    Cleanly_Last_Contacted_At: lead.workspace.lastContactedAt,
    Cleanly_Next_Follow_Up_At: lead.workspace.nextFollowUpAt,
    Cleanly_Notes: lead.workspace.notes,
    Cleanly_Tags: lead.workspace.tags,
    Cleanly_Owner: lead.workspace.owner,
    Cleanly_Data_Quality: String(lead.qualityScore),
    Cleanly_Issues: lead.issues.join("; "),
  }

  return exportRow
}

export function CleanlyWorkspacePage({
  initialTab = "enrich",
}: {
  initialTab?: TabKey
}) {
  const pathname = usePathname()
  const router = useRouter()
  const activeTab = getTabFromPath(pathname) || initialTab
  const [project, setProject] = useState<LeadProject | null>(null)
  const [activeView, setActiveView] = useState<ViewKey>("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("qualityScore")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")
  const [leadPage, setLeadPage] = useState(1)
  const [leadPageSize, setLeadPageSize] = useState(25)
  const [selectedLeadId, setSelectedLeadId] = useState("")
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([])
  const [editingLeadId, setEditingLeadId] = useState("")
  const [editingWorkspace, setEditingWorkspace] = useState<WorkspaceFields | null>(
    null
  )
  const [dateEditor, setDateEditor] = useState<{
    leadId: string
    field: "lastContactedAt" | "nextFollowUpAt"
    value: string
  } | null>(null)
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false)
  const [visibleLeadColumns, setVisibleLeadColumns] = useState<
    Record<LeadColumnKey, boolean>
  >(DEFAULT_VISIBLE_LEAD_COLUMNS)
  const [bulkOutreachStatus, setBulkOutreachStatus] =
    useState<OutreachStatus>("contacted")
  const [exportMode, setExportMode] = useState<ExportMode>("filtered")
  const [stats, setStats] = useState<ProcessingStats>(initialStats)
  const [enrichmentToast, setEnrichmentToast] = useState<EnrichmentToast>({
    status: "idle",
  })
  const [errorMessage, setErrorMessage] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [singleNpi, setSingleNpi] = useState("")
  const [singleLookupResult, setSingleLookupResult] =
    useState<NpiLookupResponse | null>(null)
  const [singleLookupError, setSingleLookupError] = useState("")
  const [isSingleLookupLoading, setIsSingleLookupLoading] = useState(false)
  const [copyStatus, setCopyStatus] = useState("")
  const [hydrated, setHydrated] = useState(false)
  const [databaseState, setDatabaseState] = useState<
    "checking" | "available" | "unavailable"
  >("checking")
  const [savedProjects, setSavedProjects] = useState<ProjectSummary[]>([])
  const [persistenceMessage, setPersistenceMessage] = useState("")
  const [lastSavedAt, setLastSavedAt] = useState("")
  const [isSavingProject, setIsSavingProject] = useState(false)
  const [isLoadingProject, setIsLoadingProject] = useState(false)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [analyticsDashboard, setAnalyticsDashboard] =
    useState<DashboardAnalytics | null>(null)
  const [isDashboardLoading, setIsDashboardLoading] = useState(false)
  const [dashboardError, setDashboardError] = useState("")
  const [activeOutreachIndex, setActiveOutreachIndex] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const goToTab = useCallback(
    (tab: TabKey) => {
      router.push(TAB_ROUTES[tab])
    },
    [router]
  )

  const loadProjectFromDatabase = useCallback(async (projectId: string) => {
    setIsLoadingProject(true)
    setPersistenceMessage("")

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`)
      const payload = (await response.json()) as {
        ok: boolean
        project?: LeadProject
        error?: string
      }

      if (!response.ok || !payload.project) {
        setPersistenceMessage(payload.error ?? "Unable to load saved project.")
        return
      }

      const leads = withCleaningAnalysis(payload.project.leads)
      setProject({
        ...payload.project,
        assignedWeek:
          payload.project.assignedWeek || getWeekKey(new Date(payload.project.createdAt)),
        leads,
      })
      setSelectedLeadId(leads[0]?.id ?? "")
      setSelectedLeadIds([])
      setActiveView("all")
      setDatabaseState("available")
      setLastSavedAt(payload.project.updatedAt)
    } catch {
      setPersistenceMessage("Unable to reach the project API.")
    } finally {
      setIsLoadingProject(false)
    }
  }, [goToTab])

  const loadSavedProjects = useCallback(
    async ({ loadLatest = false }: { loadLatest?: boolean } = {}) => {
      setDatabaseState("checking")

      try {
        const response = await fetch("/api/projects", { cache: "no-store" })
        const payload = (await response.json()) as {
          ok: boolean
          projects: ProjectSummary[]
          error?: string
        }

        if (!response.ok) {
          setDatabaseState("unavailable")
          setSavedProjects([])
          setPersistenceMessage(payload.error ?? "Database is unavailable.")
          return
        }

        setDatabaseState("available")
        setSavedProjects(payload.projects)

        if (loadLatest && payload.projects[0]) {
          await loadProjectFromDatabase(payload.projects[0].id)
        }
      } catch {
        setDatabaseState("unavailable")
        setSavedProjects([])
        setPersistenceMessage("Unable to reach the project API.")
      }
    },
    [loadProjectFromDatabase]
  )

  const loadDashboardAnalytics = useCallback(async () => {
    setIsDashboardLoading(true)
    setDashboardError("")

    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" })
      const payload = (await response.json()) as {
        ok: boolean
        dashboard?: DashboardAnalytics
        error?: string
      }

      setAnalyticsDashboard(payload.dashboard ?? EMPTY_DASHBOARD_ANALYTICS)
      setDashboardError(payload.ok ? "" : payload.error ?? "Dashboard is unavailable.")
    } catch {
      setAnalyticsDashboard(EMPTY_DASHBOARD_ANALYTICS)
      setDashboardError("Unable to reach the dashboard API.")
    } finally {
      setIsDashboardLoading(false)
    }
  }, [])

  const openSavedProjectInTab = useCallback(
    async (projectId: string, tab: TabKey) => {
      if (!projectId) return

      await loadProjectFromDatabase(projectId)
      goToTab(tab)
      setSelectedLeadIds([])
      setLeadPage(1)
    },
    [goToTab, loadProjectFromDatabase]
  )

  const saveProjectToDatabase = useCallback(async () => {
    if (!project) return

    setIsSavingProject(true)
    setPersistenceMessage("")

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(project),
      })
      const payload = (await response.json()) as {
        ok: boolean
        project?: LeadProject
        error?: string
      }

      if (!response.ok || !payload.project) {
        setDatabaseState(response.status === 503 ? "unavailable" : databaseState)
        setPersistenceMessage(payload.error ?? "Unable to save project.")
        return
      }

      const leads = withCleaningAnalysis(payload.project.leads)
      setProject({
        ...payload.project,
        assignedWeek:
          payload.project.assignedWeek || getWeekKey(new Date(payload.project.createdAt)),
        leads,
      })
      setLastSavedAt(payload.project.updatedAt)
      setDatabaseState("available")
      setPersistenceMessage("Saved to workspace.")
      await loadSavedProjects()
      await loadDashboardAnalytics()
    } catch {
      setPersistenceMessage("Unable to reach the project API.")
    } finally {
      setIsSavingProject(false)
    }
  }, [databaseState, loadDashboardAnalytics, loadSavedProjects, project])

  const assignCurrentProjectToWeek = useCallback(
    (weekKey: string) => {
      setProject((current) =>
        current
          ? {
              ...current,
              assignedWeek: weekKey,
              updatedAt: new Date().toISOString(),
            }
          : current
      )
    },
    []
  )

  const deleteProjectFromDatabase = useCallback(
    async (projectId: string) => {
      setPersistenceMessage("")

      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
          method: "DELETE",
        })
        const payload = (await response.json()) as {
          ok: boolean
          error?: string
        }

        if (!response.ok) {
          setPersistenceMessage(payload.error ?? "Unable to delete project.")
          return
        }

        if (project?.id === projectId) {
          setProject(null)
          setSelectedLeadId("")
          setSelectedLeadIds([])
          setStats(initialStats)
          setLastSavedAt("")
        }

        setPersistenceMessage("Project deleted.")
        await loadSavedProjects()
        await loadDashboardAnalytics()
      } catch {
        setPersistenceMessage("Unable to reach the project API.")
      }
    },
    [loadDashboardAnalytics, loadSavedProjects, project]
  )

  const selectedLead = useMemo(
    () => project?.leads.find((lead) => lead.id === selectedLeadId) ?? null,
    [project?.leads, selectedLeadId]
  )
  const editingLead = useMemo(
    () => project?.leads.find((lead) => lead.id === editingLeadId) ?? null,
    [editingLeadId, project?.leads]
  )
  const visibleLeadColumnCount = Object.values(visibleLeadColumns).filter(Boolean).length
  const canShowMoreLeadColumns = visibleLeadColumnCount < 10

  const openLeadDetail = useCallback((lead: LeadRecord) => {
    setSelectedLeadId(lead.id)
    setEditingLeadId(lead.id)
    setEditingWorkspace({ ...lead.workspace })
  }, [])

  const closeLeadDetail = useCallback(() => {
    setEditingLeadId("")
    setEditingWorkspace(null)
  }, [])

  const dashboard = useMemo(() => {
    const leads = project?.leads ?? []

    return {
      total: leads.length,
      clean: leads.filter((lead) => lead.workspace.status === "clean").length,
      needsReview: leads.filter((lead) => lead.workspace.status === "needs_review")
        .length,
      enriched: leads.filter(
        (lead) => lead.workspace.enrichmentStatus === "enriched"
      ).length,
      contacted: leads.filter((lead) => lead.workspace.outreachStatus !== "not_contacted")
        .length,
      responded: leads.filter((lead) => lead.workspace.outreachStatus === "responded")
        .length,
      followUps: leads.filter((lead) => leadMatchesView(lead, "follow_ups")).length,
    }
  }, [project?.leads])

  const filteredLeads = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    return [...(project?.leads ?? [])]
      .filter((lead) => leadMatchesView(lead, activeView))
      .filter((lead) => {
        if (!normalizedSearch) return true

        const searchable = [
          lead.normalizedNpi,
          lead.enriched.firstName,
          lead.enriched.lastName,
          lead.enriched.organizationName,
          lead.enriched.primaryTaxonomy,
          lead.normalizedState,
          lead.workspace.notes,
          lead.workspace.tags,
          ...Object.values(lead.original),
        ]
          .join(" ")
          .toLowerCase()

        return searchable.includes(normalizedSearch)
      })
      .sort((a, b) => {
        const aValue = getLeadSortValue(a, sortKey)
        const bValue = getLeadSortValue(b, sortKey)

        if (aValue < bValue) return sortDirection === "asc" ? -1 : 1
        if (aValue > bValue) return sortDirection === "asc" ? 1 : -1
        return 0
      })
  }, [activeView, project?.leads, searchTerm, sortDirection, sortKey])

  useEffect(() => {
    queueMicrotask(() => {
      setHydrated(true)
      void loadSavedProjects()
      void loadDashboardAnalytics()
    })
  }, [loadDashboardAnalytics, loadSavedProjects])

  useEffect(() => {
    if (enrichmentToast.status !== "complete") return

    const timeoutId = window.setTimeout(() => {
      setEnrichmentToast({ status: "idle" })
    }, 4500)

    return () => window.clearTimeout(timeoutId)
  }, [enrichmentToast.status])

  const updateProjectLeads = useCallback((updater: (leads: LeadRecord[]) => LeadRecord[]) => {
    setProject((current) => {
      if (!current) return current

      const updatedLeads = withCleaningAnalysis(updater(current.leads))

      return {
        ...current,
        leads: updatedLeads,
        updatedAt: new Date().toISOString(),
      }
    })
  }, [])

  const ingestFile = useCallback((file: File) => {
    setErrorMessage("")
    setStats(initialStats)
    setEnrichmentToast({ status: "idle" })

    Papa.parse<string[]>(file, {
      complete: (results) => {
        const matrix = results.data.filter((row) => Array.isArray(row))

        if (matrix.length === 0) {
          setErrorMessage("The uploaded CSV is empty.")
          return
        }

        const rawHeaders = matrix[0] ?? []
        const uniqueHeaders = makeHeadersUnique(rawHeaders)
        const csvRows = matrix
          .slice(1)
          .filter((row) => !isBlankRow(row))
          .map((row) => toCsvRow(uniqueHeaders, row))

        if (uniqueHeaders.length === 0 || csvRows.length === 0) {
          setErrorMessage(
            "The CSV must include a header row and at least one data row."
          )
          return
        }

        const now = new Date().toISOString()
        setPendingImport({
          id: `project-${Date.now()}`,
          name: fileNameToProjectName(file.name),
          fileName: file.name,
          headers: uniqueHeaders,
          rows: csvRows,
          selectedNpiColumn: detectNpiHeader(uniqueHeaders),
          selectedFields: DEFAULT_SELECTED_FIELDS,
          createdAt: now,
        })
        goToTab("enrich")
        setActiveView("all")
        setSearchTerm("")
        setSelectedLeadId("")
        setSelectedLeadIds([])
      },
      error: () => {
        setErrorMessage("The CSV could not be parsed. Please try another file.")
      },
    })
  }, [goToTab])

  const handleFileSelection = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]

      if (!file) return

      ingestFile(file)
      event.target.value = ""
    },
    [ingestFile]
  )

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragging(false)

      const file = event.dataTransfer.files?.[0]

      if (file) ingestFile(file)
    },
    [ingestFile]
  )

  const setProjectName = useCallback((name: string) => {
    setProject((current) =>
      current
        ? {
            ...current,
            name,
            updatedAt: new Date().toISOString(),
          }
        : current
    )
  }, [])

  const setPendingNpiColumn = useCallback((header: string) => {
    setPendingImport((current) =>
      current
        ? {
            ...current,
            selectedNpiColumn: header,
          }
        : current
    )
  }, [])

  const togglePendingField = useCallback((fieldKey: EnrichFieldKey) => {
    setPendingImport((current) => {
      if (!current) return current

      const selectedFields = current.selectedFields.includes(fieldKey)
        ? current.selectedFields.filter((value) => value !== fieldKey)
        : [...current.selectedFields, fieldKey]

      return {
        ...current,
        selectedFields,
      }
    })
  }, [])

  const confirmPendingImport = useCallback(() => {
    if (!pendingImport) return

    if (!pendingImport.selectedNpiColumn) {
      setErrorMessage("Choose the NPI column before continuing.")
      return
    }

    if (pendingImport.selectedFields.length === 0) {
      setErrorMessage("Choose at least one NPI field to append.")
      return
    }

    const leads = withCleaningAnalysis(
      pendingImport.rows.map((row, index) =>
        buildLead(row, index, pendingImport.selectedNpiColumn)
      )
    )
    const now = new Date().toISOString()

    setProject({
      id: pendingImport.id,
      name: pendingImport.name,
      fileName: pendingImport.fileName,
      assignedWeek: getWeekKey(new Date()),
      headers: pendingImport.headers,
      selectedNpiColumn: pendingImport.selectedNpiColumn,
      selectedFields: pendingImport.selectedFields,
      leads,
      createdAt: pendingImport.createdAt,
      updatedAt: now,
    })
    setPendingImport(null)
    setErrorMessage("")
    setSelectedLeadId(leads[0]?.id ?? "")
    setSelectedLeadIds([])
  }, [pendingImport])

  const startEnrichment = useCallback(
    async (mode: "all_pending" | "retry_failed" = "all_pending") => {
      if (!project || project.selectedFields.length === 0) return

      const targetLeads = project.leads.filter((lead) => {
        if (!lead.normalizedNpi) return mode === "all_pending"
        if (mode === "retry_failed") {
          return ["not_found", "error"].includes(lead.workspace.enrichmentStatus)
        }

        return lead.workspace.enrichmentStatus !== "enriched"
      })

      if (targetLeads.length === 0) {
        setErrorMessage("There are no eligible leads to enrich in this view.")
        return
      }

      const emptyFields = createEmptyEnrichedFields()
      const groupedLeads = new Map<string, string[]>()
      const leadUpdates = new Map<string, Partial<LeadRecord>>()
      let processed = 0
      let success = 0
      let failed = 0

      setErrorMessage("")
      setIsProcessing(true)
      const startingStats = {
        total: targetLeads.length,
        processed: 0,
        success: 0,
        failed: 0,
      }
      setStats(startingStats)
      setEnrichmentToast({ status: "processing" })

      targetLeads.forEach((lead) => {
        if (!lead.normalizedNpi) {
          leadUpdates.set(lead.id, {
            enriched: emptyFields,
            workspace: {
              ...lead.workspace,
              enrichmentStatus: "invalid_npi",
            },
          })
          processed += 1
          failed += 1
          return
        }

        groupedLeads.set(lead.normalizedNpi, [
          ...(groupedLeads.get(lead.normalizedNpi) ?? []),
          lead.id,
        ])
      })

      if (processed > 0) {
        setStats({ total: targetLeads.length, processed, success, failed })
      }

      const limit = pLimit(12)
      const appendLookupResult = (
        number: string,
        leadIds: string[],
        response: NpiLookupResponse
      ) => {
        leadIds.forEach((leadId) => {
          const lead = project.leads.find((item) => item.id === leadId)
          if (!lead) return

          leadUpdates.set(leadId, {
            enriched: response.fields,
            workspace: {
              ...lead.workspace,
              enrichmentStatus: response.found ? "enriched" : "not_found",
            },
          })
        })

        processed += leadIds.length

        if (response.found) {
          success += leadIds.length
        } else {
          failed += leadIds.length
        }

        setStats({ total: targetLeads.length, processed, success, failed })
      }

      try {
        await Promise.all(
          Array.from(groupedLeads.entries()).map(([number, leadIds]) =>
            limit(async () => {
              try {
                const response = await fetch(
                  `/api/npi?number=${encodeURIComponent(number)}`,
                  { cache: "no-store" }
                )
                const payload = (await response.json()) as NpiLookupResponse

                if (!response.ok) {
                  appendLookupResult(number, leadIds, {
                    number,
                    found: false,
                    fields: emptyFields,
                    error: payload.error ?? "Lookup failed",
                  })
                  return
                }

                appendLookupResult(number, leadIds, payload)
              } catch {
                leadIds.forEach((leadId) => {
                  const lead = project.leads.find((item) => item.id === leadId)
                  if (!lead) return

                  leadUpdates.set(leadId, {
                    enriched: emptyFields,
                    workspace: {
                      ...lead.workspace,
                      enrichmentStatus: "error",
                    },
                  })
                })
                processed += leadIds.length
                failed += leadIds.length
                setStats({ total: targetLeads.length, processed, success, failed })
              }
            })
          )
        )

        updateProjectLeads((leads) =>
          leads.map((lead) => {
            const update = leadUpdates.get(lead.id)
            if (!update) return lead

            return buildLead(lead.original, 0, project.selectedNpiColumn, {
              ...lead,
              ...update,
              workspace: {
                ...lead.workspace,
                ...update.workspace,
              },
            })
          })
        )
      } catch {
        setErrorMessage("The enrichment run ended unexpectedly. Please try again.")
      } finally {
        setIsProcessing(false)
        setEnrichmentToast({
          status: "complete",
          stats: { total: targetLeads.length, processed, success, failed },
        })
      }
    },
    [project, updateProjectLeads]
  )

  const updateLeadWorkspace = useCallback(
    (leadId: string, patch: Partial<WorkspaceFields>) => {
      updateProjectLeads((leads) =>
        leads.map((lead) =>
          lead.id === leadId
            ? {
                ...lead,
                workspace: {
                  ...lead.workspace,
                  ...patch,
                  attemptCount:
                    patch.outreachStatus && patch.outreachStatus !== "not_contacted"
                      ? Math.max(lead.workspace.attemptCount, 1)
                      : patch.attemptCount ?? lead.workspace.attemptCount,
                },
                updatedAt: new Date().toISOString(),
              }
            : lead
        )
      )
    },
    [updateProjectLeads]
  )

  const confirmLeadDetail = useCallback(() => {
    if (!editingLeadId || !editingWorkspace) return

    updateLeadWorkspace(editingLeadId, editingWorkspace)
    closeLeadDetail()
  }, [closeLeadDetail, editingLeadId, editingWorkspace, updateLeadWorkspace])

  const applyBulkOutreach = useCallback(() => {
    if (selectedLeadIds.length === 0) return

    updateProjectLeads((leads) =>
      leads.map((lead) =>
        selectedLeadIds.includes(lead.id)
          ? {
              ...lead,
              workspace: {
                ...lead.workspace,
                outreachStatus: bulkOutreachStatus,
                attemptCount:
                  bulkOutreachStatus === "not_contacted"
                    ? lead.workspace.attemptCount
                    : Math.max(lead.workspace.attemptCount, 1),
                lastContactedAt:
                  bulkOutreachStatus === "not_contacted"
                    ? lead.workspace.lastContactedAt
                    : lead.workspace.lastContactedAt || new Date().toISOString().slice(0, 10),
              },
              updatedAt: new Date().toISOString(),
            }
          : lead
      )
    )
    setSelectedLeadIds([])
  }, [bulkOutreachStatus, selectedLeadIds, updateProjectLeads])

  const exportRowsForMode = useCallback(
    (mode: ExportMode) => {
      const leads = project?.leads ?? []

      switch (mode) {
        case "filtered":
          return filteredLeads
        case "clean":
          return leads.filter((lead) => lead.workspace.status === "clean")
        case "failed":
          return leads.filter((lead) =>
            ["not_found", "invalid_npi", "error"].includes(
              lead.workspace.enrichmentStatus
            )
          )
        case "follow_up":
          return leads.filter((lead) => leadMatchesView(lead, "follow_ups"))
        case "all":
        default:
          return leads
      }
    },
    [filteredLeads, project?.leads]
  )

  const downloadCsv = useCallback(() => {
    if (!project) return

    const selectedHeaders = getSelectedHeaderNames(project.selectedFields)
    const exportHeaders = [
      ...project.headers,
      ...selectedHeaders,
      ...WORKSPACE_HEADERS,
    ]
    const exportRows = exportRowsForMode(exportMode).map((lead) =>
      leadToExportRow(lead, project.headers, project.selectedFields)
    )
    const csv = Papa.unparse({
      fields: exportHeaders,
      data: exportRows.map((row) => exportHeaders.map((header) => row[header] ?? "")),
    })
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const downloadUrl = URL.createObjectURL(blob)
    const anchor = document.createElement("a")

    anchor.href = downloadUrl
    anchor.download = `${project.name || "cleanly-leads"}-${exportMode}.csv`
    anchor.click()
    URL.revokeObjectURL(downloadUrl)
  }, [exportMode, exportRowsForMode, project])

  const runSingleLookup = useCallback(async () => {
    const normalizedNpi = normalizeNpi(singleNpi)

    if (!normalizedNpi) {
      setSingleLookupResult(null)
      setSingleLookupError("Enter a valid 10-digit NPI number.")
      return
    }

    setIsSingleLookupLoading(true)
    setSingleLookupError("")
    setCopyStatus("")

    try {
      const response = await fetch(
        `/api/npi?number=${encodeURIComponent(normalizedNpi)}`,
        { cache: "no-store" }
      )
      const payload = (await response.json()) as NpiLookupResponse

      if (!response.ok || !payload.found) {
        setSingleLookupResult(payload)
        setSingleLookupError(payload.error ?? "NPI not found.")
        return
      }

      setSingleLookupResult(payload)
    } catch {
      setSingleLookupResult(null)
      setSingleLookupError("The lookup request failed. Please try again.")
    } finally {
      setIsSingleLookupLoading(false)
    }
  }, [singleNpi])

  const copySingleLookupResults = useCallback(async () => {
    if (!singleLookupResult) return

    const copyText = Object.entries(NPI_FIELD_DEFINITIONS)
      .map(([fieldKey, definition]) => {
        const value = singleLookupResult.fields[fieldKey as EnrichFieldKey] || ""
        return `${definition.header}: ${value}`
      })
      .join("\n")

    try {
      await navigator.clipboard.writeText(copyText)
      setCopyStatus("Copied")
    } catch {
      setCopyStatus("Copy failed")
    }
  }, [singleLookupResult])

  const progressValue = getProgressValue(stats)
  const hasProject = Boolean(project)
  const previewLeads = useMemo(
    () => (project?.leads ?? []).slice(0, 10),
    [project?.leads]
  )
  const currentWeekLabel = project
    ? getWeekLabel(project.assignedWeek || project.createdAt)
    : "Unassigned"
  const weekOptions = useMemo(
    () => getWeekOptions(savedProjects, project),
    [project, savedProjects]
  )
  const weekGroups = useMemo(() => {
    return weekOptions.reduce<Array<{ month: string; weeks: string[] }>>(
      (groups, weekKey) => {
        const month = getWeekMonthLabel(weekKey)
        const existing = groups.find((group) => group.month === month)

        if (existing) {
          existing.weeks.push(weekKey)
        } else {
          groups.push({ month, weeks: [weekKey] })
        }

        return groups
      },
      []
    )
  }, [weekOptions])
  const leadPageCount = Math.max(1, Math.ceil(filteredLeads.length / leadPageSize))
  const currentLeadPage = Math.min(leadPage, leadPageCount)
  const paginatedLeads = useMemo(() => {
    const start = (currentLeadPage - 1) * leadPageSize
    return filteredLeads.slice(start, start + leadPageSize)
  }, [currentLeadPage, filteredLeads, leadPageSize])

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-[96rem] px-4 py-4 lg:px-6">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileSelection}
        />

        <section className="border border-border bg-background px-5 py-5 sm:px-6">
          <div className="flex min-w-0 flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0 max-w-3xl space-y-4">
              <div className="flex items-center gap-2 text-[0.68rem] font-medium tracking-[0.22em] text-muted-foreground uppercase">
                <span className="inline-flex size-2 bg-foreground" />
                Cleanly
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-medium tracking-[-0.06em] sm:text-5xl">
                  Lead operations workspace for NPI-based healthcare outreach.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Enrich your lead lists with the latest healthcare provider data, manage outreach workflows, and track progress all in one place.
                </p>
              </div>
            </div>
            <div className="grid min-w-0 gap-2 text-sm text-muted-foreground sm:min-w-72 xl:max-w-sm">
              <InfoLine label="Project" value={project?.name ?? "No draft loaded"} />
              <InfoLine label="File" value={project?.fileName ?? "Awaiting CSV"} />
              <InfoLine label="Rows" value={project ? formatStat(project.leads.length) : "0"} />
              <InfoLine label="Week" value={currentWeekLabel} />
              <InfoLine
                label="Database"
                value={
                  databaseState === "available"
                    ? "Connected"
                    : databaseState === "checking"
                      ? "Checking"
                      : "Unavailable"
                }
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => (
              <TabButton
                key={tab}
                active={activeTab === tab}
                href={TAB_ROUTES[tab]}
                icon={TAB_ICONS[tab]}
                label={TAB_LABELS[tab]}
              />
            ))}
          </div>
        </section>

        {errorMessage ? (
          <div className="mt-4 flex items-start gap-3 border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
            <AlertCircle className="mt-0.5 size-4 text-destructive" />
            <p>{errorMessage}</p>
          </div>
        ) : null}

        {persistenceMessage ? (
          <div className="mt-4 flex items-start justify-between gap-3 border border-border bg-background px-4 py-3 text-sm">
            <p className="text-muted-foreground">{persistenceMessage}</p>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setPersistenceMessage("")}
            >
              <X />
            </Button>
          </div>
        ) : null}

        {pendingImport ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 px-4 backdrop-blur-sm">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="import-config-title"
              className="max-h-[90vh] w-full max-w-3xl overflow-y-auto border border-border bg-background shadow-2xl"
            >
              <div className="border-b border-border px-5 py-4">
                <p className="text-[0.68rem] tracking-[0.2em] text-muted-foreground uppercase">
                  Import Setup
                </p>
                <h2
                  id="import-config-title"
                  className="mt-2 text-2xl font-medium"
                >
                  Confirm NPI enrichment settings
                </h2>
                <TruncatedText
                  value={pendingImport.fileName}
                  className="mt-2 text-sm text-muted-foreground"
                />
              </div>

              <div className="grid gap-5 px-5 py-5">
                <section className="grid gap-2">
                  <label className="text-[0.68rem] tracking-[0.16em] text-muted-foreground uppercase">
                    NPI Column
                  </label>
                  <Select
                    value={pendingImport.selectedNpiColumn}
                    onChange={(event) => setPendingNpiColumn(event.target.value)}
                  >
                    {pendingImport.headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Auto-detected from common names like NPI, NPI Number, or NPI_Number.
                  </p>
                </section>

                <section className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[0.68rem] tracking-[0.16em] text-muted-foreground uppercase">
                      Fields To Append
                    </p>
                    <span className="text-sm text-muted-foreground">
                      {formatStat(pendingImport.selectedFields.length)} selected
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {DEFAULT_SELECTED_FIELDS.map((fieldKey) => (
                      <label
                        key={fieldKey}
                        className="flex min-w-0 items-start gap-3 border border-border p-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 shrink-0 accent-foreground"
                          checked={pendingImport.selectedFields.includes(fieldKey)}
                          onChange={() => togglePendingField(fieldKey)}
                        />
                        <span className="min-w-0">
                          <TruncatedText
                            value={NPI_FIELD_DEFINITIONS[fieldKey].label}
                            className="font-medium"
                          />
                          <TruncatedText
                            value={NPI_FIELD_DEFINITIONS[fieldKey].header}
                            className="mt-1 text-xs text-muted-foreground"
                          />
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPendingImport(null)
                    setErrorMessage("")
                  }}
                >
                  <X />
                  Cancel
                </Button>
                <Button
                  onClick={confirmPendingImport}
                  disabled={pendingImport.selectedFields.length === 0}
                >
                  <Save />
                  Confirm Import
                </Button>
              </div>
            </section>
          </div>
        ) : null}

        <div className="mt-4">
          {activeTab === "enrich" ? (
            !hasProject ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <section
                  onDragOver={(event) => {
                    event.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={[
                    "grid min-h-[42rem] place-items-center border border-dashed px-6 py-10 transition-colors",
                    isDragging ? "border-foreground bg-muted/60" : "border-border bg-muted/20",
                  ].join(" ")}
                >
                  <div className="max-w-2xl space-y-6 text-center">
                    <div className="mx-auto flex size-14 items-center justify-center border border-border bg-background">
                      <FileSpreadsheet className="size-6" />
                    </div>
                    <div className="space-y-3">
                      <h2 className="text-4xl font-medium tracking-[-0.06em]">
                        Import a healthcare outreach CSV
                      </h2>
                      <p className="text-sm leading-6 text-muted-foreground">
                        Start in Enrich, keep the lookup run observable, and move
                        into the workspace only after the draft is ready to manage.
                      </p>
                    </div>
                    <Button size="lg" onClick={() => fileInputRef.current?.click()}>
                      <Upload />
                      Select CSV
                    </Button>
                  </div>
                </section>

                <section className="grid content-start gap-4">
                  <PanelCard
                    eyebrow="Workflow"
                    title="Enrich tab"
                    lines={[
                      "Upload and validate a CSV",
                      "Confirm the NPI column once",
                      "Choose appended NPI fields",
                      "Run and observe the lookup batch",
                      "Preview results before opening the workspace",
                    ]}
                  />
                  <section className="border border-border bg-background p-4">
                    <p className="text-[0.68rem] tracking-[0.2em] text-muted-foreground uppercase">
                      Single Lookup
                    </p>
                    <div className="mt-3 grid gap-3">
                      <input
                        value={singleNpi}
                        onChange={(event) => {
                          setSingleNpi(event.target.value)
                          setSingleLookupError("")
                          setCopyStatus("")
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void runSingleLookup()
                        }}
                        placeholder="1467550004"
                        className="h-10 w-full border border-border bg-background px-3 text-sm outline-none focus:border-foreground"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Button onClick={() => void runSingleLookup()}>
                          {isSingleLookupLoading ? (
                            <LoaderCircle className="animate-spin" />
                          ) : (
                            <Search />
                          )}
                          Search
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void copySingleLookupResults()}
                          disabled={!singleLookupResult?.found}
                        >
                          <Copy />
                          Copy
                        </Button>
                      </div>
                      {singleLookupError ? (
                        <p className="text-sm text-destructive">{singleLookupError}</p>
                      ) : null}
                      {copyStatus ? (
                        <p className="text-sm text-muted-foreground">{copyStatus}</p>
                      ) : null}
                      <SingleLookupResults result={singleLookupResult} />
                    </div>
                  </section>
                </section>
              </div>
            ) : (
              <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
                <section className="grid min-w-0 content-start gap-4">
                  <section className="border border-border bg-background p-4">
                    <p className="text-[0.68rem] tracking-[0.2em] text-muted-foreground uppercase">
                      Draft Summary
                    </p>
                    <input
                      value={project!.name}
                      onChange={(event) => setProjectName(event.target.value)}
                      title={project!.name}
                      className="mt-4 w-full truncate border border-border bg-background px-3 py-2 text-lg font-medium tracking-[-0.04em] outline-none focus:border-foreground"
                    />
                    <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
                      <InfoLine label="Original file" value={project!.fileName} />
                      <InfoLine label="Rows" value={formatStat(project!.leads.length)} />
                      <InfoLine label="Uploaded" value={formatDateTime(project!.createdAt)} />
                      <InfoLine label="Updated" value={formatDateTime(project!.updatedAt)} />
                      <InfoLine
                        label="Saved"
                        value={lastSavedAt ? formatDateTime(lastSavedAt) : "Not yet"}
                      />
                    </div>
                    <div className="mt-4 grid gap-2">
                      <Button
                        onClick={() => void saveProjectToDatabase()}
                        disabled={isSavingProject}
                      >
                        {isSavingProject ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <Save />
                        )}
                        Save to Workspace
                      </Button>
                      <Button onClick={() => fileInputRef.current?.click()}>
                        <Upload />
                        Replace CSV
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => goToTab("workspace")}
                      >
                        <PanelRight />
                        Open Workspace
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setProject(null)
                          setSelectedLeadId("")
                          setSelectedLeadIds([])
                          setStats(initialStats)
                          setEnrichmentToast({ status: "idle" })
                          goToTab("enrich")
                        }}
                      >
                        <X />
                        Clear Draft
                      </Button>
                    </div>
                  </section>

                  <section className="border border-border bg-background p-4">
                    <p className="text-[0.68rem] tracking-[0.2em] text-muted-foreground uppercase">
                      Single Lookup
                    </p>
                    <div className="mt-3 grid gap-3">
                      <input
                        value={singleNpi}
                        onChange={(event) => {
                          setSingleNpi(event.target.value)
                          setSingleLookupError("")
                          setCopyStatus("")
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void runSingleLookup()
                        }}
                        placeholder="1467550004"
                        className="h-10 w-full border border-border bg-background px-3 text-sm outline-none focus:border-foreground"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Button onClick={() => void runSingleLookup()}>
                          {isSingleLookupLoading ? (
                            <LoaderCircle className="animate-spin" />
                          ) : (
                            <Search />
                          )}
                          Search
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void copySingleLookupResults()}
                          disabled={!singleLookupResult?.found}
                        >
                          <Copy />
                          Copy
                        </Button>
                      </div>
                      {singleLookupError ? (
                        <p className="text-sm text-destructive">{singleLookupError}</p>
                      ) : null}
                      {copyStatus ? (
                        <p className="text-sm text-muted-foreground">{copyStatus}</p>
                      ) : null}
                      <SingleLookupResults result={singleLookupResult} />
                    </div>
                  </section>
                </section>

                <section className="grid min-w-0 content-start gap-4">
                  <section className="border border-border bg-background p-4">
                    <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                      <div className="min-w-0">
                        <p className="text-[0.68rem] tracking-[0.2em] text-muted-foreground uppercase">
                          Enrich
                        </p>
                        <h2 className="mt-2 text-2xl font-medium tracking-[-0.05em]">
                          Data Preview
                        </h2>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                          First 10 rows of the enrichment results. For complete data management and outreach workflow, open the workspace after enrichment to review and assign leads.
                        </p>
                      </div>
                      <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        <Button
                          onClick={() => void startEnrichment("all_pending")}
                          disabled={isProcessing}
                        >
                          {isProcessing ? (
                            <LoaderCircle className="animate-spin" />
                          ) : (
                            <RefreshCcw />
                          )}
                          Enrich Pending
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void startEnrichment("retry_failed")}
                          disabled={isProcessing}
                        >
                          <RefreshCcw />
                          Retry Failed
                        </Button>
                        <Button variant="outline" onClick={downloadCsv}>
                          <Download />
                          Export CSV
                        </Button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <MetricTile label="Rows" value={dashboard.total} />
                      <MetricTile label="Enriched" value={dashboard.enriched} />
                      <MetricTile label="Needs Review" value={dashboard.needsReview} />
                      <MetricTile label="Follow Ups" value={dashboard.followUps} />
                    </div>
                  </section>

                  <section className="border border-border bg-background">
                    <div className="flex min-w-0 flex-col gap-3 border-b border-border px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <p className="text-[0.68rem] tracking-[0.2em] text-muted-foreground uppercase">
                          Results Preview
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Showing {formatStat(previewLeads.length)} of{" "}
                          {formatStat(project!.leads.length)} rows before full
                          workspace review.
                        </p>
                      </div>
                      <div className="flex min-w-0 flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() => void saveProjectToDatabase()}
                          disabled={isSavingProject}
                        >
                          {isSavingProject ? (
                            <LoaderCircle className="animate-spin" />
                          ) : (
                            <Save />
                          )}
                          Save as File
                        </Button>
                        <Button variant="outline" onClick={() => goToTab("workspace")}>
                          <PanelRight />
                          Open Workspace
                        </Button>
                        <Button variant="outline" onClick={() => goToTab("weekly")}>
                          <Filter />
                          Assign Later
                        </Button>
                        <Button onClick={() => goToTab("leads")}>
                          <ArrowUpDown />
                          Full Lead Grid
                        </Button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-border text-left">
                            <th className="px-4 py-3 font-medium">Lead</th>
                            <th className="px-4 py-3 font-medium">NPI</th>
                            <th className="px-4 py-3 font-medium">Enrichment</th>
                            <th className="px-4 py-3 font-medium">Quality</th>
                            <th className="px-4 py-3 font-medium">Outreach</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewLeads.map((lead) => (
                            <tr key={lead.id} className="border-b border-border/80 align-top">
                              <td className="px-4 py-3">
                                <TruncatedText
                                  value={
                                    getLeadOrganization(lead.original, lead.enriched) ||
                                    `${lead.enriched.firstName} ${lead.enriched.lastName}`.trim() ||
                                    "Unnamed lead"
                                  }
                                  className="font-medium"
                                />
                                <TruncatedText
                                  value={lead.enriched.primaryTaxonomy || "No specialty"}
                                  className="text-xs text-muted-foreground"
                                />
                              </td>
                              <td className="px-4 py-3 font-mono text-xs">
                                {lead.normalizedNpi || "Invalid"}
                              </td>
                              <td className="px-4 py-3">
                                <StatusPill
                                  label={ENRICHMENT_STATUS_LABELS[lead.workspace.enrichmentStatus]}
                                  className={
                                    ENRICHMENT_STATUS_CLASSES[
                                      lead.workspace.enrichmentStatus
                                    ]
                                  }
                                />
                              </td>
                              <td className="px-4 py-3">
                                <QualityPill score={lead.qualityScore} />
                              </td>
                              <td className="px-4 py-3">
                                <StatusPill
                                  label={OUTREACH_STATUS_LABELS[lead.workspace.outreachStatus]}
                                  className={
                                    OUTREACH_STATUS_CLASSES[lead.workspace.outreachStatus]
                                  }
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </section>
              </div>
            )
          ) : null}

          {activeTab !== "enrich" &&
          activeTab !== "files" &&
          activeTab !== "leads" &&
          !hasProject ? (
            <SavedFilePrompt
              title="Select a saved file"
              description="Choose a saved file to open this workspace view."
              savedProjects={savedProjects}
              databaseState={databaseState}
              isLoadingProject={isLoadingProject}
              onRefresh={() => void loadSavedProjects()}
              onImport={() => goToTab("enrich")}
              onOpen={(projectId) =>
                void openSavedProjectInTab(projectId, activeTab)
              }
            />
          ) : null}

          {activeTab === "workspace" && hasProject ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <section className="grid content-start gap-4">
                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricTile label="Total Leads" value={dashboard.total} />
                  <MetricTile label="Needs Review" value={dashboard.needsReview} />
                  <MetricTile label="Ready to Contact" value={dashboard.clean} />
                  <MetricTile label="Follow Ups Due" value={dashboard.followUps} />
                </section>

                <section className="border border-border bg-background p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-[0.68rem] tracking-[0.2em] text-muted-foreground uppercase">
                        Operational Views
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Fast entry points into the lead grid without cluttering the
                        enrichment surface.
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => goToTab("leads")}>
                      <PanelRight />
                      Open Lead Grid
                    </Button>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {(Object.keys(VIEW_LABELS) as ViewKey[]).map((view) => (
                      <button
                        key={view}
                        onClick={() => {
                          setActiveView(view)
                          setLeadPage(1)
                          setSelectedLeadIds([])
                          goToTab("leads")
                        }}
                        className="border border-border p-4 text-left transition-colors hover:border-foreground"
                      >
                        <p className="text-sm font-medium">{VIEW_LABELS[view]}</p>
                        <p className="mt-2 text-2xl font-medium tracking-[-0.05em]">
                          {formatStat(
                            project!.leads.filter((lead) => leadMatchesView(lead, view)).length
                          )}
                        </p>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="border border-border bg-background p-4">
                  <p className="text-[0.68rem] tracking-[0.2em] text-muted-foreground uppercase">
                    Current Draft
                  </p>
                  <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                    <div className="grid min-w-0 gap-4">
                      <InfoLine label="Display name" value={project!.name} />
                      <InfoLine label="Original file" value={project!.fileName} />
                      <InfoLine label="Upload date" value={formatDateOnly(project!.createdAt)} />
                      <InfoLine label="Upload day" value={formatUploadDay(project!.createdAt)} />
                      <InfoLine label="Upload week" value={currentWeekLabel} />
                    </div>
                    
                  </div>
                </section>
              </section>

              <section className="grid content-start gap-4">
                <PanelCard
                  eyebrow="Next actions"
                  title="Recommended flow"
                  lines={[
                    "Review enrichment issues",
                    "Open the lead grid for cleanup",
                    "Export a filtered outreach list",
                    "Assign this draft to an operational week",
                  ]}
                />
                {selectedLead ? (
                  <section className="border border-border bg-background p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[0.68rem] tracking-[0.2em] text-muted-foreground uppercase">
                        Focus Lead
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => goToTab("leads")}
                      >
                        Open
                      </Button>
                    </div>
                    <div className="mt-4 grid min-w-0 gap-3">
                      <TruncatedText
                        value={
                          getLeadOrganization(selectedLead.original, selectedLead.enriched) ||
                          `${selectedLead.enriched.firstName} ${selectedLead.enriched.lastName}`.trim() ||
                          "Unnamed lead"
                        }
                        className="text-lg font-medium tracking-[-0.04em]"
                      />
                      <InfoLine
                        label="NPI"
                        value={selectedLead.normalizedNpi || "Invalid"}
                      />
                      <InfoLine
                        label="Status"
                        value={OUTREACH_STATUS_LABELS[selectedLead.workspace.outreachStatus]}
                      />
                      <InfoLine
                        label="Follow-up"
                        value={selectedLead.workspace.nextFollowUpAt || "-"}
                      />
                    </div>
                  </section>
                ) : null}
              </section>
            </div>
          ) : null}

          {activeTab === "files" ? (
            <section className="border border-border bg-background">
              <div className="flex min-w-0 flex-col gap-3 border-b border-border px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-[0.68rem] tracking-[0.2em] text-muted-foreground uppercase">
                    Files
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Unsaved drafts stay in memory until you save them.
                  </p>
                </div>
                <div className="flex min-w-0 flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void loadSavedProjects()}
                    disabled={databaseState === "checking"}
                  >
                    <RefreshCcw />
                    Refresh
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void saveProjectToDatabase()}
                    disabled={!project || isSavingProject}
                  >
                    <Save />
                    Save current draft
                  </Button>
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                    <Upload />
                    Import another CSV
                  </Button>
                  <Button variant="outline" onClick={downloadCsv} disabled={!project}>
                    <Download />
                    Export current draft
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-4 py-3 font-medium">Display Name</th>
                      <th className="px-4 py-3 font-medium">Original File</th>
                      <th className="px-4 py-3 font-medium">Upload Date</th>
                      <th className="px-4 py-3 font-medium">Upload Day</th>
                      <th className="px-4 py-3 font-medium">Upload Week</th>
                      <th className="px-4 py-3 font-medium">Row Count</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {savedProjects.map((savedProject) => (
                      <tr key={savedProject.id} className="border-b border-border/80">
                        <td className="max-w-72 px-4 py-3 font-medium">
                          <TruncatedText value={savedProject.name} />
                        </td>
                        <td className="max-w-72 px-4 py-3">
                          <TruncatedText value={savedProject.fileName || "-"} />
                        </td>
                        <td className="px-4 py-3">
                          {formatDateOnly(savedProject.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          {formatUploadDay(savedProject.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          {getWeekRangeLabel(savedProject.uploadWeek)}
                        </td>
                        <td className="px-4 py-3">
                          {formatStat(savedProject.rowCount)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill label={savedProject.status} tone="info" />
                        </td>
                        <td className="px-4 py-3">
                      <div className="flex min-w-max flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void openSavedProjectInTab(savedProject.id, "workspace")
                              }
                              disabled={isLoadingProject}
                            >
                              Open
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                await loadProjectFromDatabase(savedProject.id)
                                goToTab("weekly")
                              }}
                            >
                              Assign Week
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void deleteProjectFromDatabase(savedProject.id)}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {savedProjects.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-4 py-12 text-center text-muted-foreground"
                        >
                          No saved files yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {activeTab === "weekly" && hasProject ? (
            <div className="grid gap-4">
              <section className="border border-border bg-background p-4">
                <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,18rem)_11rem]">
                  <div className="min-w-0">
                    <p className="text-[0.68rem] tracking-[0.2em] text-muted-foreground uppercase">
                      Weekly Workflow
                    </p>
                    <p className="mt-2 text-2xl font-medium tracking-normal">
                      {currentWeekLabel}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Files are grouped by Monday-start calendar weeks and month
                      sections.
                    </p>
                  </div>
                  <div className="grid min-w-0 gap-2">
                    <label className="text-[0.68rem] tracking-[0.16em] text-muted-foreground uppercase">
                      Assign current file
                    </label>
                    <Select
                      value={project!.assignedWeek || getWeekKey(new Date())}
                      onChange={(event) => assignCurrentProjectToWeek(event.target.value)}
                      className="w-full"
                    >
                      {weekOptions.map((weekKey) => (
                        <option key={weekKey} value={weekKey}>
                          {getWeekShortLabel(weekKey)} - {getWeekRangeLabel(weekKey)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    onClick={() => void saveProjectToDatabase()}
                    disabled={isSavingProject}
                  >
                    {isSavingProject ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Save />
                    )}
                    Save Week
                  </Button>
                </div>
              </section>

              <section className="grid gap-6">
                {weekGroups.map((group) => (
                  <div key={group.month} className="min-w-0">
                    <div className="mb-3 flex items-center justify-between gap-4">
                      <p className="text-[0.72rem] font-medium tracking-[0.2em] text-muted-foreground uppercase">
                        {group.month}
                      </p>
                      <span className="text-sm text-muted-foreground">
                        {formatStat(group.weeks.length)} weeks
                      </span>
                    </div>
                    <div className="flex min-w-0 gap-3 overflow-x-auto pb-3">
                      {group.weeks.map((weekKey) => {
                        const weekProjects = savedProjects.filter(
                          (savedProject) =>
                            savedProject.id !== project?.id &&
                            getWeekKey(
                              parseWeekKey(savedProject.uploadWeek) ??
                                new Date(savedProject.createdAt)
                            ) === weekKey
                        )
                        const hasCurrentProject =
                          project?.assignedWeek === weekKey ||
                          (!project?.assignedWeek &&
                            getWeekKey(new Date(project!.createdAt)) === weekKey)
                        const totalLeads =
                          weekProjects.reduce(
                            (sum, savedProject) => sum + savedProject.rowCount,
                            0
                          ) + (hasCurrentProject ? project!.leads.length : 0)

                        return (
                          <div
                            key={weekKey}
                            className={[
                              "flex min-h-72 w-80 shrink-0 flex-col border bg-background",
                              hasCurrentProject
                                ? "border-foreground"
                                : "border-border",
                            ].join(" ")}
                          >
                            <div className="border-b border-border p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium">
                                    {getWeekShortLabel(weekKey)}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {getWeekRangeLabel(weekKey)}
                                  </p>
                                </div>
                                {hasCurrentProject ? (
                                  <StatusPill label="Selected" tone="info" />
                                ) : null}
                              </div>
                              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                                <MiniStat
                                  label="Files"
                                  value={
                                    weekProjects.length + (hasCurrentProject ? 1 : 0)
                                  }
                                />
                                <MiniStat label="Leads" value={totalLeads} />
                                <MiniStat
                                  label="Review"
                                  value={hasCurrentProject ? dashboard.needsReview : 0}
                                />
                              </div>
                            </div>
                            <div className="grid flex-1 content-start gap-2 p-3">
                              {hasCurrentProject ? (
                                <button
                                  onClick={() => goToTab("leads")}
                                  className="min-w-0 w-full overflow-hidden border border-foreground bg-muted/40 p-3 text-left transition-colors hover:bg-muted"
                                >
                                  <TruncatedText
                                    value={project!.name}
                                    className="text-sm font-medium"
                                  />
                                  <TruncatedText
                                    value={project!.fileName}
                                    className="mt-1 text-xs text-muted-foreground"
                                  />
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <StatusPill label="Current" tone="info" />
                                    <StatusPill
                                      label={`${formatStat(project!.leads.length)} rows`}
                                      tone="neutral"
                                    />
                                  </div>
                                </button>
                              ) : null}

                              {weekProjects.map((savedProject) => (
                                <button
                                  key={savedProject.id}
                                  onClick={() =>
                                    void openSavedProjectInTab(savedProject.id, "weekly")
                                  }
                                  className="min-w-0 w-full overflow-hidden border border-border p-3 text-left transition-colors hover:border-foreground"
                                >
                                  <TruncatedText
                                    value={savedProject.name}
                                    className="text-sm font-medium"
                                  />
                                  <TruncatedText
                                    value={savedProject.fileName || "Saved list"}
                                    className="mt-1 text-xs text-muted-foreground"
                                  />
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <StatusPill
                                      label={`${formatStat(savedProject.rowCount)} rows`}
                                      tone="neutral"
                                    />
                                    <StatusPill
                                      label={savedProject.status}
                                      tone="info"
                                    />
                                  </div>
                                </button>
                              ))}

                              {!hasCurrentProject && weekProjects.length === 0 ? (
                                <button
                                  onClick={() => assignCurrentProjectToWeek(weekKey)}
                                  className="grid min-h-24 place-items-center border border-dashed border-border px-3 text-center text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                                >
                                  Assign current file here
                                </button>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </section>
            </div>
          ) : null}

          {activeTab === "dashboard" ? (
            <DashboardAnalyticsView
              dashboard={analyticsDashboard ?? EMPTY_DASHBOARD_ANALYTICS}
              error={dashboardError}
              isLoading={isDashboardLoading}
              activeOutreachIndex={activeOutreachIndex}
              onActiveOutreachIndexChange={setActiveOutreachIndex}
              onRefresh={() => void loadDashboardAnalytics()}
              onImport={() => goToTab("enrich")}
            />
          ) : null}

          {activeTab === "settings" && hasProject ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <section className="border border-border bg-background p-4">
                <p className="text-[0.68rem] tracking-[0.2em] text-muted-foreground uppercase">
                  Settings
                </p>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="border border-border p-4">
                    <p className="text-sm font-medium">Current decisions</p>
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                      <InfoLine label="Package manager" value="npm (package-lock.json)" />
                      <InfoLine label="Persistence today" value="Postgres when configured" />
                      <InfoLine label="UI preferences" value="localStorage" />
                      <InfoLine label="Route handler" value="/api/npi" />
                    </div>
                  </div>
                  <div className="border border-border p-4">
                    <p className="text-sm font-medium">Selected enrichment fields</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {project!.selectedFields.map((fieldKey) => (
                        <StatusPill
                          key={fieldKey}
                          label={NPI_FIELD_DEFINITIONS[fieldKey].header}
                          tone="neutral"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </section>
              <PanelCard
                eyebrow="Phase 2"
                title="Persistence upgrade"
                lines={[
                  "Add Railway Postgres",
                  "Choose ORM after inspection-driven schema design",
                  "Expand saved file and lead APIs",
                  "Replace remaining in-memory draft edits with server writes",
                ]}
              />
            </div>
          ) : null}

          {activeTab === "leads" ? (
            <div className="grid gap-4">
              <section className="border border-border bg-background p-4">
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_16rem_9rem_9rem_7rem] xl:items-end">
                  <div className="min-w-0">
                    <p className="text-[0.68rem] tracking-[0.2em] text-muted-foreground uppercase">
                      Lead File
                    </p>
                    <Select
                      value={project?.id ?? ""}
                      onChange={(event) =>
                        void openSavedProjectInTab(event.target.value, "leads")
                      }
                      disabled={isLoadingProject || savedProjects.length === 0}
                      className="mt-3"
                    >
                      <option value="">
                        {savedProjects.length === 0
                          ? "No saved files available"
                          : "Select saved file"}
                      </option>
                      {savedProjects.map((savedProject) => (
                        <option key={savedProject.id} value={savedProject.id}>
                          {savedProject.name} - {getWeekRangeLabel(savedProject.uploadWeek)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.68rem] tracking-[0.2em] text-muted-foreground uppercase">
                      Export
                    </p>
                    <Select
                      value={exportMode}
                      onChange={(event) => setExportMode(event.target.value as ExportMode)}
                      disabled={!project}
                      className="mt-3"
                    >
                      <option value="filtered">Filtered view</option>
                      <option value="all">Full workspace</option>
                      <option value="clean">Clean rows</option>
                      <option value="failed">Failed rows</option>
                      <option value="follow_up">Follow-up list</option>
                    </Select>
                  </div>
                  <Button
                    variant="outline"
                    onClick={downloadCsv}
                    disabled={!project}
                  >
                    <Download />
                    Export CSV
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void loadSavedProjects()}
                    disabled={databaseState === "checking"}
                  >
                    <RefreshCcw />
                    Refresh
                  </Button>
                  <Button variant="outline" onClick={() => goToTab("files")}>
                    <FileSpreadsheet />
                    Files
                  </Button>
                </div>

              </section>

              {!hasProject ? (
                <SavedFilePrompt
                  title="Select a file to view leads"
                  description="Open a saved file from the dropdown above to load its lead grid."
                  savedProjects={savedProjects}
                  databaseState={databaseState}
                  isLoadingProject={isLoadingProject}
                  onRefresh={() => void loadSavedProjects()}
                  onImport={() => goToTab("enrich")}
                  onOpen={(projectId) =>
                    void openSavedProjectInTab(projectId, "leads")
                  }
                />
              ) : (
                <div className="grid gap-4">
              <section className="grid min-w-0 content-start gap-4">
                <section className="border border-border bg-background p-4">
                  <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 flex-wrap gap-2">
                      {(Object.keys(VIEW_LABELS) as ViewKey[]).map((view) => (
                        <button
                          key={view}
                          onClick={() => {
                            setActiveView(view)
                            setLeadPage(1)
                            setSelectedLeadIds([])
                          }}
                          className={[
                            "rounded-lg border px-3 py-2 text-sm transition-colors",
                            activeView === view
                              ? "border-foreground bg-foreground text-background"
                              : "border-border bg-background hover:border-foreground hover:bg-muted",
                          ].join(" ")}
                        >
                          {VIEW_LABELS[view]}
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <Button
                        variant="outline"
                        onClick={() => setIsColumnMenuOpen((current) => !current)}
                      >
                        <Columns3 />
                        Customize Columns
                      </Button>
                      {isColumnMenuOpen ? (
                        <div className="absolute right-0 z-30 mt-2 w-64 border border-border bg-background p-2 shadow-xl">
                          {(Object.keys(LEAD_COLUMN_LABELS) as LeadColumnKey[]).map(
                            (columnKey) => (
                              <label
                                key={columnKey}
                                className="flex items-center gap-2 px-2 py-2 text-sm hover:bg-muted"
                              >
                                <input
                                  type="checkbox"
                                  className="size-4 accent-foreground"
                                  checked={visibleLeadColumns[columnKey]}
                                  disabled={
                                    !visibleLeadColumns[columnKey] &&
                                    !canShowMoreLeadColumns
                                  }
                                  onChange={() =>
                                    setVisibleLeadColumns((current) => {
                                      const selectedCount =
                                        Object.values(current).filter(Boolean).length
                                      const isSelected = current[columnKey]

                                      if (!isSelected && selectedCount >= 10) {
                                        return current
                                      }

                                      return {
                                        ...current,
                                        [columnKey]: !isSelected,
                                      }
                                    })
                                  }
                                />
                                <span className="flex-1">{LEAD_COLUMN_LABELS[columnKey]}</span>
                              </label>
                            )
                          )}
                          <p className="border-t border-border px-2 pt-2 text-xs text-muted-foreground">
                            Maximum 10 columns at a time.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_9rem_9rem_12rem_9rem_9rem]">
                    <div className="relative">
                      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={searchTerm}
                        onChange={(event) => {
                          setSearchTerm(event.target.value)
                          setLeadPage(1)
                        }}
                        placeholder="Search NPI, name, organization, state, specialty, notes..."
                        className="h-10 w-full border border-border bg-background px-9 text-sm outline-none focus:border-foreground"
                      />
                    </div>
                    <Select
                      value={sortKey}
                      onChange={(event) => {
                        setSortKey(event.target.value as SortKey)
                        setLeadPage(1)
                      }}
                      aria-label="Sort leads"
                    >
                      <option value="qualityScore">Quality</option>
                      <option value="outreachStatus">Outreach</option>
                      <option value="responseStatus">Response</option>
                      <option value="state">State</option>
                      <option value="specialty">Specialty</option>
                      <option value="lastContactedAt">Last Contact</option>
                      <option value="nextFollowUpAt">Next Follow-Up</option>
                    </Select>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setSortDirection((current) =>
                          current === "asc" ? "desc" : "asc"
                        )
                      }
                    >
                      <ArrowUpDown />
                      {sortDirection === "asc" ? "Asc" : "Desc"}
                    </Button>
                    <Select
                      value={bulkOutreachStatus}
                      onChange={(event) =>
                        setBulkOutreachStatus(event.target.value as OutreachStatus)
                      }
                      aria-label="Bulk outreach status"
                    >
                      {Object.entries(OUTREACH_STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                    <Button
                      variant="outline"
                      onClick={applyBulkOutreach}
                      disabled={selectedLeadIds.length === 0}
                    >
                      <Save />
                      Apply
                    </Button>
                    <Button
                      onClick={() => void startEnrichment("all_pending")}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <RefreshCcw />
                      )}
                      Enrich
                    </Button>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Filter className="size-4" />
                    <span>{formatStat(filteredLeads.length)} visible</span>
                    <span>{formatStat(selectedLeadIds.length)} selected</span>
                    <span>{formatStat(visibleLeadColumnCount)} columns shown</span>
                  </div>
                </section>

                <section className="min-w-0 border border-border bg-background">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-max border-collapse text-sm">
                      <thead className="sticky top-0 z-10 bg-background">
                        <tr className="border-b border-border text-left">
                          <th className="w-10 px-3 py-3">
                            <input
                              type="checkbox"
                              className="size-4 accent-foreground"
                              checked={
                                paginatedLeads.length > 0 &&
                                paginatedLeads.every((lead) =>
                                  selectedLeadIds.includes(lead.id)
                                )
                              }
                              onChange={(event) =>
                                setSelectedLeadIds(
                                  event.target.checked
                                    ? Array.from(
                                        new Set([
                                          ...selectedLeadIds,
                                          ...paginatedLeads.map((lead) => lead.id),
                                        ])
                                      )
                                    : selectedLeadIds.filter(
                                        (id) =>
                                          !paginatedLeads.some((lead) => lead.id === id)
                                      )
                                )
                              }
                            />
                          </th>
                          {visibleLeadColumns.lead ? (
                            <th className="px-3 py-3 font-medium">Lead</th>
                          ) : null}
                          {visibleLeadColumns.npi ? (
                            <th className="px-3 py-3 font-medium">NPI</th>
                          ) : null}
                          {visibleLeadColumns.phone ? (
                            <th className="px-3 py-3 font-medium">Phone</th>
                          ) : null}
                          {visibleLeadColumns.organization ? (
                            <th className="px-3 py-3 font-medium">Organization</th>
                          ) : null}
                          {visibleLeadColumns.specialty ? (
                            <th className="px-3 py-3 font-medium">Specialty</th>
                          ) : null}
                          {visibleLeadColumns.address ? (
                            <th className="px-3 py-3 font-medium">Address</th>
                          ) : null}
                          {visibleLeadColumns.city ? (
                            <th className="px-3 py-3 font-medium">City</th>
                          ) : null}
                          {visibleLeadColumns.state ? (
                            <th className="px-3 py-3 font-medium">State</th>
                          ) : null}
                          {visibleLeadColumns.zip ? (
                            <th className="px-3 py-3 font-medium">ZIP</th>
                          ) : null}
                          {visibleLeadColumns.quality ? (
                            <th className="px-3 py-3 font-medium">Quality</th>
                          ) : null}
                          {visibleLeadColumns.enrichment ? (
                            <th className="px-3 py-3 font-medium">Enrichment</th>
                          ) : null}
                          {visibleLeadColumns.outreach ? (
                            <th className="px-3 py-3 font-medium">Outreach</th>
                          ) : null}
                          {visibleLeadColumns.response ? (
                            <th className="px-3 py-3 font-medium">Response</th>
                          ) : null}
                          {visibleLeadColumns.lastContacted ? (
                            <th className="px-3 py-3 font-medium">Last Contacted</th>
                          ) : null}
                          {visibleLeadColumns.followUp ? (
                            <th className="px-3 py-3 font-medium">Follow-Up</th>
                          ) : null}
                          {visibleLeadColumns.owner ? (
                            <th className="px-3 py-3 font-medium">Owner</th>
                          ) : null}
                          {visibleLeadColumns.attempts ? (
                            <th className="px-3 py-3 font-medium">Attempts</th>
                          ) : null}
                          {visibleLeadColumns.tags ? (
                            <th className="px-3 py-3 font-medium">Tags</th>
                          ) : null}
                          {visibleLeadColumns.issues ? (
                            <th className="px-3 py-3 font-medium">Issues</th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedLeads.map((lead) => (
                          <tr
                            key={lead.id}
                            onClick={() => openLeadDetail(lead)}
                            className={[
                              "cursor-pointer border-b border-border/80 align-top transition-colors hover:bg-sky-50/80",
                              selectedLeadIds.includes(lead.id) ? "bg-sky-50" : "",
                            ].join(" ")}
                          >
                            <td
                              className="px-3 py-3"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                className="size-4 accent-foreground"
                                checked={selectedLeadIds.includes(lead.id)}
                                onChange={(event) =>
                                  setSelectedLeadIds((current) =>
                                    event.target.checked
                                      ? [...current, lead.id]
                                      : current.filter((id) => id !== lead.id)
                                  )
                                }
                              />
                            </td>
                            {visibleLeadColumns.lead ? (
                              <td className="max-w-56 px-3 py-3">
                                <TruncatedText
                                  value={getLeadDisplayName(lead)}
                                  className="font-medium"
                                />
                                <TruncatedText
                                  value={
                                    lead.normalizedPhone
                                      ? `(${lead.normalizedPhone.slice(0, 3)}) ${lead.normalizedPhone.slice(3, 6)}-${lead.normalizedPhone.slice(6)}`
                                      : "No phone"
                                  }
                                  className="text-xs text-muted-foreground"
                                />
                              </td>
                            ) : null}
                            {visibleLeadColumns.npi ? (
                              <td className="px-3 py-3 font-mono text-xs">
                                {lead.normalizedNpi || "Invalid"}
                              </td>
                            ) : null}
                            {visibleLeadColumns.phone ? (
                              <td className="px-3 py-3 text-xs">
                                {lead.normalizedPhone || "-"}
                              </td>
                            ) : null}
                            {visibleLeadColumns.organization ? (
                              <td className="max-w-56 px-3 py-3">
                                <TruncatedText
                                  value={getLeadOrganization(lead.original, lead.enriched) || "-"}
                                />
                              </td>
                            ) : null}
                            {visibleLeadColumns.specialty ? (
                              <td className="max-w-48 px-3 py-3">
                                <TruncatedText
                                  value={lead.enriched.primaryTaxonomy || "Unknown"}
                                />
                              </td>
                            ) : null}
                            {visibleLeadColumns.address ? (
                              <td className="max-w-56 px-3 py-3">
                                <TruncatedText
                                  value={getLeadAddress(lead.original, lead.enriched) || "-"}
                                />
                              </td>
                            ) : null}
                            {visibleLeadColumns.city ? (
                              <td className="px-3 py-3">
                                {lead.enriched.practiceCity || "-"}
                              </td>
                            ) : null}
                            {visibleLeadColumns.state ? (
                              <td className="px-3 py-3">{lead.normalizedState || "-"}</td>
                            ) : null}
                            {visibleLeadColumns.zip ? (
                              <td className="px-3 py-3">{lead.normalizedZip || "-"}</td>
                            ) : null}
                            {visibleLeadColumns.quality ? (
                              <td className="px-3 py-3">
                                <QualityPill score={lead.qualityScore} />
                              </td>
                            ) : null}
                            {visibleLeadColumns.enrichment ? (
                              <td className="px-3 py-3">
                                <StatusPill
                                  label={
                                    ENRICHMENT_STATUS_LABELS[
                                      lead.workspace.enrichmentStatus
                                    ]
                                  }
                                  className={
                                    ENRICHMENT_STATUS_CLASSES[
                                      lead.workspace.enrichmentStatus
                                    ]
                                  }
                                />
                              </td>
                            ) : null}
                            {visibleLeadColumns.outreach ? (
                              <td className="px-3 py-3">
                                <StatusPill
                                  label={OUTREACH_STATUS_LABELS[lead.workspace.outreachStatus]}
                                  className={
                                    OUTREACH_STATUS_CLASSES[lead.workspace.outreachStatus]
                                  }
                                />
                              </td>
                            ) : null}
                            {visibleLeadColumns.response ? (
                              <td className="px-3 py-3">
                                <StatusPill
                                  label={RESPONSE_STATUS_LABELS[lead.workspace.responseStatus]}
                                  className={
                                    RESPONSE_STATUS_CLASSES[lead.workspace.responseStatus]
                                  }
                                />
                              </td>
                            ) : null}
                            {visibleLeadColumns.lastContacted ? (
                              <td
                                className="relative px-3 py-3 text-xs"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <DateCellEditor
                                  lead={lead}
                                  field="lastContactedAt"
                                  activeEditor={dateEditor}
                                  onOpen={(nextEditor) => setDateEditor(nextEditor)}
                                  onCancel={() => setDateEditor(null)}
                                  onSave={(value) => {
                                    updateLeadWorkspace(lead.id, {
                                      lastContactedAt: value,
                                    })
                                    setDateEditor(null)
                                  }}
                                  onClear={() => {
                                    updateLeadWorkspace(lead.id, {
                                      lastContactedAt: "",
                                    })
                                    setDateEditor(null)
                                  }}
                                />
                              </td>
                            ) : null}
                            {visibleLeadColumns.followUp ? (
                              <td
                                className="relative px-3 py-3 text-xs"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <DateCellEditor
                                  lead={lead}
                                  field="nextFollowUpAt"
                                  activeEditor={dateEditor}
                                  onOpen={(nextEditor) => setDateEditor(nextEditor)}
                                  onCancel={() => setDateEditor(null)}
                                  onSave={(value) => {
                                    updateLeadWorkspace(lead.id, {
                                      nextFollowUpAt: value,
                                      outreachStatus: value
                                        ? "follow_up_needed"
                                        : lead.workspace.outreachStatus,
                                    })
                                    setDateEditor(null)
                                  }}
                                  onClear={() => {
                                    updateLeadWorkspace(lead.id, {
                                      nextFollowUpAt: "",
                                    })
                                    setDateEditor(null)
                                  }}
                                />
                              </td>
                            ) : null}
                            {visibleLeadColumns.owner ? (
                              <td className="max-w-40 px-3 py-3">
                                <TruncatedText value={lead.workspace.owner || "-"} />
                              </td>
                            ) : null}
                            {visibleLeadColumns.attempts ? (
                              <td className="px-3 py-3">
                                {formatStat(lead.workspace.attemptCount)}
                              </td>
                            ) : null}
                            {visibleLeadColumns.tags ? (
                              <td className="max-w-48 px-3 py-3">
                                <TruncatedText value={lead.workspace.tags || "-"} />
                              </td>
                            ) : null}
                            {visibleLeadColumns.issues ? (
                              <td className="max-w-64 px-3 py-3">
                                <p className="line-clamp-2 text-xs text-muted-foreground">
                                  {lead.issues.length > 0 ? lead.issues.join(", ") : "None"}
                                </p>
                              </td>
                            ) : null}
                          </tr>
                        ))}
                        {paginatedLeads.length === 0 ? (
                          <tr>
                            <td
                              colSpan={visibleLeadColumnCount + 1}
                              className="px-4 py-16 text-center text-muted-foreground"
                            >
                              No leads match this view.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-col gap-3 border-t border-border px-4 py-4 md:flex-row md:items-center md:justify-between">
                    <p className="text-sm text-muted-foreground">
                      {formatStat(selectedLeadIds.length)} of{" "}
                      {formatStat(filteredLeads.length)} row(s) selected.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-medium">Rows per page</span>
                      <Select
                        value={String(leadPageSize)}
                        onChange={(event) => {
                          setLeadPageSize(Number(event.target.value))
                          setLeadPage(1)
                        }}
                        aria-label="Rows per page"
                        className="h-9 w-20"
                      >
                        <option value="10">10</option>
                        <option value="25">25</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                      </Select>
                      <span className="text-sm font-medium">
                        Page {formatStat(currentLeadPage)} of {formatStat(leadPageCount)}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon-sm"
                          onClick={() => setLeadPage(1)}
                          disabled={currentLeadPage <= 1}
                          aria-label="First page"
                        >
                          <ChevronsLeft />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          onClick={() => setLeadPage((page) => Math.max(1, page - 1))}
                          disabled={currentLeadPage <= 1}
                          aria-label="Previous page"
                        >
                          <ChevronLeft />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          onClick={() =>
                            setLeadPage((page) => Math.min(leadPageCount, page + 1))
                          }
                          disabled={currentLeadPage >= leadPageCount}
                          aria-label="Next page"
                        >
                          <ChevronRight />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          onClick={() => setLeadPage(leadPageCount)}
                          disabled={currentLeadPage >= leadPageCount}
                          aria-label="Last page"
                        >
                          <ChevronsRight />
                        </Button>
                      </div>
                    </div>
                  </div>
                </section>
              </section>

                </div>
              )}
            </div>
          ) : null}
        </div>

        {editingLead && editingWorkspace ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 px-4 backdrop-blur-sm">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="lead-detail-title"
              className="max-h-[90vh] w-full max-w-3xl overflow-y-auto border border-border bg-background shadow-2xl"
            >
              <div className="flex min-w-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
                <div className="min-w-0">
                  <p className="text-[0.68rem] tracking-[0.2em] text-muted-foreground uppercase">
                    Lead Detail
                  </p>
                  <h2 id="lead-detail-title" className="mt-2 text-2xl font-medium">
                    {getLeadDisplayName(editingLead)}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {editingLead.enriched.primaryTaxonomy || "No specialty enriched yet"}
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={closeLeadDetail}>
                  <X />
                </Button>
              </div>

              <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
                <FieldEditor label="Outreach">
                  <Select
                    value={editingWorkspace.outreachStatus}
                    onChange={(event) =>
                      setEditingWorkspace((current) =>
                        current
                          ? {
                              ...current,
                              outreachStatus: event.target.value as OutreachStatus,
                              lastContactedAt:
                                event.target.value === "not_contacted"
                                  ? current.lastContactedAt
                                  : current.lastContactedAt ||
                                    new Date().toISOString().slice(0, 10),
                            }
                          : current
                      )
                    }
                  >
                    {Object.entries(OUTREACH_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </FieldEditor>
                <FieldEditor label="Response">
                  <Select
                    value={editingWorkspace.responseStatus}
                    onChange={(event) =>
                      setEditingWorkspace((current) =>
                        current
                          ? {
                              ...current,
                              responseStatus: event.target.value as ResponseStatus,
                            }
                          : current
                      )
                    }
                  >
                    {Object.entries(RESPONSE_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </FieldEditor>
                <FieldEditor label="Last Contact">
                  <input
                    type="date"
                    value={editingWorkspace.lastContactedAt}
                    onChange={(event) =>
                      setEditingWorkspace((current) =>
                        current
                          ? { ...current, lastContactedAt: event.target.value }
                          : current
                      )
                    }
                    className="h-10 w-full border border-border bg-background px-3 text-sm outline-none focus:border-foreground"
                  />
                </FieldEditor>
                <FieldEditor label="Follow-Up">
                  <div className="grid grid-cols-[minmax(0,1fr)_4.5rem] gap-2">
                    <input
                      type="date"
                      value={editingWorkspace.nextFollowUpAt}
                      onChange={(event) =>
                        setEditingWorkspace((current) =>
                          current
                            ? {
                                ...current,
                                nextFollowUpAt: event.target.value,
                                outreachStatus: event.target.value
                                  ? "follow_up_needed"
                                  : current.outreachStatus,
                              }
                            : current
                        )
                      }
                      className="h-10 w-full border border-border bg-background px-3 text-sm outline-none focus:border-foreground"
                    />
                    <Button
                      variant="outline"
                      onClick={() =>
                        setEditingWorkspace((current) =>
                          current ? { ...current, nextFollowUpAt: "" } : current
                        )
                      }
                    >
                      Clear
                    </Button>
                  </div>
                </FieldEditor>
                <FieldEditor label="Owner">
                  <input
                    value={editingWorkspace.owner}
                    onChange={(event) =>
                      setEditingWorkspace((current) =>
                        current ? { ...current, owner: event.target.value } : current
                      )
                    }
                    className="h-10 w-full border border-border bg-background px-3 text-sm outline-none focus:border-foreground"
                  />
                </FieldEditor>
                <FieldEditor label="Attempts">
                  <input
                    type="number"
                    min={0}
                    value={editingWorkspace.attemptCount}
                    onChange={(event) =>
                      setEditingWorkspace((current) =>
                        current
                          ? { ...current, attemptCount: Number(event.target.value) }
                          : current
                      )
                    }
                    className="h-10 w-full border border-border bg-background px-3 text-sm outline-none focus:border-foreground"
                  />
                </FieldEditor>
                <FieldEditor label="Tags">
                  <input
                    value={editingWorkspace.tags}
                    onChange={(event) =>
                      setEditingWorkspace((current) =>
                        current ? { ...current, tags: event.target.value } : current
                      )
                    }
                    placeholder="priority, west-region, callback"
                    className="h-10 w-full border border-border bg-background px-3 text-sm outline-none focus:border-foreground"
                  />
                </FieldEditor>
                <div className="grid gap-2">
                  <StatusPill
                    label={ENRICHMENT_STATUS_LABELS[editingLead.workspace.enrichmentStatus]}
                    className={ENRICHMENT_STATUS_CLASSES[editingLead.workspace.enrichmentStatus]}
                  />
                  <QualityPill score={editingLead.qualityScore} />
                </div>
                <div className="md:col-span-2">
                  <FieldEditor label="Notes">
                    <textarea
                      value={editingWorkspace.notes}
                      onChange={(event) =>
                        setEditingWorkspace((current) =>
                          current ? { ...current, notes: event.target.value } : current
                        )
                      }
                      rows={5}
                      className="w-full resize-none border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
                    />
                  </FieldEditor>
                </div>
                <div className="border border-border md:col-span-2">
                  <div className="border-b border-border px-3 py-2 text-[0.68rem] tracking-[0.18em] text-muted-foreground uppercase">
                    Data Signals
                  </div>
                  <div className="grid gap-2 p-3 text-sm md:grid-cols-2">
                    <InfoLine label="NPI" value={editingLead.normalizedNpi || "Invalid"} />
                    <InfoLine label="Phone" value={editingLead.normalizedPhone || "Missing"} />
                    <InfoLine label="State" value={editingLead.normalizedState || "-"} />
                    <InfoLine label="ZIP" value={editingLead.normalizedZip || "-"} />
                    <InfoLine
                      label="Issues"
                      value={
                        editingLead.issues.length > 0
                          ? editingLead.issues.join(", ")
                          : "None"
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={closeLeadDetail}>
                  Cancel
                </Button>
                <Button onClick={confirmLeadDetail}>
                  <Save />
                  Confirm
                </Button>
              </div>
            </section>
          </div>
        ) : null}

        {enrichmentToast.status !== "idle" ? (
          <EnrichmentProgressToast
            status={enrichmentToast.status}
            stats={
              enrichmentToast.status === "complete" ? enrichmentToast.stats : stats
            }
            progressValue={
              enrichmentToast.status === "complete"
                ? getProgressValue(enrichmentToast.stats)
                : progressValue
            }
          />
        ) : null}
      </div>
    </main>
  )
}

export default function Page() {
  return <CleanlyWorkspacePage initialTab="enrich" />
}

function TruncatedText({
  value,
  className = "",
}: {
  value: string
  className?: string
}) {
  return (
    <span
      title={value}
      className={`block min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap ${className}`}
    >
      {value}
    </span>
  )
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 border-b border-border pb-2 last:border-b-0 last:pb-0">
      <span className="shrink-0 text-[0.68rem] tracking-[0.16em] text-muted-foreground uppercase">
        {label}
      </span>
      <TruncatedText value={value} className="text-right text-sm" />
    </div>
  )
}

function DateCellEditor({
  lead,
  field,
  activeEditor,
  onOpen,
  onSave,
  onClear,
  onCancel,
}: {
  lead: LeadRecord
  field: "lastContactedAt" | "nextFollowUpAt"
  activeEditor: {
    leadId: string
    field: "lastContactedAt" | "nextFollowUpAt"
    value: string
  } | null
  onOpen: (editor: {
    leadId: string
    field: "lastContactedAt" | "nextFollowUpAt"
    value: string
  }) => void
  onSave: (value: string) => void
  onClear: () => void
  onCancel: () => void
}) {
  const currentValue = lead.workspace[field]
  const isOpen = activeEditor?.leadId === lead.id && activeEditor.field === field

  return (
    <>
      <button
        onClick={() =>
          onOpen({
            leadId: lead.id,
            field,
            value: currentValue,
          })
        }
        className="inline-flex items-center gap-1 border border-border px-2 py-1 hover:border-foreground"
      >
        <CalendarDays className="size-3" />
        {currentValue || "Set date"}
      </button>
      {isOpen ? (
        <div className="absolute right-3 z-30 mt-2 grid w-56 gap-2 border border-border bg-background p-3 shadow-xl">
          <input
            type="date"
            value={activeEditor.value}
            onChange={(event) =>
              onOpen({
                leadId: lead.id,
                field,
                value: event.target.value,
              })
            }
            className="h-9 border border-border bg-background px-2 text-sm outline-none focus:border-foreground"
          />
          <div className="grid grid-cols-3 gap-2">
            <Button size="xs" onClick={() => onSave(activeEditor.value)}>
              Save
            </Button>
            <Button size="xs" variant="outline" onClick={onClear}>
              Clear
            </Button>
            <Button size="xs" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
}

function SingleLookupResults({ result }: { result: NpiLookupResponse | null }) {
  if (!result) return null

  const rows = Object.entries(NPI_FIELD_DEFINITIONS).map(
    ([fieldKey, definition]) => ({
      label: definition.label,
      value: result.fields[fieldKey as EnrichFieldKey] || "-",
    })
  )

  return (
    <div className="mt-2 min-w-0 border border-border bg-background">
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border px-3 py-2">
        <TruncatedText
          value={`NPI ${result.number}`}
          className="text-sm font-medium"
        />
        <StatusPill
          label={result.found ? "Found" : "Not Found"}
          tone={result.found ? "success" : "warning"}
        />
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b border-border text-left">
              <th className="px-3 py-2 font-medium">Field</th>
              <th className="px-3 py-2 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-border/70 last:border-b-0">
                <td className="max-w-40 px-3 py-2 align-top text-muted-foreground">
                  <TruncatedText value={row.label} />
                </td>
                <td className="max-w-64 px-3 py-2 align-top">
                  <TruncatedText value={row.value} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EnrichmentProgressToast({
  status,
  stats,
  progressValue,
}: {
  status: "processing" | "complete"
  stats: ProcessingStats
  progressValue: number
}) {
  const isComplete = status === "complete"

  return (
    <div className="fixed right-4 bottom-4 z-50 w-[calc(100vw-2rem)] max-w-sm border border-border bg-background p-4 shadow-2xl sm:right-6 sm:bottom-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[0.68rem] tracking-[0.18em] text-muted-foreground uppercase">
            Enrichment
          </p>
          <p className="mt-1 text-sm font-medium">
            {isComplete
              ? `${formatStat(stats.success)} rows out of ${formatStat(stats.total)} successfully enriched`
              : `${formatStat(stats.processed)} / ${formatStat(stats.total)} rows processed`}
          </p>
        </div>
        {isComplete ? (
          <StatusPill label="Complete" tone="success" />
        ) : (
          <LoaderCircle className="mt-1 size-4 shrink-0 animate-spin text-muted-foreground" />
        )}
      </div>
      <Progress value={progressValue} className="mt-3 h-2" />
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <MiniStat label="Success" value={stats.success} />
        <MiniStat label="Failed" value={stats.failed} />
        <MiniStat label="Total" value={stats.total} />
      </div>
    </div>
  )
}

function DashboardAnalyticsView({
  dashboard,
  error,
  isLoading,
  activeOutreachIndex,
  onActiveOutreachIndexChange,
  onRefresh,
  onImport,
}: {
  dashboard: DashboardAnalytics
  error: string
  isLoading: boolean
  activeOutreachIndex: number
  onActiveOutreachIndexChange: (index: number) => void
  onRefresh: () => void
  onImport: () => void
}) {
  const hasData = dashboard.totals.files > 0 || dashboard.totals.totalLeads > 0
  const enrichmentPercent = getPercent(
    dashboard.totals.enrichedLeads,
    dashboard.totals.totalLeads
  )
  const outreachPercent = getPercent(
    dashboard.totals.contacted,
    dashboard.totals.totalLeads
  )
  const activeOutreach =
    dashboard.outreachDistribution[activeOutreachIndex] ??
    dashboard.outreachDistribution[0] ?? {
      label: "No status",
      value: 0,
      fill: "var(--muted)",
    }
  const outreachTotal = dashboard.outreachDistribution.reduce(
    (sum, item) => sum + item.value,
    0
  )
  const radialData = [
    {
      name: "enrichment",
      value: enrichmentPercent,
      fill: "var(--color-enrichment)",
    },
    {
      name: "outreach",
      value: outreachPercent,
      fill: "var(--color-outreach)",
    },
  ]
  const kpis = [
    {
      label: "Total Files",
      value: dashboard.totals.files,
      detail: "Saved lists",
      color: "border-l-blue-500",
    },
    {
      label: "Total Leads",
      value: dashboard.totals.totalLeads,
      detail: "Persisted rows",
      color: "border-l-slate-500",
    },
    {
      label: "Enriched",
      value: dashboard.totals.enrichedLeads,
      detail: `${enrichmentPercent}% complete`,
      color: "border-l-emerald-500",
    },
    {
      label: "Invalid / Failed",
      value: dashboard.totals.invalidFailed,
      detail: "Needs attention",
      color: "border-l-red-500",
    },
    {
      label: "Ready / Review",
      value: dashboard.totals.readyForOutreach,
      detail: `${formatStat(dashboard.totals.needsReview)} review`,
      color: "border-l-amber-500",
    },
    {
      label: "Follow-Ups Due",
      value: dashboard.totals.followUpsDue,
      detail: "Due today or earlier",
      color: "border-l-orange-500",
    },
    {
      label: "Contacted",
      value: dashboard.totals.contacted,
      detail: `${outreachPercent}% outreach`,
      color: "border-l-sky-500",
    },
    {
      label: "Responded",
      value: dashboard.totals.responded,
      detail: "Positive or negative",
      color: "border-l-violet-500",
    },
  ]

  return (
    <div className="grid gap-4">
      <section className="border border-border bg-background p-4">
        <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-[0.68rem] tracking-[0.2em] text-muted-foreground uppercase">
              Dashboard
            </p>
            <h2 className="mt-2 text-2xl font-medium tracking-[-0.04em]">
              Cross-file lead operations analytics
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Saved projects, files, leads, enrichment outcomes, outreach status, and
              follow-ups roll up here. Unsaved CSV drafts are intentionally excluded.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onRefresh} disabled={isLoading}>
              {isLoading ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <RefreshCcw />
              )}
              Refresh
            </Button>
            <Button onClick={onImport}>
              <Upload />
              Import CSV
            </Button>
          </div>
        </div>
        {error ? (
          <div className="mt-4 flex items-start gap-2 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => (
          <Card
            key={item.label}
            className={`rounded-none border-l-4 ${item.color}`}
            size="sm"
          >
            <CardHeader>
              <CardDescription className="text-[0.66rem] tracking-[0.16em] uppercase">
                {item.label}
              </CardDescription>
              <CardTitle className="text-2xl tracking-[-0.05em]">
                {formatStat(item.value)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{item.detail}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {!hasData ? (
        <Card className="rounded-none">
          <CardHeader>
            <CardTitle>No saved analytics yet</CardTitle>
            <CardDescription>
              Import and save a CSV list to Postgres, then this dashboard will populate
              with cross-file operational charts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={onImport}>
              <Upload />
              Import first file
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="grid gap-4 2xl:grid-cols-[minmax(0,1.55fr)_minmax(22rem,0.85fr)]">
            <Card className="rounded-none">
              <CardHeader>
                <CardTitle>Workspace growth by month</CardTitle>
                <CardDescription>
                  Imported rows stacked against enrichment, review, ready, and outreach
                  progress.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={DASHBOARD_AREA_CONFIG}
                  className="h-[340px] w-full"
                >
                  <AreaChart
                    accessibilityLayer
                    data={dashboard.timeSeries}
                    margin={{ left: 12, right: 12, top: 12 }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                    <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <defs>
                      <linearGradient id="fillImported" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="var(--color-imported)"
                          stopOpacity={0.45}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--color-imported)"
                          stopOpacity={0.05}
                        />
                      </linearGradient>
                      <linearGradient id="fillEnriched" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="var(--color-enriched)"
                          stopOpacity={0.55}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--color-enriched)"
                          stopOpacity={0.08}
                        />
                      </linearGradient>
                      <linearGradient id="fillNeedsReview" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="var(--color-needsReview)"
                          stopOpacity={0.55}
                        />
                        <stop
                          offset="95%"
                          stopColor="var(--color-needsReview)"
                          stopOpacity={0.08}
                        />
                      </linearGradient>
                    </defs>
                    <Area
                      dataKey="imported"
                      type="natural"
                      fill="url(#fillImported)"
                      stroke="var(--color-imported)"
                      stackId="a"
                    />
                    <Area
                      dataKey="enriched"
                      type="natural"
                      fill="url(#fillEnriched)"
                      stroke="var(--color-enriched)"
                      stackId="a"
                    />
                    <Area
                      dataKey="needsReview"
                      type="natural"
                      fill="url(#fillNeedsReview)"
                      stroke="var(--color-needsReview)"
                      stackId="a"
                    />
                    <Area
                      dataKey="ready"
                      type="natural"
                      fill="var(--color-ready)"
                      fillOpacity={0.25}
                      stroke="var(--color-ready)"
                      stackId="a"
                    />
                    <Area
                      dataKey="contacted"
                      type="natural"
                      fill="var(--color-contacted)"
                      fillOpacity={0.2}
                      stroke="var(--color-contacted)"
                      stackId="a"
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card className="rounded-none">
              <CardHeader>
                <CardTitle>Completion pulse</CardTitle>
                <CardDescription>
                  Enrichment and outreach completion across all saved rows.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <ChartContainer
                    config={DASHBOARD_RADIAL_CONFIG}
                    className="mx-auto h-[300px] w-full"
                  >
                    <RadialBarChart
                      accessibilityLayer
                      data={radialData}
                      innerRadius="58%"
                      outerRadius="90%"
                      startAngle={90}
                      endAngle={-270}
                    >
                      <ChartTooltip
                        content={<ChartTooltipContent hideLabel />}
                        cursor={false}
                      />
                      <RadialBar dataKey="value" background cornerRadius={12} />
                    </RadialBarChart>
                  </ChartContainer>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    <div className="text-center">
                      <p className="text-4xl font-medium tracking-[-0.08em]">
                        {enrichmentPercent}%
                      </p>
                      <p className="mt-1 text-xs tracking-[0.16em] text-muted-foreground uppercase">
                        Enriched
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {outreachPercent}% contacted
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 2xl:grid-cols-2">
            <Card className="rounded-none">
              <CardHeader>
                <CardTitle>Rates over time</CardTitle>
                <CardDescription>
                  Completion labels show how operational velocity changes as files arrive.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={DASHBOARD_RATE_CONFIG}
                  className="h-[310px] w-full"
                >
                  <LineChart
                    accessibilityLayer
                    data={dashboard.timeSeries}
                    margin={{ left: 12, right: 24, top: 20 }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tickFormatter={(value) => `${value}%`}
                    />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                    <Line
                      dataKey="enrichmentRate"
                      type="monotone"
                      stroke="var(--color-enrichmentRate)"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    >
                      <LabelList
                        dataKey="enrichmentRate"
                        position="top"
                        formatter={(value: unknown) =>
                          typeof value === "number" ? `${value}%` : String(value ?? "")
                        }
                      />
                    </Line>
                    <Line
                      dataKey="outreachRate"
                      type="monotone"
                      stroke="var(--color-outreachRate)"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card className="rounded-none">
              <CardHeader>
                <CardTitle>Outreach status mix</CardTitle>
                <CardDescription>
                  Hover a segment to inspect count and share of the full workspace.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-center">
                  <div className="relative">
                    <ChartContainer
                      config={{ value: { label: "Leads", color: "#2563eb" } }}
                      className="mx-auto h-[310px] w-full"
                    >
                      <PieChart accessibilityLayer>
                        <ChartTooltip
                          content={<ChartTooltipContent hideLabel nameKey="label" />}
                        />
                        <Pie
                          data={dashboard.outreachDistribution}
                          dataKey="value"
                          nameKey="label"
                          innerRadius={72}
                          outerRadius={116}
                          paddingAngle={2}
                          onMouseEnter={(_, index) =>
                            onActiveOutreachIndexChange(index)
                          }
                        >
                          {dashboard.outreachDistribution.map((entry, index) => (
                            <Cell
                              key={entry.key}
                              fill={entry.fill}
                              opacity={index === activeOutreachIndex ? 1 : 0.48}
                            />
                          ))}
                          <Label
                            content={({ viewBox }) => {
                              if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) {
                                return null
                              }

                              return (
                                <text
                                  x={Number(viewBox.cx)}
                                  y={Number(viewBox.cy)}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                >
                                  <tspan
                                    x={Number(viewBox.cx)}
                                    y={Number(viewBox.cy) - 8}
                                    className="fill-foreground text-2xl font-medium"
                                  >
                                    {formatStat(activeOutreach.value)}
                                  </tspan>
                                  <tspan
                                    x={Number(viewBox.cx)}
                                    y={Number(viewBox.cy) + 14}
                                    className="fill-muted-foreground text-xs"
                                  >
                                    {getPercent(activeOutreach.value, outreachTotal)}%
                                  </tspan>
                                </text>
                              )
                            }}
                          />
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                  </div>
                  <div className="grid gap-2">
                    {dashboard.outreachDistribution.map((item, index) => (
                      <button
                        key={item.key}
                        onMouseEnter={() => onActiveOutreachIndexChange(index)}
                        onFocus={() => onActiveOutreachIndexChange(index)}
                        className={[
                          "flex min-w-0 items-center justify-between gap-3 border px-3 py-2 text-left text-sm transition-colors",
                          index === activeOutreachIndex
                            ? "border-foreground bg-muted"
                            : "border-border hover:border-foreground",
                        ].join(" ")}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: item.fill }}
                          />
                          <TruncatedText value={item.label} />
                        </span>
                        <span className="font-mono text-xs">
                          {formatStat(item.value)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Card className="rounded-none">
              <CardHeader>
                <CardTitle>Data quality radar</CardTitle>
                <CardDescription>
                  Coverage scores show whether lists are operationally ready.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={DASHBOARD_QUALITY_CONFIG}
                  className="h-[330px] w-full"
                >
                  <RadarChart data={dashboard.qualityRadar}>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <PolarGrid />
                    <PolarAngleAxis dataKey="metric" />
                    <Radar
                      dataKey="score"
                      stroke="var(--color-score)"
                      fill="var(--color-score)"
                      fillOpacity={0.22}
                      dot={{ r: 4, fill: "var(--color-score)" }}
                    />
                  </RadarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <DashboardListCard
                title="Top states"
                description="Lead concentration by state."
                items={dashboard.topStates}
              />
              <DashboardListCard
                title="Top specialties"
                description="Specialty and taxonomy concentration."
                items={dashboard.topSpecialties}
              />
              <DashboardFollowUpsCard items={dashboard.followUpsDue} />
              <DashboardFilesReviewCard items={dashboard.filesNeedingReview} />
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function DashboardListCard({
  title,
  description,
  items,
}: {
  title: string
  description: string
  items: DashboardRankPoint[]
}) {
  const maxValue = Math.max(...items.map((item) => item.value), 1)

  return (
    <Card className="rounded-none" size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.label} className="grid gap-1">
              <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
                <TruncatedText value={item.label} />
                <span className="font-mono text-xs text-muted-foreground">
                  {formatStat(item.value)}
                </span>
              </div>
              <div className="h-1.5 bg-muted">
                <div
                  className="h-full bg-foreground"
                  style={{ width: `${Math.max((item.value / maxValue) * 100, 4)}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No saved lead data yet.</p>
        )}
      </CardContent>
    </Card>
  )
}

function DashboardFollowUpsCard({ items }: { items: DashboardFollowUpPoint[] }) {
  return (
    <Card className="rounded-none" size="sm">
      <CardHeader>
        <CardTitle>Upcoming follow-ups</CardTitle>
        <CardDescription>Next dated outreach tasks across all files.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.id} className="grid gap-1 border border-border p-2 text-sm">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <TruncatedText value={item.name} className="font-medium" />
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDateOnly(item.date)}
                </span>
              </div>
              <TruncatedText
                value={`${item.fileName} · ${item.status}`}
                className="text-xs text-muted-foreground"
              />
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No follow-up dates scheduled.</p>
        )}
      </CardContent>
    </Card>
  )
}

function DashboardFilesReviewCard({
  items,
}: {
  items: DashboardFileReviewPoint[]
}) {
  return (
    <Card className="rounded-none" size="sm">
      <CardHeader>
        <CardTitle>Files needing review</CardTitle>
        <CardDescription>Lists with cleanup or enrichment failures.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.id} className="grid gap-2 border border-border p-2 text-sm">
              <div className="min-w-0">
                <TruncatedText value={item.name} className="font-medium" />
                <TruncatedText
                  value={`${item.projectName} · ${getWeekRangeLabel(item.uploadWeek)}`}
                  className="mt-1 text-xs text-muted-foreground"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusPill label={`${formatStat(item.needsReview)} review`} tone="warning" />
                <StatusPill label={`${formatStat(item.failed)} failed`} tone="danger" />
                <StatusPill label={`${formatStat(item.total)} rows`} tone="neutral" />
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No files currently need review.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function getPercent(value: number, total: number) {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border bg-background p-3">
      <p className="text-[0.66rem] tracking-[0.16em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-2 text-2xl font-medium tracking-[-0.05em]">
        {formatStat(value)}
      </p>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border p-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{formatStat(value)}</p>
    </div>
  )
}

function StatusPill({
  label,
  tone = "neutral",
  className,
}: {
  label: string
  tone?: "neutral" | "success" | "warning" | "danger" | "info"
  className?: string
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-700/40 bg-emerald-500/10 text-emerald-800"
      : tone === "warning"
        ? "border-amber-700/40 bg-amber-500/10 text-amber-800"
        : tone === "danger"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : tone === "info"
            ? "border-sky-700/40 bg-sky-500/10 text-sky-800"
            : "border-border bg-muted/30 text-muted-foreground"

  return (
    <span
      className={`inline-flex max-w-full items-center justify-center rounded-full border px-2 py-1 text-xs ${className ?? toneClass}`}
    >
      <span className="truncate">{label}</span>
    </span>
  )
}

function QualityPill({ score }: { score: number }) {
  const tone =
    score >= 78
      ? "border-emerald-700/40 bg-emerald-500/10 text-emerald-800"
      : score >= 55
        ? "border-amber-700/40 bg-amber-500/10 text-amber-800"
        : "border-destructive/40 bg-destructive/10 text-destructive"

  return (
    <span className={`inline-flex items-center justify-center border px-2 py-1 text-xs ${tone}`}>
      {score}/100
    </span>
  )
}

function FieldEditor({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="grid gap-1">
      <span className="text-[0.68rem] tracking-[0.16em] text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </label>
  )
}

function TabButton({
  active,
  href,
  icon: Icon,
  label,
}: {
  active: boolean
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <Link
      href={href}
      className={[
        "inline-flex items-center gap-2 border px-4 py-2 text-sm transition-colors",
        active
          ? "border-foreground bg-foreground text-background [&_svg]:text-sky-200"
          : "border-border bg-background text-foreground hover:border-foreground [&_svg]:text-white",
      ].join(" ")}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  )
}

function SavedFilePrompt({
  title,
  description,
  savedProjects,
  databaseState,
  isLoadingProject,
  onRefresh,
  onImport,
  onOpen,
}: {
  title: string
  description: string
  savedProjects: ProjectSummary[]
  databaseState: "checking" | "available" | "unavailable"
  isLoadingProject: boolean
  onRefresh: () => void
  onImport: () => void
  onOpen: (projectId: string) => void
}) {
  return (
    <section className="border border-border bg-background p-4">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[0.68rem] tracking-[0.2em] text-muted-foreground uppercase">
            Workspace File
          </p>
          <h2 className="mt-2 text-2xl font-medium">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={databaseState === "checking"}
          >
            <RefreshCcw />
            Refresh
          </Button>
          <Button variant="outline" onClick={onImport}>
            <Upload />
            Import CSV
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        {savedProjects.map((savedProject) => (
          <button
            key={savedProject.id}
            onClick={() => onOpen(savedProject.id)}
            disabled={isLoadingProject}
            className="grid min-w-0 gap-3 border border-border p-3 text-left transition-colors hover:border-foreground disabled:cursor-not-allowed disabled:opacity-60 md:grid-cols-[minmax(0,1fr)_11rem_7rem]"
          >
            <div className="min-w-0">
              <TruncatedText
                value={savedProject.name}
                className="text-sm font-medium"
              />
              <TruncatedText
                value={savedProject.fileName || "Saved file"}
                className="mt-1 text-xs text-muted-foreground"
              />
            </div>
            <span className="text-sm text-muted-foreground">
              {getWeekRangeLabel(savedProject.uploadWeek)}
            </span>
            <span className="text-sm">{formatStat(savedProject.rowCount)} rows</span>
          </button>
        ))}
        {savedProjects.length === 0 ? (
          <div className="border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No saved files are available yet.
          </div>
        ) : null}
      </div>
    </section>
  )
}

function PanelCard({
  eyebrow,
  title,
  lines,
}: {
  eyebrow: string
  title: string
  lines: string[]
}) {
  return (
    <section className="border border-border bg-background p-4">
      <p className="text-[0.68rem] tracking-[0.18em] text-muted-foreground uppercase">
        {eyebrow}
      </p>
      <p className="mt-2 text-sm font-medium">{title}</p>
      <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </section>
  )
}
