import { Loader2 } from 'lucide-react'

export function FullScreenLoader() {
  return (
    <div
      role="status"
      className="flex min-h-screen items-center justify-center"
    >
      <Loader2 className="size-7 animate-spin text-amber-500" />
      <span className="sr-only">Cargando</span>
    </div>
  )
}
