import { Link } from 'react-router-dom'
import { primaryButtonClass } from '../utils/styles'

export function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-amber-50 text-lg font-bold text-amber-600">
        404
      </span>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">
        Página no encontrada
      </h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600">
        La dirección solicitada no existe o no está disponible.
      </p>
      <Link to="/" className={`${primaryButtonClass} mt-6`}>
        Volver al inicio
      </Link>
    </main>
  )
}
