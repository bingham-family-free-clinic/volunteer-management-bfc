import 'server-only'
import { createPlaceholderResponse } from '../../../lib/chatbot'

export async function POST(req) {
  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const question = typeof body?.question === 'string' ? body.question.trim() : ''
  if (!question) {
    return Response.json({ error: 'A question is required.' }, { status: 400 })
  }

  return Response.json(createPlaceholderResponse(question))
}
