import { Loader2 } from 'lucide-react'

export function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <Loader2 className="size-6 animate-spin text-slate-500" />
      <span className="sr-only">Cargando</span>
    </div>
  )
}
