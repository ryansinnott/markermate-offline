# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MarkerMate Offline is a fully offline web application that automates grading of handwritten English assessments using local AI. React TypeScript frontend + Node.js Express backend with **Ollama/Gemma 4** for OCR and intelligent grading. No cloud APIs or authentication — everything runs locally.

## Prerequisites

- **Node.js 18+**
- **Ollama** running locally (`http://localhost:11434`)
- **Gemma 4 model** pulled: `ollama pull gemma4:latest`

## Development Commands

```bash
# Backend (port 3001) — always use dev, not start
cd backend
npm install && cp .env.example .env  # first time only
npm run dev          # Start with ts-node
npm run build        # Compile TypeScript
npm run lint         # ESLint
npm run lint:fix     # Auto-fix
npm test             # Jest
npm test -- <pattern> # Single test (e.g., npm test -- grading)

# Frontend (port 3000)
cd frontend
npm install          # first time only
npm start            # CRA dev server
npm run build        # Production build
npm test             # React tests
```

Both servers must run simultaneously. Frontend proxies API requests to backend via CRA proxy config.

## Architecture

### Backend (`backend/src/`)

**Routes** map 1:1 to API namespaces:
- `completeGrading.ts` → `/api/complete-grading/*` — Main 3-step grading workflow (transcribe → analyze → grade)
- `rubric.ts` → `/api/rubric/*` — Rubric upload and AI analysis
- `submissions.ts` → `/api/submissions/*` — Student work upload
- `export.ts` → `/api/export/*` — Grade export
- `savedRubrics.ts` → `/api/rubrics/*` — CRUD for saved rubrics (hardcoded `local-user`, no auth)

**Services** — the core AI logic:
- `gradingService.ts` — Orchestrates transcription, analysis, and grading via Ollama. Key method: `transcribeAndAnalyze()` does transcription + analysis in a single AI call. Defines all TypeScript interfaces (`FileAnalysisResult`, `GradingResult`, `StudentGradingResult`, `GradingCriterion`).
- `ollamaClient.ts` — Wraps Ollama `/api/generate` REST endpoint. Uses `undici` Agent (not native fetch) to disable Node's default header/body timeouts for long-running inference. Exponential backoff retry (3 attempts). Context window: 8192 tokens, max output: 4096 tokens.
- `pdfToImages.ts` — Converts PDF pages to PNG base64 since Ollama vision API requires images, not PDFs.

**Database**: SQLite via `better-sqlite3` with WAL mode (`backend/data/markermate.db`). Only stores saved rubrics.

**Sessions**: In-memory `Map` with 1-hour expiry and 30-minute cleanup interval. Not persisted.

### Frontend (`frontend/src/`)

CRA (Create React App) with React Router. Five pages: `HomePage` → `UploadRubricPage`/`UploadPage` → `AnalysisPage` → `ResultsPage`. All routes public.

**Critical data flow detail**: Analysis/grading results are passed between pages via React Router `navigation state` — this is ephemeral and lost on page refresh. There is no client-side persistence layer.

Component directories: `upload/` (drag-and-drop file handling), `grading/` (grade display cards), `rubric/` (rubric editing UI), `common/` (shared layout).

### Data Flow
1. **Rubric Upload** → Gemma 4 analyzes grading criteria via Ollama vision API
2. **Student Submissions** → Gemma 4 transcribes handwriting and assesses quality
3. **AI Grading** → Teacher AI persona grades against rubric with evidence and confidence scores
4. **Results** → Teacher reviews, modifies, exports grades

## Key Technical Gotchas

- **Always `npm run dev`** for backend development — `npm start` requires `npm run build` first
- **`pdf-to-img` is ESM-only** — imported via dynamic `import()` in `pdfToImages.ts` (the rest of the backend is CommonJS)
- **`undici` for Ollama HTTP** — Node's native fetch has header/body timeouts that kill long inference requests; `ollamaClient.ts` uses a custom `undici.Agent` with timeouts disabled
- **`num_predict=4096`** caps Ollama output tokens to prevent runaway generation
- **Frontend proxy**: `"proxy": "http://localhost:3001"` in `frontend/package.json` — no manual CORS config needed in dev
- **`frontend/build-subdirectory/`** contains a checked-in production build (separate from `frontend/build/`)
- TypeScript strict mode, ES2020 target, CommonJS modules (backend)
- Tailwind CSS with `@tailwindcss/typography`
- Rate limiting: 100 requests per 15 minutes per IP
- File uploads: max 50MB per file, 30 files per batch; formats: PDF, PNG, JPG, JPEG
- Upload directories auto-created at backend startup

## Environment

Copy `backend/.env.example` to `backend/.env` — defaults work out of the box. Key vars: `OLLAMA_URL`, `OLLAMA_MODEL`, `PORT`, `CORS_ORIGIN`.
