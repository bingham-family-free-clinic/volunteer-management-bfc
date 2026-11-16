import { search, expandRelated, loadDocuments, TTLCache, createRateLimiter, logger } from '../../../lib/chatbot/index.js'

const MODEL = 'gemini-3.8-flash'
const CACHE_TTL_MS = Number(process.env.CHATBOT_CACHE_TTL_SECONDS || 3600) * 1000
const RATE_WINDOW_MS = Number(process.env.CHATBOT_RATE_WINDOW_MS || 60000)
const RATE_MAX_HITS = Number(process.env.CHATBOT_RATE_MAX_HITS || 30)

const cache = new TTLCache(CACHE_TTL_MS)
const isRateLimited = createRateLimiter(RATE_WINDOW_MS, RATE_MAX_HITS)

function geminiEndpoint(apiKey) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey || ''}`
}

function buildPrompt(question, docs) {
  const context = docs
    .map(
      (d) =>
        `Source document: ${d.file}\nTitle: ${d.title}\n${d.body.slice(0, 2500)}`
    )
    .join('\n\n---\n\n')

  return `You are an internal assistant for the BFC Volunteer Portal volunteer management platform. Answer the user's question using ONLY the provided source documents from the generated knowledge base. Do not use any outside knowledge or inspect application source code.

If the answer cannot be found in the documents, say so.

When relevant, mention which source document(s) the answer comes from.

Source documents:
${context}

User question:
${question}`
}

async function callGemini(apiKey, prompt) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    logger.info('gemini request', { model: MODEL })
    const res = await fetch(geminiEndpoint(apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          topK: 1,
          topP: 1,
          candidateCount: 1,
          maxOutputTokens: 2048
        }
      }),
      signal: controller.signal
    })
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      throw new Error(`Gemini API ${res.status}: ${err}`)
    }
    const json = await res.json()
    const text =
      json.candidates && json.candidates[0]
        ? json.candidates[0].content.parts.map((p) => p.text || '').join('')
        : ''
    logger.info('gemini response', { chars: text.length })
    return text.trim()
  } catch (err) {
    logger.error('gemini failure', { message: err.message })
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(req) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (isRateLimited(ip)) {
    logger.warn('rate limited', { ip })
    return Response.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    logger.warn('invalid json body')
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const question =
    typeof body?.question === 'string' ? body.question.trim() : ''
  if (!question) {
    logger.warn('missing question')
    return Response.json({ error: 'A question is required.' }, { status: 400 })
  }

  logger.info('chat request', { ip, questionLength: question.length })

  const cacheKey = question.toLowerCase()
  const cached = cache.get(cacheKey)
  if (cached) {
    logger.info('cache hit', { question: cacheKey.slice(0, 60) })
    return Response.json(cached)
  }

  const apiKey = process.env.GEMINI_API_KEY
  const topDocs = search(question, { limit: 4 })
  const usedDocs = topDocs.length ? expandRelated(topDocs, loadDocuments()) : []
  logger.info('retrieval', { question: cacheKey.slice(0, 60), docs: usedDocs.map((d) => d.file) })

  let answer
  if (!apiKey) {
    logger.warn('gemini not configured')
    answer =
      'The chatbot is not configured with a Gemini API key, so no answer can be generated.'
  } else if (usedDocs.length === 0) {
    answer =
      'I could not find any relevant documentation for your question in the knowledge base.'
  } else {
    try {
      const prompt = buildPrompt(question, usedDocs)
      answer = await callGemini(apiKey, prompt)
      if (!answer) {
        answer =
          'I could not generate an answer from the knowledge base at this time.'
      }
    } catch (err) {
      answer =
        'The chatbot is temporarily unavailable. Please try again later.'
    }
  }

  const response = {
    answer,
    question,
    sources: usedDocs.map((d) => d.file),
    placeholder: !apiKey
  }

  cache.set(cacheKey, response)
  logger.info('response', { question: cacheKey.slice(0, 60), sources: response.sources.length })
  return Response.json(response)
}
