# MarkerMate Offline Conversion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert MarkerMate from cloud-based (Claude API + JWT auth) to fully offline (Ollama/Gemma 4 + no auth).

**Architecture:** Replace the Anthropic SDK transport layer with Ollama REST API calls (`http://localhost:11434/api/generate`). Remove all JWT authentication from backend routes and frontend. Add PDF-to-image conversion since Ollama doesn't support PDF input directly. Keep all existing prompt engineering, JSON extraction, scoring logic, and SQLite rubric storage intact.

**Tech Stack:** Node.js/Express/TypeScript backend, React/TypeScript frontend, Ollama REST API, Gemma 4 (31B), `pdf-to-img` for PDF rasterization, better-sqlite3 for rubric persistence.

---

## File Structure

### Files to create:
- `backend/src/services/ollamaClient.ts` - Ollama REST API client with retry logic and PDF-to-image support
- `backend/src/services/pdfToImages.ts` - PDF page rasterization utility

### Files to modify:
- `backend/src/services/gradingService.ts` - Replace all Claude API calls with Ollama client
- `backend/src/index.ts` - Remove authMiddleware from routes, update health check
- `backend/src/database/db.ts` - Remove user table operations, hardcode local user
- `backend/src/routes/savedRubrics.ts` - Replace `req.user!.id` with hardcoded local user ID
- `backend/src/middleware/auth.ts` - Gut the file (keep export, make pass-through)
- `backend/package.json` - Remove Anthropic/auth deps, add pdf-to-img
- `backend/.env` - Replace Claude config with Ollama config
- `backend/.env.example` - Same
- `frontend/src/App.tsx` - Remove AuthProvider, ProtectedRoute, login/signup routes
- `frontend/src/components/common/Header.tsx` - Remove auth section
- `frontend/src/services/apiService.ts` - Remove auth token interceptor and auth methods
- `frontend/src/contexts/AuthContext.tsx` - Delete (or empty)
- `frontend/src/pages/LoginPage.tsx` - Delete
- `frontend/src/pages/SignupPage.tsx` - Delete
- `CLAUDE.md` - Update to reflect offline architecture

### Files to leave unchanged:
- All prompt engineering text within gradingService.ts (the prompt strings stay identical)
- All JSON extraction logic (`extractJsonFromResponse`)
- All year-level grading context (`getYearLevelGradingContext`)
- All scoring validation logic
- Frontend pages: HomePage, UploadPage, UploadRubricPage, AnalysisPage, ResultsPage
- Frontend components: grading/*, rubric/*, upload/*
- Backend routes: completeGrading.ts, rubric.ts, submissions.ts, export.ts (no auth refs)

---

### Task 1: Create PDF-to-Image Utility

**Files:**
- Create: `backend/src/services/pdfToImages.ts`

- [ ] **Step 1: Install pdf-to-img dependency**

```bash
cd backend && npm install pdf-to-img
```

Note: `pdf-to-img` uses pdfjs-dist internally. It converts PDF pages to PNG buffers.

- [ ] **Step 2: Create the PDF-to-image utility**

```typescript
// backend/src/services/pdfToImages.ts
import { logger } from '../utils/logger';

/**
 * Convert a PDF file to an array of base64-encoded PNG images (one per page).
 * Used because Ollama/Gemma4 supports images but NOT PDFs directly.
 */
export async function pdfToBase64Images(pdfPath: string): Promise<string[]> {
  try {
    // Dynamic import since pdf-to-img is ESM-only
    const { pdf } = await import('pdf-to-img');
    
    const document = await pdf(pdfPath, { scale: 2.0 });
    const images: string[] = [];
    
    for await (const page of document) {
      images.push(Buffer.from(page).toString('base64'));
    }
    
    logger.info(`Converted PDF to ${images.length} page image(s): ${pdfPath}`);
    return images;
  } catch (error) {
    logger.error(`PDF to image conversion failed for ${pdfPath}:`, error);
    throw new Error(`Failed to convert PDF to images: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

- [ ] **Step 3: Verify the file compiles**

```bash
cd backend && npx tsc --noEmit src/services/pdfToImages.ts
```

If `pdf-to-img` is ESM-only and causes issues with CommonJS, we may need to adjust the tsconfig or use a dynamic import wrapper. The dynamic `import()` in step 2 handles this.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/pdfToImages.ts backend/package.json backend/package-lock.json
git commit -m "feat: add PDF-to-image conversion utility for Ollama compatibility"
```

---

### Task 2: Create Ollama REST API Client

**Files:**
- Create: `backend/src/services/ollamaClient.ts`

- [ ] **Step 1: Create the Ollama client with retry logic**

This replaces the Anthropic SDK client and `callClaudeWithRetry`. It wraps Ollama's `/api/generate` endpoint.

```typescript
// backend/src/services/ollamaClient.ts
import { logger } from '../utils/logger';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:31b';

export interface OllamaResponse {
  response: string;
  model: string;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

/**
 * Call Ollama /api/generate with retry logic.
 * Replaces callClaudeWithRetry — same exponential backoff pattern.
 */
export async function callOllamaWithRetry(
  prompt: string,
  options: {
    images?: string[];       // Raw base64 strings (no data: prefix)
    system?: string;         // System prompt (combined from cacheable blocks)
    maxRetries?: number;
    baseDelay?: number;
    temperature?: number;
  } = {}
): Promise<string> {
  const {
    images,
    system,
    maxRetries = 3,
    baseDelay = 1000,
    temperature = 0
  } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const body: any = {
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: {
          temperature
        }
      };

      if (system) {
        body.system = system;
      }

      if (images && images.length > 0) {
        body.images = images;
      }

      logger.info(`[OLLAMA] Attempt ${attempt}/${maxRetries} - model: ${OLLAMA_MODEL}, prompt: ${prompt.length} chars, images: ${images?.length || 0}`);

      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300000) // 5 minute timeout for large PDFs
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
      }

      const data: OllamaResponse = await response.json();
      
      if (!data.response) {
        throw new Error('Empty response from Ollama');
      }

      logger.info(`[OLLAMA] Success on attempt ${attempt} - response: ${data.response.length} chars`);
      return data.response;

    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries;
      const isRetryableError =
        error.message?.includes('timeout') ||
        error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('ECONNRESET') ||
        error.message?.includes('fetch failed') ||
        error.message?.includes('502') ||
        error.message?.includes('503') ||
        error.message?.includes('504');

      if (isLastAttempt || !isRetryableError) {
        logger.error(`[OLLAMA] Failed on attempt ${attempt}/${maxRetries}:`, error.message);
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt - 1);
      logger.warn(`[OLLAMA] Failed on attempt ${attempt}/${maxRetries}, retrying in ${delay}ms:`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Ollama call failed after all retries');
}

/**
 * Check if Ollama is running and the model is available.
 */
export async function checkOllamaHealth(): Promise<{
  connected: boolean;
  modelAvailable: boolean;
  modelName: string;
}> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(5000)
    });
    const data = await response.json();
    const hasModel = data.models?.some((m: any) => m.name.includes('gemma4'));
    
    return {
      connected: true,
      modelAvailable: !!hasModel,
      modelName: OLLAMA_MODEL
    };
  } catch {
    return {
      connected: false,
      modelAvailable: false,
      modelName: OLLAMA_MODEL
    };
  }
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd backend && npx tsc --noEmit src/services/ollamaClient.ts
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/ollamaClient.ts
git commit -m "feat: add Ollama REST API client with retry logic"
```

---

### Task 3: Convert gradingService.ts from Claude to Ollama

**Files:**
- Modify: `backend/src/services/gradingService.ts` (entire file — replace transport layer only)

This is the largest task. Every Claude API call becomes an Ollama call. All prompt text stays identical.

- [ ] **Step 1: Replace imports and constructor**

Remove:
```typescript
import Anthropic from '@anthropic-ai/sdk';
```

Add:
```typescript
import { callOllamaWithRetry } from './ollamaClient';
import { pdfToBase64Images } from './pdfToImages';
```

Replace the constructor (lines 99-111):
```typescript
export class GradingService {
  constructor() {
    // No API key needed - Ollama runs locally
    logger.info('GradingService initialized for Ollama/Gemma4 (offline mode)');
  }
```

Remove the `private claude: Anthropic;` field (line 100).

- [ ] **Step 2: Remove callClaudeWithRetry method**

Delete the entire `callClaudeWithRetry` method (lines 242-287). It's replaced by `callOllamaWithRetry` from `ollamaClient.ts`.

- [ ] **Step 3: Create helper method for building Ollama image content**

Add this new helper method to GradingService (replaces the per-method image/PDF content building):

```typescript
  /**
   * Prepare image(s) for Ollama from a file path.
   * For images: returns single base64 string in array.
   * For PDFs: converts each page to a PNG image, returns array of base64 strings.
   */
  private async prepareImagesForOllama(filePath: string): Promise<string[]> {
    const fileExtension = path.extname(filePath).toLowerCase();
    
    if (fileExtension === '.pdf') {
      return await pdfToBase64Images(filePath);
    } else {
      const base64Data = await this.encodeImageToBase64Async(filePath);
      return [base64Data];
    }
  }
```

- [ ] **Step 4: Convert analyzeRubricFile method**

Replace the Claude API call section in `analyzeRubricFile` (lines 402-624). The prompt text stays identical — only the transport changes.

The key change: instead of building `content` arrays with `type: 'image'` / `type: 'document'` blocks, we:
1. Call `prepareImagesForOllama(filePath)` to get base64 images
2. Call `callOllamaWithRetry(promptText, { images })` 

```typescript
  async analyzeRubricFile(filePath: string, yearLevel?: number): Promise<FileAnalysisResult> {
    try {
      logger.info(`Analyzing rubric file: ${filePath}`);
      
      const fileName = path.basename(filePath);
      const fileExtension = path.extname(filePath).toLowerCase();
      
      if (!['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.pdf'].includes(fileExtension)) {
        return {
          success: false,
          analysis: '',
          fileType: 'rubric',
          fileName,
          modelUsed: 'none',
          error: 'Unsupported file type. Please use image or PDF files.'
        };
      }

      const images = await this.prepareImagesForOllama(filePath);
      
      // Same prompt as before — just sent via Ollama instead of Claude
      const promptText = `Analyze this grading rubric ${fileExtension === '.pdf' ? 'document' : 'image'} carefully and extract ALL details. ${yearLevel ? `This is for Year ${yearLevel} students.` : ''}

FIRST: Detect the RUBRIC FORMAT TYPE:
... (KEEP ALL EXISTING PROMPT TEXT IDENTICAL - copy from current lines 410-495) ...
- Return ONLY valid JSON, no other text`;

      const responseText = await callOllamaWithRetry(promptText, { images });

      return {
        success: true,
        analysis: responseText,
        fileType: 'rubric',
        fileName,
        modelUsed: process.env.OLLAMA_MODEL || 'gemma4:31b'
      };

    } catch (error) {
      // Keep all existing error handling — just change model name references
      // Replace 'claude-sonnet-4-5-20250929' with process.env.OLLAMA_MODEL || 'gemma4:31b'
      // Replace 'Network error' message to mention Ollama instead
    }
  }
```

**CRITICAL:** Copy every character of the existing prompt text. Only change:
- The transport (fetch to Ollama instead of Anthropic SDK)
- The `modelUsed` string in returns
- Error messages that reference "Claude" → "Ollama"

- [ ] **Step 5: Convert analyzeStudentWorkFile method**

Same pattern as step 4. Replace lines 668-776.

```typescript
  async analyzeStudentWorkFile(filePath: string): Promise<FileAnalysisResult> {
    try {
      logger.info(`Analyzing student work file: ${filePath}`);
      
      const fileName = path.basename(filePath);
      const fileExtension = path.extname(filePath).toLowerCase();
      
      if (!['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.pdf'].includes(fileExtension)) {
        return { success: false, analysis: '', fileType: 'student_work', fileName, modelUsed: 'none', error: 'Unsupported file type.' };
      }

      const images = await this.prepareImagesForOllama(filePath);
      
      const promptText = `Analyze this student's work ${fileExtension === '.pdf' ? 'document' : 'image'}. Extract:
1. All text content (perform OCR if needed)
2. Writing quality assessment
3. Structure and organization
4. Any notable strengths or weaknesses
5. Legibility assessment

Transcribe all readable text and provide analysis.`;

      const responseText = await callOllamaWithRetry(promptText, { images });

      return {
        success: true,
        analysis: responseText,
        fileType: 'student_work',
        fileName,
        modelUsed: process.env.OLLAMA_MODEL || 'gemma4:31b'
      };

    } catch (error) {
      logger.error(`Student work analysis failed:`, error);
      return {
        success: false, analysis: '', fileType: 'student_work',
        fileName: path.basename(filePath),
        modelUsed: process.env.OLLAMA_MODEL || 'gemma4:31b',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
```

- [ ] **Step 6: Convert transcribeHandwrittenText method**

Replace lines 778-916. Same pattern — extract prompt, use `callOllamaWithRetry`.

```typescript
  async transcribeHandwrittenText(filePath: string): Promise<string> {
    try {
      logger.info(`Transcribing handwritten text: ${filePath}`);
      
      const fileExtension = path.extname(filePath).toLowerCase();
      if (!['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.pdf'].includes(fileExtension)) {
        throw new Error('Unsupported file type for transcription');
      }

      const images = await this.prepareImagesForOllama(filePath);
      
      // KEEP THE ENTIRE EXISTING PROMPT TEXT (lines 796-827 / 852-883)
      const promptText = `You are an expert at reading handwritten student work. Please transcribe ALL text from this ${fileExtension === '.pdf' ? 'document' : 'image'} with exceptional accuracy.

CONTEXT: This is a student's handwritten academic work (essay, assignment, or exam response).

HANDWRITING TRANSCRIPTION EXPERTISE:
... (KEEP ALL PROMPT TEXT IDENTICAL) ...

Return ONLY the complete transcribed text, nothing else:`;

      const transcription = await callOllamaWithRetry(promptText, { images, temperature: 0 });
      
      const fileName = path.basename(filePath);
      logger.info(`Transcription completed for ${fileName}`);
      return transcription;

    } catch (error) {
      logger.error(`Transcription failed:`, error);
      return `[Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}]`;
    }
  }
```

- [ ] **Step 7: Convert transcribeAndAnalyze method**

Replace lines 918-1104. Uses the combined prompt that returns JSON with transcription + analysis.

```typescript
  async transcribeAndAnalyze(filePath: string): Promise<{ transcription: string; analysis: FileAnalysisResult }> {
    try {
      logger.info(`Combined transcription and analysis: ${filePath}`);
      
      const fileName = path.basename(filePath);
      const fileExtension = path.extname(filePath).toLowerCase();
      
      if (!['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.pdf'].includes(fileExtension)) {
        return {
          transcription: '[Unsupported file type]',
          analysis: { success: false, analysis: '', fileType: 'student_work', fileName, modelUsed: 'none', error: 'Unsupported file type' }
        };
      }

      const images = await this.prepareImagesForOllama(filePath);
      
      // KEEP THE ENTIRE EXISTING basePrompt (lines 942-987)
      const basePrompt = `You are an expert at reading handwritten student work...
      ... (KEEP ALL PROMPT TEXT IDENTICAL) ...
      }`;

      const responseContent = await callOllamaWithRetry(basePrompt, { images, temperature: 0 });

      // KEEP ALL EXISTING JSON PARSING AND FALLBACK LOGIC (lines 1034-1103)
      let parsed;
      try {
        parsed = JSON.parse(responseContent);
      } catch (parseError) {
        logger.warn(`JSON parsing failed for ${fileName}, using fallback`);
        return {
          transcription: responseContent || '[Transcription failed]',
          analysis: {
            success: false,
            analysis: 'Basic transcription completed. JSON parsing failed - manual review needed.',
            fileType: 'student_work', fileName,
            modelUsed: process.env.OLLAMA_MODEL || 'gemma4:31b',
            error: 'JSON parsing failed'
          }
        };
      }

      // ... rest of existing parsing logic stays identical ...
      // Just change modelUsed references to process.env.OLLAMA_MODEL || 'gemma4:31b'
    }
  }
```

- [ ] **Step 8: Convert transcribeAndGrade method**

Replace lines 1111-1341. This was the optimized single-call method with prompt caching.

For Ollama: no prompt caching, but we keep the same combined prompt. The system messages become the `system` parameter, and the user content becomes the `prompt` with images.

```typescript
  async transcribeAndGrade(
    filePath: string,
    criteria: GradingCriterion[],
    studentId: string,
    studentName: string,
    yearLevel?: number
  ): Promise<{ transcription: string; grades: Array<{...}>; totalScore: number; maxScore: number; percentage: number; summary: string; confidence: string; }> {
    try {
      const startTime = Date.now();
      logger.info(`[OPTIMIZED] Combined transcribe+grade for ${studentName}: ${filePath}`);

      const fileExtension = path.extname(filePath).toLowerCase();
      if (!['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.pdf'].includes(fileExtension)) {
        throw new Error('Unsupported file type');
      }

      const images = await this.prepareImagesForOllama(filePath);
      const yearLevelContext = yearLevel ? this.getYearLevelGradingContext(yearLevel) : '';

      // Build system prompt (combines all the cacheable system messages into one string)
      let systemPrompt = `You are an experienced professional teacher marking essays...`;
      // KEEP ALL EXISTING SYSTEM MESSAGE TEXT from lines 1143-1253
      // Concatenate all the system message blocks into one string
      
      if (yearLevel) {
        systemPrompt += `\n\nSTUDENT CONTEXT: This is a Year ${yearLevel} student.\n${yearLevelContext}\n...`;
      }
      
      systemPrompt += `\n\nMARKING RUBRIC - Apply these criteria...\n${criteria.map(c => { ... }).join('\n\n')}\n...OUTPUT FORMAT...`;

      // Student-specific prompt
      const prompt = `Transcribe AND grade this student's work (${studentName}). Apply all instructions from the system prompt.`;

      const responseContent = await callOllamaWithRetry(prompt, { 
        images, 
        system: systemPrompt,
        temperature: 0 
      });

      const parsed = this.extractJsonFromResponse(responseContent, 'transcribeAndGrade');

      // KEEP ALL EXISTING score calculation logic (lines 1302-1318)
      const grades = parsed.grades || [];
      const totalScore = grades.reduce((sum: number, g: any) => sum + (g.score || 0), 0);
      const maxScore = grades.reduce((sum: number, g: any) => sum + (g.maxScore || 0), 0);
      const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

      // ... return same structure ...
    } catch (error) {
      // KEEP EXISTING FALLBACK LOGIC (lines 1321-1340)
    }
  }
```

- [ ] **Step 9: Convert parseRubric method (text-only, no images)**

Replace lines 1508-1622. This is text-only — no images needed.

```typescript
  async parseRubric(rubricText: string, yearLevel?: number): Promise<GradingCriterion[]> {
    try {
      logger.info('Parsing rubric with universal adaptive detection');

      // KEEP THE ENTIRE universalRubricPrompt (lines 1513-1558)
      const universalRubricPrompt = `...`;

      const responseText = await callOllamaWithRetry(universalRubricPrompt);

      if (!responseText) {
        throw new Error('No response from Ollama');
      }

      const criteria = this.extractJsonFromResponse(responseText, 'universal rubric parsing');
      const validatedCriteria = this.validateUniversalCriteria(criteria);
      
      // ... same logging and return ...
    } catch (error) {
      // KEEP EXISTING FALLBACK CRITERIA (lines 1579-1621)
    }
  }
```

- [ ] **Step 10: Convert gradeSubmission method (text-only)**

Replace lines 1890-2066. Text-only grading.

```typescript
  async gradeSubmission(
    studentText: string, criteria: GradingCriterion[], studentId: string,
    studentName: string, ocrWarnings: string[] = [], yearLevel?: number
  ): Promise<GradingResult> {
    try {
      logger.info(`Grading submission for ${studentName}`);

      // KEEP THE ENTIRE PROMPT (lines 1903-2012)
      const prompt = `You are an experienced professional teacher...
      ... (IDENTICAL PROMPT TEXT) ...
      }`;

      const responseText = await callOllamaWithRetry(prompt, { temperature: 0 });

      if (!responseText) {
        throw new Error('No response from Ollama');
      }

      const result = this.extractJsonFromResponse(responseText, 'grading submission');
      
      // KEEP ALL EXISTING score calculation (lines 2028-2043)
      const totalScore = result.grades.reduce((sum: number, grade: any) => sum + grade.score, 0);
      const maxScore = result.grades.reduce((sum: number, grade: any) => sum + grade.maxScore, 0);
      const percentage = Math.round((totalScore / maxScore) * 100);

      return { studentId, studentName, totalScore, maxScore, percentage, criteria: result.grades, summary: result.summary, ocrWarnings };
    } catch (error) {
      // KEEP EXISTING FALLBACK (lines 2045-2065)
    }
  }
```

- [ ] **Step 11: Convert gradeSubmissionWithCache method (text-only)**

Replace lines 2072-2264. This was the cached version — for Ollama, it becomes equivalent to `gradeSubmission` but with `system` parameter.

```typescript
  async gradeSubmissionWithCache(
    studentText: string, criteria: GradingCriterion[], studentId: string,
    studentName: string, yearLevel?: number
  ): Promise<GradingResult> {
    try {
      logger.info(`Grading submission for ${studentName} (offline)`);

      const yearLevelContext = yearLevel ? this.getYearLevelGradingContext(yearLevel) : '';

      // Combine all system messages into one system prompt string
      // KEEP ALL TEXT from lines 2089-2168 concatenated together
      const systemPrompt = `You are an experienced professional teacher...
      ${yearLevel ? `STUDENT CONTEXT: Year ${yearLevel}. ${yearLevelContext}` : ''}
      ... MARKING PROCESS, STRICTNESS, DESCRIPTOR MATCHING ...`;

      // Rubric criteria as part of system prompt
      const rubricPrompt = `MARKING RUBRIC - Apply these criteria with professional precision:
${criteria.map(c => { /* KEEP EXISTING FORMAT */ }).join('\n\n')}

Return ONLY valid JSON in this exact format:
{ "grades": [...], "summary": "..." }`;

      // Student-specific prompt
      const userPrompt = `Grade this student's essay (${studentName}):\n\n"${studentText}"\n\nApply all marking instructions and rubric criteria from the system prompt. Return ONLY valid JSON.`;

      const responseText = await callOllamaWithRetry(userPrompt, {
        system: systemPrompt + '\n\n' + rubricPrompt,
        temperature: 0
      });

      if (!responseText) throw new Error('No response from Ollama');

      const result = this.extractJsonFromResponse(responseText, 'grading submission');
      // KEEP ALL EXISTING score calculation and return (lines 2226-2241)
    } catch (error) {
      // KEEP EXISTING FALLBACK (lines 2243-2263)
    }
  }
```

- [ ] **Step 12: Update all modelUsed references and log messages**

Search and replace throughout gradingService.ts:
- `'claude-sonnet-4-5-20250929'` → `process.env.OLLAMA_MODEL || 'gemma4:31b'`
- `'No response from Claude'` → `'No response from Ollama'`
- `'Claude API'` → `'Ollama'` in log messages
- `'Claude response'` → `'AI response'` in log messages

- [ ] **Step 13: Verify gradingService.ts compiles**

```bash
cd backend && npx tsc --noEmit src/services/gradingService.ts
```

Fix any TypeScript errors.

- [ ] **Step 14: Commit**

```bash
git add backend/src/services/gradingService.ts
git commit -m "feat: replace Claude API with Ollama/Gemma4 in grading service"
```

---

### Task 4: Remove Backend Authentication

**Files:**
- Modify: `backend/src/index.ts`
- Modify: `backend/src/routes/savedRubrics.ts`
- Modify: `backend/src/database/db.ts`
- Modify: `backend/src/middleware/auth.ts`

- [ ] **Step 1: Update index.ts — remove authMiddleware from routes and add Ollama health check**

Replace lines 12, 16, 71-88 in `backend/src/index.ts`:

```typescript
// Remove these lines:
// import { authMiddleware } from './middleware/auth';
// import authRoutes from './routes/auth';

// Change protected routes to public (remove authMiddleware):
app.use('/api/rubric', rubricRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/complete-grading', completeGradingRoutes);
app.use('/api/rubrics', savedRubricsRoutes);

// Remove: app.use('/api/auth', authRoutes);

// Replace health check with Ollama-aware version:
app.get('/api/health', async (req, res) => {
  try {
    const { checkOllamaHealth } = await import('./services/ollamaClient');
    const ollamaStatus = await checkOllamaHealth();
    res.json({
      status: 'OK',
      ollama: ollamaStatus.connected
        ? (ollamaStatus.modelAvailable ? 'connected' : 'model not found')
        : 'disconnected',
      model: ollamaStatus.modelName,
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  } catch {
    res.json({
      status: 'OK',
      ollama: 'disconnected',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  }
});
```

- [ ] **Step 2: Update savedRubrics.ts — replace req.user with hardcoded local user**

Replace all `req.user!.id` with `'local-user'`:

```typescript
// Line 20: const userId = req.user!.id;
const userId = 'local-user';

// Line 90: const userId = req.user!.id;
const userId = 'local-user';

// Line 110: const userId = req.user!.id;
const userId = 'local-user';

// Line 144: const userId = req.user!.id;
const userId = 'local-user';
```

- [ ] **Step 3: Update database/db.ts — simplify for offline use**

Replace the `seedTestUser` function and remove bcrypt import:

```typescript
// Remove: import bcrypt from 'bcryptjs';
// Replace seedTestUser with seedLocalUser:
function seedLocalUser(): void {
  const localUserId = 'local-user';
  const existingUser = db.prepare('SELECT id FROM users WHERE id = ?').get(localUserId);
  
  if (!existingUser) {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO users (id, email, password_hash, name, school_name, created_at, last_login)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(localUserId, 'local@markermate.local', 'no-auth', 'Teacher', null, now, now);
    logger.info('Local user created for offline mode');
  }
}

// In initializeDatabase(): change seedTestUser() to seedLocalUser()
```

Keep the users table (saved_rubrics has a foreign key to it), but the user is just a local placeholder.

- [ ] **Step 4: Gut auth.ts middleware**

Replace `backend/src/middleware/auth.ts` contents:

```typescript
import { Request, Response, NextFunction } from 'express';

// Auth middleware disabled for offline mode — pass-through
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  next();
}
```

- [ ] **Step 5: Verify backend compiles**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/index.ts backend/src/routes/savedRubrics.ts backend/src/database/db.ts backend/src/middleware/auth.ts
git commit -m "feat: remove authentication for offline mode"
```

---

### Task 5: Update Backend Dependencies and Environment

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/.env`
- Modify: `backend/.env.example`

- [ ] **Step 1: Remove unused dependencies**

```bash
cd backend && npm uninstall @anthropic-ai/sdk bcryptjs jsonwebtoken openai tesseract.js @types/bcryptjs @types/jsonwebtoken
```

Keep: better-sqlite3, pdf-parse, p-limit, and all other deps.

- [ ] **Step 2: Update .env**

```
PORT=3001
NODE_ENV=development
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:31b
MAX_FILE_SIZE=50MB
MAX_FILES_PER_BATCH=30
LOG_LEVEL=info
LOG_FILE=logs/markermate.log
CORS_ORIGIN=http://localhost:3000
```

- [ ] **Step 3: Update .env.example**

Same content as .env but without any secrets (there are none for offline mode):

```
# Server Configuration
PORT=3001
NODE_ENV=development

# Ollama AI Configuration (local)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:31b

# File Upload Configuration
MAX_FILE_SIZE=50MB
MAX_FILES_PER_BATCH=30

# Logging
LOG_LEVEL=info
LOG_FILE=logs/markermate.log

# CORS Configuration
CORS_ORIGIN=http://localhost:3000
```

- [ ] **Step 4: Verify build still works**

```bash
cd backend && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/.env backend/.env.example
git commit -m "chore: update deps and env config for offline Ollama mode"
```

---

### Task 6: Remove Frontend Authentication

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/common/Header.tsx`
- Modify: `frontend/src/services/apiService.ts`
- Delete: `frontend/src/contexts/AuthContext.tsx`
- Delete: `frontend/src/pages/LoginPage.tsx`
- Delete: `frontend/src/pages/SignupPage.tsx`

- [ ] **Step 1: Rewrite App.tsx — remove AuthProvider, ProtectedRoute, login/signup routes**

```typescript
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { UploadPage } from './pages/UploadPage';
import { UploadRubricPage } from './pages/UploadRubricPage';
import { ResultsPage } from './pages/ResultsPage';
import { AnalysisPage } from './pages/AnalysisPage';
import { Header } from './components/common/Header';
import BetaBanner from './components/common/BetaBanner';
import Footer from './components/common/Footer';
import './assets/styles/index.css';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header />
        <BetaBanner />
        <main className="container mx-auto px-4 py-8 flex-1">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/upload-rubric" element={<UploadRubricPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/analysis" element={<AnalysisPage />} />
            <Route path="/results" element={<ResultsPage />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}

export default App;
```

- [ ] **Step 2: Rewrite Header.tsx — remove auth section**

```typescript
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export const Header: React.FC = () => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="bg-gradient-to-r from-orange-50 to-purple-50 shadow-lg border-b-2 border-orange-200">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-3 transform hover:scale-105 transition-transform">
            <img
              src={`${process.env.PUBLIC_URL}/assets/logo.png`}
              alt="MarkerMate Logo"
              className="h-10 w-auto"
            />
            <span className="text-2xl font-bold text-gray-900 font-playful">MarkerMate</span>
          </Link>

          <nav className="flex items-center space-x-4">
            <Link
              to="/"
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all transform hover:scale-105 font-playful ${
                isActive('/')
                  ? 'bg-orange-200 text-orange-800 shadow-md'
                  : 'text-gray-700 hover:bg-orange-100 hover:text-orange-700'
              }`}
            >
              Home
            </Link>
            <Link
              to="/upload"
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all transform hover:scale-105 font-playful ${
                isActive('/upload')
                  ? 'bg-orange-200 text-orange-800 shadow-md'
                  : 'text-gray-700 hover:bg-orange-100 hover:text-orange-700'
              }`}
            >
              Grade Papers
            </Link>
            <Link
              to="/upload-rubric"
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all transform hover:scale-105 font-playful ${
                isActive('/upload-rubric')
                  ? 'bg-purple-200 text-purple-800 shadow-md'
                  : 'text-gray-700 hover:bg-purple-100 hover:text-purple-700'
              }`}
            >
              Upload Rubric
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
};
```

- [ ] **Step 3: Clean up apiService.ts — remove auth token handling and auth methods**

Remove:
- Lines 10-24: `authToken` variable and request interceptor
- Lines 27-40: `AuthUser` and `AuthResponse` interfaces
- Lines 241-301: `setAuthToken`, `signup`, `login`, `logout`, `getMe` methods

The interceptor removal means the axios instance just does plain requests with no Bearer token.

- [ ] **Step 4: Delete auth-related frontend files**

```bash
rm frontend/src/contexts/AuthContext.tsx
rm frontend/src/pages/LoginPage.tsx
rm frontend/src/pages/SignupPage.tsx
```

- [ ] **Step 5: Verify frontend builds**

```bash
cd frontend && npm run build
```

Fix any import errors from removed files.

- [ ] **Step 6: Commit**

```bash
git add -A frontend/src/
git commit -m "feat: remove frontend authentication for offline mode"
```

---

### Task 7: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Rewrite CLAUDE.md to reflect offline architecture**

Update all sections:
- Project Overview: "MarkerMate Offline" using Ollama/Gemma 4 locally, no auth
- Quick Start: mention `ollama pull gemma4:31b` prerequisite, remove JWT/auth setup
- Architecture: replace Claude SDK references with Ollama client, remove auth middleware/routes
- Key Technical Details: Gemma 4 via Ollama, PDF-to-image conversion, no authentication
- Remove Authentication section entirely
- Add Ollama prerequisites section

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for offline Ollama architecture"
```

---

### Task 8: Integration Verification

- [ ] **Step 1: Verify backend compiles and starts**

```bash
cd backend && npm run build && timeout 5 npm start || true
```

- [ ] **Step 2: Verify frontend compiles and builds**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Check that health endpoint works**

Start backend, then:
```bash
curl http://localhost:3001/api/health
```

Expected response (if Ollama is not running):
```json
{"status":"OK","ollama":"disconnected","timestamp":"...","version":"1.0.0"}
```

Expected response (if Ollama is running with gemma4):
```json
{"status":"OK","ollama":"connected","model":"gemma4:31b","timestamp":"...","version":"1.0.0"}
```

- [ ] **Step 4: Verify no auth references remain**

```bash
cd backend && grep -r "CLAUDE_API_KEY\|@anthropic-ai\|jsonwebtoken\|bcryptjs" src/ --include="*.ts" | grep -v node_modules
cd frontend && grep -r "AuthContext\|useAuth\|LoginPage\|SignupPage\|Bearer" src/ --include="*.tsx" --include="*.ts" | grep -v node_modules
```

Both should return no results.

- [ ] **Step 5: Final commit with any fixes**

```bash
git add -A
git commit -m "chore: final integration fixes for offline conversion"
```

---

### Task 9: Push as New Repo

- [ ] **Step 1: Confirm with user before proceeding**

This is destructive (removes .git history). Confirm the user wants to proceed.

- [ ] **Step 2: Remove old git history and initialize new repo**

```bash
rm -rf .git
git init
git add -A
git commit -m "Initial commit: MarkerMate Offline (Ollama/Gemma4)"
```

- [ ] **Step 3: Create GitHub repo and push**

```bash
gh repo create ryansinnott/markermate-offline --public --source=. --push
```

- [ ] **Step 4: Verify repo is live**

```bash
gh repo view ryansinnott/markermate-offline --web
```
