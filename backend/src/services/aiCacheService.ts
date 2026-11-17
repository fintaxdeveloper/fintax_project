import fs from 'fs';
import path from 'path';

/**
 * AI Extraction Cache (keyed by SHA-256 file checksum)
 * ----------------------------------------------------
 * Vision OCR of scanned PDFs is the slowest step (≈30–60 s per page on a local GPU).
 * When the SAME file is uploaded again (re-upload, re-analysis, another month test),
 * the stored AI result is reused instantly instead of re-scanning every page.
 * Bump CACHE_VERSION whenever the extraction prompts / logic change to invalidate old entries.
 */
const CACHE_VERSION = 1;
const STORAGE_DIR = path.resolve(process.cwd(), '../storage');
const CACHE_FILE = path.join(STORAGE_DIR, 'ai_extraction_cache.json');
const MAX_ENTRIES = 500;

interface CacheEntry {
  v: number;
  saved_at: string;
  filename: string;
  extracted: any;
  splitBills: any[];
}

let memory: Record<string, CacheEntry> | null = null;

const load = (): Record<string, CacheEntry> => {
  if (memory) return memory;
  try {
    memory = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')) : {};
  } catch (e) {
    console.warn('[AI Cache] Could not read cache file, starting empty:', (e as Error).message);
    memory = {};
  }
  return memory!;
};

const persist = (): void => {
  try {
    if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(memory || {}), 'utf-8');
  } catch (e) {
    console.warn('[AI Cache] Could not write cache file:', (e as Error).message);
  }
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v ?? null));

export const aiCacheService = {
  get(checksum: string | undefined): { extracted: any; splitBills: any[] } | null {
    if (!checksum) return null;
    const entry = load()[checksum];
    if (!entry || entry.v !== CACHE_VERSION || !entry.extracted) return null;
    return { extracted: clone(entry.extracted), splitBills: clone(entry.splitBills || []) };
  },

  set(checksum: string | undefined, filename: string, extracted: any, splitBills: any[]): void {
    if (!checksum || !extracted) return;
    const hasData =
      (Array.isArray(extracted.bookings) && extracted.bookings.length > 0) ||
      Number(extracted.total_amount) > 0 ||
      (Array.isArray(splitBills) && splitBills.length > 0);
    if (!hasData) return; // never cache empty / failed extractions
    const all = load();
    all[checksum] = {
      v: CACHE_VERSION,
      saved_at: new Date().toISOString(),
      filename,
      extracted: clone(extracted),
      splitBills: clone(splitBills || []),
    };
    const keys = Object.keys(all);
    if (keys.length > MAX_ENTRIES) {
      keys
        .sort((a, b) => (all[a].saved_at < all[b].saved_at ? -1 : 1))
        .slice(0, keys.length - MAX_ENTRIES)
        .forEach((k) => delete all[k]);
    }
    persist();
  },

  clear(): void {
    memory = {};
    persist();
  },
};
