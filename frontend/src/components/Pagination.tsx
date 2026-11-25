import { ChevronLeft, ChevronRight } from 'lucide-react'

type PaginationProps = {
  page: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
}

export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
}: PaginationProps) {
  if (total === 0) {
    return null
  }

  return (
    <nav
      aria-label="Paginación de resultados"
      className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between"
    >
      <p aria-live="polite">
        {total} registro{total === 1 ? '' : 's'} · Página {page} de{' '}
        {Math.max(totalPages, 1)}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft className="size-4" />
          Anterior
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-amber-300 hover:bg-amber-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Siguiente
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  )
}
