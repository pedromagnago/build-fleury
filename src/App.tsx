import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProjectProvider } from '@/contexts/ProjectContext'
import { TourProvider } from '@/contexts/TourContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { ProjectGate } from '@/components/ProjectGate'
import { AppLayout } from '@/components/layout/AppLayout'
import { Toaster } from 'sonner'
import '@/lib/tours/tour.css'

import Login from '@/pages/Login'
import Register from '@/pages/Register'
import Onboarding from '@/pages/Onboarding'
import ProjectSelector from '@/pages/ProjectSelector'
// Dashboard removed — redirects to /cronograma
import Configuracoes from '@/pages/Configuracoes'
import CronogramaPage from '@/pages/CronogramaPage'
import ComprasPage from '@/pages/ComprasPage'
import ImportacaoPage from '@/pages/ImportacaoPage'
import PagamentosPage from '@/pages/PagamentosPage'
import DocumentosPage from '@/pages/DocumentosPage'
import AuditoriaPage from '@/pages/AuditoriaPage'
import AvancoFisicoPage from '@/pages/AvancoFisicoPage'
// MedicoesPage removed — absorbed into CronogramaPage
import ConciliacaoPage from '@/pages/ConciliacaoPage'
// SimuladorPage removed — absorbed into CronogramaPage
import RelatoriosPage from '@/pages/RelatoriosPage'
import MutuosPage from '@/pages/MutuosPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ProjectProvider>
          <TourProvider>
          <BrowserRouter>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* Protected: Onboarding (no project needed) */}
              <Route
                path="/onboarding"
                element={
                  <ProtectedRoute>
                    <Onboarding />
                  </ProtectedRoute>
                }
              />

              {/* Protected: Project selector */}
              <Route
                path="/projetos"
                element={
                  <ProtectedRoute>
                    <ProjectSelector />
                  </ProtectedRoute>
                }
              />

              {/* Protected routes with project gate */}
              <Route
                element={
                  <ProjectGate>
                    <AppLayout />
                  </ProjectGate>
                }
              >
                <Route path="/dashboard" element={<Navigate to="/cronograma" replace />} />
                <Route path="/cronograma" element={<CronogramaPage />} />
                <Route path="/compras" element={<ComprasPage />} />
                <Route path="/pagamentos" element={<PagamentosPage />} />
                <Route path="/mutuos" element={<MutuosPage />} />
                <Route path="/documentos" element={<DocumentosPage />} />
                <Route path="/auditoria" element={<AuditoriaPage />} />
                <Route path="/avanco" element={<AvancoFisicoPage />} />
                <Route path="/medicoes" element={<Navigate to="/cronograma" replace />} />
                <Route path="/conciliacao" element={<ConciliacaoPage />} />
                <Route path="/simulador" element={<Navigate to="/cronograma" replace />} />
                <Route path="/relatorios" element={<RelatoriosPage />} />
                <Route path="/importacao" element={<ImportacaoPage />} />
                <Route path="/configuracoes" element={<Configuracoes />} />
              </Route>

              {/* Default redirect */}
              <Route path="*" element={<Navigate to="/cronograma" replace />} />
            </Routes>
          </BrowserRouter>
          <Toaster
            position="top-right"
            richColors
            toastOptions={{
              style: { fontFamily: 'Inter, system-ui, sans-serif' },
            }}
          />
          </TourProvider>
        </ProjectProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
