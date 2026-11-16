# AI Chatbot Development

## Overview

Build an AI chatbot as an integrated feature of the volunteer management platform. The application remains the source of truth for all application behavior and documentation. The chatbot is an internal module that can only be accessed through the volunteer management application and is not intended to function as a standalone service or separate repository.

Rather than inspecting the application's source code at runtime, the chatbot should answer questions using an automatically generated Markdown knowledge base stored within the project.

The project should prioritize simplicity, maintainability, transparency, and compatibility with free-tier services. Do not introduce vector databases, embeddings, LangChain, LlamaIndex, Pinecone, Chroma, or similar frameworks unless explicitly requested.

At the completion of every stage:

- Ensure the project builds successfully.
- Test all newly added functionality.
- Fix any linting or TypeScript errors.
- Commit changes before beginning the next stage.

---

# Stage 1 — Chatbot Module Setup

## Goal

Create the chatbot as an internal module within the existing volunteer management platform.

## Requirements

Create a modular structure similar to:

```text
app/
    api/
        chatbot/

lib/
    chatbot/

knowledge/

scripts/

types/
```

Create the API endpoint:

```text
POST /api/chatbot
```

This endpoint is intended only for use by the volunteer management application and should not be designed as a public API.

Return a placeholder response and verify local execution.

---

# Stage 2 — Knowledge Base Design

## Goal

Design the Markdown knowledge system.

Create a feature-based knowledge hierarchy instead of documenting individual source files.

Example:

```text
knowledge/

generated/
    scheduling.md
    attendance.md
    volunteers.md
    notifications.md
    permissions.md

database/
    volunteers.md
    users.md
    shifts.md

architecture/
    authentication.md
    deployment.md
    github-actions.md

manual/
    clinic-policies.md
    terminology.md
```

Each generated document should contain consistent front matter:

```yaml
title:
feature:
keywords:
related:
last_generated:
```

Each feature document should include:

- Purpose
- Pages
- Workflows
- Business rules
- User roles
- Frequently asked questions
- Related documents

Focus on explaining system behavior from the user's and organization's perspective rather than implementation details.

---

# Stage 3 — Documentation Generator

## Goal

Automatically generate the Markdown knowledge base.

Create a generator script.

The generator should:

- Read project files.
- Group files into features using a manifest.
- Send feature context to Gemini Flash.
- Generate Markdown.
- Save files into `knowledge/generated`.

Do not regenerate unaffected features.

Create a manifest describing feature ownership.

Example:

```text
manifest.json

Scheduling
    app/admin/shifts/*
    components/ShiftCalendar*
    lib/scheduling*

Attendance
    app/admin/attendance/*
    lib/attendance*
```

Keep prompts deterministic so documentation remains consistent across runs.

---

# Stage 4 — GitHub Actions Automation

## Goal

Automatically maintain the knowledge base.

On every push:

1. Determine changed files using `git diff`.
2. Load the feature manifest.
3. Determine affected features.
4. Regenerate only those features.
5. Commit updated Markdown.
6. Skip commit if nothing changed.

The workflow should minimize Gemini API usage.

---

# Stage 5 — Retrieval Engine

## Goal

Retrieve relevant documentation without embeddings.

Do not use vector databases.

Implement lightweight retrieval using:

- filename matching
- keyword scoring
- metadata scoring
- related-document expansion

Workflow:

```text
User Question
        ↓
Keyword Search
        ↓
Metadata Search
        ↓
Top Documents
        ↓
Related Documents
        ↓
Gemini Flash
```

Return only the most relevant documents.

---

# Stage 6 — Chat Endpoint

## Goal

Implement the internal chatbot.

API:

```text
POST /api/chatbot
```

Input:

```json
{
  "question": "..."
}
```

Workflow:

1. Receive the user's question.
2. Retrieve the most relevant Markdown documents.
3. Expand to related documentation when appropriate.
4. Build the Gemini Flash prompt.
5. Send the prompt to Gemini Flash.
6. Return the generated response.
7. Include the source document names in the response.

The chatbot should only use the generated knowledge base and should never inspect application source code at runtime.

---

# Stage 7 — Performance

Implement:

- In-memory cache
- Configurable cache expiration
- Rate limiting
- Graceful Gemini failures
- Logging

The chatbot should continue operating gracefully even if Gemini is temporarily unavailable.

---

# Stage 8 — Testing

Verify:

- Retrieval quality
- Documentation generation
- GitHub Action
- Deployment
- Cache behavior
- Rate limiting
- API responses

Add representative test questions covering multiple application features.

---

# Stage 9 — Documentation

Write:

- README
- Deployment instructions
- Environment variables
- Architecture overview
- GitHub Actions documentation
- Knowledge generation workflow
- Troubleshooting guide

Document every major design decision.

---

# Architecture Requirements

The volunteer management platform is both the application and the source of truth.

The chatbot is an internal feature of the application and is not designed to be deployed, accessed, or maintained as a separate service.

The chatbot consumes only the generated Markdown knowledge base.

The chatbot never indexes or searches application source code at runtime.

Do not introduce unnecessary dependencies or frameworks.

Avoid vector databases and embedding pipelines.

Prioritize readability, maintainability, and simplicity over abstraction.

The completed system should require only:

- GitHub
- GitHub Actions
- Gemini Flash API
- Vercel

The final implementation should be easy for future volunteers to understand, inspect, debug, extend, and maintain.