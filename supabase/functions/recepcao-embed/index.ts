// Recepção de Documentos — embeddings da OpenAI
// Body: { texts: string[] }
// Retorno: { embeddings: number[][], modelo, custo_cents }
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')!
const MODEL = Deno.env.get('OPENAI_EMBED_MODEL') ?? 'text-embedding-3-small'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // JWT validation — block unauthenticated calls to prevent API credit abuse
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Missing or invalid Authorization header' }),
      { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized: invalid or expired token' }),
      { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const { texts } = await req.json()
    if (!Array.isArray(texts) || texts.length === 0) {
      return new Response(JSON.stringify({ error: 'texts deve ser array nao vazio' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    if (texts.length > 500) {
      return new Response(JSON.stringify({ error: 'maximo 500 textos por chamada' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const resp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, input: texts }),
    })
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`OpenAI ${resp.status}: ${text}`)
    }
    const data = await resp.json()
    const embeddings = data.data.map((d: any) => d.embedding as number[])

    // text-embedding-3-small: $0.02/M tokens
    const inCost = (data.usage.prompt_tokens / 1_000_000) * 0.020
    const custo_cents = Math.round(inCost * 100 * 100) / 100

    return new Response(
      JSON.stringify({ embeddings, modelo: MODEL, custo_cents, usage: data.usage }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
