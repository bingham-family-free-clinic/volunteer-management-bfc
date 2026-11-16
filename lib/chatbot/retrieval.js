import fs from 'fs'
import path from 'path'

const KNOWLEDGE_DIR = path.join(process.cwd(), 'knowledge', 'generated')

const STOP_WORDS = new Set([
  'a','an','and','are','as','at','be','by','for','from','has','he','in','is','it','its',
  'of','on','or','that','the','to','was','were','will','with','you','your','can','do',
  'does','how','if','i','me','my','we','our','us','not','no','yes','this','these','those'
])

function tokenize(text) {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && !STOP_WORDS.has(t))
}

function parseFrontMatter(text) {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''))
  let body = text
  const meta = {}
  let listKey = null
  if (lines[0] && lines[0].trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
    if (end > 0) {
      for (let i = 1; i < end; i++) {
        const line = lines[i]
        const scalar = line.match(/^([^:]+):\s*(.*)$/)
        if (scalar && scalar[2].trim() !== '') {
          meta[scalar[1].trim()] = scalar[2].trim()
          listKey = null
        } else if (scalar) {
          meta[scalar[1].trim()] = []
          listKey = scalar[1].trim()
        } else if (listKey && line.match(/^\s*-\s+/)) {
          const item = line.replace(/^\s*-\s+/, '').trim()
          if (!Array.isArray(meta[listKey])) meta[listKey] = []
          meta[listKey].push(item)
        }
      }
      body = lines.slice(end + 1).join('\n').trimStart()
    }
  }
  return { meta, body }
}

function listValues(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (!value) return []
  return value.split(',').map((v) => v.trim()).filter(Boolean)
}

// Docs are read from disk and tokenized once per server process (the knowledge
// files only change on deploy), instead of on every request.
let docsCache = null

function readDocuments() {
  const docs = []
  if (!fs.existsSync(KNOWLEDGE_DIR)) return docs
  for (const file of fs.readdirSync(KNOWLEDGE_DIR).sort()) {
    if (!file.endsWith('.md')) continue
    const text = fs.readFileSync(path.join(KNOWLEDGE_DIR, file), 'utf8')
    const { meta, body } = parseFrontMatter(text)
    const title = meta.title || path.basename(file, '.md')
    const feature = meta.feature || ''
    docs.push({
      file,
      title,
      feature,
      keywords: listValues(meta.keywords),
      related: listValues(meta.related),
      body,
      // Pre-computed token sets so scoring is O(query tokens) per doc
      keywordTokens: new Set(listValues(meta.keywords).flatMap(tokenize)),
      titleTokens: new Set(tokenize(title)),
      featureTokens: new Set(tokenize(feature)),
      filenameTokens: new Set(tokenize(path.basename(file, '.md'))),
      contentTokens: new Set(tokenize(`${title} ${body}`))
    })
  }
  return docs
}

function loadDocuments() {
  if (!docsCache) docsCache = readDocuments()
  return docsCache
}

function overlapCount(queryTokens, tokenSet) {
  let count = 0
  for (const t of queryTokens) {
    if (tokenSet.has(t)) count++
  }
  return count
}

function scoreDocument(doc, queryTokens) {
  return (
    overlapCount(queryTokens, doc.keywordTokens) * 3 +
    overlapCount(queryTokens, doc.titleTokens) * 2 +
    overlapCount(queryTokens, doc.featureTokens) * 2 +
    overlapCount(queryTokens, doc.filenameTokens) * 1 +
    overlapCount(queryTokens, doc.contentTokens) * 0.5
  )
}

function search(question, options = {}) {
  const limit = options.limit || 5
  const docs = loadDocuments()
  if (docs.length === 0) return []
  const queryTokens = [...new Set(tokenize(question))]
  return docs
    .map((doc) => ({ ...doc, score: scoreDocument(doc, queryTokens) }))
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

function expandRelated(docs, allDocs) {
  const added = new Set(docs.map((d) => d.file))
  const expanded = [...docs]

  for (const doc of docs) {
    for (const rel of doc.related) {
      const relLower = rel.toLowerCase()
      for (const candidate of allDocs) {
        if (candidate.feature.toLowerCase() === relLower && !added.has(candidate.file)) {
          added.add(candidate.file)
          expanded.push({ ...candidate, score: 0, relatedMatch: rel })
        }
      }
    }
  }

  return expanded
}

export { loadDocuments, search, expandRelated }