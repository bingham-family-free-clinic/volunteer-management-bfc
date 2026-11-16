export function createRateLimiter(windowMs, maxHits) {
  const hits = new Map()
  return function isRateLimited(ip) {
    const now = Date.now()
    const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs)
    arr.push(now)
    hits.set(ip, arr)
    return arr.length > maxHits
  }
}
