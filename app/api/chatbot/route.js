import { search, expandRelated, loadDocuments, TTLCache, createRateLimiter, logger } from '../../../lib/chatbot/index.js'

// fs is used for the knowledge base, so this must run on the Node runtime.
export const runtime = 'nodejs'
// Must be longer than GEMINI_TIMEOUT_MS so the 30s abort fires (and returns a
// friendly error) before the platform kills the function.
export const maxDuration = 40

const MODEL = process.env.CHATBOT_MODEL || 'gemini-3.5-flash-lite'
// Gemini 3.x models "think" before answering. For doc Q&A, low is plenty and much faster.
const THINKING_LEVEL = process.env.CHATBOT_THINKING_LEVEL || 'low'
const GEMINI_TIMEOUT_MS = Number(process.env.CHATBOT_TIMEOUT_MS || 30000)
const CACHE_TTL_MS = Number(process.env.CHATBOT_CACHE_TTL_SECONDS || 3600) * 1000
const RATE_WINDOW_MS = Number(process.env.CHATBOT_RATE_WINDOW_MS || 60000)
const RATE_MAX_HITS = Number(process.env.CHATBOT_RATE_MAX_HITS || 30)

const cache = new TTLCache(CACHE_TTL_MS)
const isRateLimited = createRateLimiter(RATE_WINDOW_MS, RATE_MAX_HITS)

const ERROR_CONFIG = 'config'
const ERROR_RETRIEVAL = 'retrieval'
const ERROR_RATE_LIMIT = 'rate_limit'
const ERROR_GEMINI = 'gemini'
const ERROR_VALIDATION = 'validation'
const ERROR_UNKNOWN = 'unknown'

function geminiEndpoint() {
  return `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
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

function classifyError(err) {
  if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) return ERROR_GEMINI
  const message = (err && err.message) || String(err)
  if (message.includes('Gemini API 429')) return ERROR_RATE_LIMIT
  if (message.includes('Gemini API 401') || message.includes('API_KEY_INVALID')) return ERROR_CONFIG
  if (message.includes('Gemini API 403')) return ERROR_CONFIG
  if (message.includes('Gemini API 5') || /fetch|abort/i.test(message)) return ERROR_GEMINI
  if (message.includes('Gemini API')) return ERROR_GEMINI
  return ERROR_UNKNOWN
}

function userMessageFor(code) {
  switch (code) {
    case ERROR_CONFIG:
      return 'The chatbot is not configured. A Gemini API key is missing — please contact your administrator to set GEMINI_API_KEY.'
    case ERROR_RETRIEVAL:
      return "I couldn't find any relevant documentation for your question in the knowledge base. Try rephrasing or asking about a different topic (scheduling, attendance, volunteers, messaging, or permissions)."
    case ERROR_RATE_LIMIT:
      return 'You have sent too many requests. Please wait a moment and try again.'
    case ERROR_GEMINI:
      return 'The AI service is having trouble right now. Please try again in a moment.'
    case ERROR_VALIDATION:
      return 'Please enter a question before asking.'
    default:
      return 'Something went wrong while processing your question. Please try again.'
  }
}

async function callGemini(apiKey, prompt, meta) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)
  const t0 = Date.now()
  try {
    logger.info('gemini request', { model: MODEL, thinking: THINKING_LEVEL, promptChars: prompt.length, ...meta })
    const res = await fetch(geminiEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Key in a header rather than the URL so it never lands in logs
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // No temperature/topK/topP overrides: Gemini 3 models work best at their defaults.
        generationConfig: {
          candidateCount: 1,
          maxOutputTokens: 2048,
          thinkingConfig: { thinkingLevel: THINKING_LEVEL }
        }
      }),
      signal: controller.signal
    })
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      logger.error('gemini api error', { ...meta, status: res.status, body: err, ms: Date.now() - t0 })
      throw new Error(`Gemini API ${res.status}: ${err}`)
    }
    const json = await res.json()
    // Skip "thought" parts so only the final answer is returned
    const parts = json.candidates?.[0]?.content?.parts || []
    const text = parts.filter((p) => !p.thought).map((p) => p.text || '').join('')
    logger.info('gemini response', { ...meta, chars: text.length, ms: Date.now() - t0 })
    return text.trim()
  } catch (err) {
    logger.error('gemini failure', { ...meta, message: err.message, code: classifyError(err), ms: Date.now() - t0 })
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function errorResponse(code, status) {
  return Response.json(
    {
      error: userMessageFor(code),
      errorCode: code,
      question: '',
      sources: [],
      placeholder: false
    },
    { status }
  )
}

export async function POST(req) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const meta = { ip }

  if (isRateLimited(ip)) {
    logger.warn('rate limited', meta)
    return errorResponse(ERROR_RATE_LIMIT, 429)
  }

  let body
  try {
    body = await req.json()
  } catch {
    logger.warn('invalid json body', meta)
    return errorResponse(ERROR_VALIDATION, 400)
  }

  const question =
    typeof body?.question === 'string' ? body.question.trim() : ''
  if (!question) {
    logger.warn('missing question', meta)
    return errorResponse(ERROR_VALIDATION, 400)
  }

  meta.question = question.slice(0, 120)
  logger.info('chat request', meta)

  const cacheKey = question.toLowerCase().replace(/\s+/g, ' ')
  const cached = cache.get(cacheKey)
  if (cached) {
    logger.info('cache hit', meta)
    return Response.json(cached)
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    // Not cached: once the key is set, answers should work immediately.
    logger.warn('gemini not configured', meta)
    return Response.json({
      error: userMessageFor(ERROR_CONFIG),
      errorCode: ERROR_CONFIG,
      question,
      sources: [],
      placeholder: true
    })
  }

  const topDocs = search(question, { limit: 4 })
  const usedDocs = topDocs.length ? expandRelated(topDocs, loadDocuments()) : []
  logger.info('retrieval', { ...meta, docs: usedDocs.map((d) => d.file) })

  if (usedDocs.length === 0) {
    logger.info('no relevant documents', meta)
    const response = {
      error: userMessageFor(ERROR_RETRIEVAL),
      errorCode: ERROR_RETRIEVAL,
      question,
      sources: [],
      placeholder: false
    }
    cache.set(cacheKey, response) // deterministic, safe to cache
    return Response.json(response)
  }

  const sources = usedDocs.map((d) => d.file)

  try {
    const answer = await callGemini(apiKey, buildPrompt(question, usedDocs), meta)
    if (!answer) {
      // Empty answers are usually transient; don't cache them
      logger.warn('empty gemini answer', meta)
      return Response.json({
        answer: 'I could not generate an answer from the knowledge base at this time. Please try again.',
        question,
        sources,
        placeholder: false
      })
    }

    const response = { answer, question, sources, placeholder: false }
    cache.set(cacheKey, response) // only successful answers are cached
    logger.info('response', { ...meta, sources: sources.length })
    return Response.json(response)
  } catch (err) {
    // Errors (timeouts, 5xx, 429) are NOT cached, so a retry actually retries.
    const code = classifyError(err)
    logger.error('chat failed', { ...meta, code, message: err.message })
    return Response.json(
      {
        error: userMessageFor(code),
        errorCode: code,
        question,
        sources,
        placeholder: false
      },
      { status: code === ERROR_RATE_LIMIT ? 429 : 200 }
    )
  }
}