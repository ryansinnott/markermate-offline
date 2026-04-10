# MarkerMate

A web-based application that automates the grading of handwritten English assessments using AI.

## Features

- Upload teacher rubrics (PDF, PNG, JPG)
- Process up to 30 student submissions per batch
- OCR processing of handwritten documents
- AI-powered grading based on uploaded rubrics
- Interactive grade review and modification
- Export functionality for final grades

## Project Structure

```
Marker Mate/
├── frontend/          # React.js frontend application
├── backend/           # Node.js/Express backend API
├── shared/            # Shared types and utilities
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 16+
- npm or yarn
- Claude API key

### Installation

1. Clone the repository
2. Install backend dependencies:
   ```bash
   cd backend
   npm install
   ```

3. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```

4. Set up environment variables:
   ```bash
   # Backend
   cp backend/.env.example backend/.env
   # Add your Claude API key to backend/.env

   # Frontend
   cp frontend/.env.example frontend/.env
   ```

### Development

1. Start the backend server:
   ```bash
   cd backend
   npm run dev
   ```

2. Start the frontend development server:
   ```bash
   cd frontend
   npm start
   ```

The application will be available at http://localhost:3000

## API Endpoints

- `POST /api/rubric/upload` - Upload grading rubric
- `POST /api/submissions/upload` - Upload student submissions
- `GET /api/grading/status` - Check grading progress
- `GET /api/grading/results` - Get grading results
- `PUT /api/grading/modify` - Modify grades
- `GET /api/export/grades` - Export final grades

## Tech Stack

**Frontend:**
- React 18 with TypeScript
- Tailwind CSS for styling
- React Router for navigation
- Axios for API calls

**Backend:**
- Node.js with Express
- TypeScript
- Claude AI for grading
- Tesseract.js for OCR
- Multer for file uploads

## License

MIT License