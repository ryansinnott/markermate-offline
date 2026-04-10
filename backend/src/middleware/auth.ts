import { Request, Response, NextFunction } from 'express';

// Auth middleware disabled for offline mode — pass-through
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  next();
}
