import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../hooks/AuthProvider'
import { AppLayout } from '../layouts/AppLayout'
import { AnnualUpdatesPage } from '../pages/AnnualUpdatesPage'
import { AuditPage } from '../pages/AuditPage'
import { CounterpartiesPage } from '../pages/CounterpartiesPage'
import { CounterpartyDetailPage } from '../pages/CounterpartyDetailPage'
import { HomePage } from '../pages/HomePage'
import { ImportPage } from '../pages/ImportPage'
import { LoginPage } from '../pages/LoginPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { SubprocessesPage } from '../pages/SubprocessesPage'
import { UsersPage } from '../pages/UsersPage'
import { AdminRoute } from './AdminRoute'
import { ProtectedRoute } from './ProtectedRoute'

export function AppRoutes() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<HomePage />} />
              <Route
                path="contrapartes"
                element={<CounterpartiesPage />}
              />
              <Route
                path="actualizacion-anual"
                element={<AnnualUpdatesPage />}
              />
              <Route
                path="contrapartes/:id"
                element={<CounterpartyDetailPage />}
              />

              <Route element={<AdminRoute />}>
                <Route
                  path="subprocesos"
                  element={<SubprocessesPage />}
                />
                <Route path="importar" element={<ImportPage />} />
                <Route path="auditoria" element={<AuditPage />} />
                <Route path="usuarios" element={<UsersPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
