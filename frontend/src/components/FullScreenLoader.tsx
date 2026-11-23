import { Loader2 } from 'lucide-react'

export function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <Loader2 className="size-6 animate-spin text-amber-500" />
      <span className="sr-only">Cargando</span>
    </div>
  )
}
