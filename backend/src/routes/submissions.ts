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
    const uploadPath = path.join(__dirname, '../../uploads/submissions');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `submission-${uniqueSuffix}${path.extname(file.originalname)}`);
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
    files: 30 // Max 30 files
  }
});

// Upload student submissions
router.post('/upload', upload.array('submissions', 30), async (req, res, next) => {
  try {
    if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
      throw createError('No submission files provided', 400);
    }

    const files = req.files as Express.Multer.File[];
    
    logger.info(`${files.length} submissions uploaded`);

    // Analyze each submission with Claude AI immediately
    const gradingService = new GradingService();
    const submissions = [];

    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      
      // Analyze the student work only (transcription removed for speed)
      const analysis = await gradingService.analyzeStudentWorkFile(file.path);
      
      submissions.push({
        id: index + 1,
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        path: file.path,
        status: 'uploaded',
        analysis: analysis
      });
    }

    res.json({
      success: true,
      submissions,
      count: submissions.length
    });
  } catch (error) {
    next(error);
  }
});

// Get submissions list
router.get('/list', (req, res) => {
  // In a real app, this would fetch from session/database
  res.json({
    success: true,
    submissions: []
  });
});

export default router;