import { User } from '../database/db';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export {};
