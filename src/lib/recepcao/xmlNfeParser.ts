// Parser de NF-e XML (SEFAZ) — deterministico, client-side
// Trabalha tanto com NFe completa quanto com o "procNFe" (mais comum em downloads)

export interface NfeItem {
  ordem: number
  descricao: string
  ncm: string | null
  unidade: string | null
  quantidade: number | null
  valor_unitario: number | null
  valor_total: number | null
}

export interface NfeParsed {
  fornecedor: { nome: string | null; cnpj: string | null; ie: string | null }
  documento: {
    numero: string | null
    serie: string | null
    data_emissao: string | null
    data_vencimento: string | null
    valor_total: number | null
    chave_acesso: string | null
    tipo: 'NFE'
  }
  itens: NfeItem[]
}

function getText(node: Element | null, tag: string): string | null {
  if (!node) return null
  const el = node.getElementsByTagName(tag)[0]
  return el?.textContent?.trim() || null
}

function getNumber(node: Element | null, tag: string): number | null {
  const v = getText(node, tag)
  return v == null ? null : Number(v)
}

export function parseNfeXml(xmlText: string): NfeParsed {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('XML invalido')
  }

  // NFe pode estar dentro de <nfeProc><NFe><infNFe> ou <NFe><infNFe>
  const infNFe = doc.querySelector('infNFe')
  if (!infNFe) throw new Error('Nao parece ser uma NF-e (sem infNFe)')

  const ide = infNFe.querySelector('ide')
  const emit = infNFe.querySelector('emit')
  const total = infNFe.querySelector('total > ICMSTot') ?? infNFe.querySelector('ICMSTot')
  const detList = infNFe.querySelectorAll('det')

  const chave = infNFe.getAttribute('Id')?.replace(/^NFe/, '') ?? null

  const itens: NfeItem[] = []
  detList.forEach((det) => {
    const prod = det.querySelector('prod')
    if (!prod) return
    const ordemAttr = det.getAttribute('nItem')
    itens.push({
      ordem: ordemAttr ? Number(ordemAttr) : itens.length + 1,
      descricao: getText(prod, 'xProd') ?? '',
      ncm: getText(prod, 'NCM'),
      unidade: getText(prod, 'uCom') ?? getText(prod, 'uTrib'),
      quantidade: getNumber(prod, 'qCom') ?? getNumber(prod, 'qTrib'),
      valor_unitario: getNumber(prod, 'vUnCom') ?? getNumber(prod, 'vUnTrib'),
      valor_total: getNumber(prod, 'vProd'),
    })
  })

  return {
    fornecedor: {
      nome: getText(emit, 'xNome') ?? getText(emit, 'xFant'),
      cnpj: getText(emit, 'CNPJ'),
      ie: getText(emit, 'IE'),
    },
    documento: {
      numero: getText(ide, 'nNF'),
      serie: getText(ide, 'serie'),
      data_emissao: (getText(ide, 'dhEmi') ?? getText(ide, 'dEmi'))?.slice(0, 10) ?? null,
      data_vencimento: null,
      valor_total: getNumber(total, 'vNF'),
      chave_acesso: chave,
      tipo: 'NFE',
    },
    itens,
  }
}
