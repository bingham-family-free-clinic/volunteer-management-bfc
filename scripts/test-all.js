import { execSync } from 'node:child_process'

const tests = ['test-retrieval', 'test-cache', 'test-rate-limit', 'test-api']
let failed = 0

for (const name of tests) {
  console.log(`\n=== Running ${name} ===\n`)
  try {
    execSync(`node scripts/${name}.js`, { stdio: 'inherit' })
  } catch (err) {
    failed++
  }
}

console.log(`\n=== ${failed === 0 ? 'ALL TESTS PASSED' : failed + ' TEST SUITE(S) FAILED'} ===`)
process.exit(failed === 0 ? 0 : 1)
