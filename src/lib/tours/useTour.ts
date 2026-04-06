import { useEffect, useCallback, useRef } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { TOUR_THEME, buildDriverSteps, type TourStepDef, type TourId } from '@/lib/tours/driver-config'
import { useTourContext } from '@/contexts/TourContext'

interface UseTourOptions {
  delay?: number
  autoStart?: boolean
}

export function useTour(tourId: TourId, steps: TourStepDef[], options: UseTourOptions = {}) {
  const { delay = 600, autoStart = true } = options
  const { hasSeenTour, markTourSeen, isProductTourActive } = useTourContext()
  const driverRef = useRef<ReturnType<typeof driver> | null>(null)

  const startTour = useCallback(() => {
    // Filter steps to only those with elements currently in DOM
    const available = steps.filter((s) => document.querySelector(s.element))
    if (available.length === 0) return

    const d = driver({
      ...TOUR_THEME,
      steps: buildDriverSteps(available),
      onDestroyStarted: () => {
        markTourSeen(tourId)
        d.destroy()
      },
    })

    driverRef.current = d
    d.drive()
  }, [steps, tourId, markTourSeen])

  // Auto-start on first visit (if not seen and not in product tour mode)
  useEffect(() => {
    if (!autoStart) return
    if (hasSeenTour(tourId)) return
    if (isProductTourActive) return // Product tour handles its own timing

    const timer = setTimeout(() => {
      startTour()
    }, delay)

    return () => {
      clearTimeout(timer)
      driverRef.current?.destroy()
    }
  }, [tourId, autoStart, delay, hasSeenTour, isProductTourActive, startTour])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      driverRef.current?.destroy()
    }
  }, [])

  return { startTour, restartTour: startTour }
}
