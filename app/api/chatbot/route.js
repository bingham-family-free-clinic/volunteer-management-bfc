import { search, expandRelated, loadDocuments, TTLCache, createRateLimiter, logger } from '../../../lib/chatbot/index.js'

const MODEL = 'gemini-3.6-flash'
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

function classifyError(err) {
  const message = (err && err.message) || String(err)
  if (message.includes('Gemini API 429')) return ERROR_RATE_LIMIT
  if (message.includes('Gemini API 401') || message.includes('API_KEY_INVALID')) return ERROR_CONFIG
  if (message.includes('Gemini API 403')) return ERROR_CONFIG
  if (message.includes('Gemini API 5') || message.includes('fetch') || message.includes('Abort')) return ERROR_GEMINI
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
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    logger.info('gemini request', { model: MODEL, ...meta })
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
      logger.error('gemini api error', { ...meta, status: res.status, body: err })
      throw new Error(`Gemini API ${res.status}: ${err}`)
    }
    const json = await res.json()
    const text =
      json.candidates && json.candidates[0]
        ? json.candidates[0].content.parts.map((p) => p.text || '').join('')
        : ''
    logger.info('gemini response', { ...meta, chars: text.length })
    return text.trim()
  } catch (err) {
    logger.error('gemini failure', { ...meta, message: err.message, code: classifyError(err) })
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

  const cacheKey = question.toLowerCase()
  const cached = cache.get(cacheKey)
  if (cached) {
    logger.info('cache hit', meta)
    return Response.json(cached)
  }

  const apiKey = process.env.GEMINI_API_KEY
  const topDocs = search(question, { limit: 4 })
  const usedDocs = topDocs.length ? expandRelated(topDocs, loadDocuments()) : []
  logger.info('retrieval', { ...meta, docs: usedDocs.map((d) => d.file) })

  if (!apiKey) {
    logger.warn('gemini not configured', meta)
    const response = {
      error: userMessageFor(ERROR_CONFIG),
      errorCode: ERROR_CONFIG,
      question,
      sources: [],
      placeholder: true
    }
    cache.set(cacheKey, response)
    logger.info('response', { ...meta, errorCode: ERROR_CONFIG })
    return Response.json(response)
  }

  if (usedDocs.length === 0) {
    logger.info('no relevant documents', meta)
    const response = {
      error: userMessageFor(ERROR_RETRIEVAL),
      errorCode: ERROR_RETRIEVAL,
      question,
      sources: [],
      placeholder: false
    }
    cache.set(cacheKey, response)
    logger.info('response', { ...meta, errorCode: ERROR_RETRIEVAL })
    return Response.json(response)
  }

  try {
    const prompt = buildPrompt(question, usedDocs)
    const answer = await callGemini(apiKey, prompt, meta)
    if (!answer) {
      logger.warn('empty gemini answer', meta)
      const response = {
        answer:
          'I could not generate an answer from the knowledge base at this time.',
        question,
        sources: usedDocs.map((d) => d.file),
        placeholder: false
      }
      cache.set(cacheKey, response)
      logger.info('response', { ...meta, sources: response.sources.length })
      return Response.json(response)
    }

    const response = {
      answer,
      question,
      sources: usedDocs.map((d) => d.file),
      placeholder: false
    }

    cache.set(cacheKey, response)
    logger.info('response', { ...meta, sources: response.sources.length })
    return Response.json(response)
  } catch (err) {
    const code = classifyError(err)
    logger.error('chat failed', { ...meta, code, message: err.message })
    const response = {
      error: userMessageFor(code),
      errorCode: code,
      question,
      sources: usedDocs.map((d) => d.file),
      placeholder: false
    }
    cache.set(cacheKey, response)
    logger.info('response', { ...meta, errorCode: code })
    return Response.json(response, { status: code === ERROR_RATE_LIMIT ? 429 : 200 })
  }
}
