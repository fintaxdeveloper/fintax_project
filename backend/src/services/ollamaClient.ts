import dotenv from 'dotenv';
dotenv.config();

export interface OllamaVisionRequest {
  prompt: string;
  images?: string[]; // base64 encoded
  system?: string;
  format?: 'json' | string | Record<string, any>;
  model?: string;
  temperature?: number;
}

export const ollamaClient = {
  getBaseUrl(): string {
    return process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  },

  getVisionModel(): string {
    return process.env.OLLAMA_VISION_MODEL || 'minicpm-v';
  },

  getTextModel(): string {
    return process.env.OLLAMA_TEXT_MODEL || process.env.OLLAMA_MODEL || 'qwen3.5:9b';
  },

  getModel(hasImages = false): string {
    return hasImages ? this.getVisionModel() : this.getTextModel();
  },

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/tags`, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  },

  async generate(options: OllamaVisionRequest): Promise<string> {
    const hasImages = Boolean(options.images && options.images.length > 0);
    const model = options.model || this.getModel(hasImages);
    const url = `${this.getBaseUrl()}/api/generate`;

    const body: Record<string, any> = {
      model,
      prompt: options.prompt,
      // Streaming: Ollama sends response headers immediately, so long GPU jobs (vision scans of
      // large scanned pages) never trigger Node's 5-minute UND_ERR_HEADERS_TIMEOUT.
      stream: true,
      // Keep models resident in VRAM between pages/uploads (avoids expensive reloads)
      keep_alive: process.env.OLLAMA_KEEP_ALIVE || '30m',
      options: {
        num_predict: 4096,
        temperature: typeof options.temperature === 'number' ? options.temperature : 0.1,
      },
    };

    if (options.images && options.images.length > 0) {
      body.images = options.images;
    }

    if (options.system) {
      body.system = options.system;
    }

    if (options.format) {
      body.format = options.format;
    }

    console.log(`[OllamaClient] Calling ${model} at ${url}...`);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Ollama returned status ${res.status}: ${res.statusText}`);
    }

    // Read the NDJSON stream and concatenate the generated tokens
    if (!res.body) {
      const data: any = await res.json();
      return data.response || '';
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let output = '';
    const consumeLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const chunk = JSON.parse(trimmed);
        if (chunk.error) throw new Error(`Ollama error: ${chunk.error}`);
        if (typeof chunk.response === 'string') output += chunk.response;
      } catch (e: any) {
        if (String(e?.message || '').startsWith('Ollama error')) throw e;
      }
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        consumeLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
    consumeLine(buffer);
    return output;
  },

  async generateJson<T = any>(options: OllamaVisionRequest): Promise<T> {
    const raw = await this.generate({ ...options, format: options.format || 'json' });
    let cleaned = raw
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch (err: any) {
      console.warn('[OllamaClient] JSON direct parse failed, attempting repair...', err.message);

      // Attempt 1: Extract JSON object bounds
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        try {
          return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
        } catch {
          // continue
        }
      }

      // Attempt 2: Repair unclosed JSON (e.g. truncated response)
      try {
        let repaired = cleaned;
        if (firstBrace !== -1) {
          repaired = repaired.substring(firstBrace);
        }
        // Remove trailing commas
        repaired = repaired.replace(/,\s*([}\]])/g, '$1');
        // Count unclosed braces and brackets
        const openBraces = (repaired.match(/\{/g) || []).length;
        const closeBraces = (repaired.match(/\}/g) || []).length;
        const openBrackets = (repaired.match(/\[/g) || []).length;
        const closeBrackets = (repaired.match(/\]/g) || []).length;

        // If in middle of a string, close quote
        const quoteCount = (repaired.match(/"/g) || []).length;
        if (quoteCount % 2 !== 0) {
          repaired += '"';
        }

        for (let i = 0; i < (openBrackets - closeBrackets); i++) {
          repaired += ']';
        }
        for (let i = 0; i < (openBraces - closeBraces); i++) {
          repaired += '}';
        }

        return JSON.parse(repaired);
      } catch (repairErr: any) {
        console.error('[OllamaClient] Failed to repair JSON response:', raw);
        throw new Error(`Ollama JSON parse error: ${err.message}`);
      }
    }
  },
};

