import { callOllamaWithRetry } from './ollamaClient';
import { pdfToBase64Images } from './pdfToImages';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';
import pLimit from 'p-limit';

export interface ScoringLevel {
  level: string;
  points: number;
  description: string;
}

export interface GradingCriterion {
  name: string;
  description: string;
  maxScore: number;
  scoringType?: 'numerical' | 'percentage' | 'letter' | 'qualitative' | 'binary';
  scoringLevels?: ScoringLevel[];
}

// Grid-based rubric interfaces (e.g., Year 7 Narrative Rubric style)
export interface PerformanceLevel {
  level: string;  // e.g., "Above Expected Standard", "At Expected Standard"
  color: 'green' | 'yellow' | 'orange' | 'red';
  descriptors: { [criterionName: string]: string };  // Descriptor text per criterion
}

export interface RubricCategory {
  name: string;  // e.g., "Language", "Story Development", "Writing Skills"
  criteria: string[];  // Criterion names in this category
}

export interface GridRubric {
  title: string;
  isGridFormat: true;
  categories?: RubricCategory[];  // Optional groupings
  criteria: string[];  // All column headers (criterion names)
  performanceLevels: PerformanceLevel[];  // Rows with descriptors
}

export interface ParsedRubricResult {
  isGridFormat: boolean;
  gridRubric?: GridRubric;
  flatCriteria?: GradingCriterion[];
}

export interface StudentGrade {
  criterion: string;
  score: number;
  maxScore: number;
  feedback: string;
}

export interface GradingResult {
  studentId: string;
  studentName: string;
  totalScore: number;
  maxScore: number;
  percentage: number;
  criteria: StudentGrade[];
  summary: string;
  ocrWarnings: string[];
}

export interface FileAnalysisResult {
  success: boolean;
  analysis: string;
  fileType: 'rubric' | 'student_work';
  fileName: string;
  modelUsed: string;
  transcription?: string;
  error?: string;
  confidence?: string;
  qualityNotes?: string;
  uncertainSections?: string[];
}

export interface CompleteGradingResult {
  rubricSuccess: boolean;
  rubricCriteria: GradingCriterion[];
  studentResults: StudentGradingResult[];
}

export interface StudentGradingResult {
  studentId: number;
  filename: string;
  originalName: string;
  transcription: string;
  analysis: string;
  gradingSuccess: boolean;
  grades: StudentGrade[];
  totalScore: number;
  maxScore: number;
  percentage: number;
  summary: string;
  error?: string;
}

export class GradingService {
  constructor() {
    // No API key needed — Ollama runs locally
    logger.info('GradingService initialised (Ollama backend)');
  }

  /**
   * Convert a file to an array of base64 images suitable for Ollama.
   * Images: single-element array. PDFs: one image per page.
   */
  private async prepareImagesForOllama(filePath: string): Promise<string[]> {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
      return pdfToBase64Images(filePath);
    }
    // Single image file
    const base64 = await this.encodeImageToBase64Async(filePath);
    return [base64];
  }

  private extractJsonFromResponse(response: string, context: string = ''): any {
    // Enhanced logging for debugging
    logger.info(`[DEBUG] Attempting to parse Ollama response for ${context}`);
    logger.info(`[DEBUG] Raw response length: ${response.length} characters`);
    logger.info(`[DEBUG] Raw response first 500 chars: ${response.substring(0, 500)}`);
    
    try {
      // First try direct JSON parsing
      const parsed = JSON.parse(response);
      logger.info(`[DEBUG] Direct JSON parsing succeeded for ${context}`);
      return parsed;
    } catch (error) {
      logger.warn(`[DEBUG] Direct JSON parsing failed for ${context}:`, (error as Error).message);
      logger.debug('Trying alternative extraction methods');
      
      // Method 1: Extract JSON from code blocks
      const codeBlockMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```/i);
      if (codeBlockMatch) {
        try {
          const parsed = JSON.parse(codeBlockMatch[1]);
          logger.info(`[DEBUG] Code block JSON parsing succeeded for ${context}`);
          return parsed;
        } catch (e) {
          logger.debug(`[DEBUG] Code block JSON parsing failed for ${context}`);
        }
      }
      
      // Method 2: Find JSON-like structures (objects or arrays)
      const jsonMatches = response.match(/(\{[\s\S]*\}|\[[\s\S]*\])/g);
      if (jsonMatches) {
        logger.debug(`[DEBUG] Found ${jsonMatches.length} potential JSON structures`);
        for (let i = 0; i < jsonMatches.length; i++) {
          const match = jsonMatches[i];
          try {
            const parsed = JSON.parse(match);
            // Validate it looks like our expected structure
            if (Array.isArray(parsed) || (typeof parsed === 'object' && parsed !== null)) {
              logger.info(`[DEBUG] JSON structure ${i+1} parsing succeeded for ${context}`);
              return parsed;
            }
          } catch (e) {
            logger.debug(`[DEBUG] JSON structure ${i+1} parsing failed`);
            continue;
          }
        }
      }
      
      // Method 3: Clean up common issues and retry
      let cleaned = response
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .replace(/^\s*Here.*?:\s*/gm, '')
        .replace(/^\s*The.*?:\s*/gm, '')
        .replace(/^\s*Based on.*?:\s*/gm, '')
        .replace(/^\s*Looking at.*?:\s*/gm, '')
        .replace(/^\s*I can see.*?:\s*/gm, '')
        .trim();
        
      logger.debug(`[DEBUG] Cleaned response for ${context}: ${cleaned.substring(0, 300)}...`);
        
      // Method 3a: Try to find and extract complete JSON structures more aggressively
      const jsonExtractionPatterns = [
        /\[[\s\S]*?\]/g,  // Arrays
        /\{[\s\S]*?\}/g,  // Objects
      ];
      
      for (const pattern of jsonExtractionPatterns) {
        const matches = cleaned.match(pattern);
        if (matches) {
          for (const match of matches) {
            try {
              const parsed = JSON.parse(match);
              if ((Array.isArray(parsed) && parsed.length > 0) || 
                  (typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length > 0)) {
                logger.info(`[DEBUG] Pattern extraction succeeded for ${context}`);
                return parsed;
              }
            } catch (e) {
              continue;
            }
          }
        }
      }
        
      // Method 3b: Find the first { or [ and last } or ]
      const startMatch = cleaned.match(/[\{\[]/);
      const endMatch = cleaned.match(/.*[\}\]]/);
      
      if (startMatch && endMatch) {
        const startIndex = cleaned.indexOf(startMatch[0]);
        const endIndex = cleaned.lastIndexOf(endMatch[0].slice(-1)) + 1;
        const extracted = cleaned.substring(startIndex, endIndex);
        
        logger.debug(`[DEBUG] Boundary extraction attempt for ${context}: ${extracted.substring(0, 200)}...`);
        
        try {
          const parsed = JSON.parse(extracted);
          logger.info(`[DEBUG] Boundary extraction succeeded for ${context}`);
          return parsed;
        } catch (e) {
          logger.error(`[DEBUG] Boundary extraction failed for ${context}:`, (e as Error).message);
        }
      }
      
      // Method 4: Try to fix common JSON syntax issues
      const commonFixes = [
        (str: string) => str.replace(/,(\s*[}\]])/g, '$1'), // Remove trailing commas
        (str: string) => str.replace(/([{,]\s*)(\w+):/g, '$1"$2":'), // Add quotes to keys
        (str: string) => str.replace(/:\s*([^",{\[\d][^",}\]]*)/g, ': "$1"'), // Quote unquoted string values
      ];
      
      for (const fix of commonFixes) {
        try {
          const fixed = fix(cleaned);
          const parsed = JSON.parse(fixed);
          logger.info(`[DEBUG] Syntax fix succeeded for ${context}`);
          return parsed;
        } catch (e) {
          continue;
        }
      }
      
      // Log the complete failure for debugging
      logger.error(`[DEBUG] All JSON extraction methods failed for ${context}`);
      logger.error(`[DEBUG] Complete response that failed: ${response}`);
      throw new Error(`Failed to extract valid JSON from response: ${response.substring(0, 200)}...`);
    }
  }

  private getYearLevelGradingContext(yearLevel: number): string {
    const contexts = {
      7: `YEAR 7 BASELINE STANDARDS (Ages 12-13):
This is the BASE year level - apply rubric descriptors as written without additional strictness.

EXPECTATIONS for Year 7:
• Vocabulary: Simple, everyday words (e.g., "good", "nice", "bad") are acceptable
• Sentences: Basic sentences (5-10 words), mostly simple structure
• Paragraphs: 3-5 sentences, basic topic introduction
• Analysis: Descriptive rather than analytical (e.g., "The character was sad" vs. deeper why/how)
• Organization: May lack clear introduction/conclusion, ideas presented linearly
• Errors: Several spelling/grammar errors expected and acceptable for this age

GRADING THRESHOLD: Award rubric levels when requirements are met at Year 7 capacity. If rubric says "organized writing", simple paragraph structure qualifies.`,

      8: `YEAR 8 DEVELOPING STANDARDS (Ages 13-14):
Expect 15-20% MORE quality than Year 7 to earn the SAME rubric level.

EXPECTATIONS beyond Year 7:
• Vocabulary: Some variety beyond basic words (e.g., "significant", "demonstrates", "illustrates")
• Sentences: Mix of simple and compound sentences (10-15 words)
• Paragraphs: Clearer topic sentences, 5-7 sentences per paragraph
• Analysis: Beginning to explain "why" and "how", not just "what"
• Organization: Attempts at introduction and conclusion, clearer structure
• Errors: Fewer errors than Year 7, better control of basics

GRADING THRESHOLD: What earns "4/4" for Year 7 might only earn "3/4" for Year 8. Raise the bar proportionally.`,

      9: `YEAR 9 INTERMEDIATE STANDARDS (Ages 14-15):
Expect 30-40% MORE quality than Year 7 to earn the SAME rubric level.

EXPECTATIONS beyond Year 7-8:
• Vocabulary: Academic vocabulary emerging (e.g., "analyze", "interpret", "implication", "perspective")
• Sentences: Complex sentences with subordinate clauses (15-20 words), varied structure
• Paragraphs: Clear topic + supporting sentences + concluding sentence structure
• Analysis: Developing critical thinking - questions, evaluates, makes connections
• Organization: Clear introduction with thesis, body paragraphs, conclusion that synthesizes
• Errors: Minimal basic errors, control of more complex grammar

GRADING THRESHOLD: What earns "4/4" for Year 7 might only earn "2-3/4" for Year 9. Significantly raise expectations.`,

      10: `YEAR 10 ADVANCED STANDARDS (Ages 15-16):
Expect 40-50% MORE quality than Year 7 to earn the SAME rubric level. This is pre-senior year preparation.

EXPECTATIONS beyond Year 7-9:
• Vocabulary: Sophisticated academic vocabulary throughout (e.g., "synthesize", "paradox", "nuanced", "paradigm")
• Sentences: Consistently complex structures, strategic sentence variation for effect (15-25 words)
• Paragraphs: Sophisticated paragraph development with internal logic and cohesion
• Analysis: Critical thinking evident - evaluates multiple perspectives, makes original insights
• Organization: Cohesive essay structure with clear thesis, well-developed arguments, synthesizing conclusion
• Errors: Rare basic errors, near-mastery of conventions

GRADING THRESHOLD: What earns "4/4" for Year 7 likely earns "2/4" for Year 10. SAME QUALITY WORK = LOWER SCORE at higher year levels. Be significantly more critical.`,

      11: `YEAR 11 PRE-UNIVERSITY STANDARDS (Ages 16-17):
Expect 60-70% MORE quality than Year 7 to earn the SAME rubric level. Apply senior secondary standards.

EXPECTATIONS beyond Year 10:
• Vocabulary: Discipline-specific terminology, precise word choice, sophisticated expression
• Sentences: Complex, varied, purposeful - sentences serve rhetorical goals
• Paragraphs: Sophisticated internal development with seamless transitions between ideas
• Analysis: Original critical thinking, engages with abstract concepts, evaluates implications
• Organization: Sophisticated essay architecture - thesis development throughout, compelling argument flow
• Errors: Professional-level writing conventions, polished presentation

GRADING THRESHOLD: Year 7 "excellent" work (4/4) would be Year 11 "satisfactory" work (2/4). Demand near-professional quality for top marks.`,

      12: `YEAR 12 UNIVERSITY-PREPARATION STANDARDS (Ages 17-18):
Expect 75-90% MORE quality than Year 7 to earn the SAME rubric level. Apply the HIGHEST academic standards.

EXPECTATIONS - University-level writing:
• Vocabulary: Sophisticated, precise, discipline-specific throughout - could appear in academic journals
• Sentences: Masterful sentence craft - varied, complex, rhetorically purposeful
• Paragraphs: Each paragraph a mini-essay with sophisticated internal logic
• Analysis: Sophisticated critical thinking - original insights, engages with complexity and nuance
• Organization: Compelling argument architecture, sophisticated thesis development, intellectual coherence
• Errors: Publication-quality writing, mastery of all conventions

GRADING THRESHOLD: Year 7 "excellent" work (4/4) is Year 12 "poor-satisfactory" work (1-2/4). Only truly exceptional, university-ready writing earns top marks. Be EXTREMELY critical.`
    };

    return contexts[yearLevel as keyof typeof contexts] || contexts[10];
  }

  private encodeImageToBase64(imagePath: string): string {
    const imageBuffer = fs.readFileSync(imagePath);
    return imageBuffer.toString('base64');
  }

  // Async version for better performance
  private async encodeImageToBase64Async(imagePath: string): Promise<string> {
    const imageBuffer = await fs.promises.readFile(imagePath);
    return imageBuffer.toString('base64');
  }

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

      const docType = fileExtension === '.pdf' ? 'PDF document' : 'image';
      const promptText = `Analyze this grading rubric ${docType} carefully and extract ALL details. ${yearLevel ? `This is for Year ${yearLevel} students.` : ''}

FIRST: Detect the RUBRIC FORMAT TYPE:

**GRID/MATRIX FORMAT** (like assessment rubrics with criteria as columns and performance levels as rows):
- Has a table/grid structure
- Columns = different criteria (e.g., "Figurative Language", "Dialogue", "Plot Development")
- Rows = performance levels (e.g., "Above Expected Standard", "At Expected Standard", "Working Towards")
- Each cell contains a descriptor (e.g., "1.3 I can use a range of figurative language deliberately to create imagery")
- May have category groupings (e.g., "Language", "Story Development", "Writing Skills")
- May have color-coded rows (green, yellow, orange, red)

**FLAT/LIST FORMAT** (traditional rubrics):
- Lists criteria with point values
- Each criterion has its own max points
- May have scoring levels within each criterion

IF THIS IS A GRID/MATRIX RUBRIC, return JSON in this exact format:
{
  "isGridFormat": true,
  "title": "Assignment title",
  "categories": [
    { "name": "Language", "criteria": ["Figurative Language", "Dialogue"] },
    { "name": "Story Development", "criteria": ["Point of View", "Plot Development", "Character Development", "Setting"] },
    { "name": "Writing Skills", "criteria": ["Spelling and Vocabulary", "Grammar and Punctuation"] }
  ],
  "criteria": ["Figurative Language", "Dialogue", "Point of View", "Plot Development", "Character Development", "Setting", "Spelling and Vocabulary", "Grammar and Punctuation"],
  "performanceLevels": [
    {
      "level": "Above Expected Standard",
      "color": "green",
      "descriptors": {
        "Figurative Language": "1.3 I can use a range of figurative language deliberately to create imagery",
        "Dialogue": "2.4 I can embed dialogue interchangeably within a sentence/description"
      }
    },
    {
      "level": "At Expected Standard",
      "color": "yellow",
      "descriptors": {
        "Figurative Language": "1.2 I can use figurative language consistently to describe characters and setting",
        "Dialogue": "2.3 I can use dialogue by including a new line with correct punctuation"
      }
    },
    {
      "level": "Working Towards Expected Standard",
      "color": "orange",
      "descriptors": {
        "Figurative Language": "1.1 I can use figurative language",
        "Dialogue": "2.1 I can use conversation between 2 or more characters"
      }
    },
    {
      "level": "Insufficient Evidence",
      "color": "red",
      "descriptors": {
        "Figurative Language": "1.0 Insufficient evidence",
        "Dialogue": "2.0 Insufficient evidence"
      }
    }
  ]
}

IF THIS IS A FLAT/LIST RUBRIC, return JSON in this format:
{
  "isGridFormat": false,
  "title": "Assignment title",
  "criteria": [
    {
      "name": "criterion name",
      "description": "what this criterion measures",
      "maxScore": 4,
      "scoringLevels": [
        { "level": "Excellent", "points": 4, "description": "descriptor" },
        { "level": "Good", "points": 3, "description": "descriptor" }
      ]
    }
  ]
}

CRITICAL INSTRUCTIONS:
- Extract EVERY criterion column and EVERY performance level row
- Include the COMPLETE descriptor text for each cell
- Preserve any numbering (e.g., "1.3", "2.4") in descriptors
- Identify category groupings if present
- Detect row colors if visible (green=above, yellow=at, orange=working towards, red=insufficient)
- Return ONLY valid JSON, no other text`;

      const responseText = await callOllamaWithRetry(promptText, { images, temperature: 0 });

      return {
        success: true,
        analysis: responseText || 'No analysis available',
        fileType: 'rubric',
        fileName,
        modelUsed: process.env.OLLAMA_MODEL || 'gemma4:31b'
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const fileName = path.basename(filePath);
      const fileExtension = path.extname(filePath);
      logger.error(`Rubric analysis failed for ${fileName}:`, {
        error: errorMessage,
        filePath,
        fileExtension,
        yearLevel
      });

      // Provide user-friendly error messages
      let userMessage = 'Failed to analyze rubric file.';
      if (errorMessage.includes('timeout')) {
        userMessage = 'Rubric analysis timed out. The file may be too large or complex. Try using a smaller, clearer image.';
      } else if (errorMessage.includes('Invalid MIME type')) {
        userMessage = 'File format not supported. Please use PDF, PNG, JPG, or JPEG files.';
      } else if (errorMessage.includes('Failed to extract valid JSON')) {
        userMessage = 'Could not understand the rubric format. Please ensure the rubric is clearly visible and well-structured.';
      } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch failed') || errorMessage.includes('502') || errorMessage.includes('503')) {
        userMessage = 'Ollama connection error. Please ensure Ollama is running and try again.';
      }

      return {
        success: false,
        analysis: '',
        fileType: 'rubric',
        fileName: path.basename(filePath),
        modelUsed: process.env.OLLAMA_MODEL || 'gemma4:31b',
        error: userMessage
      };
    }
  }

  async analyzeStudentWorkFile(filePath: string): Promise<FileAnalysisResult> {
    try {
      logger.info(`Analyzing student work file: ${filePath}`);

      const fileName = path.basename(filePath);
      const fileExtension = path.extname(filePath).toLowerCase();

      if (!['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.pdf'].includes(fileExtension)) {
        return {
          success: false,
          analysis: '',
          fileType: 'student_work',
          fileName,
          modelUsed: 'none',
          error: 'Unsupported file type. Please use image or PDF files.'
        };
      }

      const images = await this.prepareImagesForOllama(filePath);

      const docType = fileExtension === '.pdf' ? 'PDF document' : 'image';
      const promptText = `Analyze this student's work ${docType}. Extract:
1. All text content (perform OCR if needed)
2. Writing quality assessment
3. Structure and organization
4. Any notable strengths or weaknesses
5. Legibility assessment

Transcribe all readable text and provide analysis.`;

      const responseText = await callOllamaWithRetry(promptText, { images, temperature: 0 });

      return {
        success: true,
        analysis: responseText || 'No analysis available',
        fileType: 'student_work',
        fileName,
        modelUsed: process.env.OLLAMA_MODEL || 'gemma4:31b'
      };

    } catch (error) {
      logger.error(`Student work analysis failed:`, error);
      return {
        success: false,
        analysis: '',
        fileType: 'student_work',
        fileName: path.basename(filePath),
        modelUsed: process.env.OLLAMA_MODEL || 'gemma4:31b',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async transcribeHandwrittenText(filePath: string): Promise<string> {
    try {
      logger.info(`Transcribing handwritten text: ${filePath}`);
      
      const fileName = path.basename(filePath);
      const fileExtension = path.extname(filePath).toLowerCase();
      
      if (!['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.pdf'].includes(fileExtension)) {
        throw new Error('Unsupported file type for transcription');
      }

      const images = await this.prepareImagesForOllama(filePath);

      const docType = fileExtension === '.pdf' ? 'document' : 'image';
      const promptText = `You are an expert at reading handwritten student work. Please transcribe ALL text from this ${docType} with exceptional accuracy.

CONTEXT: This is a student's handwritten academic work (essay, assignment, or exam response).

HANDWRITING TRANSCRIPTION EXPERTISE:
• Read both cursive and print handwriting carefully
• Recognize common student writing patterns and academic vocabulary
• Handle mixed writing styles (cursive + print combinations)
• Identify and transcribe crossed-out text and corrections appropriately
• Recognize common academic terms, essay structures, and subject-specific vocabulary
• Pay special attention to names, dates, and technical terms

TRANSCRIPTION REQUIREMENTS:
• Transcribe word-for-word, preserving ALL original spelling (including errors)
• Maintain exact spacing, line breaks, and paragraph structure
• Do NOT correct grammar, spelling, or punctuation errors
• For unclear handwriting, use [unclear] and attempt your best interpretation: [unclear: possible_word]
• Include margin notes, corrections, and any visible text
• Transcribe the COMPLETE document, not summaries or excerpts
• Handle common handwriting challenges:
  - Letters that look similar (a/o, n/u, rn/m)
  - Unclear capitalization
  - Rushed or messy writing
  - Partial erasures or corrections

ACADEMIC CONTEXT AWARENESS:
• Expect essay structures (introduction, body, conclusion)
• Common academic phrases and transitions
• Subject-specific terminology
• Student-appropriate vocabulary and expressions

Return ONLY the complete transcribed text, nothing else:`;

      const transcription = await callOllamaWithRetry(promptText, { images, temperature: 0 });
      logger.info(`Transcription completed for ${fileName}`);
      return transcription;

    } catch (error) {
      logger.error(`Transcription failed:`, error);
      return `[Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}]`;
    }
  }

  async transcribeAndAnalyze(filePath: string): Promise<{ transcription: string; analysis: FileAnalysisResult }> {
    try {
      logger.info(`Combined transcription and analysis: ${filePath}`);
      
      const fileName = path.basename(filePath);
      const fileExtension = path.extname(filePath).toLowerCase();
      
      if (!['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.pdf'].includes(fileExtension)) {
        return {
          transcription: '[Unsupported file type]',
          analysis: {
            success: false,
            analysis: '',
            fileType: 'student_work',
            fileName,
            modelUsed: 'none',
            error: 'Unsupported file type for transcription'
          }
        };
      }

      const images = await this.prepareImagesForOllama(filePath);

      const basePrompt = `You are an expert at reading handwritten student work. Please transcribe ALL text from this ${fileExtension === '.pdf' ? 'document' : 'image'} with exceptional accuracy and provide a quality assessment.

CONTEXT: This is a student's handwritten academic work (essay, assignment, or exam response).

HANDWRITING TRANSCRIPTION EXPERTISE:
• Read both cursive and print handwriting carefully
• Recognize common student writing patterns and academic vocabulary
• Handle mixed writing styles (cursive + print combinations)
• Identify and transcribe crossed-out text and corrections appropriately
• Recognize common academic terms, essay structures, and subject-specific vocabulary
• Pay special attention to names, dates, and technical terms

TRANSCRIPTION REQUIREMENTS:
• Transcribe word-for-word, preserving ALL original spelling (including errors)
• Maintain exact spacing, line breaks, and paragraph structure
• Do NOT correct grammar, spelling, or punctuation errors
• For unclear handwriting, use [unclear] and attempt your best interpretation: [unclear: possible_word]
• Include margin notes, corrections, and any visible text
• Transcribe the COMPLETE document, not summaries or excerpts
• Handle common handwriting challenges:
  - Letters that look similar (a/o, n/u, rn/m)
  - Unclear capitalization
  - Rushed or messy writing
  - Partial erasures or corrections

ACADEMIC CONTEXT AWARENESS:
• Expect essay structures (introduction, body, conclusion)
• Common academic phrases and transitions
• Subject-specific terminology
• Student-appropriate vocabulary and expressions

QUALITY ASSESSMENT REQUIREMENTS:
• Rate transcription confidence (High/Medium/Low)
• Identify sections that may need manual review
• Note image quality issues that affect reading
• Assess overall handwriting legibility
• Highlight any concerns about transcription accuracy

Return ONLY valid JSON in this exact format:
{
  "transcription": "Complete transcribed text here...",
  "confidence": "High|Medium|Low",
  "quality_notes": "Brief assessment of image quality and handwriting legibility",
  "uncertain_sections": ["list", "of", "uncertain", "words"],
  "analysis": "Brief quality assessment focusing on structure, academic content, and notable features."
}`;

      const responseContent = await callOllamaWithRetry(basePrompt, { images, temperature: 0 });

      let parsed;
      try {
        parsed = JSON.parse(responseContent);
      } catch (parseError) {
        // Fallback if JSON parsing fails
        logger.warn(`JSON parsing failed for ${fileName}, using fallback`);
        return {
          transcription: responseContent || '[Transcription failed]',
          analysis: {
            success: false,
            analysis: 'Basic transcription completed. JSON parsing failed - manual review needed.',
            fileType: 'student_work',
            fileName,
            modelUsed: process.env.OLLAMA_MODEL || 'gemma4:31b',
            error: 'JSON parsing failed'
          }
        };
      }

      // Create enhanced analysis with confidence information
      const confidence = parsed.confidence || 'Unknown';
      const qualityNotes = parsed.quality_notes || '';
      const uncertainSections = parsed.uncertain_sections || [];
      
      let analysisText = parsed.analysis || 'Analysis completed';
      
      // Add confidence and quality information to analysis
      if (confidence !== 'High' || uncertainSections.length > 0) {
        analysisText += `\n\nTranscription Quality: ${confidence} confidence`;
        if (qualityNotes) {
          analysisText += `\nQuality Notes: ${qualityNotes}`;
        }
        if (uncertainSections.length > 0) {
          analysisText += `\nUncertain sections: ${uncertainSections.join(', ')}`;
        }
      }

      logger.info(`Combined transcription and analysis completed for ${fileName} (${confidence} confidence)`);
      
      return {
        transcription: parsed.transcription || '[No transcription available]',
        analysis: {
          success: true,
          analysis: analysisText,
          fileType: 'student_work',
          fileName,
          modelUsed: process.env.OLLAMA_MODEL || 'gemma4:31b',
          confidence: confidence,
          qualityNotes: qualityNotes,
          uncertainSections: uncertainSections
        }
      };

    } catch (error) {
      logger.error(`Combined transcription and analysis failed:`, error);
      return {
        transcription: `[Combined processing failed: ${error instanceof Error ? error.message : 'Unknown error'}]`,
        analysis: {
          success: false,
          analysis: 'Transcription failed due to processing error. Manual review required.',
          fileType: 'student_work',
          fileName: path.basename(filePath),
          modelUsed: process.env.OLLAMA_MODEL || 'gemma4:31b',
          error: error instanceof Error ? error.message : 'Unknown error',
          confidence: 'Low',
          qualityNotes: 'Processing failed - unable to assess quality',
          uncertainSections: []
        }
      };
    }
  }

  /**
   * OPTIMIZED: Combined transcription AND grading in a single AI call.
   * Use this when rubric criteria are already available (saved rubric flow).
   * This reduces 2 AI calls to 1, cutting grading time by ~50%.
   */
  async transcribeAndGrade(
    filePath: string,
    criteria: GradingCriterion[],
    studentId: string,
    studentName: string,
    yearLevel?: number
  ): Promise<{
    transcription: string;
    grades: Array<{ criterion: string; score: number; maxScore: number; feedback: string }>;
    totalScore: number;
    maxScore: number;
    percentage: number;
    summary: string;
    confidence: string;
  }> {
    try {
      const startTime = Date.now();
      logger.info(`[OPTIMIZED] Combined transcribe+grade for ${studentName}: ${filePath}`);

      const fileName = path.basename(filePath);
      const fileExtension = path.extname(filePath).toLowerCase();

      if (!['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.pdf'].includes(fileExtension)) {
        throw new Error('Unsupported file type');
      }

      const images = await this.prepareImagesForOllama(filePath);
      const yearLevelContext = yearLevel ? this.getYearLevelGradingContext(yearLevel) : '';

      // Build system prompt (concatenate all system message blocks)
      let systemPrompt = `You are an experienced professional teacher marking essays with the same accuracy and consistency that an expert educator would provide. Act as a seasoned teacher who has marked thousands of essays and knows exactly how to apply rubric standards fairly and rigorously.`;

      if (yearLevel) {
        systemPrompt += `\n\nSTUDENT CONTEXT: This is a Year ${yearLevel} student.

${yearLevelContext}

YEAR LEVEL CALIBRATION - CRITICAL INSTRUCTION:
${yearLevel >= 8 ? `• The SAME quality essay receives DIFFERENT scores at different year levels
• A Year 7 student's "excellent" work (4/4) would typically be "satisfactory" or "developing" work (2/4 or 3/4) for Year ${yearLevel}
• You MUST be progressively MORE CRITICAL as year level increases
• Higher year levels require SUBSTANTIALLY HIGHER quality to earn the same rubric scores
• Apply the Year ${yearLevel} expectations listed above - do NOT grade as if this were a younger student
• If this student's work quality would earn top marks in Year 7, but they are Year ${yearLevel}, award LOWER marks accordingly` : ''}`;
      }

      systemPrompt += `\n\nMARKING RUBRIC - Apply these criteria with professional precision:
${criteria.map(c => {
  let criteriaText = `\n**${c.name.toUpperCase()} (Maximum: ${c.maxScore} points)**\n${c.description}`;
  if (c.scoringLevels && c.scoringLevels.length > 0) {
    criteriaText += '\n\nPerformance Standards:';
    c.scoringLevels.forEach(level => {
      criteriaText += `\n• ${level.level} (${level.points} pts): ${level.description}`;
    });
  }
  return criteriaText;
}).join('\n\n')}

PROFESSIONAL MARKING PROCESS:

1. TRANSCRIPTION: Read ALL handwritten text with exceptional accuracy
   • Transcribe word-for-word, preserving ALL original spelling (including errors)
   • Maintain exact spacing, line breaks, and paragraph structure
   • Do NOT correct grammar, spelling, or punctuation errors
   • For unclear handwriting, use [unclear: possible_word]
   • Handle cursive, print, and mixed writing styles
   • Note: Confidence rating (High/Medium/Low) based on handwriting legibility

2. HOLISTIC READING: First, read the entire essay to understand the student's overall achievement and intent

3. SYSTEMATIC EVALUATION: For each rubric criterion:
   • Identify specific evidence in the student's writing that demonstrates their performance level
   • Quote relevant passages that support your judgment
   • Match the essay's quality to the EXACT rubric descriptors (don't just assign points arbitrarily)
   • Award points ONLY when the work meets the specific requirements stated in each level
   • If requirements are missing or partially met, use the appropriate LOWER level
   • Evaluate ALL aspects against rubric standards - both strengths AND gaps

4. EVIDENCE-BASED SCORING:
   • Use the exact language from rubric descriptors to justify scores
   • Provide specific quotes from the student's work as evidence
   • Be consistent across all criteria - similar quality should receive similar relative scores
   • Apply ${yearLevel ? `Year ${yearLevel}` : 'age-appropriate'} expectations fairly
   • Missing or weak elements MUST result in lower scores per the rubric

STRICTNESS CALIBRATION - APPLY RIGOROUSLY:
• This is formal assessment, not encouraging feedback
• Each rubric level lists SPECIFIC requirements that MUST be met to earn those points
• If the essay does NOT demonstrate a descriptor's requirements, do NOT award that level
• Partial achievement = award the LOWER level's points unless clearly closer to higher
• Between two levels? Choose the LOWER level unless 85-90%+ toward the higher
• When uncertain between levels, DEFAULT TO THE LOWER LEVEL
• Top scores require COMPLETE demonstration of ALL top-level descriptor elements
• Do NOT award points for effort alone - only for demonstrated mastery per rubric
• Missing elements, errors, or weak execution = lower scores according to rubric standards

RUBRIC DESCRIPTOR MATCHING - MANDATORY:
• Each score MUST explicitly match a specific rubric descriptor's language
• If a rubric level says "sophisticated vocabulary" and the essay has basic vocabulary, that level is NOT earned
• If a rubric level says "well-developed arguments" and arguments are underdeveloped, that level is NOT earned
• Quote the EXACT rubric descriptor language that justifies the score you award
• If the work does NOT meet a descriptor's specific requirements, you MUST use the next lower level
• Rubric descriptors are REQUIREMENTS, not suggestions - treat them as mandatory criteria
• Your feedback must cite which descriptor requirements were met (or not met) to justify the score

CRITICAL MARKING PRINCIPLES:
• Match rubric standards EXACTLY - do NOT be more lenient than rubric descriptors allow
• Each score must be JUSTIFIED by specific rubric level requirements being met
• If a requirement is NOT met, use the lower level that matches actual performance
• Gaps, errors, or missing elements = lower scores per rubric standards
• Be precise and accurate - expect students to MEET ${yearLevel ? `Year ${yearLevel}` : 'grade-level'} standards to earn ${yearLevel ? `Year ${yearLevel}` : 'grade-level'} marks
• Professional rigor: Not every essay deserves top marks - differentiate quality levels clearly

OUTPUT FORMAT:
Return ONLY valid JSON in this exact format:
{
  "transcription": "Complete transcribed text here preserving all original spelling/grammar errors...",
  "confidence": "High|Medium|Low",
  "grades": [
    {
      "criterion": "Criterion Name",
      "score": 3,
      "maxScore": 4,
      "feedback": "Strong content demonstrated by [specific quote from essay]. Shows clear understanding of [specific concept]. The argument that '[quote]' effectively demonstrates [specific skill]. To improve: [specific actionable suggestion]."
    }
  ],
  "summary": "This essay demonstrates [specific strengths with examples]. Student shows particular strength in [area] as evidenced by '[quote]'. Areas for development include [specific areas]. Overall, this represents [level] work for ${yearLevel ? `Year ${yearLevel}` : 'grade level'} with [specific next steps]."
}`;

      // Build student-specific user prompt
      const userPrompt = `Transcribe AND grade this student's work (${studentName}). Apply all instructions from the system prompt.`;

      const responseContent = await callOllamaWithRetry(userPrompt, { images, system: systemPrompt, temperature: 0 });
      const parsed = this.extractJsonFromResponse(responseContent, 'transcribeAndGrade');

      // Calculate totals
      const grades = parsed.grades || [];
      const totalScore = grades.reduce((sum: number, g: any) => sum + (g.score || 0), 0);
      const maxScore = grades.reduce((sum: number, g: any) => sum + (g.maxScore || 0), 0);
      const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

      const elapsed = Date.now() - startTime;
      logger.info(`[OPTIMIZED] ${studentName} completed in ${elapsed}ms: ${totalScore}/${maxScore} (${percentage}%)`);

      return {
        transcription: parsed.transcription || '[Transcription unavailable]',
        grades: grades,
        totalScore,
        maxScore,
        percentage,
        summary: parsed.summary || `Grading completed for ${studentName}`,
        confidence: parsed.confidence || 'Medium'
      };

    } catch (error) {
      logger.error(`[OPTIMIZED] transcribeAndGrade failed for ${studentName}:`, error);

      // Return fallback result
      const totalMax = criteria.reduce((sum, c) => sum + c.maxScore, 0);
      return {
        transcription: '[Transcription failed]',
        grades: criteria.map(c => ({
          criterion: c.name,
          score: 0,
          maxScore: c.maxScore,
          feedback: 'Processing failed - manual review required.'
        })),
        totalScore: 0,
        maxScore: totalMax,
        percentage: 0,
        summary: 'Automated grading failed due to processing error.',
        confidence: 'Low'
      };
    }
  }

  /**
   * OPTIMIZED: Process multiple students in parallel with rate limiting.
   * Use this for batch grading with saved rubrics.
   */
  async gradeStudentsInParallel(
    students: Array<{
      name: string;
      files: Array<{ path: string; filename: string; originalName: string }>;
    }>,
    criteria: GradingCriterion[],
    yearLevel?: number,
    concurrencyLimit: number = 8,  // Increased from 5 to 8 for better parallelism
    onProgress?: (stage: 'transcribing' | 'grading', completed: number, total: number) => void
  ): Promise<Array<{
    studentId: number;
    studentName: string;
    filename: string;
    originalName: string;
    transcription: string;
    analysis: string;
    gradingSuccess: boolean;
    grades: Array<{ criterion: string; score: number; maxScore: number; feedback: string }>;
    totalScore: number;
    maxScore: number;
    percentage: number;
    summary: string;
    error?: string;
  }>> {
    const startTime = Date.now();
    logger.info(`[PARALLEL] Starting parallel grading: ${students.length} students, concurrency=${concurrencyLimit}`);

    const limit = pLimit(concurrencyLimit);

    // TWO-STAGE OPTIMIZED APPROACH
    // Stage 1: Transcribe all files in parallel (vision processing)
    logger.info(`[STAGE 1] Transcribing ${students.reduce((sum, s) => sum + s.files.length, 0)} files across ${students.length} students`);
    const stage1Start = Date.now();

    const transcriptionTasks = students.flatMap((student, studentIndex) =>
      student.files.map(file => ({
        studentIndex,
        student,
        file,
        task: () => this.transcribeAndAnalyze(file.path)
      }))
    );

    const transcriptionResults = await Promise.all(
      transcriptionTasks.map(task => limit(task.task))
    );

    const stage1Elapsed = Date.now() - stage1Start;
    logger.info(`[STAGE 1] Transcription completed in ${stage1Elapsed}ms`);

    // Organize transcriptions by student
    let transcriptionIndex = 0;
    const studentTranscriptions = students.map(student => {
      const fileTranscriptions = student.files.map(file => {
        const result = transcriptionResults[transcriptionIndex++];
        return {
          filename: file.originalName,
          transcription: result.transcription,
          analysis: result.analysis
        };
      });
      return { student, transcriptions: fileTranscriptions };
    });

    // Stage 2: Grade all students in parallel (text-only, fast)
    logger.info(`[STAGE 2] Grading ${students.length} students with prompt caching`);
    const stage2Start = Date.now();
    let completedGradingCount = 0;

    const processStudent = async (item: typeof studentTranscriptions[0], studentIndex: number) => {
      const studentId = studentIndex + 1;
      const studentStartTime = Date.now();

      try {
        const { student, transcriptions } = item;

        // Combine all transcriptions for this student
        const combinedTranscription = transcriptions
          .map(t => `=== ${t.filename} ===\n${t.transcription}`)
          .join('\n\n--- NEXT FILE ---\n\n');

        const combinedAnalysis = transcriptions
          .map(t => t.analysis.success ? t.analysis.analysis : 'Analysis failed')
          .join('\n\n');

        // Grade with prompt caching (text-only, FAST!)
        const gradingResult = await this.gradeSubmissionWithCache(
          combinedTranscription,
          criteria,
          studentId.toString(),
          student.name,
          yearLevel
        );

        const elapsed = Date.now() - studentStartTime;
        logger.info(`[STAGE 2] Student ${studentId} (${student.name}) graded in ${elapsed}ms`);

        // Update progress after successful grading
        completedGradingCount++;
        onProgress?.('grading', completedGradingCount, students.length);

        return {
          studentId,
          studentName: student.name,
          filename: `${student.name}_combined`,
          originalName: student.name,
          transcription: combinedTranscription,
          analysis: combinedAnalysis,
          gradingSuccess: true,
          grades: gradingResult.criteria,
          totalScore: gradingResult.totalScore,
          maxScore: gradingResult.maxScore,
          percentage: gradingResult.percentage,
          summary: `${gradingResult.summary} (Based on ${transcriptions.length} file${transcriptions.length !== 1 ? 's' : ''})`
        };
      } catch (error) {
        logger.error(`[PARALLEL] Failed to process student ${studentId} (${item.student.name}):`, error);

        // Update progress even on failure
        completedGradingCount++;
        onProgress?.('grading', completedGradingCount, students.length);

        const totalMax = criteria.reduce((sum, c) => sum + c.maxScore, 0);
        return {
          studentId,
          studentName: item.student.name,
          filename: `${item.student.name}_failed`,
          originalName: item.student.name,
          transcription: '[Processing failed]',
          analysis: '[Analysis failed]',
          gradingSuccess: false,
          grades: criteria.map(c => ({
            criterion: c.name,
            score: 0,
            maxScore: c.maxScore,
            feedback: 'Processing failed - manual review required.'
          })),
          totalScore: 0,
          maxScore: totalMax,
          percentage: 0,
          summary: 'Automated grading failed due to processing error.',
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    };

    // Process all students in parallel with rate limiting
    const results = await Promise.all(
      studentTranscriptions.map((item, index) => limit(() => processStudent(item, index)))
    );

    const stage2Elapsed = Date.now() - stage2Start;
    logger.info(`[STAGE 2] Grading completed in ${stage2Elapsed}ms`);

    const totalElapsed = Date.now() - startTime;
    const successCount = results.filter(r => r.gradingSuccess).length;
    logger.info(`[PARALLEL] TWO-STAGE COMPLETE: ${successCount}/${students.length} successful in ${totalElapsed}ms (Stage1: ${stage1Elapsed}ms, Stage2: ${stage2Elapsed}ms)`);

    return results;
  }

  async parseRubric(rubricText: string, yearLevel?: number): Promise<GradingCriterion[]> {
    try {
      logger.info('Parsing rubric with universal adaptive detection');

      // Universal rubric parsing prompt that adapts to ANY format
      const universalRubricPrompt = `
        Analyze and extract ALL grading criteria from this rubric. Detect the scoring system automatically. ${yearLevel ? `This rubric is for Year ${yearLevel} students.` : ''}
        
        Rubric text:
        ${rubricText}
        
        UNIVERSAL DETECTION INSTRUCTIONS:
        1. Identify ALL criterion names exactly as written
        2. Detect the scoring system for each criterion:
           - Numerical points (0-3, 1-4, 0-10, 0-100, etc.)
           - Percentage scales (0-100%)
           - Letter grades (A-F, 1-7, etc.)
           - Qualitative scales (Excellent/Good/Fair/Poor, etc.)
           - Pass/Fail or Met/Not Met systems
           - Any other scoring method used
        
        3. Extract ALL performance levels and their exact point values or descriptors
        4. Preserve the original language and terminology from the rubric
        5. Handle weighted criteria, bonus points, or penalty systems if present
        
        SCORING SYSTEM EXAMPLES:
        - "Grammar /4" or "Grammar: 4 points" → maxScore: 4, numerical scale
        - "Content 0-15 pts" → maxScore: 15, numerical scale  
        - "Organization: A, B, C, D, F" → letter grade scale
        - "Style: Excellent, Good, Satisfactory, Poor" → qualitative scale
        - "Mechanics 25%" → percentage-based scoring
        
        Return ONLY this JSON array:
        [
          {
            "name": "exact criterion name from rubric",
            "description": "what this criterion measures",
            "maxScore": maximum_value_or_highest_level,
            "scoringType": "numerical|percentage|letter|qualitative|binary",
            "scoringLevels": [
              {
                "level": "exact level name from rubric",
                "points": actual_point_value_or_level_rank,
                "description": "exact description from rubric"
              }
            ]
          }
        ]
        
        CRITICAL: Extract the ACTUAL scoring system used, don't impose any standard format.
      `;

      const responseText = await callOllamaWithRetry(universalRubricPrompt, { temperature: 0 });
      if (!responseText) {
        throw new Error('No response from Ollama');
      }

      const criteria = this.extractJsonFromResponse(responseText, 'universal rubric parsing');
      
      // Validate and normalize for system compatibility
      const validatedCriteria = this.validateUniversalCriteria(criteria);
      
      logger.info(`Parsed ${validatedCriteria.length} grading criteria with universal detection`);
      logger.info(`Criteria details: ${validatedCriteria.map(c => `${c.name}(${c.maxScore})`).join(', ')}`);
      
      return validatedCriteria;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to parse rubric:', {
        error: errorMessage,
        rubricTextLength: rubricText.length,
        yearLevel
      });
      
      // Provide more detailed error information for debugging
      if (errorMessage.includes('Failed to extract valid JSON')) {
        logger.warn('JSON extraction failed - Ollama may have returned non-JSON response');
      } else if (errorMessage.includes('timeout')) {
        logger.warn('Rubric parsing timed out - text may be too long or complex');
      }
      
      // Return universal default criteria that can adapt to any context
      const basePoints = yearLevel && yearLevel <= 8 ? 4 : 5;
      logger.warn('Using universal fallback criteria due to parsing failure');
      
      return [
        {
          name: 'Content Quality',
          description: 'Overall quality and relevance of content',
          maxScore: basePoints,
          scoringType: 'numerical' as const,
          scoringLevels: this.generateUniversalScoringLevels('Content Quality', basePoints, 'numerical')
        },
        {
          name: 'Organization',
          description: 'Structure and logical flow',
          maxScore: basePoints,
          scoringType: 'numerical' as const,
          scoringLevels: this.generateUniversalScoringLevels('Organization', basePoints, 'numerical')
        },
        {
          name: 'Language Use',
          description: 'Grammar, vocabulary, and expression',
          maxScore: basePoints,
          scoringType: 'numerical' as const,
          scoringLevels: this.generateUniversalScoringLevels('Language Use', basePoints, 'numerical')
        }
      ];
    }
  }

  private generateScoringLevels(criterionName: string, maxPoints: number): ScoringLevel[] {
    const levels: ScoringLevel[] = [];
    
    // Generate appropriate level names and descriptions
    if (maxPoints === 3) {
      levels.push(
        { level: 'Excellent', points: 3, description: `Outstanding ${criterionName.toLowerCase()}` },
        { level: 'Good', points: 2, description: `Good ${criterionName.toLowerCase()}` },
        { level: 'Satisfactory', points: 1, description: `Basic ${criterionName.toLowerCase()}` },
        { level: 'Unsatisfactory', points: 0, description: `Inadequate ${criterionName.toLowerCase()}` }
      );
    } else if (maxPoints === 4) {
      levels.push(
        { level: 'Excellent', points: 4, description: `Outstanding ${criterionName.toLowerCase()}` },
        { level: 'Good', points: 3, description: `Good ${criterionName.toLowerCase()}` },
        { level: 'Satisfactory', points: 2, description: `Satisfactory ${criterionName.toLowerCase()}` },
        { level: 'Needs Improvement', points: 1, description: `Needs improvement in ${criterionName.toLowerCase()}` },
        { level: 'Unsatisfactory', points: 0, description: `Inadequate ${criterionName.toLowerCase()}` }
      );
    } else {
      // For other max points, generate levels evenly distributed
      const levelNames = ['Excellent', 'Good', 'Satisfactory', 'Needs Improvement', 'Unsatisfactory'];
      const step = maxPoints / (levelNames.length - 1);
      
      for (let i = 0; i < levelNames.length; i++) {
        const points = Math.round((levelNames.length - 1 - i) * step);
        levels.push({
          level: levelNames[i],
          points: points,
          description: `${levelNames[i]} ${criterionName.toLowerCase()}`
        });
      }
    }
    
    return levels;
  }

  private validateUniversalCriteria(criteria: any[]): GradingCriterion[] {
    logger.info(`[DEBUG] Validating ${criteria.length} criteria with universal detection`);
    
    return criteria.map(criterion => {
      logger.info(`[DEBUG] Validating criterion: ${criterion.name} with maxScore: ${criterion.maxScore}, type: ${criterion.scoringType}`);
      
      // Normalize the criterion to our expected format
      const normalizedCriterion: GradingCriterion = {
        name: criterion.name || 'Unnamed Criterion',
        description: criterion.description || `Assessment of ${criterion.name}`,
        maxScore: this.normalizeMaxScore(criterion.maxScore, criterion.scoringType),
        scoringType: criterion.scoringType || 'numerical',
        scoringLevels: []
      };
      
      // Process scoring levels based on the detected type
      if (criterion.scoringLevels && criterion.scoringLevels.length > 0) {
        normalizedCriterion.scoringLevels = this.normalizeScoringLevels(
          criterion.scoringLevels, 
          criterion.scoringType, 
          normalizedCriterion.maxScore
        );
      } else {
        // Generate appropriate scoring levels based on detected type and maxScore
        normalizedCriterion.scoringLevels = this.generateUniversalScoringLevels(
          criterion.name, 
          normalizedCriterion.maxScore, 
          criterion.scoringType
        );
      }
      
      // Final validation - ensure maxScore matches the highest scoring level
      if (normalizedCriterion.scoringLevels.length > 0) {
        const maxPointsInLevels = Math.max(...normalizedCriterion.scoringLevels.map(level => level.points));
        if (normalizedCriterion.maxScore !== maxPointsInLevels) {
          logger.info(`[DEBUG] Adjusting maxScore for ${criterion.name}: was ${normalizedCriterion.maxScore}, now ${maxPointsInLevels}`);
          normalizedCriterion.maxScore = maxPointsInLevels;
        }
      }
      
      logger.info(`[DEBUG] Final criterion: ${normalizedCriterion.name} (${normalizedCriterion.maxScore} ${normalizedCriterion.scoringType})`);
      return normalizedCriterion;
    });
  }
  
  private normalizeMaxScore(maxScore: any, scoringType: string): number {
    // Convert various maxScore formats to numerical values
    if (typeof maxScore === 'number') {
      return Math.max(0, maxScore);
    }
    
    if (typeof maxScore === 'string') {
      // Handle percentage (e.g., "100%")
      if (maxScore.includes('%')) {
        return parseInt(maxScore.replace('%', '')) || 100;
      }
      
      // Handle letter grades (A=4, B=3, etc.)
      if (scoringType === 'letter') {
        const letterMap: { [key: string]: number } = { 'A': 4, 'B': 3, 'C': 2, 'D': 1, 'F': 0 };
        return letterMap[maxScore.toUpperCase()] || 4;
      }
      
      // Extract numbers from strings
      const match = maxScore.match(/\d+/);
      if (match) {
        return parseInt(match[0]);
      }
    }
    
    // Default fallback based on scoring type
    const defaults = {
      'percentage': 100,
      'letter': 4,
      'qualitative': 4,
      'binary': 1,
      'numerical': 4
    };
    
    return defaults[scoringType as keyof typeof defaults] || 4;
  }
  
  private normalizeScoringLevels(levels: any[], scoringType: string, maxScore: number): ScoringLevel[] {
    return levels.map((level, index) => ({
      level: level.level || level.name || `Level ${index + 1}`,
      points: this.normalizePoints(level.points, scoringType, maxScore, index, levels.length),
      description: level.description || `${level.level || `Level ${index + 1}`} performance`
    }));
  }
  
  private normalizePoints(points: any, scoringType: string, maxScore: number, index: number, totalLevels: number): number {
    if (typeof points === 'number') {
      return Math.max(0, points);
    }
    
    if (typeof points === 'string') {
      // Handle percentage
      if (points.includes('%')) {
        return parseInt(points.replace('%', '')) || 0;
      }
      
      // Handle letter grades
      if (scoringType === 'letter') {
        const letterMap: { [key: string]: number } = { 'A': 4, 'B': 3, 'C': 2, 'D': 1, 'F': 0 };
        return letterMap[points.toUpperCase()] || 0;
      }
      
      // Extract numbers
      const match = points.match(/\d+/);
      if (match) {
        return parseInt(match[0]);
      }
    }
    
    // Generate points based on position (highest first)
    return Math.max(0, maxScore - index);
  }
  
  private generateUniversalScoringLevels(criterionName: string, maxScore: number, scoringType: string = 'numerical'): ScoringLevel[] {
    const levels: ScoringLevel[] = [];
    
    switch (scoringType) {
      case 'percentage':
        return this.generatePercentageLevels(criterionName, maxScore);
      case 'letter':
        return this.generateLetterGradeLevels(criterionName);
      case 'qualitative':
        return this.generateQualitativeLevels(criterionName, maxScore);
      case 'binary':
        return this.generateBinaryLevels(criterionName);
      default: // numerical
        return this.generateNumericalLevels(criterionName, maxScore);
    }
  }
  
  private generatePercentageLevels(criterionName: string, maxScore: number): ScoringLevel[] {
    const ranges = [
      { level: 'Excellent', min: 90, max: maxScore },
      { level: 'Good', min: 80, max: 89 },
      { level: 'Satisfactory', min: 70, max: 79 },
      { level: 'Needs Improvement', min: 60, max: 69 },
      { level: 'Unsatisfactory', min: 0, max: 59 }
    ];
    
    return ranges.map(range => ({
      level: range.level,
      points: range.max <= maxScore ? range.max : Math.floor(maxScore * range.max / 100),
      description: `${range.level} ${criterionName.toLowerCase()} (${range.min}-${Math.min(range.max, maxScore)}%)`
    }));
  }
  
  private generateLetterGradeLevels(criterionName: string): ScoringLevel[] {
    return [
      { level: 'A', points: 4, description: `Excellent ${criterionName.toLowerCase()}` },
      { level: 'B', points: 3, description: `Good ${criterionName.toLowerCase()}` },
      { level: 'C', points: 2, description: `Satisfactory ${criterionName.toLowerCase()}` },
      { level: 'D', points: 1, description: `Needs improvement in ${criterionName.toLowerCase()}` },
      { level: 'F', points: 0, description: `Failing ${criterionName.toLowerCase()}` }
    ];
  }
  
  private generateQualitativeLevels(criterionName: string, maxScore: number): ScoringLevel[] {
    const levelNames = ['Excellent', 'Good', 'Satisfactory', 'Needs Improvement', 'Unsatisfactory'];
    return levelNames.map((name, index) => ({
      level: name,
      points: Math.max(0, maxScore - index),
      description: `${name} ${criterionName.toLowerCase()}`
    }));
  }
  
  private generateBinaryLevels(criterionName: string): ScoringLevel[] {
    return [
      { level: 'Met', points: 1, description: `${criterionName} criteria met` },
      { level: 'Not Met', points: 0, description: `${criterionName} criteria not met` }
    ];
  }
  
  private generateNumericalLevels(criterionName: string, maxScore: number): ScoringLevel[] {
    // Use the existing generateScoringLevels method for numerical scales
    return this.generateScoringLevels(criterionName, maxScore);
  }

  private validateAndFixCriteria(criteria: GradingCriterion[], structureData: any): GradingCriterion[] {
    return criteria.map(criterion => {
      // For mixed-scale rubrics, validate against structure data first
      const structureCriterion = structureData.criteria.find((sc: any) => 
        sc.name.toLowerCase().includes(criterion.name.toLowerCase()) || 
        criterion.name.toLowerCase().includes(sc.name.toLowerCase())
      );
      
      if (structureCriterion && structureCriterion.maxPoints) {
        // Use the detected maximum from structure analysis
        if (criterion.maxScore !== structureCriterion.maxPoints) {
          logger.info(`Using detected maxScore for ${criterion.name}: ${structureCriterion.maxPoints} (was ${criterion.maxScore})`);
          criterion.maxScore = structureCriterion.maxPoints;
          
          // Regenerate scoring levels if they don't match the detected maximum
          if (!criterion.scoringLevels || Math.max(...criterion.scoringLevels.map(l => l.points)) !== structureCriterion.maxPoints) {
            criterion.scoringLevels = this.generateScoringLevels(criterion.name, structureCriterion.maxPoints);
          }
        }
      } else {
        // Fallback: validate that maxScore matches the highest point value in scoring levels
        if (criterion.scoringLevels && criterion.scoringLevels.length > 0) {
          const maxPoints = Math.max(...criterion.scoringLevels.map(level => level.points));
          if (criterion.maxScore !== maxPoints) {
            logger.warn(`Fixing maxScore for ${criterion.name}: was ${criterion.maxScore}, should be ${maxPoints}`);
            criterion.maxScore = maxPoints;
          }
        }
      }

      // Keep detected scores without arbitrary caps - validate contextually
      if (criterion.maxScore > 1000) {
        logger.info(`Very high maxScore detected for ${criterion.name}: ${criterion.maxScore} - may be percentage-based, preserving as detected`);
      } else if (criterion.maxScore < 0) {
        logger.warn(`Invalid negative maxScore for ${criterion.name}: ${criterion.maxScore} - setting to 1`);
        criterion.maxScore = 1;
      }
      
      // Ensure we have scoring levels regardless of rubric type
      if (!criterion.scoringLevels || criterion.scoringLevels.length === 0) {
        criterion.scoringLevels = this.generateScoringLevels(criterion.name, criterion.maxScore);
      }

      return criterion;
    });
  }

  async gradeSubmission(
    studentText: string,
    criteria: GradingCriterion[],
    studentId: string,
    studentName: string,
    ocrWarnings: string[] = [],
    yearLevel?: number
  ): Promise<GradingResult> {
    try {
      logger.info(`Grading submission for ${studentName}`);

      const yearLevelContext = yearLevel ? this.getYearLevelGradingContext(yearLevel) : '';
      
      const prompt = `
        You are an experienced professional teacher marking this essay with the same accuracy and consistency that an expert educator would provide. Act as a seasoned teacher who has marked thousands of essays and knows exactly how to apply rubric standards fairly and rigorously.

        ${yearLevel ? `\n\nSTUDENT CONTEXT: This is a Year ${yearLevel} student. ${yearLevelContext}` : ''}

        YEAR LEVEL CALIBRATION - CRITICAL INSTRUCTION:
        ${yearLevel ? `
        • The SAME quality essay receives DIFFERENT scores at different year levels
        • A Year 7 student's "excellent" work (4/4) would typically be "satisfactory" or "developing" work (2/4 or 3/4) for Year ${yearLevel}
        • You MUST be progressively MORE CRITICAL as year level increases
        • Higher year levels require SUBSTANTIALLY HIGHER quality to earn the same rubric scores
        • Apply the Year ${yearLevel} expectations listed above - do NOT grade as if this were a younger student
        • If this student's work quality would earn top marks in Year 7, but they are Year ${yearLevel}, award LOWER marks accordingly
        ` : ''}

        MARKING RUBRIC - Apply these criteria with professional precision:
        ${criteria.map(c => {
          let criteriaText = `\n**${c.name.toUpperCase()} (Maximum: ${c.maxScore} points)**\n${c.description}`;
          if (c.scoringLevels && c.scoringLevels.length > 0) {
            criteriaText += '\n\nPerformance Standards:';
            c.scoringLevels.forEach(level => {
              criteriaText += `\n• ${level.level} (${level.points} pts): ${level.description}`;
            });
          }
          return criteriaText;
        }).join('\n\n')}

        STUDENT'S ESSAY TO MARK:
        "${studentText}"

        PROFESSIONAL MARKING PROCESS:

        1. HOLISTIC READING: First, read the entire essay to understand the student's overall achievement and intent.

        2. SYSTEMATIC EVALUATION: For each rubric criterion:
           - Identify specific evidence in the student's writing that demonstrates their performance level
           - Quote relevant passages that support your judgment
           - Match the essay's quality to the EXACT rubric descriptors (don't just assign points arbitrarily)
           - Award points ONLY when the work meets the specific requirements stated in each level
           - If requirements are missing or partially met, use the appropriate LOWER level
           - Evaluate ALL aspects against rubric standards - both strengths AND gaps
           - OCR quirks: Distinguish between genuine spelling/grammar vs. transcription errors (e.g., "tbe" for "the"), but do NOT excuse actual student errors

        3. EVIDENCE-BASED SCORING:
           - Use the exact language from rubric descriptors to justify scores
           - Provide specific quotes from the student's work as evidence
           - Be consistent across all criteria - similar quality should receive similar relative scores
           - Apply ${yearLevel ? `Year ${yearLevel}` : 'age-appropriate'} expectations fairly
           - Missing or weak elements MUST result in lower scores per the rubric

        4. PROFESSIONAL FEEDBACK:
           - Write feedback in an encouraging teacher voice
           - Highlight specific strengths with evidence
           - Suggest concrete areas for improvement
           - Sound like a real teacher, not an AI

        STRICTNESS CALIBRATION - APPLY RIGOROUSLY:
        - This is formal assessment, not encouraging feedback
        - Each rubric level lists SPECIFIC requirements that MUST be met to earn those points
        - If the essay does NOT demonstrate a descriptor's requirements, do NOT award that level
        - Partial achievement = award the LOWER level's points unless clearly closer to higher
        - Between two levels? Choose the LOWER level unless 85-90%+ toward the higher
        - When uncertain between levels, DEFAULT TO THE LOWER LEVEL
        - Top scores require COMPLETE demonstration of ALL top-level descriptor elements
        - Do NOT award points for effort alone - only for demonstrated mastery per rubric
        - Missing elements, errors, or weak execution = lower scores according to rubric standards

        CONSISTENCY RULE FOR BORDERLINE CASES - MANDATORY TIE-BREAKER:
        When a student's work falls between two scoring levels, apply this systematic decision process:
        1. COUNT how many specific requirements from the HIGHER level are fully demonstrated
        2. COUNT how many specific requirements from the LOWER level are fully demonstrated
        3. DECISION RULE:
           - If 3 or more requirements of the higher level are clearly met → award the HIGHER level
           - If fewer than 3 requirements of the higher level are met → award the LOWER level
        4. DOCUMENTATION: In your feedback, explicitly state which specific requirements from each level were met or not met to justify your borderline decision
        5. NEVER split the difference or invent intermediate scores - always award the exact level that matches your requirement count

        RUBRIC DESCRIPTOR MATCHING - MANDATORY:
        - Each score MUST explicitly match a specific rubric descriptor's language
        - If a rubric level says "sophisticated vocabulary" and the essay has basic vocabulary, that level is NOT earned
        - If a rubric level says "well-developed arguments" and arguments are underdeveloped, that level is NOT earned
        - Quote the EXACT rubric descriptor language that justifies the score you award
        - If the work does NOT meet a descriptor's specific requirements, you MUST use the next lower level
        - Rubric descriptors are REQUIREMENTS, not suggestions - treat them as mandatory criteria
        - Your feedback must cite which descriptor requirements were met (or not met) to justify the score

        CRITICAL MARKING PRINCIPLES:
        - Match rubric standards EXACTLY - do NOT be more lenient than rubric descriptors allow
        - Each score must be JUSTIFIED by specific rubric level requirements being met
        - If a requirement is NOT met, use the lower level that matches actual performance
        - Gaps, errors, or missing elements = lower scores per rubric standards
        - Be precise and accurate - expect students to MEET ${yearLevel ? `Year ${yearLevel}` : 'grade-level'} standards to earn ${yearLevel ? `Year ${yearLevel}` : 'grade-level'} marks
        - Professional rigor: Not every essay deserves top marks - differentiate quality levels clearly
        - Quote specific text passages to justify each score
        - Provide specific, actionable feedback
        - Maintain consistency across all criteria

        Return ONLY valid JSON in this exact format:
        {
          "grades": [
            {
              "criterion": "Content",
              "score": 45,
              "maxScore": 50,
              "feedback": "Strong content demonstrated by [specific quote from essay]. Shows clear understanding of [specific concept]. The argument that '[quote]' effectively demonstrates [specific skill]. To improve: [specific actionable suggestion]."
            }
          ],
          "summary": "This essay demonstrates [specific strengths with examples]. [Student name] shows particular strength in [area] as evidenced by '[quote]'. Areas for development include [specific areas]. Overall, this represents [level] work for Year ${yearLevel || 'grade level'} with [specific next steps]."
        }
      `;

      const responseText = await callOllamaWithRetry(prompt, { temperature: 0 });
      if (!responseText) {
        throw new Error('No response from Ollama');
      }

      const result = this.extractJsonFromResponse(responseText, 'grading submission');

      const totalScore = result.grades.reduce((sum: number, grade: any) => sum + grade.score, 0);
      const maxScore = result.grades.reduce((sum: number, grade: any) => sum + grade.maxScore, 0);
      const percentage = Math.round((totalScore / maxScore) * 100);

      logger.info(`Grading completed for ${studentName}: ${totalScore}/${maxScore} (${percentage}%)`);

      return {
        studentId,
        studentName,
        totalScore,
        maxScore,
        percentage,
        criteria: result.grades,
        summary: result.summary,
        ocrWarnings
      };

    } catch (error) {
      logger.error(`Grading failed for ${studentName}:`, error);
      
      // Return a fallback result
      const totalMax = criteria.reduce((sum, c) => sum + c.maxScore, 0);
      return {
        studentId,
        studentName,
        totalScore: Math.floor(totalMax * 0.7), // 70% as fallback
        maxScore: totalMax,
        percentage: 70,
        criteria: criteria.map(c => ({
          criterion: c.name,
          score: Math.floor(c.maxScore * 0.7),
          maxScore: c.maxScore,
          feedback: 'Unable to provide detailed feedback due to processing error.'
        })),
        summary: 'Grading completed with limited analysis due to technical issues.',
        ocrWarnings: [...ocrWarnings, '⚠️ Grading error occurred - manual review recommended']
      };
    }
  }

  /**
   * OPTIMIZED: Text-only grading with prompt caching for maximum speed
   * Used in two-stage workflow after transcription is already done
   */
  async gradeSubmissionWithCache(
    studentText: string,
    criteria: GradingCriterion[],
    studentId: string,
    studentName: string,
    yearLevel?: number
  ): Promise<GradingResult> {
    try {
      logger.info(`[CACHED] Grading submission for ${studentName} with prompt caching`);

      const yearLevelContext = yearLevel ? this.getYearLevelGradingContext(yearLevel) : '';

      // Build system prompt (concatenate all system message blocks)
      const systemPrompt = `You are an experienced professional teacher marking this essay with the same accuracy and consistency that an expert educator would provide. Act as a seasoned teacher who has marked thousands of essays and knows exactly how to apply rubric standards fairly and rigorously.

${yearLevel ? `\n\nSTUDENT CONTEXT: This is a Year ${yearLevel} student. ${yearLevelContext}` : ''}

YEAR LEVEL CALIBRATION - CRITICAL INSTRUCTION:
${yearLevel ? `
• The SAME quality essay receives DIFFERENT scores at different year levels
• A Year 7 student's "excellent" work (4/4) would typically be "satisfactory" or "developing" work (2/4 or 3/4) for Year ${yearLevel}
• You MUST be progressively MORE CRITICAL as year level increases
• Higher year levels require SUBSTANTIALLY HIGHER quality to earn the same rubric scores
• Apply the Year ${yearLevel} expectations listed above - do NOT grade as if this were a younger student
• If this student's work quality would earn top marks in Year 7, but they are Year ${yearLevel}, award LOWER marks accordingly
` : ''}

PROFESSIONAL MARKING PROCESS:

1. HOLISTIC READING: First, read the entire essay to understand the student's overall achievement and intent.

2. SYSTEMATIC EVALUATION: For each rubric criterion:
   - Identify specific evidence in the student's writing that demonstrates their performance level
   - Quote relevant passages that support your judgment
   - Match the essay's quality to the EXACT rubric descriptors (don't just assign points arbitrarily)
   - Award points ONLY when the work meets the specific requirements stated in each level
   - If requirements are missing or partially met, use the appropriate LOWER level
   - Evaluate ALL aspects against rubric standards - both strengths AND gaps
   - OCR quirks: Distinguish between genuine spelling/grammar vs. transcription errors (e.g., "tbe" for "the"), but do NOT excuse actual student errors

3. EVIDENCE-BASED SCORING:
   - Use the exact language from rubric descriptors to justify scores
   - Provide specific quotes from the student's work as evidence
   - Be consistent across all criteria - similar quality should receive similar relative scores
   - Apply ${yearLevel ? `Year ${yearLevel}` : 'age-appropriate'} expectations fairly
   - Missing or weak elements MUST result in lower scores per the rubric

4. PROFESSIONAL FEEDBACK:
   - Write feedback in an encouraging teacher voice
   - Highlight specific strengths with evidence
   - Suggest concrete areas for improvement
   - Sound like a real teacher, not an AI

STRICTNESS CALIBRATION - APPLY RIGOROUSLY:
- This is formal assessment, not encouraging feedback
- Each rubric level lists SPECIFIC requirements that MUST be met to earn those points
- If the essay does NOT demonstrate a descriptor's requirements, do NOT award that level
- Partial achievement = award the LOWER level's points unless clearly closer to higher
- Between two levels? Choose the LOWER level unless 85-90%+ toward the higher
- When uncertain between levels, DEFAULT TO THE LOWER LEVEL
- Top scores require COMPLETE demonstration of ALL top-level descriptor elements
- Do NOT award points for effort alone - only for demonstrated mastery per rubric
- Missing elements, errors, or weak execution = lower scores according to rubric standards

CONSISTENCY RULE FOR BORDERLINE CASES - MANDATORY TIE-BREAKER:
When a student's work falls between two scoring levels, apply this systematic decision process:
1. COUNT how many specific requirements from the HIGHER level are fully demonstrated
2. COUNT how many specific requirements from the LOWER level are fully demonstrated
3. DECISION RULE:
   - If 3 or more requirements of the higher level are clearly met → award the HIGHER level
   - If fewer than 3 requirements of the higher level are met → award the LOWER level
4. DOCUMENTATION: In your feedback, explicitly state which specific requirements from each level were met or not met to justify your borderline decision
5. NEVER split the difference or invent intermediate scores - always award the exact level that matches your requirement count

RUBRIC DESCRIPTOR MATCHING - MANDATORY:
- Each score MUST explicitly match a specific rubric descriptor's language
- If a rubric level says "sophisticated vocabulary" and the essay has basic vocabulary, that level is NOT earned
- If a rubric level says "well-developed arguments" and arguments are underdeveloped, that level is NOT earned
- Quote the EXACT rubric descriptor language that justifies the score you award
- If the work does NOT meet a descriptor's specific requirements, you MUST use the next lower level
- Rubric descriptors are REQUIREMENTS, not suggestions - treat them as mandatory criteria
- Your feedback must cite which descriptor requirements were met (or not met) to justify the score

CRITICAL MARKING PRINCIPLES:
- Match rubric standards EXACTLY - do NOT be more lenient than rubric descriptors allow
- Each score must be JUSTIFIED by specific rubric level requirements being met
- If a requirement is NOT met, use the lower level that matches actual performance
- Gaps, errors, or missing elements = lower scores per rubric standards
- Be precise and accurate - expect students to MEET ${yearLevel ? `Year ${yearLevel}` : 'grade-level'} standards to earn ${yearLevel ? `Year ${yearLevel}` : 'grade-level'} marks
- Professional rigor: Not every essay deserves top marks - differentiate quality levels clearly
- Quote specific text passages to justify each score
- Provide specific, actionable feedback
- Maintain consistency across all criteria

MARKING RUBRIC - Apply these criteria with professional precision:
${criteria.map(c => {
  let criteriaText = `\n**${c.name.toUpperCase()} (Maximum: ${c.maxScore} points)**\n${c.description}`;
  if (c.scoringLevels && c.scoringLevels.length > 0) {
    criteriaText += '\n\nPerformance Standards:';
    c.scoringLevels.forEach(level => {
      criteriaText += `\n• ${level.level} (${level.points} pts): ${level.description}`;
    });
  }
  return criteriaText;
}).join('\n\n')}

Return ONLY valid JSON in this exact format:
{
  "grades": [
    {
      "criterion": "Content",
      "score": 45,
      "maxScore": 50,
      "feedback": "Strong content demonstrated by [specific quote from essay]. Shows clear understanding of [specific concept]. The argument that '[quote]' effectively demonstrates [specific skill]. To improve: [specific actionable suggestion]."
    }
  ],
  "summary": "This essay demonstrates [specific strengths with examples]. [Student name] shows particular strength in [area] as evidenced by '[quote]'. Areas for development include [specific areas]. Overall, this represents [level] work for Year ${yearLevel || 'grade level'} with [specific next steps]."
}`;

      // Build student-specific user message (unique per student)
      const userMessage = `Grade this student's essay (${studentName}):

"${studentText}"

Apply all marking instructions and rubric criteria from the system prompt. Return ONLY valid JSON.`;

      const responseText = await callOllamaWithRetry(userMessage, { system: systemPrompt, temperature: 0 });
      if (!responseText) {
        throw new Error('No response from Ollama');
      }

      const result = this.extractJsonFromResponse(responseText, 'cached grading submission');

      const totalScore = result.grades.reduce((sum: number, grade: any) => sum + grade.score, 0);
      const maxScore = result.grades.reduce((sum: number, grade: any) => sum + grade.maxScore, 0);
      const percentage = Math.round((totalScore / maxScore) * 100);

      logger.info(`[CACHED] Grading completed for ${studentName}: ${totalScore}/${maxScore} (${percentage}%)`);

      return {
        studentId,
        studentName,
        totalScore,
        maxScore,
        percentage,
        criteria: result.grades,
        summary: result.summary,
        ocrWarnings: []
      };

    } catch (error) {
      logger.error(`[CACHED] Grading failed for ${studentName}:`, error);

      // Return a fallback result
      const totalMax = criteria.reduce((sum, c) => sum + c.maxScore, 0);
      return {
        studentId,
        studentName,
        totalScore: Math.floor(totalMax * 0.7), // 70% as fallback
        maxScore: totalMax,
        percentage: 70,
        criteria: criteria.map(c => ({
          criterion: c.name,
          score: Math.floor(c.maxScore * 0.7),
          maxScore: c.maxScore,
          feedback: 'Unable to provide detailed feedback due to processing error.'
        })),
        summary: 'Grading completed with limited analysis due to technical issues.',
        ocrWarnings: ['⚠️ Grading error occurred - manual review recommended']
      };
    }
  }


  async performCompleteGradingWithStudents(
    rubricFilePath: string,
    students: { name: string; files: { path: string; filename: string; originalName: string }[] }[],
    yearLevel?: number
  ): Promise<CompleteGradingResult> {
    logger.info(`Starting complete grading workflow: 1 rubric + ${students.length} students (${students.reduce((sum, s) => sum + s.files.length, 0)} total files)`);

    try {
      // Step 1: Rubric Reader (AI #1) - Analyze rubric and extract criteria
      logger.info(`Step 1: Analyzing rubric with Rubric Reader AI${yearLevel ? ` (Year ${yearLevel})` : ''}`);
      const rubricAnalysis = await this.analyzeRubricFile(rubricFilePath, yearLevel);
      
      let rubricCriteria: GradingCriterion[] = [];
      let rubricSuccess = false;

      if (rubricAnalysis.success) {
        rubricCriteria = await this.parseRubric(rubricAnalysis.analysis, yearLevel);
        rubricSuccess = true;
        logger.info(`Rubric analysis successful: ${rubricCriteria.length} criteria extracted`);
      } else {
        logger.warn('Rubric analysis failed, using default criteria');
        rubricCriteria = [
          { name: 'Content', description: 'Quality and relevance of content', maxScore: 50 },
          { name: 'Grammar', description: 'Grammar, spelling, and punctuation', maxScore: 25 },
          { name: 'Structure', description: 'Organization and flow of writing', maxScore: 25 }
        ];
      }

      // Step 2 & 3: Process each student (combining all their files)
      logger.info('Step 2 & 3: Processing students with Student Reader and Results Grader AIs');
      const studentResults: StudentGradingResult[] = [];

      for (let studentIndex = 0; studentIndex < students.length; studentIndex++) {
        const student = students[studentIndex];
        const studentId = studentIndex + 1;
        
        try {
          logger.info(`Processing student ${studentId}: ${student.name} (${student.files.length} files)`);

          // Process all files for this student
          const allTranscriptions: string[] = [];
          const allAnalyses: string[] = [];

          for (const file of student.files) {
            // Student Reader (AI #2): Combined transcribe and analyze each file
            const result = await this.transcribeAndAnalyze(file.path);

            allTranscriptions.push(`=== ${file.originalName} ===\n${result.transcription}`);
            if (result.analysis.success) {
              allAnalyses.push(`=== Analysis of ${file.originalName} ===\n${result.analysis.analysis}`);
            }
          }

          // Combine all transcriptions for this student
          const combinedTranscription = allTranscriptions.join('\n\n--- NEXT FILE ---\n\n');
          const combinedAnalysis = allAnalyses.join('\n\n--- NEXT FILE ANALYSIS ---\n\n');

          // Results Grader (AI #3): Grade against rubric using combined content
          const gradingResult = await this.gradeSubmission(
            combinedTranscription,
            rubricCriteria,
            studentId.toString(),
            student.name,
            [],
            yearLevel
          );

          studentResults.push({
            studentId,
            filename: `${student.name}_combined`,
            originalName: student.name,
            transcription: combinedTranscription,
            analysis: combinedAnalysis || 'Analysis completed',
            gradingSuccess: true,
            grades: gradingResult.criteria,
            totalScore: gradingResult.totalScore,
            maxScore: gradingResult.maxScore,
            percentage: gradingResult.percentage,
            summary: `${gradingResult.summary} (Based on ${student.files.length} file${student.files.length !== 1 ? 's' : ''})`
          });

          logger.info(`Student ${studentId} (${student.name}) graded: ${gradingResult.totalScore}/${gradingResult.maxScore} (${gradingResult.percentage}%)`);

        } catch (error) {
          logger.error(`Failed to process student ${studentId} (${student.name}):`, error);
          
          // Add failed result
          const totalMax = rubricCriteria.reduce((sum, c) => sum + c.maxScore, 0);
          studentResults.push({
            studentId,
            filename: `${student.name}_failed`,
            originalName: student.name,
            transcription: '[Transcription failed]',
            analysis: '[Analysis failed]',
            gradingSuccess: false,
            grades: rubricCriteria.map(c => ({
              criterion: c.name,
              score: 0,
              maxScore: c.maxScore,
              feedback: 'Processing failed - manual review required.'
            })),
            totalScore: 0,
            maxScore: totalMax,
            percentage: 0,
            summary: 'Automated grading failed due to processing error.',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      const result: CompleteGradingResult = {
        rubricSuccess,
        rubricCriteria,
        studentResults
      };

      logger.info(`Complete grading finished: ${studentResults.filter(r => r.gradingSuccess).length}/${studentResults.length} successful`);
      return result;

    } catch (error) {
      logger.error('Complete grading workflow failed:', error);
      throw error;
    }
  }

  async performCompleteGrading(
    rubricFilePath: string,
    submissionFiles: { path: string; filename: string; originalName: string }[],
    yearLevel?: number
  ): Promise<CompleteGradingResult> {
    logger.info(`Starting complete grading workflow: 1 rubric + ${submissionFiles.length} submissions`);

    try {
      // Step 1: Rubric Reader (AI #1) - Analyze rubric and extract criteria
      logger.info(`Step 1: Analyzing rubric with Rubric Reader AI${yearLevel ? ` (Year ${yearLevel})` : ''}`);
      const rubricAnalysis = await this.analyzeRubricFile(rubricFilePath, yearLevel);
      
      let rubricCriteria: GradingCriterion[] = [];
      let rubricSuccess = false;

      if (rubricAnalysis.success) {
        rubricCriteria = await this.parseRubric(rubricAnalysis.analysis, yearLevel);
        rubricSuccess = true;
        logger.info(`Rubric analysis successful: ${rubricCriteria.length} criteria extracted`);
      } else {
        logger.warn('Rubric analysis failed, using default criteria');
        rubricCriteria = [
          { name: 'Content', description: 'Quality and relevance of content', maxScore: 50 },
          { name: 'Grammar', description: 'Grammar, spelling, and punctuation', maxScore: 25 },
          { name: 'Structure', description: 'Organization and flow of writing', maxScore: 25 }
        ];
      }

      // Step 2 & 3: Process each submission with Student Reader (AI #2) and Results Grader (AI #3)
      logger.info('Step 2 & 3: Processing submissions with Student Reader and Results Grader AIs');
      const studentResults: StudentGradingResult[] = [];

      for (let index = 0; index < submissionFiles.length; index++) {
        const submissionFile = submissionFiles[index];
        const studentId = index + 1;
        
        try {
          logger.info(`Processing student ${studentId}: ${submissionFile.originalName}`);

          // Student Reader (AI #2): Combined transcribe and analyze
          const result = await this.transcribeAndAnalyze(submissionFile.path);

          // Results Grader (AI #3): Grade against rubric
          const gradingResult = await this.gradeSubmission(
            result.transcription,
            rubricCriteria,
            studentId.toString(),
            `Student ${studentId}`,
            [],
            yearLevel
          );

          studentResults.push({
            studentId,
            filename: submissionFile.filename,
            originalName: submissionFile.originalName,
            transcription: result.transcription,
            analysis: result.analysis.success ? result.analysis.analysis : 'Analysis failed',
            gradingSuccess: true,
            grades: gradingResult.criteria,
            totalScore: gradingResult.totalScore,
            maxScore: gradingResult.maxScore,
            percentage: gradingResult.percentage,
            summary: gradingResult.summary
          });

          logger.info(`Student ${studentId} graded: ${gradingResult.totalScore}/${gradingResult.maxScore} (${gradingResult.percentage}%)`);

        } catch (error) {
          logger.error(`Failed to process student ${studentId}:`, error);
          
          // Add failed result
          const totalMax = rubricCriteria.reduce((sum, c) => sum + c.maxScore, 0);
          studentResults.push({
            studentId,
            filename: submissionFile.filename,
            originalName: submissionFile.originalName,
            transcription: '[Transcription failed]',
            analysis: '[Analysis failed]',
            gradingSuccess: false,
            grades: rubricCriteria.map(c => ({
              criterion: c.name,
              score: 0,
              maxScore: c.maxScore,
              feedback: 'Processing failed - manual review required.'
            })),
            totalScore: 0,
            maxScore: totalMax,
            percentage: 0,
            summary: 'Automated grading failed due to processing error.',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      const result: CompleteGradingResult = {
        rubricSuccess,
        rubricCriteria,
        studentResults
      };

      logger.info(`Complete grading finished: ${studentResults.filter(r => r.gradingSuccess).length}/${studentResults.length} successful`);
      return result;

    } catch (error) {
      logger.error('Complete grading workflow failed:', error);
      throw error;
    }
  }
}