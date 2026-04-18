import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProjectProvider } from '@/contexts/ProjectContext'
import { TourProvider } from '@/contexts/TourContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { ProjectGate } from '@/components/ProjectGate'
import { RoleGate } from '@/components/RoleGate'
import { AppLayout } from '@/components/layout/AppLayout'
import { Toaster } from 'sonner'
import '@/lib/tours/tour.css'

import Login from '@/pages/Login'
import Register from '@/pages/Register'
import ResetSenhaPage from '@/pages/ResetSenhaPage'
import Onboarding from '@/pages/Onboarding'
import ProjectSelector from '@/pages/ProjectSelector'
// Dashboard removed — redirects to /cronograma
import Configuracoes from '@/pages/Configuracoes'
import CronogramaPage from '@/pages/CronogramaPage'
import ComprasPage from '@/pages/ComprasPage'
import DespesasIndiretasPage from '@/pages/DespesasIndiretasPage'
import ImportacaoPage from '@/pages/ImportacaoPage'
import PagamentosPage from '@/pages/PagamentosPage'
import DocumentosPage from '@/pages/DocumentosPage'
import AuditoriaPage from '@/pages/AuditoriaPage'
import PainelControlePage from '@/pages/PainelControlePage'
import AvancoFisicoPage from '@/pages/AvancoFisicoPage'
// MedicoesPage removed — absorbed into CronogramaPage
import ConciliacaoPage from '@/pages/ConciliacaoPage'
import RelatoriosPage from '@/pages/RelatoriosPage'
import MutuosPage from '@/pages/MutuosPage'
import GestaoUsuariosPage from '@/pages/GestaoUsuariosPage'
import PerfilPage from '@/pages/PerfilPage'

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
              <Route path="/reset-senha" element={<ResetSenhaPage />} />

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
                <Route path="/cronograma" element={<RoleGate route="/cronograma"><CronogramaPage /></RoleGate>} />
                <Route path="/compras" element={<RoleGate route="/compras"><ComprasPage /></RoleGate>} />
                <Route path="/despesas-indiretas" element={<RoleGate route="/despesas-indiretas"><DespesasIndiretasPage /></RoleGate>} />
                <Route path="/pagamentos" element={<RoleGate route="/pagamentos"><PagamentosPage /></RoleGate>} />
                <Route path="/mutuos" element={<RoleGate route="/mutuos"><MutuosPage /></RoleGate>} />
                <Route path="/documentos" element={<RoleGate route="/documentos"><DocumentosPage /></RoleGate>} />
                <Route path="/auditoria" element={<RoleGate route="/auditoria"><AuditoriaPage /></RoleGate>} />
                <Route path="/painel-controle" element={<RoleGate route="/painel-controle"><PainelControlePage /></RoleGate>} />
                <Route path="/avanco" element={<RoleGate route="/avanco"><AvancoFisicoPage /></RoleGate>} />
                <Route path="/medicoes" element={<Navigate to="/cronograma" replace />} />
                <Route path="/conciliacao" element={<RoleGate route="/conciliacao"><ConciliacaoPage /></RoleGate>} />
                <Route path="/simulador" element={<Navigate to="/cronograma" replace />} />
                <Route path="/relatorios" element={<RoleGate route="/relatorios"><RelatoriosPage /></RoleGate>} />
                <Route path="/importacao" element={<RoleGate route="/importacao"><ImportacaoPage /></RoleGate>} />
                <Route path="/configuracoes" element={<RoleGate route="/configuracoes"><Configuracoes /></RoleGate>} />
                <Route path="/usuarios" element={<RoleGate route="/usuarios"><GestaoUsuariosPage /></RoleGate>} />
                <Route path="/perfil" element={<PerfilPage />} />
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
