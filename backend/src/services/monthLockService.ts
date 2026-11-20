import fs from 'fs';
import path from 'path';
import { BookingItem } from '../types/document.js';

export interface MonthLockEntry {
  scope: string;
  client_id: string;
  year: number;
  month: number;
  locked: boolean;
  locked_at: string;
  locked_by: string;
  bookings: BookingItem[];
  opening_balance?: number;
  closing_balance?: number;
  kasse_opening_balance?: number;
}

function resolveStorageDir(): string {
  const candidates = [
    ...(process.env.FINTAX_STORAGE_DIR ? [path.resolve(process.env.FINTAX_STORAGE_DIR)] : []),
    path.resolve(process.cwd(), 'fintax_project-main/storage'),
    path.resolve(process.cwd(), 'storage'),
    path.resolve(process.cwd(), '../storage'),
    path.resolve(process.cwd(), '../../storage'),
  ];
  for (const d of candidates) {
    if (fs.existsSync(d)) return d;
  }
  return path.resolve(process.cwd(), '../storage');
}

const STORAGE_DIR = resolveStorageDir();
const LOCKS_FILE = path.join(STORAGE_DIR, 'month_locks.json');

function readLocks(): Record<string, MonthLockEntry> {
  try {
    if (fs.existsSync(LOCKS_FILE)) {
      return JSON.parse(fs.readFileSync(LOCKS_FILE, 'utf-8')) as Record<string, MonthLockEntry>;
    }
  } catch (e) {
    console.warn('[MonthLockService] Could not read month_locks.json:', (e as Error).message);
  }
  return {};
}

function writeLocks(data: Record<string, MonthLockEntry>): void {
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
  fs.writeFileSync(LOCKS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export const monthLockService = {
  scopeKey(clientId: string | undefined, year: number, month: number): string {
    return `${(clientId || 'default').toLowerCase()}__${year}_${String(month).padStart(2, '0')}`;
  },

  getLock(clientId: string | undefined, year: number, month: number): MonthLockEntry | null {
    const locks = readLocks();
    const entry = locks[this.scopeKey(clientId, year, month)];
    return entry && entry.locked ? entry : null;
  },

  isLocked(clientId: string | undefined, year: number, month: number): boolean {
    return this.getLock(clientId, year, month) !== null;
  },

  lockMonth(
    clientId: string | undefined,
    year: number,
    month: number,
    data: {
      bookings: BookingItem[];
      opening_balance?: number;
      closing_balance?: number;
      kasse_opening_balance?: number;
      locked_by?: string;
    }
  ): MonthLockEntry {
    const locks = readLocks();
    const scope = this.scopeKey(clientId, year, month);
    const entry: MonthLockEntry = {
      scope,
      client_id: clientId || 'default',
      year,
      month,
      locked: true,
      locked_at: new Date().toISOString(),
      locked_by: data.locked_by || 'golden:approve',
      bookings: data.bookings,
      opening_balance: data.opening_balance,
      closing_balance: data.closing_balance,
      kasse_opening_balance: data.kasse_opening_balance,
    };
    locks[scope] = entry;
    writeLocks(locks);
    return entry;
  },

  unlockMonth(clientId: string | undefined, year: number, month: number): boolean {
    const locks = readLocks();
    const scope = this.scopeKey(clientId, year, month);
    if (!locks[scope]) return false;
    delete locks[scope];
    writeLocks(locks);
    return true;
  },

  listLocks(clientId?: string): MonthLockEntry[] {
    const locks = readLocks();
    const list = Object.values(locks).filter((l) => l.locked);
    if (clientId) {
      return list.filter((l) => l.client_id.toLowerCase() === clientId.toLowerCase());
    }
    return list;
  },
};
