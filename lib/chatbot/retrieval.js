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

function loadDocuments() {
  const docs = []
  if (!fs.existsSync(KNOWLEDGE_DIR)) return docs
  for (const file of fs.readdirSync(KNOWLEDGE_DIR).sort()) {
    if (!file.endsWith('.md')) continue
    const full = path.join(KNOWLEDGE_DIR, file)
    const text = fs.readFileSync(full, 'utf8')
    const { meta, body } = parseFrontMatter(text)
    const title = meta.title || path.basename(file, '.md')
    const keywords = listValues(meta.keywords)
    const related = listValues(meta.related)
    const contentTokens = tokenize(`${title} ${body}`)
    docs.push({
      file,
      title,
      feature: meta.feature || '',
      keywords,
      related,
      body,
      contentTokens,
      filenameTokens: tokenize(path.basename(file, '.md'))
    })
  }
  return docs
}

function overlapCount(queryTokens, docTokens) {
  let count = 0
  for (const t of queryTokens) {
    if (docTokens.includes(t)) count++
  }
  return count
}

function scoreDocument(doc, queryTokens) {
  let score = 0
  const titleTokens = tokenize(doc.title)
  const featureTokens = tokenize(doc.feature)

  score += overlapCount(queryTokens, doc.keywords.map(tokenize).flat()) * 3
  score += overlapCount(queryTokens, titleTokens) * 2
  score += overlapCount(queryTokens, featureTokens) * 2
  score += overlapCount(queryTokens, doc.filenameTokens) * 1
  score += overlapCount(queryTokens, doc.contentTokens) * 0.5

  return score
}

function search(question, options = {}) {
  const limit = options.limit || 5
  const docs = loadDocuments()
  if (docs.length === 0) return []
  const queryTokens = tokenize(question)
  const scored = docs
    .map((doc) => ({ ...doc, score: scoreDocument(doc, queryTokens) }))
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
  return scored
}

function expandRelated(docs, allDocs) {
  const byFeature = new Map()
  for (const doc of allDocs) byFeature.set(doc.feature, doc)

  const added = new Set(docs.map((d) => d.file))
  const expanded = [...docs]

  for (const doc of docs) {
    for (const rel of doc.related) {
      for (const candidate of allDocs) {
        if (candidate.feature.toLowerCase() === rel.toLowerCase() && !added.has(candidate.file)) {
          added.add(candidate.file)
          expanded.push({ ...candidate, score: 0, relatedMatch: rel })
        }
      }
    }
  }

  return expanded
}

export { loadDocuments, search, expandRelated }
