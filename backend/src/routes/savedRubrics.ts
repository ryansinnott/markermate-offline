import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import {
  saveRubric,
  getAllRubrics,
  getRubricById,
  getRubricByName,
  updateLastUsed,
  deleteRubric,
  SavedRubricData
} from '../database/db';

const router = Router();

// POST /api/rubrics/save - Save a new rubric
router.post('/save', async (req: Request, res: Response) => {
  try {
    const { rubricName, rubricData } = req.body;
    const userId = 'local-user';

    // Validate input
    if (!rubricName || typeof rubricName !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Rubric name is required'
      });
    }

    if (!rubricData || !rubricData.criteria || !Array.isArray(rubricData.criteria)) {
      return res.status(400).json({
        success: false,
        error: 'Valid rubric data with criteria array is required'
      });
    }

    // Validate criteria
    for (const criterion of rubricData.criteria) {
      if (!criterion.name || !criterion.description || typeof criterion.maxScore !== 'number') {
        return res.status(400).json({
          success: false,
          error: 'Each criterion must have name, description, and maxScore'
        });
      }
    }

    // Check for duplicate name for this user
    const existing = getRubricByName(rubricName.trim(), userId);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'A rubric with this name already exists'
      });
    }

    // Calculate total score
    const totalScore = rubricData.criteria.reduce(
      (sum: number, c: { maxScore: number }) => sum + c.maxScore,
      0
    );

    const rubricDataWithTotal: SavedRubricData = {
      criteria: rubricData.criteria,
      totalScore
    };

    // Generate ID and save
    const id = uuidv4();
    saveRubric(id, rubricName.trim(), rubricDataWithTotal, userId);

    logger.info(`Saved rubric: ${rubricName} (${id}) for user ${userId}`);

    res.json({
      success: true,
      id,
      rubricName: rubricName.trim()
    });
  } catch (error: any) {
    logger.error('Error saving rubric:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save rubric'
    });
  }
});

// GET /api/rubrics - List all saved rubrics for current user
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = 'local-user';
    const rubrics = getAllRubrics(userId);

    res.json({
      success: true,
      rubrics
    });
  } catch (error: any) {
    logger.error('Error fetching rubrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rubrics'
    });
  }
});

// GET /api/rubrics/:id - Get a specific rubric and update last_used
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = 'local-user';

    const rubric = getRubricById(id, userId);
    if (!rubric) {
      return res.status(404).json({
        success: false,
        error: 'Rubric not found'
      });
    }

    // Update last_used timestamp
    updateLastUsed(id, userId);

    res.json({
      success: true,
      id: rubric.id,
      rubricName: rubric.rubricName,
      rubricData: rubric.rubricData,
      createdAt: rubric.createdAt,
      lastUsed: Date.now() // Return updated timestamp
    });
  } catch (error: any) {
    logger.error('Error fetching rubric:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rubric'
    });
  }
});

// DELETE /api/rubrics/:id - Delete a rubric
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = 'local-user';

    const deleted = deleteRubric(id, userId);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Rubric not found'
      });
    }

    logger.info(`Deleted rubric: ${id} for user ${userId}`);

    res.json({
      success: true
    });
  } catch (error: any) {
    logger.error('Error deleting rubric:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete rubric'
    });
  }
});

export default router;
