const fs = require('fs')
const path = require('path')

const root = process.cwd()
const manifestPath = path.join(root, 'manifest.json')
const genDir = path.join(root, 'knowledge', 'generated')
const today = new Date().toISOString().slice(0, 10)
const apiKey = process.env.GEMINI_API_KEY
const model = 'gemini-3.5-flash-lite'
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey || ''}`

function slug(feature) {
  return feature.toLowerCase().replace(/\s+/g, '-')
}

function matchSegment(pattern, segment) {
  const regex = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/]*') +
      '$'
  )
  return regex.test(segment)
}

function matchGlob(pattern, filePath) {
  const pParts = pattern.split('/')
  const fParts = filePath.split('/')
  return matchParts(pParts, fParts, 0, 0)
}

function matchParts(pParts, fParts, pi, fi) {
  while (pi < pParts.length) {
    const p = pParts[pi]
    if (p === '**') {
      for (let i = fi; i <= fParts.length; i++) {
        if (matchParts(pParts, fParts, pi + 1, i)) return true
      }
      return false
    }
    if (fi >= fParts.length) return false
    if (!matchSegment(p, fParts[fi])) return false
    pi++
    fi++
  }
  return fi === fParts.length
}

function readFileSafe(rel) {
  try {
    return fs.readFileSync(path.join(root, rel), 'utf8')
  } catch {
    return null
  }
}

function collectFiles(patterns) {
  const files = []
  for (const pattern of patterns) {
    if (!pattern.includes('*') && !pattern.includes('?')) {
      if (fs.existsSync(path.join(root, pattern))) files.push(pattern)
      continue
    }
    walk(root, '', pattern, files)
  }
  return [...new Set(files)].sort()
}

function walk(dir, rel, pattern, files) {
  let entries
  try {
    entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      walk(path.join(dir, entry.name), relPath, pattern, files)
    } else if (matchGlob(pattern, relPath)) {
      files.push(relPath)
    }
  }
}

function fileContext(files) {
  let parts = []
  for (const file of files) {
    const content = readFileSafe(file) || ''
    const capped = content.slice(0, 3000)
    parts.push(`### ${file}\n\`\`\`\n${capped}\n\`\`\``)
  }
  return parts.join('\n\n')
}

function buildPrompt(feature, files, date) {
  return `You are a technical writer for the BFC Volunteer Portal, a volunteer management platform. Generate a Markdown knowledge-base document for the feature "${feature}".

Source files (project source of truth):
${fileContext(files)}

Write ONLY the Markdown document. Include a YAML front matter block with exactly these keys: title, feature, keywords (list), related (list), last_generated (YYYY-MM-DD). Then include these sections: Purpose, Pages, Workflows, Business rules, User roles, Frequently asked questions, Related documents.

Explain system behavior from the user's and organization's perspective, not implementation details. Do not reference file paths or implementation internals. Use ${date} as last_generated. Be concise and deterministic.`
}

function stripFences(text) {
  return text.replace(/```markdown\s*/g, '').replace(/```\s*$/g, '').trim()
}

async function callGemini(prompt) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          topK: 1,
          topP: 1,
          candidateCount: 1,
          maxOutputTokens: 4096
        }
      }),
      signal: controller.signal
    })
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      throw new Error(`Gemini API ${res.status}: ${err}`)
    }
    const json = await res.json()
    const text =
      json.candidates && json.candidates[0]
        ? json.candidates[0].content.parts.map((p) => p.text || '').join('')
        : ''
    return stripFences(text)
  } finally {
    clearTimeout(timer)
  }
}

function ensureFrontMatter(doc, feature, date) {
  const lines = doc.split('\n')
  let body = doc
  let fm = {}
  if (lines[0] && lines[0].trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
    if (end > 0) {
      for (let i = 1; i < end; i++) {
        const m = lines[i].match(/^([^:]+):\s*(.*)$/)
        if (m) fm[m[1].trim()] = m[2].trim()
      }
      body = lines.slice(end + 1).join('\n').trimStart()
    }
  }
  const title = fm.title || feature
  const keywords = fm.keywords || []
  const related = fm.related || []
  const front = [
    '---',
    `title: ${title}`,
    `feature: ${feature}`,
    `keywords: ${Array.isArray(keywords) ? keywords.join(', ') : keywords}`,
    `related: ${Array.isArray(related) ? related.join(', ') : related}`,
    `last_generated: ${date}`,
    '---',
    ''
  ]
  return front.join('\n') + body
}

function stubDoc(feature, date, reason) {
  return `---
title: ${feature}
feature: ${feature}
keywords: []
related: []
last_generated: ${date}
---

# Purpose
Documentation for the ${feature} feature could not be generated: ${reason}.

# Pages
- Source files for this feature were reviewed, but generated Markdown is unavailable without a configured Gemini API key.

# Workflows
- See the application source files for workflow details.

# Business rules
- See the application source files for business rules.

# User roles
- See the application source files for user roles.

# Frequently asked questions
- No questions documented yet.

# Related documents
- None yet.
`
}

function shouldSkip(feature, files) {
  const out = path.join(genDir, `${slug(feature)}.md`)
  if (!fs.existsSync(out)) return false
  const content = fs.readFileSync(out, 'utf8')
  const match = content.match(/last_generated:\s*(\S+)/)
  const last = match ? match[1] : null
  if (!last) return false
  const lastTime = new Date(`${last}T00:00:00`).getTime()
  if (isNaN(lastTime)) return false
  for (const file of files) {
    try {
      const stat = fs.statSync(path.join(root, file))
      if (stat.mtimeMs > lastTime) return false
    } catch {}
  }
  return true
}

async function main() {
  const args = process.argv.slice(2)
  let changedFile = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--changed-file' && args[i + 1]) {
      changedFile = args[i + 1]
      i++
    }
  }

  if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true })
  if (!fs.existsSync(manifestPath)) {
    console.error('manifest.json not found')
    process.exit(1)
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const results = []

  let targetFeatures = null
  if (changedFile) {
    const changed = fs
      .readFileSync(changedFile, 'utf8')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    targetFeatures = new Set()
    for (const [feature, patterns] of Object.entries(manifest)) {
      if (patterns.some((p) => changed.some((f) => matchGlob(p, f)))) {
        targetFeatures.add(feature)
      }
    }
    results.push(`[affected] ${[...targetFeatures].join(', ') || '(none)'}`)
  }

  for (const [feature, patterns] of Object.entries(manifest)) {
    const files = collectFiles(patterns).filter((f) => fs.existsSync(path.join(root, f)))
    if (files.length === 0) {
      results.push(`[skip] ${feature}: no source files found`)
      continue
    }
    if (targetFeatures) {
      if (!targetFeatures.has(feature)) {
        results.push(`[skip] ${feature}: not affected by changed files`)
        continue
      }
    } else if (shouldSkip(feature, files)) {
      results.push(`[skip] ${feature}: unaffected (${files.length} source files)`)
      continue
    }

    let doc
    if (!apiKey) {
      doc = stubDoc(feature, today, 'GEMINI_API_KEY is not configured')
      results.push(`[stub] ${feature}: generated placeholder (${files.length} source files)`)
    } else {
      try {
        const prompt = buildPrompt(feature, files, today)
        const generated = await callGemini(prompt)
        doc = generated ? ensureFrontMatter(generated, feature, today) : stubDoc(feature, today, 'empty Gemini response')
        results.push(`[write] ${feature}: regenerated (${files.length} source files)`)
      } catch (err) {
        doc = stubDoc(feature, today, err.message)
        results.push(`[error] ${feature}: ${err.message}`)
      }
    }

    fs.writeFileSync(path.join(genDir, `${slug(feature)}.md`), doc + '\n', 'utf8')
  }

  console.log(results.join('\n'))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
