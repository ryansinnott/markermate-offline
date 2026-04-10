# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MarkerMate Offline is a fully offline web application that automates grading of handwritten English assessments using local AI. It consists of a React TypeScript frontend and Node.js Express backend with **Ollama/Gemma 4** integration for OCR and intelligent grading. No cloud APIs or authentication required — everything runs locally.

**Working Directory**: The project root is `marker-mate/` - all paths below are relative to this directory.

## Prerequisites

- **Node.js 18+** (for native fetch support)
- **Ollama** installed and running locally (`http://localhost:11434`)
- **Gemma 4 model** pulled: `ollama pull gemma4:31b`

## Quick Start

```bash
# Ensure Ollama is running with Gemma 4
ollama pull gemma4:31b
ollama serve  # if not already running

# Terminal 1: Start backend (port 3001)
cd backend
npm install
cp .env.example .env
npm run dev

# Terminal 2: Start frontend (port 3000)
cd frontend
npm install
npm start
```

Both servers must run simultaneously. Frontend at http://localhost:3000 proxies API requests to backend. No API keys or login required.

## Development Commands

### Backend (Node.js/Express/TypeScript)
```bash
cd backend
npm run dev          # Start development server with ts-node (port 3001)
npm run build        # Compile TypeScript to JavaScript
npm start            # Run compiled production build
npm run lint         # Run ESLint
npm run lint:fix     # Auto-fix ESLint issues
npm test             # Run Jest tests
npm test -- <pattern> # Run single test file (e.g., npm test -- grading)
```

### Frontend (React/TypeScript)
```bash
cd frontend
npm start            # Start development server (port 3000)
npm run build        # Build for production
npm test             # Run React tests
```

### Environment Setup
- Copy `backend/.env.example` to `backend/.env` (defaults work out of the box)
- Copy `frontend/.env.example` to `frontend/.env`

## Architecture Overview

### Backend Structure (`backend/src/`)
- **Routes** (`routes/`):
  - `completeGrading.ts` → `/api/complete-grading/*` - Main 3-step grading workflow
  - `rubric.ts` → `/api/rubric/*` - Rubric upload and analysis
  - `submissions.ts` → `/api/submissions/*` - Student work upload
  - `export.ts` → `/api/export/*` - Grade export
  - `savedRubrics.ts` → `/api/rubrics/*` - Save/load/delete rubrics (no auth, uses hardcoded local user)
- **Services** (`services/`):
  - `gradingService.ts` - Ollama/Gemma 4 integration for transcription, analysis, and grading
  - `ollamaClient.ts` - Ollama REST API client with retry logic
  - `pdfToImages.ts` - PDF-to-image conversion (Ollama requires images, not PDFs)
- **Middleware** (`middleware/`):
  - `errorHandler.ts` - Custom error handling with proper HTTP status codes
  - `auth.ts` - Pass-through (auth disabled for offline mode)
- **Database** (`database/`):
  - `db.ts` - SQLite via better-sqlite3 with WAL mode; stores saved rubrics with hardcoded `local-user`
- **Utils** (`utils/`):
  - `logger.ts` - Winston logging (console + file)

Key dependencies: Express, Multer, better-sqlite3, p-limit, pdf-to-img, Winston

### Frontend Structure (`frontend/src/`)
- **Pages** (`pages/`):
  - `HomePage.tsx` - Landing page
  - `UploadPage.tsx` - Main entry point, file upload workflow
  - `UploadRubricPage.tsx` - Standalone rubric upload
  - `AnalysisPage.tsx` - AI analysis results display
  - `ResultsPage.tsx` - Grade review and modification
- **Components**:
  - `components/upload/` - File upload with drag-and-drop (RubricUpload, SubmissionUpload)
  - `components/grading/` - Grade display (GradeCard shows full transcribed text)
  - `components/rubric/` - Rubric editing (RubricEditTable, SaveRubricModal, RubricGridDisplay, ScoringLevelsEditor)
  - `components/common/` - Shared UI (Header, Footer, ImageViewer, BetaBanner, FeedbackButton)

All routes are public — no authentication or protected routes.

### Data Flow
1. **Rubric Upload** → Gemma 4 analyzes grading criteria (via Ollama vision API)
2. **Student Submissions** → Gemma 4 transcribes handwriting and assesses quality
3. **AI Grading** → Professional Teacher AI grades against rubric with evidence
4. **Results Display** → Teacher reviews, modifies, exports grades

Analysis results passed between pages via React Router navigation state (ephemeral).

## Key Technical Details

### Ollama/Gemma 4 Integration
- Uses **Gemma 4 (31B)** via Ollama REST API (`/api/generate`) with vision capabilities
- `ollamaClient.ts` provides `callOllamaWithRetry()` with exponential backoff (3 retries)
- `pdfToImages.ts` converts PDF pages to PNG images since Ollama doesn't support PDF input directly
- 5-minute timeout for large multi-page documents
- Professional teacher persona with evidence-based scoring and confidence assessment
- Combined `transcribeAndAnalyze()` method: single AI call for transcription + analysis

### AI Grading Approach
- Holistic reading before systematic evaluation against each rubric criterion
- Matches essay quality to exact rubric descriptor language
- Returns confidence scores (High/Medium/Low) and uncertain sections for manual review
- Handles cursive, print, mixed styles, corrections, and margin notes
- Year-level calibration for Years 7-12 standards

### Session Management
- Grading sessions use in-memory Map storage with automatic cleanup every 30 minutes
- Sessions expire after 1 hour
- Saved rubrics persist in SQLite (`backend/data/markermate.db`) with hardcoded `local-user` owner

### File Upload
- Max 50MB per file, 30 files per batch
- Formats: PDF, PNG, JPG, JPEG
- PDFs are rasterized to images before sending to Ollama
- Directories auto-created at backend startup: `uploads/rubrics`, `uploads/submissions`, `temp/ocr`, `logs`, `data`

### TypeScript Interfaces
Key interfaces in `services/gradingService.ts`:
- `FileAnalysisResult` - AI response with confidence scoring
- `GradingResult` - Complete grading with scores, evidence, feedback
- `StudentGradingResult` - Individual student transcription and assessment
- `GradingCriterion` - Rubric criteria with scoring levels

### API Details
- Health check: `GET /api/health` — also reports Ollama connection status and model availability
- Rate limiting: 100 requests per 15 minutes per IP
- Frontend proxies to `http://localhost:3001` in development
- All routes are public (no authentication)

## Implementation Notes

- Always use `npm run dev` for backend development (not `npm start` which requires prior `npm run build`)
- Ollama must be running at `OLLAMA_URL` (default `http://localhost:11434`) with `OLLAMA_MODEL` pulled
- TypeScript strict mode with ES2020 target and CommonJS modules
- `pdf-to-img` is ESM-only — imported via dynamic `import()` in `pdfToImages.ts`
- Tailwind CSS with `@tailwindcss/typography` for rich text rendering
- Error handling with custom `createError()` middleware and Winston logging
