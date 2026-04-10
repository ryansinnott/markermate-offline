import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';
import { createError } from '../middleware/errorHandler';
import { GradingService } from '../services/gradingService';

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads/rubrics');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `rubric-${uniqueSuffix}${path.extname(file.originalname)}`);
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
    fileSize: 50 * 1024 * 1024 // 50MB
  }
});

// Upload rubric
router.post('/upload', upload.single('rubric'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw createError('No rubric file provided', 400);
    }

    logger.info(`Rubric uploaded: ${req.file.filename}`);

    // Analyze the rubric file with Claude immediately
    const gradingService = new GradingService();
    const analysis = await gradingService.analyzeRubricFile(req.file.path);

    // Clear any existing session data
    // In a real app, this would be session-based
    const sessionId = Date.now().toString();

    if (!analysis.success) {
      logger.warn(`Rubric analysis failed: ${analysis.error}`);
      // Still return success but with error info for frontend to handle
      return res.json({
        success: true,
        sessionId,
        rubric: {
          filename: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size,
          path: req.file.path
        },
        analysis: {
          success: false,
          analysis: 'File uploaded successfully but analysis failed. Please try again or upload a different file.',
          fileType: 'rubric',
          fileName: req.file.filename,
          modelUsed: 'claude-3-5-sonnet-20241022',
          error: analysis.error
        }
      });
    }

    res.json({
      success: true,
      sessionId,
      rubric: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        path: req.file.path
      },
      analysis: analysis
    });
  } catch (error) {
    logger.error(`Rubric upload error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    next(error);
  }
});

// Get current rubric info
router.get('/current', (req, res) => {
  // In a real app, this would fetch from session/database
  res.json({
    success: true,
    rubric: null // No rubric loaded yet
  });
});

export default router;