import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';
import { createError } from '../middleware/errorHandler';
import { GradingService, FileAnalysisResult, GradingCriterion } from '../services/gradingService';

// Simple in-memory session storage (in production, use Redis or database)
// GradingResultData mirrors StudentGradingResult from gradingService but studentName is optional
interface GradingResultData {
  studentId: number;
  studentName?: string;
  filename: string;
  originalName: string;
  transcription: string;
  analysis: string;
  gradingSuccess: boolean;
  grades: Array<{
    criterion: string;
    score: number;
    maxScore: number;
    feedback: string;
  }>;
  totalScore: number;
  maxScore: number;
  percentage: number;
  summary: string;
  error?: string;
}

interface SessionData {
  sessionId: string;
  rubricAnalysis?: FileAnalysisResult;
  rubricCriteria?: GradingCriterion[];
  rubricFile?: {
    filename: string;
    originalName: string;
    path: string;
    mimetype: string;
  };
  submissionAnalyses?: Array<{
    id: number;
    filename: string;
    originalName: string;
    path: string;
    mimetype: string;
    studentName?: string;
    analysis: FileAnalysisResult;
    transcription: string;
  }>;
  students?: Array<{
    name: string;
    fileCount: number;
  }>;
  yearLevel?: number;
  gradingResults?: GradingResultData[];
  gradingSummary?: {
    totalStudents: number;
    totalFiles: number;
    averageScore: number;
    yearLevel?: number;
    allGraded: boolean;
  };
  gradingProgress?: {
    status: 'pending' | 'transcribing' | 'grading' | 'completed' | 'error';
    completedStudents: number;
    totalStudents: number;
    currentStage: string;
    error?: string;
  };
  createdAt: Date;
}

const sessions = new Map<string, SessionData>();

// Clean up old sessions (older than 1 hour)
setInterval(() => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  for (const [sessionId, session] of sessions.entries()) {
    if (session.createdAt < oneHourAgo) {
      sessions.delete(sessionId);
      logger.info(`Cleaned up expired session: ${sessionId}`);
    }
  }
}, 30 * 60 * 1000); // Check every 30 minutes

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = file.fieldname === 'rubric' 
      ? path.join(__dirname, '../../uploads/rubrics')
      : path.join(__dirname, '../../uploads/submissions');
    
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const prefix = file.fieldname === 'rubric' ? 'rubric' : 'submission';
    cb(null, `${prefix}-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(createError('Invalid file type. Only JPG, PNG, and PDF files are allowed.', 400), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
    files: 101 // 1 rubric + up to 100 student files (10 students x 10 files each)
  }
});

// Create a separate upload instance for submissions that accepts any field
const submissionUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
    files: 100 // up to 100 student files (10 students x 10 files each)
  }
});

// Step 1: Upload and analyze rubric (Rubric Reader AI)
router.post('/upload-rubric', upload.single('rubric'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw createError('Rubric file is required', 400);
    }

    const sessionId = `session-${Date.now()}`;
    logger.info(`Step 1 - Rubric upload for session ${sessionId}: ${req.file.filename}`);

    const gradingService = new GradingService();
    
    // Analyze rubric with Rubric Reader AI
    const rubricAnalysis = await gradingService.analyzeRubricFile(req.file.path);

    let rubricCriteria: GradingCriterion[] = [];
    if (rubricAnalysis.success) {
      rubricCriteria = await gradingService.parseRubric(rubricAnalysis.analysis);
    } else {
      // Even if analysis fails, call parseRubric to get fallback criteria
      logger.warn('Rubric analysis failed, using fallback criteria');
      rubricCriteria = await gradingService.parseRubric('Unable to analyze rubric file. Using default criteria.');
    }

    // Store in session
    sessions.set(sessionId, {
      sessionId,
      rubricAnalysis,
      rubricCriteria,
      rubricFile: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
        mimetype: req.file.mimetype
      },
      createdAt: new Date()
    });

    res.json({
      success: true,
      sessionId,
      rubric: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        analysis: rubricAnalysis,
        criteria: rubricCriteria,
        fileUrl: `/api/complete-grading/file/${sessionId}/${req.file.filename}`,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    logger.error('Rubric upload error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Rubric analysis failed'
    });
  }
});

// Step 2: Upload and analyze submissions (Student Submission Reader AI) - Enhanced for student grouping
router.post('/upload-submissions/:sessionId', submissionUpload.any(), async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const files = req.files as Express.Multer.File[];
    
    const session = sessions.get(sessionId);
    if (!session) {
      throw createError('Invalid session ID or session expired', 400);
    }

    // Extract year level
    const yearLevel = req.body.yearLevel ? parseInt(req.body.yearLevel) : undefined;
    
    // Debug logging for request data
    logger.info(`Upload submissions debug - Session: ${sessionId}`);
    logger.info(`Request body keys: ${Object.keys(req.body).join(', ')}`);
    logger.info(`Request body content: ${JSON.stringify(req.body, null, 2)}`);
    logger.info(`Number of files: ${files?.length || 0}`);
    if (files?.length > 0) {
      logger.info(`File fieldnames: ${files.map(f => f.fieldname).join(', ')}`);
      logger.info(`File details: ${files.map(f => `${f.fieldname}:${f.originalname}`).join(', ')}`);
    }
    
    // Parse student data from form
    const students: { name: string; files: Express.Multer.File[] }[] = [];
    
    // Group files by student using fieldname pattern
    const studentFilesMap = new Map<string, Express.Multer.File[]>();
    const studentNamesMap = new Map<string, string>();
    
    // Extract student names from body - handle both form fields and JSON format
    Object.keys(req.body).forEach(key => {
      const nameMatch = key.match(/^students\[(\d+)\]\[name\]$/);
      if (nameMatch) {
        const studentIndex = nameMatch[1];
        const studentName = req.body[key];
        logger.info(`Found student name: Index ${studentIndex}, Name: "${studentName}"`);
        if (studentName && studentName.trim()) {
          studentNamesMap.set(studentIndex, studentName.trim());
        }
      }
    });
    
    // Also check if students data is in JSON format
    if (req.body.students && Array.isArray(req.body.students)) {
      logger.info(`Found JSON students array with ${req.body.students.length} entries`);
      req.body.students.forEach((student: any, index: number) => {
        if (student.name && student.name.trim()) {
          logger.info(`Found JSON student name: Index ${index}, Name: "${student.name}"`);
          studentNamesMap.set(index.toString(), student.name.trim());
        }
      });
    }
    
    // Group files by student index
    files.forEach(file => {
      const fileMatch = file.fieldname.match(/^students\[(\d+)\]\[files\]$/);
      if (fileMatch) {
        const studentIndex = fileMatch[1];
        logger.info(`Found student file: Index ${studentIndex}, File: ${file.originalname}`);
        if (!studentFilesMap.has(studentIndex)) {
          studentFilesMap.set(studentIndex, []);
        }
        studentFilesMap.get(studentIndex)!.push(file);
      }
    });
    
    // Debug logging for parsed data
    logger.info(`Parsed student names: ${Array.from(studentNamesMap.entries()).map(([idx, name]) => `${idx}:"${name}"`).join(', ')}`);
    logger.info(`Parsed file groups: ${Array.from(studentFilesMap.entries()).map(([idx, files]) => `${idx}:${files.length}files`).join(', ')}`);
    
    // Combine student names with their files
    studentNamesMap.forEach((studentName, studentIndex) => {
      const studentFiles = studentFilesMap.get(studentIndex) || [];
      logger.info(`Processing student ${studentIndex}: "${studentName}" with ${studentFiles.length} files`);
      if (studentFiles.length > 0) {
        students.push({
          name: studentName,
          files: studentFiles
        });
      }
    });
    
    logger.info(`Final students array length: ${students.length}`);
    
    if (students.length === 0) {
      // Provide more detailed error message
      const hasNames = studentNamesMap.size > 0;
      const hasFiles = studentFilesMap.size > 0;
      let errorMessage = 'At least one student with files is required. ';
      
      if (!hasNames && !hasFiles) {
        errorMessage += 'No student names or files were found in the request.';
      } else if (!hasNames) {
        errorMessage += 'Student files were found but no student names were provided.';
      } else if (!hasFiles) {
        errorMessage += 'Student names were found but no files were uploaded.';
      } else {
        errorMessage += 'Student names and files were found but could not be matched properly.';
      }
      
      logger.error(`Validation failed: ${errorMessage}`);
      throw createError(errorMessage, 400);
    }

    logger.info(`Step 2 - Student submissions upload for session ${sessionId}: ${students.length} students, Year ${yearLevel || 'unspecified'}`);

    const gradingService = new GradingService();
    const submissionAnalyses = [];

    // Analyze each student's files
    let fileId = 1;
    for (const student of students) {
      for (const file of student.files) {
        const result = await gradingService.transcribeAndAnalyze(file.path);

        submissionAnalyses.push({
          id: fileId++,
          filename: file.filename,
          originalName: file.originalname,
          path: file.path,
          mimetype: file.mimetype,
          studentName: student.name,
          analysis: result.analysis,
          transcription: result.transcription
        });
      }
    }

    // Update session with submission analyses and student grouping
    session.submissionAnalyses = submissionAnalyses;
    session.students = students.map(student => ({
      name: student.name,
      fileCount: student.files.length
    }));
    session.yearLevel = yearLevel;
    sessions.set(sessionId, session);

    res.json({
      success: true,
      sessionId,
      submissions: submissionAnalyses.map(s => ({
        id: s.id,
        filename: s.filename,
        originalName: s.originalName,
        studentName: s.studentName,
        analysisSuccess: s.analysis.success,
        transcription: s.transcription,
        fileUrl: `/api/complete-grading/file/${sessionId}/${s.filename}`,
        mimetype: s.mimetype
      })),
      students: students.map(student => ({
        name: student.name,
        fileCount: student.files.length
      })),
      yearLevel,
      readyForGrading: true
    });
  } catch (error) {
    logger.error('Submissions upload error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Submissions analysis failed'
    });
  }
});

// Step 3: Grade submissions using rubric (Result AI) - Enhanced for student grouping
router.post('/grade/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);
    
    if (!session) {
      throw createError('Invalid session ID or session expired', 400);
    }

    if (!session.rubricCriteria || !session.submissionAnalyses) {
      throw createError('Both rubric and submissions must be analyzed first', 400);
    }

    logger.info(`Step 3 - Grading for session ${sessionId}: ${session.students?.length || 0} students, ${session.submissionAnalyses.length} files`);

    const gradingService = new GradingService();
    const gradingResults = [];

    if (session.students && session.students.length > 0) {
      // Group-based grading: combine files per student
      for (let studentIndex = 0; studentIndex < session.students.length; studentIndex++) {
        const student = session.students[studentIndex];
        
        // Find all submissions for this student
        const studentSubmissions = session.submissionAnalyses.filter(
          sub => sub.studentName === student.name
        );

        if (studentSubmissions.length > 0) {
          // Combine transcriptions for this student
          const combinedTranscription = studentSubmissions
            .map(sub => `=== ${sub.originalName} ===\n${sub.transcription}`)
            .join('\n\n--- NEXT FILE ---\n\n');

          const result = await gradingService.gradeSubmission(
            combinedTranscription,
            session.rubricCriteria,
            (studentIndex + 1).toString(),
            student.name,
            [],
            session.yearLevel
          );

          gradingResults.push({
            studentId: studentIndex + 1,
            studentName: student.name,
            filename: `${student.name}_combined`,
            originalName: student.name,
            transcription: combinedTranscription,
            analysis: `Combined analysis of ${studentSubmissions.length} file(s)`,
            gradingSuccess: true,
            grades: result.criteria,
            totalScore: result.totalScore,
            maxScore: result.maxScore,
            percentage: result.percentage,
            summary: `${result.summary} (Based on ${studentSubmissions.length} file${studentSubmissions.length !== 1 ? 's' : ''})`
          });
        }
      }
    } else {
      // Fallback: individual file grading
      for (const submission of session.submissionAnalyses) {
        const result = await gradingService.gradeSubmission(
          submission.transcription,
          session.rubricCriteria,
          submission.id.toString(),
          `Student ${submission.id}`,
          [],
          session.yearLevel
        );

        gradingResults.push({
          studentId: submission.id,
          studentName: `Student ${submission.id}`,
          filename: submission.filename,
          originalName: submission.originalName,
          transcription: submission.transcription,
          analysis: submission.analysis.success ? submission.analysis.analysis : 'Analysis failed',
          gradingSuccess: true,
          grades: result.criteria,
          totalScore: result.totalScore,
          maxScore: result.maxScore,
          percentage: result.percentage,
          summary: result.summary
        });
      }
    }

    // Store grading results in session for later retrieval
    const gradingSummary = {
      totalStudents: gradingResults.length,
      totalFiles: session.submissionAnalyses.length,
      averageScore: gradingResults.length > 0
        ? Math.round(gradingResults.reduce((sum, r) => sum + r.percentage, 0) / gradingResults.length)
        : 0,
      yearLevel: session.yearLevel,
      allGraded: true
    };

    session.gradingResults = gradingResults;
    session.gradingSummary = gradingSummary;

    res.json({
      success: true,
      sessionId,
      results: gradingResults,
      rubric: {
        criteria: session.rubricCriteria
      },
      summary: gradingSummary
    });
  } catch (error) {
    logger.error('Grading error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Grading failed'
    });
  }
});

// Get grading results by session ID (for page refresh recovery)
router.get('/results/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found or expired'
    });
  }

  if (!session.gradingResults) {
    return res.status(404).json({
      success: false,
      error: 'Grading results not found for this session. Please complete grading first.'
    });
  }

  res.json({
    success: true,
    sessionId,
    results: session.gradingResults,
    rubric: {
      criteria: session.rubricCriteria
    },
    summary: session.gradingSummary
  });
});

// Get session status with grading progress
router.get('/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Session not found or expired'
    });
  }

  // Calculate percentage if grading progress exists
  const gradingProgress = session.gradingProgress ? {
    ...session.gradingProgress,
    percentage: session.gradingProgress.totalStudents > 0
      ? Math.round((session.gradingProgress.completedStudents / session.gradingProgress.totalStudents) * 100)
      : 0
  } : null;

  // Include full results if grading is completed
  const response: any = {
    success: true,
    sessionId,
    status: {
      rubricAnalyzed: !!session.rubricAnalysis,
      submissionsAnalyzed: !!session.submissionAnalyses,
      readyForGrading: !!session.rubricCriteria && !!session.submissionAnalyses,
      rubricCriteriaCount: session.rubricCriteria?.length || 0,
      submissionCount: session.submissionAnalyses?.length || 0
    },
    gradingProgress,
    createdAt: session.createdAt
  };

  // Include full results when grading is complete for frontend to navigate
  if (session.gradingProgress?.status === 'completed' && session.gradingResults) {
    response.results = {
      students: session.gradingResults,
      rubric: { criteria: session.rubricCriteria },
      summary: session.gradingSummary,
      yearLevel: session.yearLevel
    };
  }

  res.json(response);
});

// Serve uploaded files for preview
router.get('/file/:sessionId/:filename', (req, res) => {
  try {
    const { sessionId, filename } = req.params;
    const session = sessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or expired'
      });
    }

    // Check if file is rubric or submission
    let filePath: string | undefined;
    
    // Check rubric
    if (session.rubricAnalysis && filename.includes('rubric')) {
      filePath = path.join(__dirname, '../../uploads/rubrics', filename);
    }
    
    // Check submissions
    if (session.submissionAnalyses) {
      const submission = session.submissionAnalyses.find(s => s.filename === filename);
      if (submission) {
        filePath = submission.path;
      }
    }

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Set appropriate content type
    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === '.pdf' ? 'application/pdf' : 
                       ext === '.png' ? 'image/png' : 
                       ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 
                       'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    logger.error('File serving error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to serve file'
    });
  }
});

// Complete workflow: Upload rubric + students and grade all at once
router.post('/upload-and-grade', submissionUpload.any(), async (req, res, next) => {
  try {
    const files = req.files as Express.Multer.File[];
    
    // Find rubric file
    const rubricFile = files.find(file => file.fieldname === 'rubric');
    if (!rubricFile) {
      throw createError('Rubric file is required', 400);
    }

    // Extract year level
    const yearLevel = req.body.yearLevel ? parseInt(req.body.yearLevel) : undefined;
    
    // Debug logging for request data
    logger.info(`Complete grading debug - Upload and grade`);
    logger.info(`Request body keys: ${Object.keys(req.body).join(', ')}`);
    logger.info(`Request body content: ${JSON.stringify(req.body, null, 2)}`);
    logger.info(`Total files: ${files?.length || 0}`);
    if (files?.length > 0) {
      logger.info(`File fieldnames: ${files.map(f => f.fieldname).join(', ')}`);
      logger.info(`File details: ${files.map(f => `${f.fieldname}:${f.originalname}`).join(', ')}`);
    }
    
    // Parse student data from form
    const students: { name: string; files: Express.Multer.File[] }[] = [];
    
    // Group files by student using fieldname pattern
    const studentFilesMap = new Map<string, Express.Multer.File[]>();
    const studentNamesMap = new Map<string, string>();
    
    // Extract student names from body - handle both form fields and JSON format
    Object.keys(req.body).forEach(key => {
      const nameMatch = key.match(/^students\[(\d+)\]\[name\]$/);
      if (nameMatch) {
        const studentIndex = nameMatch[1];
        const studentName = req.body[key];
        logger.info(`Found student name: Index ${studentIndex}, Name: "${studentName}"`);
        if (studentName && studentName.trim()) {
          studentNamesMap.set(studentIndex, studentName.trim());
        }
      }
    });
    
    // Also check if students data is in JSON format
    if (req.body.students && Array.isArray(req.body.students)) {
      logger.info(`Found JSON students array with ${req.body.students.length} entries`);
      req.body.students.forEach((student: any, index: number) => {
        if (student.name && student.name.trim()) {
          logger.info(`Found JSON student name: Index ${index}, Name: "${student.name}"`);
          studentNamesMap.set(index.toString(), student.name.trim());
        }
      });
    }
    
    // Group files by student index (excluding rubric)
    files.forEach(file => {
      if (file.fieldname !== 'rubric') {
        const fileMatch = file.fieldname.match(/^students\[(\d+)\]\[files\]$/);
        if (fileMatch) {
          const studentIndex = fileMatch[1];
          logger.info(`Found student file: Index ${studentIndex}, File: ${file.originalname}`);
          if (!studentFilesMap.has(studentIndex)) {
            studentFilesMap.set(studentIndex, []);
          }
          studentFilesMap.get(studentIndex)!.push(file);
        }
      }
    });
    
    // Debug logging for parsed data
    logger.info(`Parsed student names: ${Array.from(studentNamesMap.entries()).map(([idx, name]) => `${idx}:"${name}"`).join(', ')}`);
    logger.info(`Parsed file groups: ${Array.from(studentFilesMap.entries()).map(([idx, files]) => `${idx}:${files.length}files`).join(', ')}`);
    
    // Combine student names with their files
    studentNamesMap.forEach((studentName, studentIndex) => {
      const studentFiles = studentFilesMap.get(studentIndex) || [];
      logger.info(`Processing student ${studentIndex}: "${studentName}" with ${studentFiles.length} files`);
      if (studentFiles.length > 0) {
        students.push({
          name: studentName,
          files: studentFiles
        });
      }
    });
    
    logger.info(`Final students array length: ${students.length}`);
    
    if (students.length === 0) {
      // Provide more detailed error message
      const hasNames = studentNamesMap.size > 0;
      const hasFiles = studentFilesMap.size > 0;
      let errorMessage = 'At least one student with files is required. ';
      
      if (!hasNames && !hasFiles) {
        errorMessage += 'No student names or files were found in the request.';
      } else if (!hasNames) {
        errorMessage += 'Student files were found but no student names were provided.';
      } else if (!hasFiles) {
        errorMessage += 'Student names were found but no files were uploaded.';
      } else {
        errorMessage += 'Student names and files were found but could not be matched properly.';
      }
      
      logger.error(`Validation failed: ${errorMessage}`);
      throw createError(errorMessage, 400);
    }

    const sessionId = `session-${Date.now()}`;
    logger.info(`Complete grading workflow for session ${sessionId}: ${students.length} students, Year ${yearLevel || 'unspecified'}`);

    const gradingService = new GradingService();
    
    // Prepare students data for the new grading service method
    const studentsData = students.map((student) => ({
      name: student.name,
      files: student.files.map((file) => ({
        path: file.path,
        filename: file.filename,
        originalName: file.originalname
      }))
    }));

    // Process complete grading workflow with proper student grouping
    const gradingResult = await gradingService.performCompleteGradingWithStudents(
      rubricFile.path,
      studentsData,
      yearLevel
    );

    // Results are already properly grouped by student
    const studentResults = gradingResult.studentResults;

    const summary = {
      totalStudents: studentResults.length,
      totalFiles: studentsData.reduce((sum, student) => sum + student.files.length, 0),
      averageScore: studentResults.length > 0
        ? Math.round(studentResults.reduce((sum, r) => sum + r.percentage, 0) / studentResults.length)
        : 0,
      rubricAnalyzed: gradingResult.rubricSuccess,
      allGraded: studentResults.every(r => r.gradingSuccess),
      yearLevel
    };

    // Store grading results in session for later retrieval (page refresh recovery)
    sessions.set(sessionId, {
      sessionId,
      rubricCriteria: gradingResult.rubricCriteria,
      yearLevel,
      gradingResults: studentResults,
      gradingSummary: summary,
      createdAt: new Date()
    });

    const result = {
      success: true,
      sessionId,
      yearLevel,
      rubric: {
        success: gradingResult.rubricSuccess,
        criteria: gradingResult.rubricCriteria
      },
      students: studentResults,
      results: studentResults, // Also include as 'results' for consistent API
      summary
    };

    res.json(result);
  } catch (error) {
    logger.error('Complete grading workflow error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Complete grading failed'
    });
  }
});

// Grade with pre-saved rubric criteria (no file upload needed)
router.post('/grade-with-criteria', submissionUpload.any(), async (req, res, next) => {
  try {
    const files = req.files as Express.Multer.File[];

    // Parse rubric criteria from JSON body
    let rubricCriteria: GradingCriterion[];
    try {
      rubricCriteria = JSON.parse(req.body.criteria);
      if (!Array.isArray(rubricCriteria) || rubricCriteria.length === 0) {
        throw new Error('Criteria must be a non-empty array');
      }
    } catch (parseError) {
      throw createError('Invalid criteria format. Expected JSON array of criteria.', 400);
    }

    // Extract year level
    const yearLevel = req.body.yearLevel ? parseInt(req.body.yearLevel) : undefined;

    logger.info(`Grade with criteria - ${rubricCriteria.length} criteria, Year ${yearLevel || 'unspecified'}`);
    logger.info(`Request body keys: ${Object.keys(req.body).join(', ')}`);
    logger.info(`Total files: ${files?.length || 0}`);

    // Parse student data from form (same logic as upload-and-grade)
    const students: { name: string; files: Express.Multer.File[] }[] = [];
    const studentFilesMap = new Map<string, Express.Multer.File[]>();
    const studentNamesMap = new Map<string, string>();

    // Extract student names from body - handle form fields format
    Object.keys(req.body).forEach(key => {
      const nameMatch = key.match(/^students\[(\d+)\]\[name\]$/);
      if (nameMatch) {
        const studentIndex = nameMatch[1];
        const studentName = req.body[key];
        if (studentName && studentName.trim()) {
          studentNamesMap.set(studentIndex, studentName.trim());
        }
      }
    });

    // Also check if students data is in JSON/array format (axios may serialize this way)
    if (studentNamesMap.size === 0 && req.body.students) {
      let studentsData = req.body.students;

      // If it's a string, try to parse it as JSON
      if (typeof studentsData === 'string') {
        try {
          studentsData = JSON.parse(studentsData);
        } catch (e) {
          logger.warn('Could not parse students data as JSON');
        }
      }

      if (Array.isArray(studentsData)) {
        studentsData.forEach((student: any, index: number) => {
          if (student.name && student.name.trim()) {
            studentNamesMap.set(index.toString(), student.name.trim());
          }
        });
      }
    }

    // Group files by student index
    files.forEach(file => {
      const fileMatch = file.fieldname.match(/^students\[(\d+)\]\[files\]$/);
      if (fileMatch) {
        const studentIndex = fileMatch[1];
        if (!studentFilesMap.has(studentIndex)) {
          studentFilesMap.set(studentIndex, []);
        }
        studentFilesMap.get(studentIndex)!.push(file);
      }
    });

    // Debug: log what we found
    logger.info(`Parsed student names: ${studentNamesMap.size}, file groups: ${studentFilesMap.size}`);

    // Combine student names with their files
    studentNamesMap.forEach((studentName, studentIndex) => {
      const studentFiles = studentFilesMap.get(studentIndex) || [];
      if (studentFiles.length > 0) {
        students.push({
          name: studentName,
          files: studentFiles
        });
      }
    });

    if (students.length === 0) {
      // More detailed error
      logger.error(`Student parsing failed. Names found: ${studentNamesMap.size}, Files found: ${studentFilesMap.size}`);
      logger.error(`Body keys: ${Object.keys(req.body).join(', ')}`);
      logger.error(`File fieldnames: ${files.map(f => f.fieldname).join(', ')}`);
      throw createError('At least one student with files is required.', 400);
    }

    const sessionId = `session-${Date.now()}`;
    logger.info(`[OPTIMIZED] Grade with criteria for session ${sessionId}: ${students.length} students`);

    const gradingService = new GradingService();

    // Prepare students data for parallel processing
    const studentsData = students.map((student) => ({
      name: student.name,
      files: student.files.map((file) => ({
        path: file.path,
        filename: file.filename,
        originalName: file.originalname
      }))
    }));

    // Create session with initial progress state BEFORE processing starts
    sessions.set(sessionId, {
      sessionId,
      rubricCriteria,
      yearLevel,
      gradingProgress: {
        status: 'grading',
        completedStudents: 0,
        totalStudents: students.length,
        currentStage: 'Starting AI grading...'
      },
      createdAt: new Date()
    });

    // Progress callback to update session as students complete
    const onProgress = (stage: 'transcribing' | 'grading', completed: number, total: number) => {
      const session = sessions.get(sessionId);
      if (session) {
        session.gradingProgress = {
          status: stage,
          completedStudents: completed,
          totalStudents: total,
          currentStage: stage === 'transcribing'
            ? `Transcribing files (${completed}/${total})`
            : `Grading students (${completed}/${total})`
        };
        sessions.set(sessionId, session);
      }
    };

    // Use optimized parallel grading (combined transcribe+grade in single AI call)
    const studentResults = await gradingService.gradeStudentsInParallel(
      studentsData,
      rubricCriteria,
      yearLevel,
      1, // sequential: 31B model fills VRAM, parallel causes thrashing
      onProgress
    );

    const summary = {
      totalStudents: studentResults.length,
      totalFiles: students.reduce((sum, s) => sum + s.files.length, 0),
      averageScore: studentResults.length > 0
        ? Math.round(studentResults.reduce((sum, r) => sum + r.percentage, 0) / studentResults.length)
        : 0,
      rubricAnalyzed: true,
      allGraded: studentResults.every(r => r.gradingSuccess),
      yearLevel
    };

    // Update session with results and mark as completed
    const session = sessions.get(sessionId);
    if (session) {
      session.gradingResults = studentResults;
      session.gradingSummary = summary;
      session.gradingProgress = {
        status: 'completed',
        completedStudents: students.length,
        totalStudents: students.length,
        currentStage: 'Grading complete'
      };
      sessions.set(sessionId, session);
    }

    res.json({
      success: true,
      sessionId,
      yearLevel,
      rubric: {
        success: true,
        criteria: rubricCriteria
      },
      students: studentResults,
      results: studentResults,
      summary
    });
  } catch (error) {
    logger.error('Grade with criteria error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Grading with criteria failed'
    });
  }
});

// Test endpoint to verify route is working
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Complete grading route is working',
    timestamp: new Date().toISOString()
  });
});

export default router;