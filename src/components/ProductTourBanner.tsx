import { useNavigate } from 'react-router-dom'
import { useTourContext } from '@/contexts/TourContext'
import { TOUR_ORDER } from '@/lib/tours/driver-config'
import { TRANSITIONS } from '@/lib/tours/page-tours'
import { ArrowRight, X } from 'lucide-react'

/**
 * Floating banner that appears during the Product Tour
 * after the page tour finishes. Shows a transition message
 * and a button to navigate to the next page.
 */
export function ProductTourBanner() {
  const navigate = useNavigate()
  const {
    isProductTourActive,
    currentProductTourPage,
    advanceProductTour,
    stopProductTour,
    hasSeenTour,
    state,
  } = useTourContext()

  // Only show when product tour is active AND current page tour is done
  if (!isProductTourActive || !currentProductTourPage) return null
  if (!hasSeenTour(currentProductTourPage.id)) return null

  const currentIndex = state.productTourStep
  const nextPage = TOUR_ORDER[currentIndex + 1]
  const transitionMsg = TRANSITIONS[currentProductTourPage.id] ?? ''
  const isLast = currentIndex >= TOUR_ORDER.length - 1

  const handleNext = () => {
    advanceProductTour()
    if (nextPage) {
      navigate(nextPage.path)
    }
  }

  return (
    <div className="tour-transition-banner">
      <div className="flex-1">
        <p className="text-sm font-medium">{transitionMsg}</p>
        {!isLast && nextPage && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Próxima: {nextPage.label} ({currentIndex + 2}/{TOUR_ORDER.length})
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {isLast ? (
          <button
            onClick={() => stopProductTour()}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-600"
          >
            Finalizar 🎉
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            Próxima Etapa
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={() => stopProductTour()}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
          title="Parar tour"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
