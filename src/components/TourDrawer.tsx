import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTourContext } from '@/contexts/TourContext'
import { TOUR_ORDER } from '@/lib/tours/driver-config'
import {
  GraduationCap, X, CheckCircle2, Circle, ChevronRight,
  RotateCcw, Play, MapIcon,
} from 'lucide-react'

// Group tours by phase
const phases = TOUR_ORDER.reduce<{ phase: string; emoji: string; items: typeof TOUR_ORDER[number][] }[]>(
  (acc, item) => {
    const existing = acc.find((p) => p.phase === item.phase)
    if (existing) {
      existing.items.push(item)
    } else {
      acc.push({ phase: item.phase, emoji: item.emoji, items: [item] })
    }
    return acc
  },
  []
)

export function TourFAB() {
  const [open, setOpen] = useState(false)
  const { progress } = useTourContext()

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/30 text-primary-foreground transition-all hover:scale-105 hover:shadow-xl active:scale-95"
        title="Tour do Sistema"
      >
        <GraduationCap className="h-5 w-5" />
        {progress.completed > 0 && progress.completed < progress.total && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
            {progress.completed}
          </span>
        )}
      </button>

      {/* Drawer Overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <TourDrawerContent onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  )
}

function TourDrawerContent({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const {
    hasSeenTour, startProductTour, resetAllTours,
    progress, isProductTourActive, stopProductTour,
  } = useTourContext()

  const handleStartTour = () => {
    onClose()
    startProductTour()
    navigate('/dashboard')
  }

  const handleGoToPage = (path: string) => {
    onClose()
    navigate(path)
  }

  const handleReset = async () => {
    if (!window.confirm('Isso vai reiniciar todos os tutoriais. Deseja continuar?')) return
    await resetAllTours()
  }

  return (
    <div className="relative w-full max-w-sm animate-in slide-in-from-right bg-card shadow-2xl">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <MapIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold">Tour do Sistema</h2>
              <p className="text-xs text-muted-foreground">
                {progress.completed}/{progress.total} etapas concluídas
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted/50">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-700"
            style={{ width: `${progress.percent}%` }}
          />
        </div>

        {/* Action buttons */}
        <div className="mt-3 flex gap-2">
          {isProductTourActive ? (
            <button
              onClick={() => { stopProductTour(); onClose() }}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-accent"
            >
              Pausar Tour
            </button>
          ) : (
            <button
              onClick={handleStartTour}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              <Play className="h-3.5 w-3.5" />
              {progress.completed > 0 ? 'Continuar Tour' : 'Iniciar Tour Completo'}
            </button>
          )}
          {progress.completed > 0 && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Recomeçar do zero"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Phase list */}
      <div className="overflow-y-auto p-4" style={{ maxHeight: 'calc(100vh - 180px)' }}>
        <div className="space-y-4">
          {phases.map((phase) => (
            <div key={phase.phase}>
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>{phase.emoji}</span>
                {phase.phase}
              </p>
              <div className="space-y-1">
                {phase.items.map((item) => {
                  const done = hasSeenTour(item.id)
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleGoToPage(item.path)}
                      className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all ${
                        done
                          ? 'bg-emerald-500/5 hover:bg-emerald-500/10'
                          : 'hover:bg-accent'
                      }`}
                    >
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className={`flex-1 text-sm font-medium ${done ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>
                        {item.label}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Completion message */}
        {progress.percent === 100 && (
          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
            <p className="text-2xl">🎉</p>
            <p className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              Tour Completo!
            </p>
            <p className="text-xs text-muted-foreground">
              Você conheceu todas as funcionalidades do Build Fleury.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
