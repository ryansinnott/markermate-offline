import express from 'express';
import { logger } from '../utils/logger';
import { createError } from '../middleware/errorHandler';

const router = express.Router();

// Export grades as CSV
router.get('/csv/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      throw createError('Session ID is required', 400);
    }

    logger.info(`Exporting CSV for session ${sessionId}`);

    // Mock CSV data
    const csvData = `Student Name,Total Score,Max Score,Percentage,Grammar,Content,Summary
Student 1,85,100,85%,8/10,9/10,"Well-written essay with good structure"
Student 2,78,100,78%,7/10,8/10,"Good effort with room for improvement"`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="grades-${sessionId}.csv"`);
    res.send(csvData);

  } catch (error) {
    next(error);
  }
});

// Export detailed report as JSON
router.get('/report/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      throw createError('Session ID is required', 400);
    }

    logger.info(`Exporting detailed report for session ${sessionId}`);

    // Mock detailed report
    const report = {
      sessionId,
      exportDate: new Date().toISOString(),
      summary: {
        totalStudents: 2,
        averageScore: 81.5,
        highestScore: 85,
        lowestScore: 78
      },
      students: [
        {
          name: 'Student 1',
          totalScore: 85,
          breakdown: {
            grammar: { score: 8, max: 10 },
            content: { score: 9, max: 10 }
          }
        }
      ]
    };

    res.json({
      success: true,
      report
    });

  } catch (error) {
    next(error);
  }
});

export default router;