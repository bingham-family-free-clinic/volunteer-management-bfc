import assert from 'node:assert'
import { search, loadDocuments } from '../lib/chatbot/retrieval.js'

const docs = loadDocuments()
assert.ok(docs.length >= 5, 'expected knowledge documents to load')

const cases = [
  { question: 'How do I handle a shift callout?', expectFile: 'scheduling.md' },
  { question: 'How do I log my hours?', expectFile: 'attendance.md' },
  { question: 'What documents are required for volunteer onboarding?', expectFile: 'volunteers.md' },
  { question: 'How do push notifications work?', expectFile: 'notifications.md' },
  { question: 'Who can access the admin dashboard?', expectFile: 'permissions.md' },
  { question: 'What are the shift windows?', expectFile: 'scheduling.md' }
]

let failures = 0
for (const { question, expectFile } of cases) {
  const results = search(question, { limit: 3 })
  assert.ok(results.length > 0, `no results for: ${question}`)
  const top = results[0].file
  const inTop3 = results.some((r) => r.file === expectFile)
  if (top !== expectFile || !inTop3) {
    console.error(`FAIL retrieval: Q="${question}" expected ${expectFile} in top 3, got ${results.map((r) => r.file)}`)
    failures++
  } else {
    console.log(`PASS retrieval: Q="${question}" -> ${top}`)
  }
}

assert.equal(failures, 0, `${failures} retrieval test(s) failed`)
console.log('All retrieval tests passed')
