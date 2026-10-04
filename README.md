# Unbury

**Turn messy information into structured tasks and memory — without losing context.**

Unbury is an AI assistant that reads whatever you throw at it — messages, PDFs, voice notes, screenshots — and extracts the tasks, deadlines, and durable facts buried inside. Nothing is saved without your review.

## Live Demo

[unbury.onrender.com](https://unbury-bphf.onrender.com)

## What It Does

- **Dump anything** — paste text, upload a PDF, drop a screenshot, or record a voice note
- **AI extraction** — Gemma identifies tasks with deadlines and facts worth remembering
- **Review before saving** — every extraction is a proposal you confirm, edit, or discard
- **Progressive reminders** — browser notifications fire at 1 week, 3 days, 1 day, and 1 hour before a deadline (while the app is open and permission is granted)
- **Persistent memory** — durable facts (people, roles, context) are stored separately from tasks and surface when relevant
- **Ask Unbury** — query your saved memory in plain language; answers are grounded in what was actually saved, not hallucinated
- **Conflict detection** — overlapping deadlines and scheduling conflicts are flagged automatically

## How It Works

```
DUMP → UNDERSTAND → REVIEW → CONFIRM → REMEMBER → REMIND
```

1. **Dump** — submit raw input in any supported format
2. **Understand** — Gemma extracts tasks and memories from the content
3. **Review** — a confirmation modal shows the proposal before anything is saved
4. **Confirm** — you accept, edit, or discard each item
5. **Remember** — confirmed data is persisted to MongoDB with source attribution
6. **Remind** — the reminder engine schedules progressive notifications for upcoming deadlines

## Why Gemma

Gemma is the core reasoning engine. It handles extraction, classification, and the Ask query pipeline entirely on the server side — no client-side AI calls, no API keys exposed to the browser.

- **Local development** uses Ollama running Gemma locally (`gemma3` by default)
- **Production** uses the configured hosted Gemma provider via `AI_PROVIDER=google`

The extraction prompts are conservative by design: Gemma is instructed to prefer fewer, higher-confidence outputs over noisy results, and never to invent deadlines or fabricate tasks.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| AI (local) | Ollama + Gemma |
| AI (production) | Google hosted Gemma (`@google/genai`) |
| Database | MongoDB Atlas |
| OCR | Tesseract.js |
| Audio | Whisper (Python, via `scripts/transcribe.py`) |
| Deployment | Render |

## Architecture

```
Browser
  └─ Next.js App (Render)
       ├─ /app/api/dump/*     ← ingest text, PDF, image, audio
       ├─ /app/api/tasks      ← CRUD + reminder scheduling
       ├─ /app/api/memories   ← persistent memory store
       ├─ /app/api/ask        ← grounded query answering
       └─ /app/api/reminders  ← notification polling

       lib/ai/
         ├─ provider.ts       ← Ollama / Google Gemma transport
         ├─ gemma.ts          ← extraction prompts + sanitization
         └─ ask.ts            ← retrieval-augmented query pipeline

       lib/db/                ← MongoDB collections (tasks, memories,
                                 sources, reminders, conflicts)
```

## Getting Started

**Prerequisites:** Node.js 18+, MongoDB Atlas cluster, Ollama (for local AI)

```bash
# 1. Clone and install
git clone <repo-url>
cd unbury-next
npm install

# 2. Configure environment
cp .env.example .env
# Fill in MONGODB_URI and MONGODB_DB

# 3. Pull the Gemma model
ollama pull gemma3

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB Atlas connection string |
| `MONGODB_DB` | Yes | Database name (e.g. `unbury`) |
| `AI_PROVIDER` | Yes | `ollama` (local) or `google` (production) |
| `OLLAMA_BASE_URL` | Local | Ollama server URL |
| `OLLAMA_MODEL` | Local | Model name (e.g. `gemma3`) |
| `OLLAMA_API_KEY` | Optional | Bearer token for secured Ollama endpoints |
| `GOOGLE_AI_API_KEY` | Production | Server-side only — never exposed to the client |
| `GEMMA_MODEL` | Production | Hosted model name |

## Key Design Decisions

**Review before persistence.** Nothing is written to the database until the user explicitly confirms the extraction proposal. The AI is advisory, not automatic.

**Evidence-grounded memory.** Every saved memory and task is linked to its source dump. Ask Unbury answers are generated from retrieved memories, not from the model's training knowledge.

**Conservative extraction.** The extraction prompt instructs Gemma to output fewer, higher-confidence results. Boilerplate, legal text, and ambiguous content are deliberately ignored rather than guessed at.

**No fabricated deadlines.** If a deadline cannot be clearly inferred from the input, the task is saved without one. The model is explicitly instructed not to invent dates.

**Grounded Ask answers.** The `/ask` pipeline retrieves relevant memories before querying the model, and instructs it to answer only from retrieved context — declining to answer if the information is not present.

## Project Structure

```
app/
  api/          API routes (dump, tasks, memories, ask, reminders, conflicts)
  app/          UI pages (today, upcoming, inbox, memory, ask)
components/     Shared React components (dump modal, task drawer, proposal modal)
lib/
  ai/           AI provider transport, extraction logic, ask pipeline
  db/           MongoDB collection helpers
  pipeline.ts   End-to-end processing pipeline (ingest → extract → persist)
scripts/        Developer scripts (friend_test, seed_demo_data, transcribe)
```

## Hacktoberfest

Unbury was built as part of the **Hacktoberfest Weekend Challenge: Build for a Friend** — an MLH challenge to ship a useful tool for someone you know within a weekend. The project fits the spirit of the challenge: it solves a real, specific problem (information overload and forgotten commitments) with a working, deployed application built from scratch over a focused sprint.

## License

MIT
