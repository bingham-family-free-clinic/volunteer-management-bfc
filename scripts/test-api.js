import assert from 'node:assert'

function mockRequest(body, ip = '127.0.0.1') {
  return {
    json: async () => body,
    headers: {
      get: (name) => (name === 'x-forwarded-for' ? ip : undefined)
    }
  }
}

import { POST } from '../app/api/chatbot/route.js'

async function run() {
  const res = await POST(mockRequest({ question: 'How do I handle a shift callout?' }))
  assert.equal(res.status, 200, 'valid question should return 200')
  const json = await res.json()
  assert.ok(typeof json.answer === 'string', 'answer should be a string')
  assert.ok(Array.isArray(json.sources), 'sources should be an array')
  assert.ok(typeof json.question === 'string', 'question should be a string')
  assert.ok(typeof json.placeholder === 'boolean', 'placeholder should be a boolean')
  assert.ok(json.sources.length > 0, 'should return at least one source')
  assert.ok(json.sources.includes('scheduling.md'), 'should include scheduling.md as a source')
  console.log('PASS api: valid question shape and sources')

  const empty = await POST(mockRequest({}))
  assert.equal(empty.status, 400, 'missing question should return 400')

  const bad = await POST(mockRequest(null, '127.0.0.1'))
  assert.equal(bad.status, 400, 'null body should return 400')

  console.log('All API tests passed')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
