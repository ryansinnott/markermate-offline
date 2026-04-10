import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
// Type declarations in ./types/express.d.ts are automatically included by TypeScript

import rubricRoutes from './routes/rubric';
import submissionRoutes from './routes/submissions';
import exportRoutes from './routes/export';
import completeGradingRoutes from './routes/completeGrading';
import savedRubricsRoutes from './routes/savedRubrics';
import { initializeDatabase } from './database/db';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Ensure upload directories exist
const uploadDirs = ['uploads/rubrics', 'uploads/submissions', 'temp/ocr', 'logs', 'data'];
uploadDirs.forEach(dir => {
  const fullPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// Initialize database
initializeDatabase();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// CORS configuration - supports multiple origins (comma-separated in env)
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map(origin => origin.trim());

// Middleware
app.use(helmet());
app.use(compression());
app.use(limiter);
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes (no authentication in offline mode)
app.use('/api/rubric', rubricRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/complete-grading', completeGradingRoutes);
app.use('/api/rubrics', savedRubricsRoutes);

// Health check
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

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`MarkerMate backend server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
});

export default app;