import { Link } from 'react-router-dom'
import { useOnboardingStatus, type OnboardingStep } from '@/hooks/useOnboarding'
import { useProject } from '@/contexts/ProjectContext'
import { supabase } from '@/lib/supabase'
import { CheckCircle2, Clock, Circle, Rocket, X, PartyPopper } from 'lucide-react'
import { toast } from 'sonner'
import { useState } from 'react'

export default function OnboardingPanel() {
  const { steps, progress, isComplete, isDismissed, isLoading } = useOnboardingStatus()
  const { currentCompany, refreshCompanies } = useProject()
  const [hiding, setHiding] = useState(false)

  if (isLoading || isDismissed || !currentCompany) return null

  const handleDismiss = async () => {
    const existingConfig = (currentCompany.config ?? {}) as Record<string, unknown>
    const { error } = await supabase
      .from('companies')
      .update({ config: { ...existingConfig, onboarding_dismissed: true } })
      .eq('id', currentCompany.id)
    if (error) {
      toast.error('Erro ao fechar painel')
      return
    }
    setHiding(true)
    await refreshCompanies()
  }

  if (hiding) return null

  const completedCount = steps.filter((s) => s.status === 'done').length

  return (
    <div className="relative mb-5 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-emerald-500/5 p-5">
      {/* Confetti animation when 100% */}
      {isComplete && <ConfettiOverlay />}

      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          {isComplete ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
              <PartyPopper className="h-5 w-5 text-emerald-500" />
            </div>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Rocket className="h-5 w-5 text-primary" />
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold">
              {isComplete ? 'Projeto configurado! 🎉' : 'Configure seu projeto'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isComplete
                ? 'Todos os módulos estão prontos para uso'
                : `${completedCount} de ${steps.length} etapas concluídas — complete todas para habilitar os indicadores`}
            </p>
          </div>
        </div>

        {/* Progress badge + dismiss */}
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              isComplete
                ? 'bg-emerald-500/10 text-emerald-600'
                : progress >= 50
                  ? 'bg-amber-500/10 text-amber-600'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {progress}%
          </span>
          {isComplete && (
            <button
              onClick={handleDismiss}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title="Fechar painel"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-5 h-2 w-full overflow-hidden rounded-full bg-muted/50">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps grid */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {steps.map((step) => (
          <StepCard key={step.id} step={step} />
        ))}
      </div>
    </div>
  )
}

// ─── Step Card ────────────────────────────────────────
function StepCard({ step }: { step: OnboardingStep }) {
  const Icon = step.icon

  const statusConfig = {
    done: {
      bg: 'bg-emerald-500/5 border-emerald-500/20',
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-500',
      StatusIcon: CheckCircle2,
      labelClass: 'text-emerald-700 dark:text-emerald-400',
    },
    partial: {
      bg: 'bg-amber-500/5 border-amber-500/20',
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-500',
      StatusIcon: Clock,
      labelClass: 'text-amber-700 dark:text-amber-400',
    },
    pending: {
      bg: 'bg-muted/30 border-border/50 hover:border-primary/30 hover:bg-primary/5',
      iconBg: 'bg-muted',
      iconColor: 'text-muted-foreground',
      StatusIcon: Circle,
      labelClass: 'text-muted-foreground',
    },
  }

  const cfg = statusConfig[step.status]

  return (
    <Link
      to={step.link}
      className={`group relative flex flex-col gap-2 rounded-xl border p-3 transition-all duration-200 ${cfg.bg}`}
    >
      {/* Icon row */}
      <div className="flex items-center justify-between">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${cfg.iconBg}`}>
          <Icon className={`h-4 w-4 ${cfg.iconColor}`} />
        </div>
        <cfg.StatusIcon className={`h-4 w-4 ${cfg.iconColor}`} />
      </div>

      {/* Label */}
      <div>
        <p className={`text-xs font-semibold leading-tight ${cfg.labelClass}`}>
          {step.label}
        </p>
        {step.detail ? (
          <p className="mt-0.5 text-[10px] text-muted-foreground">{step.detail}</p>
        ) : step.status === 'pending' ? (
          <p className="mt-0.5 text-[10px] text-primary/60 opacity-0 transition-opacity group-hover:opacity-100">
            Ir para →
          </p>
        ) : null}
      </div>
    </Link>
  )
}

// ─── Confetti CSS Animation ───────────────────────────
function ConfettiOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="absolute animate-confetti rounded-sm opacity-80"
          style={{
            left: `${Math.random() * 100}%`,
            top: `-5%`,
            width: `${4 + Math.random() * 4}px`,
            height: `${4 + Math.random() * 4}px`,
            backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'][i % 6],
            animationDelay: `${Math.random() * 2}s`,
            animationDuration: `${2 + Math.random() * 2}s`,
          }}
        />
      ))}
    </div>
  )
}
