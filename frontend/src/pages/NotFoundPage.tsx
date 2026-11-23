import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white p-6 text-center">
      <p className="text-sm font-semibold text-amber-600">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">
        Página no encontrada
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        La dirección solicitada no existe o no está disponible.
      </p>
      <Link
        to="/"
        className="mt-6 rounded-md bg-emerald-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-950"
      >
        Volver al inicio
      </Link>
    </main>
  )
}
