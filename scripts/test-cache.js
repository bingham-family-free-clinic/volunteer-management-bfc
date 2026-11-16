import assert from 'node:assert'
import { TTLCache } from '../lib/chatbot/cache.js'

const cache = new TTLCache(50)

cache.set('a', 1)
assert.equal(cache.get('a'), 1, 'get should return set value')
assert.ok(cache.has('a'), 'has should be true after set')

cache.set('a', 2)
assert.equal(cache.get('a'), 2, 'set should overwrite value')

assert.equal(cache.get('missing'), null, 'get missing should return null')
assert.ok(!cache.has('missing'), 'has missing should be false')

assert.equal(cache.size(), 1, 'size should be 1')

await new Promise((r) => setTimeout(r, 100))
assert.equal(cache.get('a'), null, 'expired entry should return null')
assert.ok(!cache.has('a'), 'has expired should be false')
assert.equal(cache.size(), 0, 'size should be 0 after expiry')

console.log('All cache tests passed')
