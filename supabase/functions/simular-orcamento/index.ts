// Simulador de Orçamento público — interpreta descrição livre de obra e devolve
// lista de itens de custo estruturada. Chamado da landing page (sem auth).
//
// POST { messages: [{role, content}] }
// Resposta quando precisa de mais info: { pronto: false, pergunta: string }
// Resposta quando tem info suficiente:  { pronto: true, resumo, itens, observacoes? }
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')!
const MODEL = Deno.env.get('OPENAI_SIMULATOR_MODEL') ?? 'gpt-4o-mini'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM = `Você é um especialista em orçamentos de obras e reformas de construção civil no Brasil.

Quando o usuário descrever uma obra ou reforma, seu objetivo é gerar uma lista detalhada de itens de custo.

REGRAS:
1. Se falta a área em m² (ou outra informação crítica como tipo de obra), faça UMA pergunta objetiva e curta.
2. Com informação suficiente, gere imediatamente os itens — não faça perguntas desnecessárias.
3. Sempre responda em JSON válido, sem markdown, sem texto fora do JSON.

FORMATO quando precisa de informação:
{"pronto": false, "pergunta": "Qual é a área total em m² da obra?"}

FORMATO quando tem informação suficiente:
{
  "pronto": true,
  "resumo": "Reforma de cozinha (15m²) e banheiro (8m²) em apartamento",
  "itens": [
    {
      "categoria": "Demolição",
      "descricao": "Demolição e retirada de revestimentos de parede e piso",
      "unidade": "m²",
      "quantidade": 23.0,
      "valor_unitario": 48.00
    }
  ],
  "observacoes": "Valores de referência SINAPI/SP — variações regionais podem ocorrer."
}

CATEGORIAS VÁLIDAS:
Demolição, Fundação, Estrutura, Alvenaria, Cobertura, Revestimentos, Piso, Hidráulica, Elétrica, Pintura, Esquadrias, Marcenaria, Limpeza, Mão de obra, Equipamentos, Outros

TABELA DE REFERÊNCIA DE PREÇOS (SINAPI SP — média 2024):
- Demolição de revestimentos: R$ 35–55/m²
- Alvenaria tijolo cerâmico: R$ 85–120/m²
- Reboco interno: R$ 35–55/m²
- Piso porcelanato (material + assentamento): R$ 120–200/m²
- Revestimento parede cerâmica: R$ 80–150/m²
- Pintura interna (2 demãos): R$ 25–45/m²
- Instalação hidráulica (por ponto): R$ 350–600/ponto
- Instalação elétrica (por ponto): R$ 200–400/ponto
- Forro de gesso: R$ 65–95/m²
- Impermeabilização: R$ 80–130/m²
- Esquadrias alumínio: R$ 450–900/m²
- Mão de obra geral (quando não embutida): 40–60% do custo de material

DIRETRIZES:
- Para reformas simples (1–2 ambientes): gere 6–12 itens detalhados.
- Para obras maiores: gere 12–20 itens, separando material e mão de obra quando relevante.
- Inclua sempre limpeza final como último item.
- Use valores intermediários da tabela como referência.
- Quantidade deve refletir a área/volume real da obra descrita.`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const { messages } = await req.json() as { messages: { role: string; content: string }[] }

    if (!messages?.length) throw new Error('messages é obrigatório')

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: SYSTEM }, ...messages],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 2000,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI error ${res.status}: ${err}`)
    }

    const oai = await res.json()
    const content = JSON.parse(oai.choices[0].message.content)

    return new Response(JSON.stringify(content), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
