export interface NpiApiResponse {
  result_count: number
  results?: NpiRecord[]
}

export interface NpiRecord {
  number: string
  enumeration_type?: string
  basic?: {
    first_name?: string
    last_name?: string
    organization_name?: string
  }
  taxonomies?: NpiTaxonomy[]
  addresses?: NpiAddress[]
}

export interface NpiTaxonomy {
  desc?: string
  primary?: boolean | "true" | "false" | string
}

export interface NpiAddress {
  address_1?: string
  city?: string
  state?: string
  postal_code?: string
  telephone_number?: string
  fax_number?: string
  address_purpose?: string
  purpose?: string
}

export const NPI_FIELD_DEFINITIONS = {
  firstName: {
    label: "Provider First Name",
    header: "NPI_First_Name",
  },
  lastName: {
    label: "Provider Last Name",
    header: "NPI_Last_Name",
  },
  organizationName: {
    label: "Organization Name",
    header: "NPI_Organization_Name",
  },
  primaryTaxonomy: {
    label: "Primary Taxonomy / Specialty",
    header: "NPI_Primary_Taxonomy",
  },
  practiceAddress1: {
    label: "Practice Address 1",
    header: "NPI_Practice_Address_1",
  },
  practiceCity: {
    label: "Practice City",
    header: "NPI_Practice_City",
  },
  practiceState: {
    label: "Practice State",
    header: "NPI_Practice_State",
  },
  practiceZip: {
    label: "Practice Zip",
    header: "NPI_Practice_Zip",
  },
  practicePhone: {
    label: "Practice Phone",
    header: "NPI_Practice_Phone",
  },
  practiceFax: {
    label: "Practice Fax",
    header: "NPI_Practice_Fax",
  },
} as const

export type EnrichFieldKey = keyof typeof NPI_FIELD_DEFINITIONS

export type EnrichedNpiFields = Record<EnrichFieldKey, string>

export interface NpiLookupResponse {
  number: string
  found: boolean
  fields: EnrichedNpiFields
  error?: string
}

export const DEFAULT_SELECTED_FIELDS = Object.keys(
  NPI_FIELD_DEFINITIONS
) as EnrichFieldKey[]

const EMPTY_ENRICHED_FIELDS: EnrichedNpiFields = {
  firstName: "",
  lastName: "",
  organizationName: "",
  primaryTaxonomy: "",
  practiceAddress1: "",
  practiceCity: "",
  practiceState: "",
  practiceZip: "",
  practicePhone: "",
  practiceFax: "",
}

export function createEmptyEnrichedFields(): EnrichedNpiFields {
  return { ...EMPTY_ENRICHED_FIELDS }
}

export function normalizeNpi(value: string | undefined | null) {
  const digits = `${value ?? ""}`.replace(/\D/g, "")

  return /^\d{10}$/.test(digits) ? digits : ""
}

export function flattenNpiRecord(record?: NpiRecord | null): EnrichedNpiFields {
  if (!record) {
    return createEmptyEnrichedFields()
  }

  const primaryTaxonomy =
    record.taxonomies?.find((taxonomy) => taxonomy.primary === true)?.desc ??
    record.taxonomies?.find((taxonomy) => taxonomy.primary === "true")?.desc ??
    record.taxonomies?.[0]?.desc ??
    ""

  const locationAddress =
    record.addresses?.find((address) => {
      const purpose = address.address_purpose ?? address.purpose ?? ""
      return purpose.toUpperCase() === "LOCATION"
    }) ?? record.addresses?.[0]

  return {
    firstName: record.basic?.first_name ?? "",
    lastName: record.basic?.last_name ?? "",
    organizationName: record.basic?.organization_name ?? "",
    primaryTaxonomy,
    practiceAddress1: locationAddress?.address_1 ?? "",
    practiceCity: locationAddress?.city ?? "",
    practiceState: locationAddress?.state ?? "",
    practiceZip: locationAddress?.postal_code ?? "",
    practicePhone: locationAddress?.telephone_number ?? "",
    practiceFax: locationAddress?.fax_number ?? "",
  }
}
