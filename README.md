# MarkerMate Offline

Automate the grading of handwritten English assessments using local AI. Upload a rubric, submit student papers (handwritten or typed), and get AI-powered grades with evidence-based feedback — all running entirely on your machine with no cloud APIs, accounts, or internet connection required.

## How It Works

1. **Upload a rubric** — PDF or image of your grading criteria. The AI extracts and structures the criteria automatically.
2. **Upload student submissions** — Up to 30 papers per batch (PDF, PNG, JPG). Handwriting is transcribed via OCR.
3. **AI grades each paper** — Each submission is evaluated against the rubric with per-criterion scores, evidence quotes, and confidence levels.
4. **Review and export** — Inspect grades, adjust scores, and export results.

## Requirements

- **Node.js 18+** — [Download](https://nodejs.org/)
- **Ollama** — [Download](https://ollama.com/) (local LLM runtime)
- **Gemma 4 31B model** — pulled via Ollama (see below)
- **~20 GB disk space** for the Gemma 4 model weights
- **16 GB+ RAM recommended** (32 GB for best performance with 31B model)

## Installation

### 1. Install and start Ollama

Download from [ollama.com](https://ollama.com/) and install it. Then pull the Gemma 4 model:

```bash
ollama pull gemma4:31b
```

Make sure Ollama is running (it usually starts automatically after install, or run `ollama serve`).

### 2. Clone and set up the backend

```bash
git clone https://github.com/ryansinnott/markermate-offline.git
cd markermate-offline/backend
npm install
cp .env.example .env
```

The default `.env` works out of the box. Edit it if you need to change the Ollama URL or port.

### 3. Set up the frontend

```bash
cd ../frontend
npm install
```

### 4. Run

Open two terminals from the project root:

```bash
# Terminal 1 — Backend (port 3001)
cd backend
npm run dev

# Terminal 2 — Frontend (port 3000)
cd frontend
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Tech Stack

- **Frontend:** React 18, TypeScript, Tailwind CSS, React Router
- **Backend:** Node.js, Express, TypeScript
- **AI:** Ollama + Gemma 4 (31B) with vision capabilities for handwriting OCR and grading
- **Database:** SQLite (for saved rubrics only)
- **File handling:** PDF-to-image conversion, drag-and-drop upload

## Configuration

All configuration is in `backend/.env` (copied from `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Backend server port |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API endpoint |
| `OLLAMA_MODEL` | `gemma4:31b` | Model to use for grading |
| `MAX_FILE_SIZE` | `50MB` | Max upload size per file |
| `MAX_FILES_PER_BATCH` | `30` | Max submissions per batch |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed frontend origin |

## License

MIT
