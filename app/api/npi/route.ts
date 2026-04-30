import { NextResponse } from "next/server"

import {
  createEmptyEnrichedFields,
  flattenNpiRecord,
  normalizeNpi,
  type NpiApiResponse,
  type NpiLookupResponse,
} from "@/lib/npi"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const rawNumber = searchParams.get("number")
  const number = normalizeNpi(rawNumber)

  if (!number) {
    const payload: NpiLookupResponse = {
      number: rawNumber ?? "",
      found: false,
      fields: createEmptyEnrichedFields(),
      error: "Invalid NPI number",
    }

    return NextResponse.json(payload, { status: 400 })
  }

  try {
    const response = await fetch(
      `https://npiregistry.cms.hhs.gov/api/?version=2.1&number=${number}`,
      {
        cache: "no-store",
      }
    )

    if (!response.ok) {
      const payload: NpiLookupResponse = {
        number,
        found: false,
        fields: createEmptyEnrichedFields(),
        error: `CMS lookup failed with ${response.status}`,
      }

      return NextResponse.json(payload, { status: response.status })
    }

    const data = (await response.json()) as NpiApiResponse
    const record = data.results?.[0]
    const payload: NpiLookupResponse = {
      number,
      found: Boolean(record),
      fields: flattenNpiRecord(record),
      error: record ? undefined : "NPI not found",
    }

    return NextResponse.json(payload)
  } catch {
    const payload: NpiLookupResponse = {
      number,
      found: false,
      fields: createEmptyEnrichedFields(),
      error: "Unable to reach the CMS NPI Registry API",
    }

    return NextResponse.json(payload, { status: 502 })
  }
}
