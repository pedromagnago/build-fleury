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
}

interface ProjectContextType {
  companies: Company[]
  currentCompany: Company | null
  loading: boolean
  selectCompany: (id: string) => void
  refreshCompanies: () => Promise<void>
  createProject: (data: CreateProjectData) => Promise<string | null>
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

const ProjectContext = createContext<ProjectContextType | undefined>(undefined)

const STORAGE_KEY = 'build-fleury-current-company'

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [companies, setCompanies] = useState<Company[]>([])
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchCompanies = useCallback(async () => {
    if (!user) {
      setCompanies([])
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

    const companyList = (data ?? []) as Company[]
    setCompanies(companyList)

    const savedId = localStorage.getItem(STORAGE_KEY)
    const saved = companyList.find((c) => c.id === savedId)

    if (saved) {
      setCurrentCompany(saved)
    } else if (companyList.length > 0) {
      const first = companyList[0]
      if (first) {
        setCurrentCompany(first)
        localStorage.setItem(STORAGE_KEY, first.id)
      }
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

  const refreshCompanies = useCallback(async () => {
    await fetchCompanies()
  }, [fetchCompanies])

  return (
    <ProjectContext.Provider
      value={{ companies, currentCompany, loading, selectCompany, refreshCompanies, createProject }}
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

export type { Company, CreateProjectData }
