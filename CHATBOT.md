# BFC Volunteer Portal — Chatbot Module

The AI chatbot is an internal feature of the BFC Volunteer Portal volunteer management platform. It answers questions about clinic volunteer operations using a generated Markdown knowledge base. The chatbot is not a standalone service or separate repository; it lives inside this application and is only accessible through it.

## Table of Contents

- [Architecture overview](#architecture-overview)
- [Module structure](#module-structure)
- [Environment variables](#environment-variables)
- [Knowledge generation workflow](#knowledge-generation-workflow)
- [GitHub Actions automation](#github-actions-automation)
- [Retrieval engine](#retrieval-engine)
- [Chat endpoint](#chat-endpoint)
- [Performance](#performance)
- [Testing](#testing)
- [Design decisions](#design-decisions)
- [Troubleshooting](#troubleshooting)
- [Deployment](#deployment)

---

## Architecture overview

The volunteer management application is both the application and the source of truth. The chatbot is an internal module of that application. The chatbot consumes only the generated Markdown knowledge base stored under `knowledge/generated/`; it never indexes or searches application source code at runtime.

Data flow:

```
User question
      ↓
POST /api/chatbot  (Next.js API route)
      ↓
Retrieval engine (keyword + metadata + related-doc scoring)
      ↓
Gemini Flash prompt built from top source documents
      ↓
Gemini Flash API
      ↓
Response with source document names
```

The completed system requires only:

- GitHub
- GitHub Actions
- Gemini Flash API
- Vercel

No vector databases, embeddings, LangChain, LlamaIndex, Pinecone, Chroma, or similar frameworks are used.

---

## Module structure

```
app/
    api/chatbot/
        route.js            # POST /api/chatbot endpoint
lib/
    chatbot/
        index.js            # public exports (retrieval + perf modules)
        retrieval.js        # lightweight retrieval engine
        cache.js            # TTLCache with configurable expiration
        rateLimit.js        # per-IP in-memory rate limiter
        logger.js           # structured JSON logger
knowledge/
    generated/              # auto-generated Markdown knowledge base
    database/               # (future) database-level docs
    architecture/           # (future) architecture docs
    manual/                 # (future) manual/procedure docs
scripts/
    generate-knowledge.js   # documentation generator
    test-retrieval.js       # retrieval quality tests
    test-cache.js           # cache unit tests
    test-rate-limit.js      # rate limiter unit tests
    test-api.js             # chat API unit tests
    test-all.js             # runs all chatbot tests
manifest.json               # feature ownership for knowledge generation
```

---

## Environment variables

| Variable | Scope | Required | Default | Purpose |
|---|---|---|---|---|
| `GEMINI_API_KEY` | Server only | Yes (for real answers) | — | Gemini Flash API key used by `/api/chatbot` |
| `CHATBOT_CACHE_TTL_SECONDS` | Server only | No | `3600` | In-memory response cache expiration in seconds |
| `CHATBOT_RATE_WINDOW_MS` | Server only | No | `60000` | Rate limiting window in milliseconds |
| `CHATBOT_RATE_MAX_HITS` | Server only | No | `30` | Max requests per IP per window |
| `CHATBOT_LOG_LEVEL` | Server only | No | `info` | Structured log level (`error`, `warn`, `info`, `debug`) |

On Vercel, set `GEMINI_API_KEY` and any overrides in the project settings. All other variables are optional with safe defaults.

---

## Knowledge generation workflow

The knowledge base is generated from application source files described in `manifest.json`. Each manifest entry maps a feature name to a list of file glob patterns owned by that feature.

### Generator (`scripts/generate-knowledge.js`)

- Reads `manifest.json`.
- For each feature, collects matching source files using glob patterns.
- Sends feature context (concatenated source file contents) to Gemini Flash with a deterministic prompt.
- Writes Markdown into `knowledge/generated/<feature>.md` with YAML front matter (`title`, `feature`, `keywords`, `related`, `last_generated`) and sections: Purpose, Pages, Workflows, Business rules, User roles, Frequently asked questions, Related documents.
- Does not regenerate unaffected features: it compares each source file's mtime against the doc's `last_generated` and skips unchanged features.
- Degrades gracefully: without `GEMINI_API_KEY` it writes a placeholder doc so the module still loads and builds.

### Manifest example

```json
{
  "Scheduling": [
    "app/admin/page.js",
    "components/Waitlist.js",
    "lib/scheduleUtils.js"
  ],
  "Attendance": [
    "app/admin/page.js",
    "app/volunteer/page.js"
  ]
}
```

Run locally:

```bash
node scripts/generate-knowledge.js
```

Output example:

```
[skip] Scheduling: unaffected (6 source files)
[write] Attendance: regenerated (4 source files)
```

Use `--changed-file <path>` to regenerate only features owning files listed in the given file (used by GitHub Actions):

```bash
printf 'app/admin/page.js\n' > /tmp/changed.txt
node scripts/generate-knowledge.js --changed-file /tmp/changed.txt
```

---

## GitHub Actions automation

`.github/workflows/knowledge.yml` runs on every push:

1. Determines changed files using `git diff` between the push `before` and `after` SHAs.
2. Loads `manifest.json`.
3. Determines affected features by matching changed files to feature-owned globs.
4. Regenerates only affected features via `node scripts/generate-knowledge.js --changed-file /tmp/changed-files.txt`.
5. Commits and pushes updated Markdown under `knowledge/generated/`.
6. Skips the commit entirely if nothing changed, minimizing Gemini API usage and avoiding self-triggering loops (committing only Markdown does not re-run the workflow on docs-only changes because the workflow triggers on push, but no new code changes occur).

Required repository secret:

- `GEMINI_API_KEY` — Gemini Flash API key.

The workflow uses `GITHUB_TOKEN` (automatically provided) for the authenticated push.

---

## Retrieval engine

`lib/chatbot/retrieval.js` implements lightweight retrieval without embeddings or a vector database.

### Scoring

Each document is scored against the user question using:

- **Filename matching** — question tokens appearing in the document filename.
- **Keyword scoring** — overlap between question tokens and document `keywords` front matter (weighted highest).
- **Metadata scoring** — overlap with document `title` and `feature` front matter.
- **Content scoring** — overlap with document body text (weighted lowest).
- **Related-document expansion** — top documents' `related` features are appended to the result set so context is not lost across feature boundaries.

`search(question, { limit })` returns the top-ranked documents. `expandRelated(docs, allDocs)` grows a result set using `related` lists.

The engine reads only files under `knowledge/generated/`; it never reads application source code at runtime.

---

## Chat endpoint

`POST /api/chatbot`

Input:

```json
{
  "question": "..."
}
```

Workflow:

1. Validate the request body (must contain a non-empty `question`).
2. Apply per-IP rate limiting (429 if exceeded).
3. Check the in-memory response cache (cache hit returns immediately).
4. Retrieve the most relevant Markdown documents.
5. Expand to related documentation when appropriate.
6. Build a Gemini Flash prompt using only the retrieved documents.
7. Send the prompt to Gemini Flash.
8. Return `{ answer, question, sources, placeholder }`, where `sources` lists the document file names used.

Output example:

```json
{
  "answer": "When a volunteer cannot work a shift they submit a callout...",
  "question": "How do I handle a shift callout?",
  "sources": ["scheduling.md", "attendance.md"],
  "placeholder": false
}
```

The endpoint is intended only for use by the volunteer management application and is not designed as a public API.

---

## Performance

- **In-memory cache** — `TTLCache` keyed by normalized question. TTL configured via `CHATBOT_CACHE_TTL_SECONDS` (default 3600 seconds). Repeated questions return without calling Gemini.
- **Configurable cache expiration** — via `CHATBOT_CACHE_TTL_SECONDS`.
- **Rate limiting** — per-IP in-memory limiter (`CHATBOT_RATE_WINDOW_MS`, `CHATBOT_RATE_MAX_HITS`; defaults 60s / 30 requests). Returns HTTP 429 when exceeded.
- **Graceful Gemini failures** — if Gemini is unavailable or returns an error, the endpoint returns a degraded answer ("The chatbot is temporarily unavailable. Please try again later.") instead of crashing. If `GEMINI_API_KEY` is not configured, it returns a placeholder message.
- **Logging** — structured JSON logger (`lib/chatbot/logger.js`) with level filtering via `CHATBOT_LOG_LEVEL` (default `info`). Logs chat requests, retrieval, cache hits/misses, Gemini requests/responses/failures, and rate-limit events.

---

## Testing

Run all chatbot tests:

```bash
npm test
```

Test suites:

- `scripts/test-retrieval.js` — retrieval quality for representative questions across scheduling, attendance, volunteers, notifications, and permissions.
- `scripts/test-cache.js` — cache set/get/overwrite/missing/expiry/size.
- `scripts/test-rate-limit.js` — rate limiter max-hits and window behavior.
- `scripts/test-api.js` — API response shape, source inclusion, and 400 validation.

All suites must pass; `npm test` exits non-zero on failure.

---

## Design decisions

- **No vector database or embeddings** — retrieval uses keyword and metadata scoring over Markdown documents, keeping the system simple, dependency-free, and easy to debug.
- **Knowledge base as source of truth for answers** — the chatbot never inspects application source code at runtime; it only reads generated Markdown under `knowledge/generated/`.
- **Internal-only module** — the chatbot is part of the volunteer management application, not a standalone service. The `/api/chatbot` route is not documented as a public API.
- **Deterministic generation** — Gemini prompts use `temperature: 0`, `topK: 1`, `topP: 1` so documentation remains consistent across runs.
- **Minimize Gemini API usage** — the generator skips unaffected features, and GitHub Actions regenerates only features owning changed files.
- **Graceful degradation** — the chatbot keeps operating (placeholder or degraded message) when Gemini is unavailable or unconfigured.
- **No new dependencies** — tests use Node's built-in `assert`; the generator uses `fetch` (available in Node 18+).
- **Free-tier compatible** — requires only GitHub, GitHub Actions, Gemini Flash, and Vercel.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `placeholder: true` in responses | `GEMINI_API_KEY` not set | Set `GEMINI_API_KEY` in Vercel or local env |
| HTTP 429 | Rate limit exceeded | Wait for the window to reset, or raise `CHATBOT_RATE_MAX_HITS` |
| Stale knowledge base | Manifest doesn't own the changed file | Add the source file glob to the right feature in `manifest.json` |
| Empty `sources` | No document scored above zero for the question | Rephrase the question using feature keywords, or add keywords to the doc front matter |
| Knowledge docs not regenerating on push | `GEMINI_API_KEY` secret missing in repo | Add the `GEMINI_API_KEY` secret to GitHub repository settings |
| Build fails | Missing Supabase/VAPID env vars locally | Set dummy values for local build verification; real values only needed at runtime for other routes |

Logs are structured JSON. Set `CHATBOT_LOG_LEVEL=debug` for the most verbose output.

---

## Deployment

Deploy on Vercel like the rest of the application.

1. Push code to the repository connected to your Vercel project.
2. In Vercel project settings, add the environment variable `GEMINI_API_KEY` (and any `CHATBOT_*` overrides).
3. Add the repository secret `GEMINI_API_KEY` in GitHub repository **Settings → Secrets and variables → Actions** so the knowledge-generation workflow can call Gemini.
4. Verify the workflow runs on push and commits updated `knowledge/generated/` Markdown.

No separate service, database, or infrastructure is required beyond GitHub, GitHub Actions, Gemini Flash, and Vercel.

---

*This document covers the chatbot module only. The main application README.md covers the volunteer management platform itself.*
