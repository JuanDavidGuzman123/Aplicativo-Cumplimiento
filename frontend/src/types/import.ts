export type ImportStatus = 'PREVIEW' | 'CONFIRMED' | 'FAILED'

export type ImportField =
  | 'nit'
  | 'businessName'
  | 'subprocess'
  | 'registrationDate'
  | 'lastFollowUpDate'
  | 'nextFollowUpDate'
  | 'observations'

export type ImportMapping = Partial<Record<ImportField, string | null>>

export type ImportHeader = {
  value: string
  label: string
}

export type ImportFileSummary = {
  fileName: string
  sheets: {
    name: string
    rowCount: number
    headers: ImportHeader[]
  }[]
}

export type ImportRowValues = Record<ImportField, string | null>

export type ImportRowStatus =
  | 'NEW'
  | 'EXISTING'
  | 'CONFLICT'
  | 'ERROR'

export type ImportDateDifference = {
  current: string | null
  imported: string
}

export type ImportDateDifferences = Partial<
  Record<
    'registrationDate' | 'lastFollowUpDate' | 'nextFollowUpDate',
    ImportDateDifference
  >
>

export type ImportRowValidation = {
  key: string
  file: string
  sheet: string
  rowNumber: number
  values: ImportRowValues
  nitNormalized: string
  status: ImportRowStatus
  errors: string[]
  warnings: string[]
  existingCounterpartyId: string | null
  dateDifferences: ImportDateDifferences
  needsSubprocessCreation: boolean
}

export type ImportSummary = {
  totalRows: number
  validRows: number
  newRows: number
  existingRows: number
  conflictRows: number
  errorRows: number
  subprocessesToCreate: string[]
  canConfirm: boolean
}

export type ImportValidation = {
  mapping: ImportMapping
  options: {
    createMissingSubprocesses: boolean
    authorizeDateChanges: boolean
  }
  rows: ImportRowValidation[]
  summary: ImportSummary
}

export type ImportResultSummary = {
  created: number
  existing: number
  updatedDates: number
  conflicts: number
  errors: number
  createdSubprocesses: number
}

export type ImportBatch = {
  id: string
  fileName: string
  status: ImportStatus
  totalRows: number
  validRows: number
  errorRows: number
  importedRows: number
  confirmedAt: string | null
  createdAt: string
  updatedAt: string
  uploadedBy: {
    id: string
    name: string
    email: string
  }
  resultSummary: ImportResultSummary | null
  errorDetails: unknown
}

export type ImportDetail = ImportBatch & {
  mapping: ImportMapping
  headers: ImportHeader[]
  files: ImportFileSummary[]
  validation: ImportValidation | null
}

export type ImportPreviewDetail = ImportDetail & {
  validation: ImportValidation
}

export type ImportConfirmDetail = ImportDetail & {
  result: ImportResultSummary
}

export type ImportListResponse = {
  data: ImportBatch[]
  meta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export type ImportOptionsInput = {
  mapping?: ImportMapping
  createMissingSubprocesses?: boolean
  authorizeDateChanges?: boolean
}
