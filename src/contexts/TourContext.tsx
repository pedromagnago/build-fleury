import { createContext, useContext, useCallback, useState, useEffect, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useProject } from '@/contexts/ProjectContext'
import { TOUR_ORDER, type TourId } from '@/lib/tours/driver-config'

interface TourState {
  completed: TourId[]
  productTourActive: boolean
  productTourStep: number
}

interface TourContextType {
  state: TourState
  loading: boolean
  hasSeenTour: (tourId: TourId) => boolean
  markTourSeen: (tourId: TourId) => Promise<void>
  resetTour: (tourId: TourId) => Promise<void>
  resetAllTours: () => Promise<void>
  startProductTour: () => void
  stopProductTour: () => void
  advanceProductTour: () => void
  progress: { completed: number; total: number; percent: number }
  isProductTourActive: boolean
  currentProductTourPage: typeof TOUR_ORDER[number] | null
}

const TourContext = createContext<TourContextType | undefined>(undefined)

const TOUR_CONFIG_KEY = 'tour_state'

export function TourProvider({ children }: { children: ReactNode }) {
  const { currentCompany, refreshCompanies: _refreshCompanies } = useProject()
  const [state, setState] = useState<TourState>({
    completed: [],
    productTourActive: false,
    productTourStep: 0,
  })
  const [loading, setLoading] = useState(true)

  // Load tour state from company config
  useEffect(() => {
    if (!currentCompany) {
      setLoading(false)
      return
    }

    const config = (currentCompany.config ?? {}) as Record<string, unknown>
    const saved = config[TOUR_CONFIG_KEY] as TourState | undefined

    if (saved) {
      setState({
        completed: saved.completed ?? [],
        productTourActive: false, // Never resume active state across sessions
        productTourStep: saved.productTourStep ?? 0,
      })
    } else {
      setState({ completed: [], productTourActive: false, productTourStep: 0 })
    }

    setLoading(false)
  }, [currentCompany])

  // Persist to Supabase
  const persist = useCallback(async (newState: TourState) => {
    if (!currentCompany) return

    const existingConfig = (currentCompany.config ?? {}) as Record<string, unknown>
    await supabase
      .from('companies')
      .update({
        config: {
          ...existingConfig,
          [TOUR_CONFIG_KEY]: {
            completed: newState.completed,
            productTourStep: newState.productTourStep,
          },
        },
      })
      .eq('id', currentCompany.id)
  }, [currentCompany])

  const hasSeenTour = useCallback((tourId: TourId) => {
    return state.completed.includes(tourId)
  }, [state.completed])

  const markTourSeen = useCallback(async (tourId: TourId) => {
    if (state.completed.includes(tourId)) return

    const newState = {
      ...state,
      completed: [...state.completed, tourId],
    }
    setState(newState)
    await persist(newState)
  }, [state, persist])

  const resetTour = useCallback(async (tourId: TourId) => {
    const newState = {
      ...state,
      completed: state.completed.filter((id) => id !== tourId),
    }
    setState(newState)
    await persist(newState)
  }, [state, persist])

  const resetAllTours = useCallback(async () => {
    const newState: TourState = {
      completed: [],
      productTourActive: false,
      productTourStep: 0,
    }
    setState(newState)
    await persist(newState)
  }, [persist])

  const startProductTour = useCallback(() => {
    setState((prev) => ({ ...prev, productTourActive: true, productTourStep: 0 }))
  }, [])

  const stopProductTour = useCallback(() => {
    setState((prev) => ({ ...prev, productTourActive: false }))
  }, [])

  const advanceProductTour = useCallback(() => {
    setState((prev) => {
      const next = prev.productTourStep + 1
      if (next >= TOUR_ORDER.length) {
        return { ...prev, productTourActive: false, productTourStep: 0 }
      }
      return { ...prev, productTourStep: next }
    })
  }, [])

  const progress = {
    completed: state.completed.length,
    total: TOUR_ORDER.length,
    percent: Math.round((state.completed.length / TOUR_ORDER.length) * 100),
  }

  const currentProductTourPage = state.productTourActive
    ? TOUR_ORDER[state.productTourStep] ?? null
    : null

  return (
    <TourContext.Provider
      value={{
        state,
        loading,
        hasSeenTour,
        markTourSeen,
        resetTour,
        resetAllTours,
        startProductTour,
        stopProductTour,
        advanceProductTour,
        progress,
        isProductTourActive: state.productTourActive,
        currentProductTourPage,
      }}
    >
      {children}
    </TourContext.Provider>
  )
}

export function useTourContext() {
  const context = useContext(TourContext)
  if (context === undefined) {
    throw new Error('useTourContext must be used within a TourProvider')
  }
  return context
}
