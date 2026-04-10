import { Agent } from 'undici';
import { logger } from '../utils/logger';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:31b';

// Disable Node's default headers/body timeouts for long-running Ollama requests
const ollamaDispatcher = new Agent({
  headersTimeout: 0,
  bodyTimeout: 0,
  connectTimeout: 30_000,
});

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
    system?: string;         // System prompt
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
        // @ts-ignore - Node.js fetch supports dispatcher via undici
        dispatcher: ollamaDispatcher,
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json() as OllamaResponse;

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
    const data = await response.json() as { models?: Array<{ name: string }> };
    const hasModel = data.models?.some((m) => m.name.includes('gemma4'));

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
