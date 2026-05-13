// Combobox de busca de item do orçamento usado na Recepção de Notas.
// Substitui os <select> hard-limit-10 por uma busca livre com scroll, mostrando:
//   1) Sugestões da IA no topo (com badge de score e flag histórico)
//   2) Todos os demais itens do orçamento abaixo (filtrados pela query)
//   3) Atalho "Criar item novo" no rodapé
//
// Decisão consciente de NÃO usar combobox de biblioteca (cmdk, downshift, etc.)
// pra manter zero dependência nova nesse merge — a tela já carrega todos os
// itens via useItensCompra, então busca é puro client-side.

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, Sparkles, Database, Check, Plus } from 'lucide-react'
import type { ItemMatchSugerido } from '@/lib/recepcao/api'

export interface ItemDoOrcamento {
  id: string
  codigo: string
  descricao: string
  etapa_nome?: string | null
  fornecedor_nome?: string | null
  custo_unitario_orcado?: number
}

interface Props {
  /** id atual selecionado (null = nenhum) */
  value: string | null
  /** chamado quando operador escolhe um item da lista */
  onChange: (itemId: string) => void
  /** sugestões da IA pra esta linha (top-N retornado pelo search_itens_compra) */
  sugestoes: ItemMatchSugerido[]
  /** TODOS os itens do orçamento — pra busca livre */
  todosItens: ItemDoOrcamento[]
  /** chamado quando operador clica "Criar item novo" */
  onCriarItem?: () => void
  /** descrição da linha da NF, usada como placeholder e dica inicial de busca */
  placeholderQuery?: string
  /** desabilita o controle (loading state) */
  disabled?: boolean
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function ItemPickerCombobox({
  value, onChange, sugestoes, todosItens, onCriarItem, placeholderQuery, disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Foca o input ao abrir
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const selecionado = value ? todosItens.find(i => i.id === value) ?? null : null

  // IDs já presentes nas sugestões — evita repetir nos "demais itens"
  const idsSugeridos = useMemo(() => new Set(sugestoes.map(s => s.item_id)), [sugestoes])

  // Lista filtrada de itens livres (que NÃO estão nas sugestões da IA)
  const itensFiltrados = useMemo(() => {
    const q = normalize(query.trim())
    const base = todosItens.filter(i => !idsSugeridos.has(i.id))
    if (!q) return base.slice(0, 200)  // sem busca, limita a 200 pra não pesar; com query, vê tudo
    return base.filter(i => {
      const hay = normalize(`${i.codigo ?? ''} ${i.descricao ?? ''} ${i.etapa_nome ?? ''} ${i.fornecedor_nome ?? ''}`)
      return q.split(/\s+/).every(token => hay.includes(token))
    })
  }, [todosItens, idsSugeridos, query])

  // Sugestões filtradas também pela query (útil quando a IA acha 10 mas operador quer refinar)
  const sugestoesFiltradas = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return sugestoes
    return sugestoes.filter(s => {
      const hay = normalize(`${s.codigo ?? ''} ${s.descricao ?? ''} ${s.etapa_nome ?? ''} ${s.fornecedor_nome ?? ''}`)
      return q.split(/\s+/).every(token => hay.includes(token))
    })
  }, [sugestoes, query])

  const handleSelect = (itemId: string) => {
    onChange(itemId)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger — mostra item selecionado ou placeholder */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-1 rounded border bg-background px-2 py-1 text-[10px] text-left ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/30'}`}
      >
        <span className="truncate">
          {selecionado ? (
            <>
              <span className="font-mono text-[9px] text-muted-foreground">{selecionado.codigo}</span>{' '}
              <span>{selecionado.descricao}</span>
            </>
          ) : (
            <span className="text-muted-foreground">— escolher item do orçamento —</span>
          )}
        </span>
        <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-30 mt-1 w-[min(28rem,90vw)] rounded-lg border bg-card shadow-xl">
          {/* Busca */}
          <div className="border-b p-1.5">
            <div className="relative">
              <Search className="absolute left-2 top-1.5 h-3 w-3 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={placeholderQuery ? `Buscar (ex.: ${placeholderQuery.slice(0, 30)}…)` : 'Buscar por código, descrição, etapa…'}
                className="w-full rounded border bg-background pl-7 pr-2 py-1 text-[11px]"
              />
            </div>
          </div>

          {/* Lista — max altura com scroll */}
          <div className="max-h-72 overflow-y-auto">
            {/* Sugestões da IA */}
            {sugestoesFiltradas.length > 0 && (
              <div>
                <div className="sticky top-0 bg-muted/50 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-2.5 w-2.5" /> Sugestões da IA ({sugestoesFiltradas.length})
                </div>
                {sugestoesFiltradas.map(s => {
                  const isAtual = s.item_id === value
                  return (
                    <button
                      key={`sug-${s.item_id}`}
                      type="button"
                      onClick={() => handleSelect(s.item_id)}
                      className={`w-full text-left px-2 py-1.5 text-[10px] border-b last:border-b-0 hover:bg-muted/40 ${isAtual ? 'bg-emerald-500/10' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[9px] text-muted-foreground">{s.codigo}</span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {s.match_historico && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-blue-500/15 text-blue-700 px-1 text-[9px]">
                              <Database className="h-2 w-2" /> hist.
                            </span>
                          )}
                          <span className={`rounded px-1 text-[9px] ${s.score_combined >= 0.8 ? 'bg-emerald-500/15 text-emerald-700' : s.score_combined >= 0.55 ? 'bg-amber-500/15 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
                            {Math.round(s.score_combined * 100)}%
                          </span>
                          {isAtual && <Check className="h-3 w-3 text-emerald-600" />}
                        </div>
                      </div>
                      <div className="font-medium truncate">{s.descricao}</div>
                      {(s.etapa_nome || s.fornecedor_nome) && (
                        <div className="text-[9px] text-muted-foreground truncate">
                          {s.etapa_nome && <>etapa: {s.etapa_nome}</>}
                          {s.etapa_nome && s.fornecedor_nome && ' · '}
                          {s.fornecedor_nome && <>forn.: {s.fornecedor_nome}</>}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Todos os itens (livre) */}
            {itensFiltrados.length > 0 && (
              <div>
                <div className="sticky top-0 bg-muted/50 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  Todos os itens do orçamento ({itensFiltrados.length}{!query && itensFiltrados.length === 200 ? '+' : ''})
                </div>
                {itensFiltrados.map(i => {
                  const isAtual = i.id === value
                  return (
                    <button
                      key={`item-${i.id}`}
                      type="button"
                      onClick={() => handleSelect(i.id)}
                      className={`w-full text-left px-2 py-1.5 text-[10px] border-b last:border-b-0 hover:bg-muted/40 ${isAtual ? 'bg-emerald-500/10' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[9px] text-muted-foreground">{i.codigo}</span>
                        {isAtual && <Check className="h-3 w-3 text-emerald-600" />}
                      </div>
                      <div className="font-medium truncate">{i.descricao}</div>
                      {(i.etapa_nome || i.fornecedor_nome) && (
                        <div className="text-[9px] text-muted-foreground truncate">
                          {i.etapa_nome && <>etapa: {i.etapa_nome}</>}
                          {i.etapa_nome && i.fornecedor_nome && ' · '}
                          {i.fornecedor_nome && <>forn.: {i.fornecedor_nome}</>}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {sugestoesFiltradas.length === 0 && itensFiltrados.length === 0 && (
              <div className="px-3 py-4 text-center text-[10px] text-muted-foreground">
                Nenhum item encontrado pra "{query}".
              </div>
            )}
          </div>

          {/* Footer */}
          {onCriarItem && (
            <div className="border-t p-1.5">
              <button
                type="button"
                onClick={() => { setOpen(false); onCriarItem() }}
                className="w-full inline-flex items-center justify-center gap-1 rounded border border-blue-500/40 text-blue-700 hover:bg-blue-500/10 px-2 py-1 text-[10px] font-medium"
              >
                <Plus className="h-3 w-3" /> Criar item novo no orçamento
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
