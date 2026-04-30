import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface Company {
  id: string
  razao_social: string
  nome_fantasia: string | null
  cnpj: string | null
  municipio: string | null
  estado: string | null
  qtd_casas: number
  area_casa_m2: number | null
  data_inicio_obras: string | null
  saldo_inicial_caixa: number
  faturamento_contrato: number
  custo_total_contrato: number
  custo_indireto: number
  custo_capital: number
  prazo_recebimento_dias: number
  status: string
  config: Record<string, unknown>
  created_at: string
  deleted_at: string | null
}

interface ProjectContextType {
  companies: Company[]
  archivedCompanies: Company[]
  currentCompany: Company | null
  loading: boolean
  selectCompany: (id: string) => void
  refreshCompanies: () => Promise<void>
  createProject: (data: CreateProjectData) => Promise<string | null>
  updateProject: (id: string, data: UpdateProjectData) => Promise<boolean>
  softDeleteProject: (id: string) => Promise<boolean>
  restoreProject: (id: string) => Promise<boolean>
  duplicateProject: (sourceId: string, newRazaoSocial: string, newNomeFantasia?: string) => Promise<string | null>
}

interface CreateProjectData {
  razao_social: string
  nome_fantasia?: string
  municipio?: string
  estado?: string
  qtd_casas?: number
  area_casa_m2?: number
  data_inicio_obras?: string
  saldo_inicial_caixa?: number
  faturamento_contrato?: number
  custo_total_contrato?: number
}

interface UpdateProjectData {
  razao_social?: string
  nome_fantasia?: string | null
  cnpj?: string | null
  municipio?: string | null
  estado?: string | null
  qtd_casas?: number
  area_casa_m2?: number | null
  data_inicio_obras?: string | null
  saldo_inicial_caixa?: number
  faturamento_contrato?: number
  custo_total_contrato?: number
  custo_indireto?: number
  custo_capital?: number
  prazo_recebimento_dias?: number
  status?: string
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined)

const STORAGE_KEY = 'build-fleury-current-company'

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [companies, setCompanies] = useState<Company[]>([])
  const [archivedCompanies, setArchivedCompanies] = useState<Company[]>([])
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchCompanies = useCallback(async () => {
    if (!user) {
      setCompanies([])
      setArchivedCompanies([])
      setCurrentCompany(null)
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching companies:', error)
      setLoading(false)
      return
    }

    const all = (data ?? []) as Company[]
    const active = all.filter((c) => !c.deleted_at)
    const archived = all.filter((c) => !!c.deleted_at)
    setCompanies(active)
    setArchivedCompanies(archived)

    const savedId = localStorage.getItem(STORAGE_KEY)
    const saved = active.find((c) => c.id === savedId)

    if (saved) {
      setCurrentCompany(saved)
    } else if (active.length > 0) {
      const first = active[0]
      if (first) {
        setCurrentCompany(first)
        localStorage.setItem(STORAGE_KEY, first.id)
      }
    } else {
      setCurrentCompany(null)
      localStorage.removeItem(STORAGE_KEY)
    }

    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchCompanies()
  }, [fetchCompanies])

  const selectCompany = useCallback((id: string) => {
    const company = companies.find((c) => c.id === id)
    if (company) {
      setCurrentCompany(company)
      localStorage.setItem(STORAGE_KEY, id)
    }
  }, [companies])

  const createProject = useCallback(async (data: CreateProjectData): Promise<string | null> => {
    const { data: result, error } = await supabase.rpc('create_project', {
      _razao_social: data.razao_social,
      _nome_fantasia: data.nome_fantasia ?? null,
      _municipio: data.municipio ?? null,
      _estado: data.estado ?? null,
      _qtd_casas: data.qtd_casas ?? 0,
      _area_casa_m2: data.area_casa_m2 ?? null,
      _data_inicio_obras: data.data_inicio_obras ?? null,
      _saldo_inicial_caixa: data.saldo_inicial_caixa ?? 0,
      _faturamento_contrato: data.faturamento_contrato ?? 0,
      _custo_total_contrato: data.custo_total_contrato ?? 0,
    })

    if (error) {
      console.error('Error creating project:', error)
      return null
    }

    const newId = result as string
    await fetchCompanies()
    selectCompany(newId)
    return newId
  }, [fetchCompanies, selectCompany])

  const updateProject = useCallback(async (id: string, data: UpdateProjectData): Promise<boolean> => {
    const { error } = await supabase.rpc('update_project', {
      _id: id,
      _razao_social: data.razao_social ?? null,
      _nome_fantasia: data.nome_fantasia ?? null,
      _cnpj: data.cnpj ?? null,
      _municipio: data.municipio ?? null,
      _estado: data.estado ?? null,
      _qtd_casas: data.qtd_casas ?? null,
      _area_casa_m2: data.area_casa_m2 ?? null,
      _data_inicio_obras: data.data_inicio_obras ?? null,
      _saldo_inicial_caixa: data.saldo_inicial_caixa ?? null,
      _faturamento_contrato: data.faturamento_contrato ?? null,
      _custo_total_contrato: data.custo_total_contrato ?? null,
      _custo_indireto: data.custo_indireto ?? null,
      _custo_capital: data.custo_capital ?? null,
      _prazo_recebimento_dias: data.prazo_recebimento_dias ?? null,
      _status: data.status ?? null,
    })

    if (error) {
      console.error('Error updating project:', error)
      return false
    }
    await fetchCompanies()
    return true
  }, [fetchCompanies])

  const softDeleteProject = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await supabase.rpc('soft_delete_project', { _id: id })
    if (error) {
      console.error('Error archiving project:', error)
      return false
    }
    if (currentCompany?.id === id) {
      localStorage.removeItem(STORAGE_KEY)
      setCurrentCompany(null)
    }
    await fetchCompanies()
    return true
  }, [fetchCompanies, currentCompany])

  const restoreProject = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await supabase.rpc('restore_project', { _id: id })
    if (error) {
      console.error('Error restoring project:', error)
      return false
    }
    await fetchCompanies()
    return true
  }, [fetchCompanies])

  const duplicateProject = useCallback(async (
    sourceId: string,
    newRazaoSocial: string,
    newNomeFantasia?: string,
  ): Promise<string | null> => {
    const { data: result, error } = await supabase.rpc('duplicate_project_full', {
      _source_id: sourceId,
      _new_razao_social: newRazaoSocial,
      _new_nome_fantasia: newNomeFantasia ?? null,
    })
    if (error) {
      console.error('Error duplicating project:', error)
      return null
    }
    const newId = result as string
    await fetchCompanies()
    return newId
  }, [fetchCompanies])

  const refreshCompanies = useCallback(async () => {
    await fetchCompanies()
  }, [fetchCompanies])

  return (
    <ProjectContext.Provider
      value={{
        companies,
        archivedCompanies,
        currentCompany,
        loading,
        selectCompany,
        refreshCompanies,
        createProject,
        updateProject,
        softDeleteProject,
        restoreProject,
        duplicateProject,
      }}
    >
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject() {
  const context = useContext(ProjectContext)
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider')
  }
  return context
}

export type { Company, CreateProjectData, UpdateProjectData }
