// Recepção de Documentos — extrai itens de NF/PDF/imagem/texto via OpenAI
// Body: { kind: 'pdf'|'imagem'|'texto', content: string (base64 ou texto cru), prompt_extra?: string }
// Retorno: { fornecedor: {...}, itens: [...], totals: {...}, custo_cents, modelo }
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')!
// Default mudou para gpt-4o (não-mini): mini errava colunas em tabela densa de NF.
// Mantém override via env para testes A/B sem deploy.
const MODEL = Deno.env.get('OPENAI_EXTRACT_MODEL') ?? 'gpt-4o'

const SYSTEM_PROMPT = `Você extrai dados estruturados de documentos comerciais brasileiros para alimentar um sistema de contas a pagar / recepção de notas. Trabalha em DOCUMENTOS REAIS de qualquer formato:
- NF-e (DANFE) — produto, com itens em tabela densa
- NFS-e — serviço (padrão ABRASF ou variações municipais como SP/RJ/BH/Curitiba); pode vir só XML ou imagem/PDF do recibo
- CT-e — conhecimento de transporte (frete)
- Boleto bancário (com linha digitável FEBRABAN)
- Comprovante de PIX / TED / DOC
- Recibo, OS, fatura simples

REGRA DE OURO: O OBJETIVO PRIMÁRIO É CAPTURAR DADOS DE PAGAMENTO
Em qualquer documento, mesmo que não consiga ler tudo, PRIORIZE extrair:
  fornecedor.nome, fornecedor.cnpj, documento.valor_total, documento.data_vencimento (ou data_emissao se vencimento ausente), pagamento.forma e os dados necessários pra pagar (linha digitável, chave PIX, banco/agência/conta).
Se o documento NÃO TEM itens detalhados (boleto, PIX, recibo simples, NFSe de serviço único), devolva "itens": [] — NÃO INVENTE itens. Em NFSe de serviço único, você PODE devolver um único item com a descrição do serviço, quantidade=1, valor_unitario=valor_total, valor_total=valor_total.

REGRA DE OURO PARA TABELAS DE ITENS (NF-e e similares)
Notas brasileiras tipicamente trazem colunas nesta ordem (varia, mas a semântica é estável):
  Item/Nº | Código | Descrição | NCM | CST/CFOP | Unidade | Quantidade | Valor Unitário | Valor Total | (Impostos)

Antes de extrair QUALQUER item, identifique mentalmente em qual coluna está cada campo. Em particular:
- "quantidade" = SEMPRE da coluna "Qtd" / "Quantidade" / "Qtde". NUNCA da coluna "Código", "Cód.", "NCM", "Item", "Embalagem" ou "Peso".
- "valor_unitario" = SEMPRE da coluna "V. Unit" / "Valor Unitário" / "Preço Unit". NUNCA do "Valor Total" nem do "Desconto".
- "valor_total" = SEMPRE da coluna "V. Total" / "Valor Total" / "Subtotal" da LINHA. NUNCA confunda com total da NF, total por NCM ou frete.
- "ncm" = código numérico, geralmente 8 dígitos.
- "unidade" = sigla curta (UN, KG, M, M2, L, CX, PC, PCT, etc).

SE A NF DESCREVER A EMBALAGEM (ex.: "CAIXA C/ 48 UN", "FARDO 12X", "PCT 50"):
- mantenha a descrição completa
- a "quantidade" é o número de EMBALAGENS (ex.: 2 caixas), NÃO o conteúdo da embalagem (48 unidades)
- a "unidade" é a embalagem (CX, FD, PCT) quando indicado
- jamais multiplique a quantidade pelo conteúdo da embalagem por conta própria

VALIDAÇÃO INTERNA OBRIGATÓRIA
Para CADA item, verifique antes de devolver:
  abs(quantidade × valor_unitario - valor_total) <= 0.02
Se a igualdade não bater, REFAÇA a leitura daquela linha (provavelmente confundiu coluna). Se ainda assim divergir, anote em "observacoes" qual linha está duvidosa e devolva os valores que efetivamente leu (NÃO chute para forçar igualdade).

Ao final, verifique também:
  abs(SUM(itens.valor_total) - documento.valor_total) deve ser pequeno (≤ 5% ou diferença explicável por frete/desconto/IPI).
Se a diferença for grande, é sinal de erro de leitura. Anote em "observacoes": "soma das linhas R$ X difere do total NF R$ Y — revisar linhas N, M".

FORMATO DE SAÍDA (JSON estrito, sem markdown, sem comentários):

{
  "fornecedor": {
    "nome": string|null,
    "cnpj": string|null,
    "ie": string|null
  },
  "documento": {
    "numero": string|null,
    "serie": string|null,
    "data_emissao": "YYYY-MM-DD"|null,
    "data_vencimento": "YYYY-MM-DD"|null,
    "valor_total": number|null,
    "tipo": "NFE"|"NFSE"|"CTE"|"BOLETO"|"PIX"|"RECIBO"|"OUTRO"
  },
  "pagamento": {
    "forma": "BOLETO"|"PIX"|"TED"|"DINHEIRO"|"CARTAO"|"DESCONHECIDO"|null,
    "linha_digitavel": string|null,
    "codigo_barras": string|null,
    "chave_pix": string|null,
    "tipo_chave_pix": "CPF"|"CNPJ"|"EMAIL"|"TELEFONE"|"ALEATORIA"|null,
    "banco": string|null,
    "agencia": string|null,
    "conta": string|null,
    "beneficiario_nome": string|null,
    "beneficiario_cnpj_cpf": string|null
  },
  "itens": [
    {
      "ordem": number,
      "descricao": string,
      "ncm": string|null,
      "unidade": string|null,
      "quantidade": number|null,
      "valor_unitario": number|null,
      "valor_total": number|null
    }
  ],
  "observacoes": string|null
}

REGRAS DO BLOCO "pagamento"
- Boleto: extraia linha digitável (47 dígitos, formato XXXXX.XXXXX XXXXX.XXXXXX XXXXX.XXXXXX X XXXXXXXXXXXXXX) e código de barras (44 dígitos) se visíveis. Devolva ambos limpos (só dígitos + um único espaço entre blocos da linha digitável é OK).
- PIX: identifique chave (CPF/CNPJ/email/telefone/aleatória UUID). QR Code copia-e-cola (BR Code) também é válido em chave_pix se nada mais estiver legível.
- TED/transferência: banco + agência + conta + nome do beneficiário.
- Se NENHUMA informação de pagamento estiver no documento (NF-e padrão sem boleto anexo), devolva todos os campos do bloco como null e "forma": null.
- NÃO tente inferir uma forma só pelo tipo de documento (uma NFS-e PODE ter boleto anexo OU PIX OU nada). Só preencha o que estiver visível.

CONVENÇÕES NUMÉRICAS
- Decimais com ponto (1234.56). NUNCA vírgula. NUNCA string.
- "1.234,56" (formato BR) → 1234.56.
- "0,5" → 0.5. "1,000" se claramente milhar → 1000; se claramente decimal → 1.0 (use contexto da coluna).
- CNPJ: só dígitos (14 caracteres).
- Datas ISO 8601 (YYYY-MM-DD).
- Campo não identificado = null (NUNCA "" nem 0).

EXEMPLO DE EXTRAÇÃO CORRETA (linha hipotética em NF-e)
Linha visível no documento:
  "001 | 7891234567064 | TORNEIRA METAL CROMADA RETA | 84818000 | UN | 2,000 | 37,500 | 75,00"
Leitura correta:
  ordem=1, descricao="TORNEIRA METAL CROMADA RETA", ncm="84818000", unidade="UN",
  quantidade=2, valor_unitario=37.5, valor_total=75.0
Erro a EVITAR: pegar 7891234567064 (código de barras) como quantidade (resultaria em quantidade=64 ou 7891234567064 — ambos são erros graves).

EXEMPLO DE EMBALAGEM
Linha: "010 | 9876543210 | PARAFUSO 4x40 CX C/100 | 73181500 | CX | 3,000 | 45,00 | 135,00"
Leitura: quantidade=3 (caixas), unidade="CX", valor_unitario=45, valor_total=135. NÃO use quantidade=300.

COMPLETUDE — REGRA CRÍTICA
LISTE TODOS os itens da nota, na ordem física do documento. NUNCA invente itens. NUNCA pule itens.
ANTES de finalizar o JSON, faça esta dupla checagem mental:
  1. Conte quantas LINHAS DE ITEM existem visíveis na tabela do documento (ignore cabeçalhos, totais, observações).
  2. Conte quantos elementos você incluiu no array "itens".
  3. Se forem diferentes, REFAÇA a varredura — você pulou ou duplicou algo. Itens descritivos longos podem ocupar 2-3 linhas físicas (descrição contínua, FCI, observação) — isso é UM item, não vários. Ao contrário, NUNCA agrupe 2 itens distintos em um só.
Se mesmo após refazer não conseguir conciliar, devolva os itens que conseguiu identificar com certeza e registre em "observacoes": "atenção: documento parece ter N itens mas extraí M — operador deve revisar".

FIDELIDADE — NÃO INVENTE
- Descrição: copie LITERALMENTE o que está no documento. Não substitua palavras. Não complete abreviações ("ENGATE" continua "ENGATE", não vira "ANEL VEDACAO"). Não troque marcas. Se o nome está em CAIXA ALTA, mantenha em CAIXA ALTA.
- Quantidade, valor unitário, valor total: leia o que está escrito. Se um valor parece improvável (R$ 36864 numa torneira), provavelmente você confundiu coluna — refaça a leitura ANTES de devolver.`

async function callOpenAI(messages: any[]): Promise<{ json: any; usage: any }> {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0,
      // max_tokens generoso pra cobrir NF de até ~80 itens. Sem isso, resposta
      // pode vir truncada e quebrar o JSON.parse com erro genérico.
      max_tokens: 8000,
    }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`OpenAI ${resp.status}: ${text}`)
  }
  const data = await resp.json()
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error(`OpenAI retornou conteúdo inesperado: ${JSON.stringify(data).slice(0, 500)}`)
  }
  const finishReason = data.choices?.[0]?.finish_reason
  if (finishReason && finishReason !== 'stop') {
    // length, content_filter, tool_calls — qualquer um diferente de 'stop' indica resposta incompleta
    console.warn(`[recepcao-extrair] finish_reason=${finishReason} — resposta possivelmente incompleta`)
  }
  try {
    return { json: JSON.parse(content), usage: data.usage }
  } catch (parseErr) {
    throw new Error(`Falha ao parsear JSON da OpenAI (finish_reason=${finishReason ?? 'unknown'}): ${parseErr instanceof Error ? parseErr.message : String(parseErr)}. Trecho do retorno: ${content.slice(0, 300)}`)
  }
}

// Custo aproximado em centavos. Tabela atualizada (USD/M tokens, conversão BRL ~5x → cents BR).
function estimateCostCents(usage: any, model: string): number {
  if (!usage) return 0
  const rates: Record<string, { in: number; out: number }> = {
    'gpt-4o-mini': { in: 0.150, out: 0.600 },
    'gpt-4o':      { in: 2.500, out: 10.000 },  // gpt-4o-2024-08-06 e posteriores
    'gpt-4o-2024-08-06': { in: 2.500, out: 10.000 },
  }
  const r = rates[model] ?? rates['gpt-4o']
  const inCost = (usage.prompt_tokens / 1_000_000) * r.in
  const outCost = (usage.completion_tokens / 1_000_000) * r.out
  // Converte USD → centavos BR (× 100 pra cents × ~5 cotação aproximada). Mantém só valor em cents USD aqui,
  // a UI já formata como "R$" puramente informativo — o que importa é a magnitude relativa.
  return Math.round((inCost + outCost) * 100 * 100) / 100
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const body = await req.json()
    const { kind, content, prompt_extra } = body
    // kind='imagens' aceita { images: [{ base64, mime? }, ...] } pra mandar todas as
    // páginas de um PDF (ou múltiplas fotos do mesmo doc) numa única chamada Vision.
    // Evita N calls cegas e elimina o pós-merge frágil de fornecedor/itens.
    const images: Array<{ base64: string; mime?: string }> | undefined = body.images
    if (!kind) {
      return new Response(JSON.stringify({ error: 'missing kind' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    if (kind !== 'imagens' && !content) {
      return new Response(JSON.stringify({ error: 'missing content' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    if (kind === 'imagens' && (!Array.isArray(images) || images.length === 0)) {
      return new Response(JSON.stringify({ error: 'kind=imagens requer body.images: non-empty array' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    let messages: any[]
    if (kind === 'imagem' || kind === 'pdf') {
      // detail:"high" — gasta ~3x mais tokens de imagem mas é essencial pra ler tabela densa de NF
      // (com detail:"auto" o gpt-4o-mini errava colunas, gpt-4o ainda perdia precisão em valores pequenos).
      messages = [
        { role: 'system', content: SYSTEM_PROMPT + (prompt_extra ? `\n\nContexto extra: ${prompt_extra}` : '') },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extraia os dados estruturados deste documento. Identifique as colunas da tabela ANTES de extrair valores. Aplique a validação interna (qtd × unit = total) em cada linha.' },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${content}`, detail: 'high' } },
          ],
        },
      ]
    } else if (kind === 'imagens') {
      // Múltiplas páginas / faces do MESMO documento — IA vê tudo junto, não duplica
      // fornecedor/totais e enxerga continuação de tabela entre páginas.
      const userContent: any[] = [
        { type: 'text', text:
          `Estas ${images!.length} imagens são as páginas/faces do MESMO documento (ex.: NF de 2 páginas, frente+verso de boleto). ` +
          'Trate como UM documento único: extraia fornecedor/totais/pagamento UMA VEZ. ' +
          'A tabela de itens pode continuar entre páginas — NÃO duplique linhas que já aparecem em uma página anterior. ' +
          'Páginas com apenas observações/cabeçalho repetido não geram itens novos.' },
      ]
      images!.forEach((im, idx) => {
        const mime = im.mime ?? 'image/jpeg'
        userContent.push({ type: 'text', text: `=== Página ${idx + 1} de ${images!.length} ===` })
        userContent.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${im.base64}`, detail: 'high' } })
      })
      messages = [
        { role: 'system', content: SYSTEM_PROMPT + (prompt_extra ? `\n\nContexto extra: ${prompt_extra}` : '') },
        { role: 'user', content: userContent },
      ]
    } else if (kind === 'texto') {
      messages = [
        { role: 'system', content: SYSTEM_PROMPT + (prompt_extra ? `\n\nContexto extra: ${prompt_extra}` : '') },
        { role: 'user', content: `Extraia os dados estruturados do seguinte documento (texto extraído nativo do PDF — pode ter quebras de linha e ordem de leitura imperfeita; reconstrua a tabela mentalmente identificando colunas pela posição/conteúdo):\n\n${content}` },
      ]
    } else {
      return new Response(JSON.stringify({ error: 'kind invalido (use imagem|imagens|pdf|texto)' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const { json, usage } = await callOpenAI(messages)
    const custo_cents = estimateCostCents(usage, MODEL)

    return new Response(
      JSON.stringify({ ...json, _meta: { modelo: MODEL, custo_cents, usage } }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[recepcao-extrair] erro:', msg, err instanceof Error ? err.stack : '')
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
