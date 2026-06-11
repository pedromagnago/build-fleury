import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { HardHat, ArrowLeft } from 'lucide-react'

export function LegalLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  useEffect(() => {
    document.title = `${title} — Build Fleury`
    window.scrollTo(0, 0)
  }, [title])

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <HardHat className="h-5 w-5" />
            </div>
            <span className="text-base font-semibold tracking-tight">Build Fleury</span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao site
          </Link>
        </div>
      </header>

      <main>
        <section className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white">
          <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
            <p className="mt-3 text-lg text-slate-600">{subtitle}</p>
          </div>
        </section>
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">{children}</div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-10">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} Build Fleury. Todos os direitos reservados.</span>
          <div className="flex items-center gap-5">
            <Link to="/privacidade" className="text-slate-600 hover:text-slate-900">
              Política de privacidade
            </Link>
            <Link to="/termos" className="text-slate-600 hover:text-slate-900">
              Termos de uso
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

export function LegalSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-10 first:mt-0">
      <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-600">{children}</div>
    </section>
  )
}

export function Preencher({ children }: { children: string }) {
  return (
    <span className="rounded bg-amber-100 px-1 py-0.5 font-medium text-amber-800">
      [PREENCHER: {children}]
    </span>
  )
}
