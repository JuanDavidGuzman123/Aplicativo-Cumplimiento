export type AnnualStatus = 'ACTIVE' | 'INACTIVE'

export type AnnualUpdateFilter =
  | 'UPDATED_THIS_YEAR'
  | 'PENDING'
  | 'NO_DATE'

export type AnnualImportField =
  | 'code'
  | 'businessName'
  | 'status'
  | 'filingDate'
  | 'filingYear'
  | 'dueDiligenceType'
  | 'requiresSemiannualFollowUp'
  | 'observations'

export type AnnualImportMapping = Partial<
  Record<AnnualImportField, string | null>
>

export type AnnualImportHeader = {
  value: string
  label: string
}

export type AnnualImportAction =
  | 'NEW'
  | 'UPDATE'
  | 'UNCHANGED'
  | 'IGNORED'
  | 'ERROR'

export type AnnualImportRow = {
  rowNumber: number
  code: string | null
  codeNormalized: string | null
  businessName: string | null
  status: AnnualStatus | null
  requiresSemiannualFollowUp: boolean | null
  filingDate: string | null
  filingYear: number | null
  dueDiligenceType: string | null
  observations: string | null
  action: AnnualImportAction
  errors: string[]
  warnings: string[]
}

export type AnnualImportSummary = {
  totalRows: number
  validRows: number
  newRows: number
  updatedRows: number
  unchangedRows: number
  ignoredRows: number
  errorRows: number
  activeRows: number
  inactiveRows: number
  activeUpdatedThisYear: number
  activePendingUpdate: number
  inactiveUpdatedThisYear: number
  inactivePendingUpdate: number
  withoutDateRows: number
  semiannualFollowUpRows: number
  canConfirm: boolean
}

export type AnnualImportPreview = {
  file: {
    name: string
    sheetName: string
    ignoredSheets: string[]
    totalRows: number
  }
  headers: AnnualImportHeader[]
  mapping: AnnualImportMapping
  rows: AnnualImportRow[]
  summary: AnnualImportSummary
  mappingErrors: string[]
}

export type AnnualImportResult = {
  file: {
    name: string
    sheetName: string
  }
  summary: AnnualImportSummary & {
    created: number
    updated: number
    unchanged: number
    skipped: number
  }
}

export type AnnualUpdateSummary = {
  businessDate: string
  currentYear: number
  totals: {
    total: number
    active: number
    inactive: number
  }
  annual: {
    updatedThisYear: number
    active: {
      total: number
      updatedThisYear: number
      pendingUpdate: number
      withoutDate: number
    }
    inactive: {
      total: number
      updatedThisYear: number
      pendingUpdate: number
      withoutDate: number
    }
  }
  semiannual: {
    activeWithFollowUp: number
    inactiveWithFollowUp: number
    totalWithFollowUp: number
  }
}

export type AnnualUpdateRow = {
  id: string
  code: string
  businessName: string
  status: AnnualStatus
  requiresSemiannualFollowUp: boolean | null
  filingDate: string | null
  filingYear: number | null
  dueDiligenceType: string | null
  observations: string | null
  updatedThisYear: boolean
  annualStatus: AnnualUpdateFilter
  sourceFileName: string | null
  createdAt: string
  updatedAt: string
}

export type AnnualUpdateListResponse = {
  data: AnnualUpdateRow[]
  meta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export type AnnualUpdateSituation =
  | 'WITHOUT_DATE'
  | 'OVERDUE'
  | 'DUE_TODAY'
  | 'DUE_SOON'
  | 'NOT_DUE'

export type AnnualUpdateDueRow = AnnualUpdateRow & {
  dueDate: string | null
  daysUntilDue: number | null
  situation: AnnualUpdateSituation
}

export type AnnualUpdatesDueResponse = {
  data: AnnualUpdateDueRow[]
  meta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  summary: {
    needsUpdate: number
    overdue: number
    dueToday: number
    upcoming: number
    withoutDate: number
  }
}

export type AnnualUpdateListParams = {
  search?: string
  status?: AnnualStatus | ''
  annualStatus?: AnnualUpdateFilter | ''
  requiresSemiannualFollowUp?: boolean | ''
  page?: number
  pageSize?: number
}
