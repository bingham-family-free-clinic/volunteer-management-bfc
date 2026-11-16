import assert from 'node:assert'
import { createRateLimiter } from '../lib/chatbot/rateLimit.js'

const isRateLimited = createRateLimiter(1000, 3)

let hits = 0
let limited = 0
for (let i = 0; i < 5; i++) {
  if (isRateLimited('ip1')) limited++
  else hits++
}
assert.equal(hits, 3, 'should allow maxHits requests within window')
assert.equal(limited, 2, 'should limit requests beyond maxHits')

const isRateLimited2 = createRateLimiter(50, 1)
assert.ok(!isRateLimited2('ip2'), 'first request not limited')
assert.ok(isRateLimited2('ip2'), 'second request immediately limited')

console.log('All rate limit tests passed')
