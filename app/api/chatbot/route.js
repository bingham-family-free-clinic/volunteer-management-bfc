import 'server-only'
import { search, expandRelated, loadDocuments } from '../../../lib/chatbot'

const MODEL = 'gemini-1.5-flash'

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
    return (
      json.candidates && json.candidates[0]
        ? json.candidates[0].content.parts.map((p) => p.text || '').join('')
        : ''
    ).trim()
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(req) {
  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const question =
    typeof body?.question === 'string' ? body.question.trim() : ''
  if (!question) {
    return Response.json({ error: 'A question is required.' }, { status: 400 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  const topDocs = search(question, { limit: 4 })
  const usedDocs = topDocs.length ? expandRelated(topDocs, loadDocuments()) : []

  let answer
  if (!apiKey) {
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
      answer = `The chatbot encountered an error: ${err.message}`
    }
  }

  return Response.json({
    answer,
    question,
    sources: usedDocs.map((d) => d.file),
    placeholder: !apiKey
  })
}
