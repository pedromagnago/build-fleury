import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  HardHat,
  Calendar,
  ShoppingCart,
  Wallet,
  ArrowRight,
  Check,
  X,
  Sparkles,
  Shield,
  FileSearch,
  Smartphone,
  AlertTriangle,
  TrendingDown,
  Clock,
  ScrollText,
  ChevronDown,
  Menu,
  XIcon,
  Calculator,
} from 'lucide-react'
import { SimuladorOrcamento } from '@/components/SimuladorOrcamento'

// TODO Pedro: substituir pelo canal real de demo (Calendly, WhatsApp, formulário)
const DEMO_CTA_HREF = 'mailto:contato@buildfleury.com.br?subject=Quero%20agendar%20uma%20demo'

export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [simuladorAberto, setSimuladorAberto] = useState(false)

  useEffect(() => {
    document.title = 'Build Fleury — Software de gestão de obras com cronograma físico-financeiro integrado'
  }, [])

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      <Header mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <SimuladorOrcamento aberto={simuladorAberto} onFechar={() => setSimuladorAberto(false)} />
      <main>
        <Hero onAbrirSimulador={() => setSimuladorAberto(true)} />
        <LogoBar />
        <Pain />
        <SimuladorCTA onAbrir={() => setSimuladorAberto(true)} />
        <HowItWorks />
        <Benefits />
        <BeforeAfter />
        <Differentiators />
        <Personas />
        <Testimonial />
        <Faq openFaq={openFaq} setOpenFaq={setOpenFaq} />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}

function Header({ mobileOpen, setMobileOpen }: { mobileOpen: boolean; setMobileOpen: (v: boolean) => void }) {
  const links = [
    { label: 'Como funciona', href: '#como-funciona' },
    { label: 'Benefícios', href: '#beneficios' },
    { label: 'Diferenciais', href: '#diferenciais' },
    { label: 'Perguntas', href: '#faq' },
  ]
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#topo" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <HardHat className="h-5 w-5" />
          </div>
          <span className="text-base font-semibold tracking-tight">Build Fleury</span>
        </a>
        <nav className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-slate-600 transition-colors hover:text-slate-900">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <Link to="/login" className="text-sm font-medium text-slate-700 hover:text-slate-900">
            Entrar
          </Link>
          <a
            href={DEMO_CTA_HREF}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            Agendar demo
          </a>
        </div>
        <button
          className="md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Abrir menu"
        >
          {mobileOpen ? <XIcon className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
      {mobileOpen && (
        <div className="border-t border-slate-200 bg-white md:hidden">
          <div className="flex flex-col gap-1 px-4 py-3">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => setMobileOpen(false)}
              >
                {l.label}
              </a>
            ))}
            <Link to="/login" className="rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
              Entrar
            </Link>
            <a
              href={DEMO_CTA_HREF}
              className="mt-2 rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground"
            >
              Agendar demo
            </a>
          </div>
        </div>
      )}
    </header>
  )
}

function Hero({ onAbrirSimulador }: { onAbrirSimulador: () => void }) {
  return (
    <section id="topo" className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-12 lg:gap-8 lg:py-28">
        <div className="lg:col-span-7">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Cronograma físico-financeiro com IA auditada
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Mover uma data no cronograma já recalcula compras, pagamentos e fluxo de caixa.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-600">
            Saiba <strong className="font-semibold text-slate-900">hoje</strong> se a obra vai estourar o orçamento — não daqui a três meses. A primeira plataforma onde o cronograma de execução é a fonte única de verdade do financeiro.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href={DEMO_CTA_HREF}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              Agendar demonstração
              <ArrowRight className="h-4 w-4" />
            </a>
            <button
              onClick={onAbrirSimulador}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-6 py-3 text-base font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Calculator className="h-4 w-4" />
              Simular orçamento grátis
            </button>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Sem migração de ERP. Comece pela próxima obra.
          </p>
        </div>

        <div className="lg:col-span-5">
          <HeroVisual />
        </div>
      </div>
    </section>
  )
}

function HeroVisual() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-primary/10 via-transparent to-primary/5 blur-2xl" />
      <div className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/10">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">Fluxo de caixa projetado</p>
            <p className="mt-1 text-sm font-semibold">Obra Residencial Fleury</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            Atualizado agora
          </span>
        </div>
        <div className="space-y-3">
          {[
            { label: 'Maio', value: 'R$ 412.800', pct: 70, tone: 'bg-primary' },
            { label: 'Junho', value: 'R$ 587.200', pct: 95, tone: 'bg-primary' },
            { label: 'Julho', value: 'R$ 348.500', pct: 55, tone: 'bg-amber-500' },
            { label: 'Agosto', value: 'R$ 121.000', pct: 22, tone: 'bg-emerald-500' },
          ].map((row) => (
            <div key={row.label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-slate-600">{row.label}</span>
                <span className="font-medium tabular-nums text-slate-900">{row.value}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full ${row.tone}`} style={{ width: `${row.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
          <Stat label="Etapas" value="42" />
          <Stat label="Pedidos" value="187" />
          <Stat label="Parcelas" value="356" />
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function LogoBar() {
  // TODO Pedro: substituir por logos reais de clientes/parceiros
  const logos = ['Construtora A', 'Incorporadora B', 'Engenharia C', 'Construtech D', 'Empreiteira E']
  return (
    <section className="border-y border-slate-100 bg-slate-50/50 py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-center text-xs font-medium uppercase tracking-wider text-slate-500">
          Construtoras que controlam o orçamento em tempo real
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
          {logos.map((logo) => (
            <span key={logo} className="text-sm font-semibold text-slate-400">
              {logo}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function Pain() {
  const items = [
    {
      icon: TrendingDown,
      title: 'Fluxo de caixa desatualizado',
      body: 'Cronograma muda na obra, ninguém atualiza o financeiro. Quando o estouro aparece, já é tarde.',
    },
    {
      icon: Clock,
      title: 'Retrabalho diário',
      body: 'Uma data muda e alguém precisa recalcular dezenas de pedidos e parcelas no Excel — todo dia.',
    },
    {
      icon: AlertTriangle,
      title: 'NF e recibo digitados na mão',
      body: 'O operador financeiro passa o dia digitando documentos um por um. Erro de R$ 0,01 já é prejuízo.',
    },
  ]
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Por que sua obra estoura o orçamento sem aviso
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Cronograma físico e controle financeiro vivem em planilhas separadas. O resultado é decisão com dado velho.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {items.map((it) => (
            <div key={it.title} className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
                <it.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{it.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function SimuladorCTA({ onAbrir }: { onAbrir: () => void }) {
  return (
    <section className="py-14 sm:py-16 bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 px-8 py-10 sm:px-12 sm:py-14 text-white shadow-xl">
          {/* Detalhe decorativo */}
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5" />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-white/5" />

          <div className="relative grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                <Sparkles className="h-3.5 w-3.5" />
                Grátis, sem cadastro
              </div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Simule o custo da sua obra em 1 minuto
              </h2>
              <p className="mt-4 text-base text-white/80 max-w-lg">
                Descreva o que você quer construir ou reformar. Nossa IA monta o orçamento detalhado com referências SINAPI — você ajusta e baixa o PDF para apresentar ao cliente.
              </p>
            </div>

            <div className="flex flex-col gap-4 lg:items-end">
              <div className="grid grid-cols-3 gap-4 text-center lg:text-right">
                {[
                  { num: '1 min', label: 'para gerar' },
                  { num: 'SINAPI', label: 'referência' },
                  { num: 'PDF', label: 'para baixar' },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-2xl font-bold">{s.num}</p>
                    <p className="text-xs text-white/70 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={onAbrir}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-base font-semibold text-primary shadow-md transition-opacity hover:opacity-90"
              >
                <Calculator className="h-5 w-5" />
                Simular agora — é grátis
              </button>
              <p className="text-xs text-white/60">Sem criar conta. Sem cartão de crédito.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    {
      icon: Calendar,
      step: '01',
      title: 'O cronograma dirige tudo',
      body: 'Cada etapa tem itens de compra vinculados — material, mão de obra, equipamento — com fornecedor, preço e condição de pagamento.',
    },
    {
      icon: ShoppingCart,
      step: '02',
      title: 'Pedidos e parcelas em cascata',
      body: 'Quando você muda uma data no cronograma, o sistema recalcula automaticamente datas de entrega e parcelas de pagamento.',
    },
    {
      icon: Wallet,
      step: '03',
      title: 'Fluxo de caixa em tempo real',
      body: 'Toda alteração reflete no fluxo. Você vê hoje o saldo dos próximos 12 meses — sem ninguém atualizar planilha.',
    },
  ]
  return (
    <section id="como-funciona" className="bg-slate-50 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Como funciona</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Uma cadeia automatizada do canteiro ao caixa
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Cronograma → pedidos → parcelas → fluxo de caixa. Cada elo recalcula o próximo.
          </p>
        </div>
        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {steps.map((s, idx) => (
            <div key={s.step} className="relative">
              {idx < steps.length - 1 && (
                <ArrowRight className="absolute -right-4 top-7 hidden h-5 w-5 text-slate-300 md:block" />
              )}
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-semibold tracking-wider text-slate-400">{s.step}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Benefits() {
  const benefits = [
    {
      icon: Wallet,
      title: 'Previsibilidade real do caixa',
      body: 'Veja o saldo projetado dos próximos 12 meses recalculado a cada alteração de cronograma.',
    },
    {
      icon: Sparkles,
      title: 'IA que digita por você',
      body: 'NF, recibo e pedido são extraídos por IA. O financeiro só audita e aprova — nunca digita.',
    },
    {
      icon: ScrollText,
      title: 'Orçado vs. realizado sempre vivo',
      body: 'Composição entre real e previsto se atualiza sozinha. O total orçamentário só muda em revisão formal.',
    },
    {
      icon: Smartphone,
      title: 'Foto do canteiro vira lançamento',
      body: 'Gestor de obra fotografa a NF no celular. Chega no financeiro já classificada e vinculada à etapa.',
    },
    {
      icon: FileSearch,
      title: 'Auditoria nativa de tudo',
      body: 'Quem mudou, quando, valor anterior e novo — registrado em audit log para toda ação financeira.',
    },
    {
      icon: Shield,
      title: 'LGPD e isolamento por projeto',
      body: 'Multi-tenant com Row-Level Security em 100% das tabelas. Soft delete: dados financeiros nunca somem.',
    },
  ]
  return (
    <section id="beneficios" className="py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Benefícios</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            O que muda na rotina de quem usa
          </h2>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b) => (
            <div key={b.title} className="rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <b.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{b.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{b.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function BeforeAfter() {
  const rows = [
    { label: 'Cronograma e financeiro', before: 'Em planilhas separadas, atualizadas à mão', after: 'Cadeia única — uma muda, a outra recalcula' },
    { label: 'Mudança de data na obra', before: 'Horas refazendo planilha de pagamentos', after: 'Recalculado automaticamente na cascata' },
    { label: 'Lançamento de NF/recibo', before: 'Digitação manual, propenso a erro', after: 'IA extrai e propõe; humano só audita' },
    { label: 'Visão de fluxo de caixa', before: 'Foto do mês passado', after: 'Tempo real, 12 meses à frente' },
    { label: 'Auditoria de alterações', before: 'Sem rastro de quem mudou o quê', after: 'Audit log de toda ação financeira' },
  ]
  return (
    <section className="bg-slate-50 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            A diferença que aparece na primeira semana
          </h2>
        </div>
        <div className="mt-12 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500"></th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Hoje</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Com Build Fleury</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.label} className={i < rows.length - 1 ? 'border-b border-slate-100' : ''}>
                  <td className="px-6 py-4 font-medium text-slate-900">{r.label}</td>
                  <td className="px-6 py-4 text-slate-600">
                    <span className="inline-flex items-start gap-2">
                      <X className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                      <span>{r.before}</span>
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-700">
                    <span className="inline-flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>{r.after}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function Differentiators() {
  const items = [
    {
      title: 'IA sempre auditada',
      body: 'Nenhuma classificação vira definitiva sem aprovação humana. Auto-aprovação só acima de limiar configurável.',
    },
    {
      title: 'Conformidade técnica',
      body: 'Aderente à NBR 16636:2017 (cronograma físico-financeiro), PMBOK 7ª edição e EVM/ANSI EIA-748.',
    },
    {
      title: 'Configurável sem código',
      body: 'Limiares, condições de pagamento, score mínimo de IA, datas — tudo ajustável pela interface.',
    },
    {
      title: 'Soft delete em dados financeiros',
      body: 'Lançamento financeiro nunca é deletado em definitivo. Recuperável a qualquer momento.',
    },
  ]
  return (
    <section id="diferenciais" className="py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Diferenciais</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Construído para sócios que dormem tranquilos
          </h2>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {items.map((it) => (
            <div key={it.title} className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6">
              <div className="flex items-start gap-3">
                <Check className="mt-1 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <h3 className="text-lg font-semibold">{it.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{it.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Personas() {
  const personas = [
    { role: 'Sócio / Diretor', use: 'Visão executiva, alertas de desvio, aprova revisões orçamentárias.' },
    { role: 'Gerente financeiro', use: 'Audita classificações da IA, registra pagamentos, concilia bancário.' },
    { role: 'Gestor de obra', use: 'Edita cronograma, registra avanço físico, faz upload de documentos.' },
    { role: 'Investidor', use: 'Recebe relatórios periódicos com fluxo de aportes vs. recebimentos.' },
  ]
  return (
    <section className="bg-slate-50 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Um sistema, quatro perfis
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Cada um vê só o que importa — e a fonte da verdade é única.
          </p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {personas.map((p) => (
            <div key={p.role} className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-slate-900">{p.role}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{p.use}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Testimonial() {
  // TODO Pedro: substituir por depoimento real (nome, cargo, empresa, foto, número)
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-primary/5 via-white to-white p-8 sm:p-12">
          <p className="text-2xl font-medium leading-relaxed text-slate-800 sm:text-3xl">
            "Pela primeira vez consigo olhar o fluxo de caixa da obra e confiar no que vejo. Quando o engenheiro mexe no cronograma, eu já vejo o impacto no caixa do trimestre seguinte."
          </p>
          <div className="mt-6 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-slate-200" />
            <div>
              <p className="text-sm font-semibold">Nome do cliente</p>
              <p className="text-xs text-slate-500">Cargo, Construtora Exemplo</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Faq({ openFaq, setOpenFaq }: { openFaq: number | null; setOpenFaq: (i: number | null) => void }) {
  const items = [
    {
      q: 'Vou precisar migrar tudo do Sienge ou da minha planilha?',
      a: 'Não. Comece pela próxima obra. A migração de obras antigas é opcional e acontece quando você quiser.',
    },
    {
      q: 'Quanto tempo leva a implantação?',
      a: 'A primeira obra entra em operação em poucos dias. O cronograma inicial pode ser importado de planilha; o restante é configurado com o time da implantação.',
    },
    {
      q: 'IA erra. Como confio?',
      a: 'A IA propõe, o humano aprova. Nada vira definitivo sem auditoria. Você ainda configura um limiar de confiança para auto-aprovação — abaixo disso, sempre passa por revisão.',
    },
    {
      q: 'Como funciona o preço?',
      a: 'Por projeto/obra ativa, com plano anual. Fale com nosso time para receber a proposta adequada ao seu portfólio.',
    },
    {
      q: 'É seguro? Como tratam meus dados?',
      a: 'Multi-tenant com Row-Level Security em 100% das tabelas, isolamento por projeto, audit log de toda ação financeira e soft delete (dados não são apagados em definitivo). Conformidade com LGPD.',
    },
    {
      q: 'Funciona no celular do gestor de obra?',
      a: 'Sim. O gestor fotografa a NF no canteiro e o documento chega ao financeiro já extraído pela IA, vinculado à etapa.',
    },
  ]
  return (
    <section id="faq" className="bg-slate-50 py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Perguntas frequentes</h2>
        </div>
        <div className="mt-10 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {items.map((it, i) => {
            const isOpen = openFaq === i
            return (
              <div key={it.q}>
                <button
                  onClick={() => setOpenFaq(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="text-base font-medium text-slate-900">{it.q}</span>
                  <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="px-6 pb-5 text-sm leading-relaxed text-slate-600">{it.a}</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="bg-sidebar py-20 text-white sm:py-24">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Pare de descobrir o estouro tarde demais
        </h2>
        <p className="mt-4 text-lg text-white/70">
          Em uma demo de 30 minutos mostramos como o cronograma da sua próxima obra pode dirigir todo o financeiro.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={DEMO_CTA_HREF}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-medium text-primary-foreground shadow-lg transition-opacity hover:opacity-90"
          >
            Agendar demonstração
            <ArrowRight className="h-4 w-4" />
          </a>
          <Link to="/login" className="text-sm font-medium text-white/80 hover:text-white">
            Já é cliente? Entrar
          </Link>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <HardHat className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold">Build Fleury</span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Plataforma de controle orçamentário para obras de construção civil com cronograma físico-financeiro integrado.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Produto</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href="#como-funciona" className="text-slate-600 hover:text-slate-900">Como funciona</a></li>
              <li><a href="#beneficios" className="text-slate-600 hover:text-slate-900">Benefícios</a></li>
              <li><a href="#diferenciais" className="text-slate-600 hover:text-slate-900">Diferenciais</a></li>
              <li><a href="#faq" className="text-slate-600 hover:text-slate-900">Perguntas</a></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Empresa</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href={DEMO_CTA_HREF} className="text-slate-600 hover:text-slate-900">Agendar demo</a></li>
              <li><Link to="/login" className="text-slate-600 hover:text-slate-900">Entrar</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Legal</p>
            <ul className="mt-3 space-y-2 text-sm">
              {/* TODO Pedro: preencher razão social/CNPJ/encarregado nos marcadores [PREENCHER] de /privacidade e /termos */}
              <li><Link to="/privacidade" className="text-slate-600 hover:text-slate-900">Política de privacidade</Link></li>
              <li><Link to="/termos" className="text-slate-600 hover:text-slate-900">Termos de uso</Link></li>
              <li><Link to="/privacidade#direitos-do-titular" className="text-slate-600 hover:text-slate-900">LGPD</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-10 border-t border-slate-100 pt-6 text-xs text-slate-500">
          {/* TODO Pedro: substituir por razão social e CNPJ reais */}
          © {new Date().getFullYear()} Build Fleury. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  )
}