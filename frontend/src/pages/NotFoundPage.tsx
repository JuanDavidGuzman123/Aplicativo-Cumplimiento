import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-6 text-center">
      <p className="text-sm font-semibold text-slate-500">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">
        Página no encontrada
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        La dirección solicitada no existe o no está disponible.
      </p>
      <Link
        to="/"
        className="mt-6 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
      >
        Volver al inicio
      </Link>
    </main>
  )
}
