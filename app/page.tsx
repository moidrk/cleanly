"use client"

import type { ChangeEvent, DragEvent } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import Papa from "papaparse"
import pLimit from "p-limit"
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Search,
  Upload,
} from "lucide-react"

import { Button } from "@/components/ui/button"
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

type WorkflowPhase = "ingest" | "configure" | "processing" | "export"

interface ProcessingStats {
  total: number
  processed: number
  success: number
  failed: number
}

const numberFormatter = new Intl.NumberFormat("en-US")

const initialStats: ProcessingStats = {
  total: 0,
  processed: 0,
  success: 0,
  failed: 0,
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

function fileNameToDownloadName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "") || "npi-enriched"
  return `${baseName}-enriched.csv`
}

function getSelectedHeaderNames(selectedFields: EnrichFieldKey[]) {
  return selectedFields.map((fieldKey) => NPI_FIELD_DEFINITIONS[fieldKey].header)
}

function getProgressValue(stats: ProcessingStats) {
  if (stats.total === 0) {
    return 0
  }

  return (stats.processed / stats.total) * 100
}

function formatStat(value: number) {
  return numberFormatter.format(value)
}

export default function Page() {
  const [phase, setPhase] = useState<WorkflowPhase>("ingest")
  const [fileName, setFileName] = useState("")
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<CsvRow[]>([])
  const [selectedNpiColumn, setSelectedNpiColumn] = useState("")
  const [selectedFields, setSelectedFields] =
    useState<EnrichFieldKey[]>(DEFAULT_SELECTED_FIELDS)
  const [stats, setStats] = useState<ProcessingStats>(initialStats)
  const [logs, setLogs] = useState<string[]>([])
  const [exportRows, setExportRows] = useState<CsvRow[]>([])
  const [exportHeaders, setExportHeaders] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const logViewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const viewport = logViewportRef.current

    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight
    }
  }, [logs])

  const resetProcessingState = useCallback(() => {
    setStats({ ...initialStats })
    setLogs([])
    setExportRows([])
    setExportHeaders([])
    setIsProcessing(false)
  }, [])

  const ingestFile = useCallback(
    (file: File) => {
      setErrorMessage("")

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

          const detectedNpiColumn =
            uniqueHeaders.find((header) =>
              header.toLowerCase().includes("npi")
            ) ?? uniqueHeaders[0]

          setFileName(file.name)
          setHeaders(uniqueHeaders)
          setRows(csvRows)
          setSelectedNpiColumn(detectedNpiColumn)
          setSelectedFields(DEFAULT_SELECTED_FIELDS)
          resetProcessingState()
          setPhase("configure")
        },
        error: () => {
          setErrorMessage("The CSV could not be parsed. Please try another file.")
        },
      })
    },
    [resetProcessingState]
  )

  const handleFileSelection = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]

      if (!file) {
        return
      }

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

      if (!file) {
        return
      }

      ingestFile(file)
    },
    [ingestFile]
  )

  const toggleField = useCallback((fieldKey: EnrichFieldKey) => {
    setSelectedFields((current) =>
      current.includes(fieldKey)
        ? current.filter((value) => value !== fieldKey)
        : [...current, fieldKey]
    )
  }, [])

  const startEnrichment = useCallback(async () => {
    if (!selectedNpiColumn || selectedFields.length === 0 || rows.length === 0) {
      return
    }

    const emptyFields = createEmptyEnrichedFields()
    const groupedRows = new Map<string, number[]>()
    const rowFieldMap = new Map<number, EnrichedNpiFields>()
    const nextLogs: string[] = []

    let processed = 0
    let success = 0
    let failed = 0

    setErrorMessage("")
    setIsProcessing(true)
    setPhase("processing")
    setLogs([])
    setStats({ total: rows.length, processed: 0, success: 0, failed: 0 })

    rows.forEach((row, index) => {
      const normalizedNpi = normalizeNpi(row[selectedNpiColumn])

      if (!normalizedNpi) {
        rowFieldMap.set(index, createEmptyEnrichedFields())
        processed += 1
        failed += 1
        nextLogs.push(`[x] Row ${index + 2} - Invalid or missing NPI`)
        return
      }

      const existingIndexes = groupedRows.get(normalizedNpi) ?? []
      existingIndexes.push(index)
      groupedRows.set(normalizedNpi, existingIndexes)
    })

    if (nextLogs.length > 0) {
      setLogs([...nextLogs])
      setStats({ total: rows.length, processed, success, failed })
    }

    const limit = pLimit(12)

    const appendLookupResult = (
      number: string,
      rowIndexes: number[],
      response: NpiLookupResponse
    ) => {
      rowIndexes.forEach((rowIndex) => {
        rowFieldMap.set(rowIndex, response.fields)
      })

      processed += rowIndexes.length

      if (response.found) {
        success += rowIndexes.length
        nextLogs.push(
          `[OK] NPI ${number} - Enriched${rowIndexes.length > 1 ? ` (${rowIndexes.length} rows)` : ""}`
        )
      } else {
        failed += rowIndexes.length
        nextLogs.push(
          `[x] NPI ${number} - ${response.error ?? "Not Found"}${rowIndexes.length > 1 ? ` (${rowIndexes.length} rows)` : ""}`
        )
      }

      setLogs([...nextLogs])
      setStats({ total: rows.length, processed, success, failed })
    }

    try {
      await Promise.all(
        Array.from(groupedRows.entries()).map(([number, rowIndexes]) =>
          limit(async () => {
            try {
              const response = await fetch(
                `/api/npi?number=${encodeURIComponent(number)}`,
                {
                  cache: "no-store",
                }
              )

              const payload = (await response.json()) as NpiLookupResponse

              if (!response.ok) {
                appendLookupResult(number, rowIndexes, {
                  number,
                  found: false,
                  fields: emptyFields,
                  error: payload.error ?? "Lookup failed",
                })
                return
              }

              appendLookupResult(number, rowIndexes, payload)
            } catch {
              appendLookupResult(number, rowIndexes, {
                number,
                found: false,
                fields: emptyFields,
                error: "Request failed",
              })
            }
          })
        )
      )

      const selectedHeaders = getSelectedHeaderNames(selectedFields)
      const mergedRows = rows.map((row, index) => {
        const fields = rowFieldMap.get(index) ?? createEmptyEnrichedFields()
        const selectedEnrichment = selectedFields.reduce<CsvRow>(
          (collection, fieldKey) => {
            collection[NPI_FIELD_DEFINITIONS[fieldKey].header] = fields[fieldKey]
            return collection
          },
          {}
        )

        return {
          ...row,
          ...selectedEnrichment,
        }
      })

      setExportHeaders([...headers, ...selectedHeaders])
      setExportRows(mergedRows)
      setPhase("export")
    } catch {
      setErrorMessage("The enrichment run ended unexpectedly. Please try again.")
      setPhase("configure")
    } finally {
      setIsProcessing(false)
    }
  }, [headers, rows, selectedFields, selectedNpiColumn])

  const downloadCsv = useCallback(() => {
    if (exportRows.length === 0 || exportHeaders.length === 0) {
      return
    }

    const csv = Papa.unparse({
      fields: exportHeaders,
      data: exportRows.map((row) => exportHeaders.map((header) => row[header] ?? "")),
    })

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const downloadUrl = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = downloadUrl
    anchor.download = fileNameToDownloadName(fileName)
    anchor.click()
    URL.revokeObjectURL(downloadUrl)
  }, [exportHeaders, exportRows, fileName])

  const progressValue = getProgressValue(stats)

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-8 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.3fr)_20rem] lg:gap-10 lg:px-10 lg:py-8">
        <section className="flex min-w-0 flex-col gap-6">
          <header className="grid gap-4 border border-border bg-background px-5 py-6 sm:grid-cols-[minmax(0,1fr)_13rem] sm:px-7">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[0.7rem] font-medium tracking-[0.28em] text-muted-foreground uppercase">
                <span className="inline-flex size-2 bg-foreground" />
                NPI CSV Enricher
              </div>
              <div className="space-y-3">
                <h1 className="max-w-2xl text-3xl font-medium tracking-[-0.06em] text-balance sm:text-5xl">
                  Enrich healthcare outreach lists without sending the CSV to a
                  server.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Upload a CSV, map the NPI column, choose the CMS data points to
                  append, and export a clean enriched file from the browser.
                </p>
              </div>
            </div>
            <div className="grid gap-3 border-t border-border pt-4 text-sm sm:border-t-0 sm:border-s sm:pt-0 sm:ps-5">
              <InfoLine label="Project" value="Client-side workflow" />
              <InfoLine label="Lookup path" value="CMS registry via Next proxy" />
              <InfoLine label="Concurrency" value="12 requests / batch" />
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <section className="border border-border bg-background p-5 sm:p-7">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <p className="text-[0.7rem] font-medium tracking-[0.22em] text-muted-foreground uppercase">
                    Workflow
                  </p>
                  <h2 className="mt-1 text-xl font-medium tracking-[-0.04em]">
                    {phase === "ingest" && "Upload a source file"}
                    {phase === "configure" && "Map and select enrichment fields"}
                    {phase === "processing" && "Lookup in progress"}
                    {phase === "export" && "Download the enriched CSV"}
                  </h2>
                </div>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                >
                  <Upload />
                  {fileName ? "Replace CSV" : "Choose CSV"}
                </Button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileSelection}
              />

              {errorMessage ? (
                <div className="mb-6 flex items-start gap-3 border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-foreground">
                  <AlertCircle className="mt-0.5 size-4 text-destructive" />
                  <p>{errorMessage}</p>
                </div>
              ) : null}

              {phase === "ingest" ? (
                <div
                  onDragOver={(event) => {
                    event.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={[
                    "grid min-h-[24rem] place-items-center border border-dashed px-6 py-10 transition-colors",
                    isDragging
                      ? "border-foreground bg-muted/60"
                      : "border-border bg-muted/20",
                  ].join(" ")}
                >
                  <div className="max-w-xl space-y-6 text-center">
                    <div className="mx-auto flex size-14 items-center justify-center border border-border bg-background">
                      <FileSpreadsheet className="size-6" />
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-2xl font-medium tracking-[-0.04em]">
                        Drop your CSV here
                      </h3>
                      <p className="text-sm leading-6 text-muted-foreground">
                        Papa Parse handles ingestion in the browser, so the raw
                        file stays local while you prepare the lookup run.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <Button onClick={() => fileInputRef.current?.click()}>
                        <Upload />
                        Select CSV
                      </Button>
                      <span className="text-[0.72rem] tracking-[0.18em] text-muted-foreground uppercase">
                        Drag, drop, map, enrich, export
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}

              {phase === "configure" ? (
                <div className="grid gap-8">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                    <div className="space-y-4">
                      <SectionLabel
                        title="Identify the NPI column"
                        description="Choose the header that contains 10-digit NPIs. Leading zeroes are preserved."
                      />
                      <Select
                        value={selectedNpiColumn}
                        onChange={(event) => setSelectedNpiColumn(event.target.value)}
                      >
                        {headers.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-4 border border-border p-4">
                      <SectionLabel
                        title="File snapshot"
                        description="Quick context before the lookup run starts."
                      />
                      <InfoLine label="Filename" value={fileName || "None"} />
                      <InfoLine label="Headers" value={formatStat(headers.length)} />
                      <InfoLine label="Rows" value={formatStat(rows.length)} />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <SectionLabel
                      title="Choose appended fields"
                      description="Only the checked fields will be merged into the export."
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      {DEFAULT_SELECTED_FIELDS.map((fieldKey) => (
                        <label
                          key={fieldKey}
                          className="flex items-start gap-3 border border-border p-4 text-sm transition-colors hover:border-foreground"
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4 rounded-none border border-border accent-foreground"
                            checked={selectedFields.includes(fieldKey)}
                            onChange={() => toggleField(fieldKey)}
                          />
                          <span className="space-y-1">
                            <span className="block font-medium">
                              {NPI_FIELD_DEFINITIONS[fieldKey].label}
                            </span>
                            <span className="block text-xs tracking-[0.14em] text-muted-foreground uppercase">
                              {NPI_FIELD_DEFINITIONS[fieldKey].header}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4 border-t border-border pt-5 sm:flex sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                      {selectedFields.length} field
                      {selectedFields.length === 1 ? "" : "s"} selected
                    </p>
                    <Button
                      onClick={startEnrichment}
                      disabled={!selectedNpiColumn || selectedFields.length === 0}
                    >
                      <Search />
                      Start Enrichment
                    </Button>
                  </div>
                </div>
              ) : null}

              {phase === "processing" ? (
                <div className="space-y-6">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
                    <div className="space-y-4">
                      <SectionLabel
                        title="Lookup batch"
                        description="Requests are rate-limited and streamed into the live log below."
                      />
                      <Progress value={progressValue} className="h-4" />
                      <div className="flex items-center justify-between text-xs tracking-[0.18em] text-muted-foreground uppercase">
                        <span>
                          {formatStat(stats.processed)} / {formatStat(stats.total)} processed
                        </span>
                        <span>{Math.round(progressValue)}%</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border border-border p-4">
                      <div>
                        <p className="text-[0.7rem] tracking-[0.2em] text-muted-foreground uppercase">
                          Status
                        </p>
                        <p className="mt-2 text-lg font-medium tracking-[-0.04em]">
                          Processing
                        </p>
                      </div>
                      <LoaderCircle className="size-6 animate-spin" />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <StatTile label="Total Processed" value={stats.processed} />
                    <StatTile label="Successfully Fetched" value={stats.success} />
                    <StatTile label="Failed / Not Found" value={stats.failed} />
                  </div>

                  <div className="border border-border">
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                      <div>
                        <p className="text-[0.7rem] tracking-[0.2em] text-muted-foreground uppercase">
                          Terminal
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Current batch activity
                        </p>
                      </div>
                      <span className="text-[0.7rem] tracking-[0.22em] text-muted-foreground uppercase">
                        Live
                      </span>
                    </div>
                    <div
                      ref={logViewportRef}
                      className="max-h-[24rem] overflow-y-auto bg-[linear-gradient(to_bottom,transparent_95%,rgba(15,23,42,0.04)_95%)] bg-[length:100%_2rem] px-4 py-4 font-mono text-xs leading-6"
                    >
                      {logs.length === 0 ? (
                        <p className="text-muted-foreground">
                          Waiting for the first lookup to complete...
                        </p>
                      ) : (
                        logs.map((log, index) => (
                          <div key={`${log}-${index}`} className="whitespace-pre-wrap">
                            {log}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {phase === "export" ? (
                <div className="grid gap-8">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
                    <div className="space-y-4">
                      <SectionLabel
                        title="Export ready"
                        description="The original CSV rows have been merged with the selected NPI fields."
                      />
                      <Progress value={100} className="h-4" />
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="size-4 text-foreground" />
                        {formatStat(exportRows.length)} rows prepared for download
                      </div>
                    </div>
                    <Button
                      size="lg"
                      className="h-auto min-h-24 justify-between px-5 text-left"
                      onClick={downloadCsv}
                    >
                      <span className="grid gap-1">
                        <span className="text-[0.72rem] tracking-[0.18em] uppercase">
                          CSV export
                        </span>
                        <span className="text-base font-medium">
                          Download Enriched CSV
                        </span>
                      </span>
                      <Download />
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <StatTile label="Total Processed" value={stats.processed} />
                    <StatTile label="Successfully Fetched" value={stats.success} />
                    <StatTile label="Failed / Not Found" value={stats.failed} />
                  </div>

                  <div className="grid gap-4 border-t border-border pt-5 lg:grid-cols-[minmax(0,1fr)_15rem]">
                    <div className="space-y-3">
                      <p className="text-[0.7rem] tracking-[0.2em] text-muted-foreground uppercase">
                        Added headers
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {getSelectedHeaderNames(selectedFields).map((header) => (
                          <span
                            key={header}
                            className="border border-border px-3 py-2 text-xs tracking-[0.12em] text-muted-foreground uppercase"
                          >
                            {header}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col justify-between gap-3 border border-border p-4">
                      <InfoLine label="Source rows" value={formatStat(rows.length)} />
                      <InfoLine
                        label="Export columns"
                        value={formatStat(exportHeaders.length)}
                      />
                      <InfoLine
                        label="Selected fields"
                        value={formatStat(selectedFields.length)}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </section>

            <aside className="grid gap-4 self-start">
              <PanelCard
                eyebrow="Sequence"
                title="Run order"
                lines={[
                  "1. Ingest the CSV locally",
                  "2. Select the NPI column",
                  "3. Choose outbound fields",
                  "4. Fetch CMS records in batches",
                  "5. Download the merged CSV",
                ]}
              />
              <PanelCard
                eyebrow="Headers"
                title={headers.length > 0 ? `${headers.length} detected` : "Awaiting upload"}
                lines={
                  headers.length > 0
                    ? headers.slice(0, 6)
                    : ["Upload a CSV to inspect its header row."]
                }
              />
              <PanelCard
                eyebrow="Current file"
                title={fileName || "No file loaded"}
                lines={[
                  `Phase: ${phase}`,
                  `Rows: ${formatStat(rows.length)}`,
                  `Selected fields: ${formatStat(selectedFields.length)}`,
                ]}
              />
            </aside>
          </div>
        </section>

        <aside className="grid content-start gap-4">
          <div className="border border-border bg-background p-5">
            <p className="text-[0.7rem] tracking-[0.2em] text-muted-foreground uppercase">
              Metrics
            </p>
            <div className="mt-5 grid gap-4">
              <MetricRow label="Total rows" value={stats.total || rows.length} />
              <MetricRow label="Processed" value={stats.processed} />
              <MetricRow label="Success" value={stats.success} />
              <MetricRow label="Failed" value={stats.failed} />
            </div>
          </div>

          <div className="border border-border bg-background p-5">
            <p className="text-[0.7rem] tracking-[0.2em] text-muted-foreground uppercase">
              Selected field map
            </p>
            <div className="mt-4 grid gap-3">
              {selectedFields.map((fieldKey) => (
                <div key={fieldKey} className="border border-border px-3 py-3">
                  <p className="text-sm font-medium">
                    {NPI_FIELD_DEFINITIONS[fieldKey].label}
                  </p>
                  <p className="mt-1 text-[0.72rem] tracking-[0.16em] text-muted-foreground uppercase">
                    {NPI_FIELD_DEFINITIONS[fieldKey].header}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-border bg-background p-5">
            <p className="text-[0.7rem] tracking-[0.2em] text-muted-foreground uppercase">
              Notes
            </p>
            <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
              <p>CSV parsing and export stay in the browser with Papa Parse.</p>
              <p>
                NPI lookups pass through a local Next route because the live CMS
                endpoint did not expose CORS headers during verification.
              </p>
              <p className="flex items-center gap-2 text-foreground">
                <ArrowRight className="size-4" />
                Replace the file anytime to restart the workflow.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}

function SectionLabel({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="space-y-1">
      <p className="text-[0.7rem] tracking-[0.2em] text-muted-foreground uppercase">
        {title}
      </p>
      <p className="text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  )
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2 last:border-b-0 last:pb-0">
      <span className="text-[0.7rem] tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-right text-sm">{value}</span>
    </div>
  )
}

function MetricRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-border pb-3 last:border-b-0 last:pb-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-medium tracking-[-0.05em]">
        {formatStat(value)}
      </p>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border p-4">
      <p className="text-[0.7rem] tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-3 text-3xl font-medium tracking-[-0.06em]">
        {formatStat(value)}
      </p>
    </div>
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
    <div className="border border-border bg-background p-4">
      <p className="text-[0.68rem] tracking-[0.18em] text-muted-foreground uppercase">
        {eyebrow}
      </p>
      <p className="mt-2 text-sm font-medium">{title}</p>
      <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  )
}
