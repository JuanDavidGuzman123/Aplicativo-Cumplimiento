import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../hooks/AuthProvider'
import { AppLayout } from '../layouts/AppLayout'
import { AnnualUpdatesPage } from '../pages/AnnualUpdatesPage'
import { CounterpartiesPage } from '../pages/CounterpartiesPage'
import { HomePage } from '../pages/HomePage'
import { ImportPage } from '../pages/ImportPage'
import { LoginPage } from '../pages/LoginPage'
import { NotFoundPage } from '../pages/NotFoundPage'
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
                path="actualizacion-anual"
                element={<AnnualUpdatesPage />}
              />
              <Route
                path="contrapartes"
                element={<CounterpartiesPage />}
              />
              <Route
                path="contrapartes/:id"
                element={<CounterpartiesPage />}
              />

              <Route element={<AdminRoute />}>
                <Route path="importar" element={<ImportPage />} />
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
