export class TTLCache {
  constructor(ttlMs) {
    this.ttlMs = ttlMs
    this.store = new Map()
  }

  get(key) {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiry) {
      this.store.delete(key)
      return null
    }
    return entry.value
  }

  set(key, value) {
    this.store.set(key, { value, expiry: Date.now() + this.ttlMs })
  }

  has(key) {
    return this.get(key) !== null
  }

  size() {
    return this.store.size
  }
}
