import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { pdfExtractor } from './pdfExtractor.js';

const execFileAsync = promisify(execFile);

export interface OcrPage {
  page: number;
  text: string;
  source: 'pdf_text' | 'tesseract' | 'winrt_ocr';
}

const STORAGE_DIR = path.resolve(process.cwd(), '../storage');
const OCR_CACHE_FILE = path.join(STORAGE_DIR, 'ocr_cache.json');
const CACHE_VERSION = 1;

interface OcrCacheEntry {
  v: number;
  saved_at: string;
  pages: OcrPage[];
}

let ocrCache: Record<string, OcrCacheEntry> | null = null;

function loadCache(): Record<string, OcrCacheEntry> {
  if (ocrCache) return ocrCache;
  try {
    ocrCache = fs.existsSync(OCR_CACHE_FILE)
      ? JSON.parse(fs.readFileSync(OCR_CACHE_FILE, 'utf-8'))
      : {};
  } catch {
    ocrCache = {};
  }
  return ocrCache!;
}

function saveCache(): void {
  try {
    if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
    fs.writeFileSync(OCR_CACHE_FILE, JSON.stringify(ocrCache || {}, null, 2), 'utf-8');
  } catch (e: any) {
    console.warn('[OCR Service] Failed to save OCR cache:', e?.message);
  }
}

function detectExtFromBase64(b64: string): 'png' | 'jpg' {
  if (b64.startsWith('iVBORw0K')) return 'png';
  return 'jpg';
}

async function hasTesseract(): Promise<boolean> {
  try {
    await execFileAsync('tesseract', ['--version'], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

async function runTesseractOnImages(imgPaths: string[]): Promise<OcrPage[]> {
  const pages: OcrPage[] = [];
  for (let i = 0; i < imgPaths.length; i++) {
    try {
      const { stdout } = await execFileAsync('tesseract', [imgPaths[i], 'stdout', '-l', 'deu+eng', '--psm', '6'], {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      });
      pages.push({ page: i + 1, text: (stdout || '').trim(), source: 'tesseract' });
    } catch {
      pages.push({ page: i + 1, text: '', source: 'tesseract' });
    }
  }
  return pages;
}

async function runWinRtOcrBatch(imgPaths: string[]): Promise<OcrPage[]> {
  if (imgPaths.length === 0) return [];
  const tmpDir = path.dirname(imgPaths[0]);
  const listPath = path.join(tmpDir, 'files.json');
  const scriptPath = path.join(tmpDir, 'run_ocr.ps1');
  fs.writeFileSync(listPath, JSON.stringify(imgPaths), 'utf-8');

  // Batch WinRT OCR script using File.OpenRead -> AsRandomAccessStream (verified ~250ms/page on CPU)
  const psScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name.StartsWith('IAsyncOperation')
})[0]
Function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}
[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics,ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
$langs = [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages
$deLang = $langs | Where-Object { $_.LanguageTag -like 'de*' } | Select-Object -First 1
$engine = if ($deLang) {
  [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($deLang)
} else {
  [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
}
$files = Get-Content -Raw -Encoding UTF8 '${listPath.replace(/\\/g, '\\\\')}' | ConvertFrom-Json
$out = @()
foreach ($fp in $files) {
  $text = ''
  try {
    $fs = [System.IO.File]::OpenRead($fp)
    $stream = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($fs)
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    $fs.Dispose()
    $text = ($result.Lines | ForEach-Object { $_.Text }) -join "\`n"
  } catch {
    $text = ''
  }
  $out += [PSCustomObject]@{ file = $fp; text = $text }
}
$out | ConvertTo-Json -Depth 4 -Compress
`.trim();

  fs.writeFileSync(scriptPath, psScript, 'utf-8');

  try {
    const { stdout } = await execFileAsync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { timeout: 120000, maxBuffer: 25 * 1024 * 1024 }
    );
    const trimmed = (stdout || '').trim();
    if (!trimmed) return imgPaths.map((_, idx) => ({ page: idx + 1, text: '', source: 'winrt_ocr' }));
    const parsed = JSON.parse(trimmed);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.map((item: any, idx: number) => ({
      page: idx + 1,
      text: String(item?.text || '').trim(),
      source: 'winrt_ocr' as const,
    }));
  } catch (err: any) {
    console.warn('[OCR Service] WinRT batch OCR error:', err?.message);
    return imgPaths.map((_, idx) => ({ page: idx + 1, text: '', source: 'winrt_ocr' }));
  }
}

export const ocrService = {
  /**
   * Extracts per-page text from a digital PDF, scanned PDF, or image completely offline on CPU.
   * Priority:
   *  1. SHA-256 OCR cache (`storage/ocr_cache.json`)
   *  2. Digital PDF text (`pdf-parse-fork`) if substantive digital text exists
   *  3. Local Tesseract (`-l deu+eng`) if installed on PATH
   *  4. Windows Native WinRT OCR (`Windows.Media.Ocr.OcrEngine`) batch CPU scan
   */
  async extractPages(filePath: string, mimeType?: string, checksum?: string): Promise<OcrPage[]> {
    if (!fs.existsSync(filePath)) return [];

    const hash =
      checksum ||
      crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

    const cache = loadCache();
    const cached = cache[hash];
    if (cached && cached.v === CACHE_VERSION && Array.isArray(cached.pages) && cached.pages.length > 0) {
      return cached.pages;
    }

    const isPdf = pdfExtractor.isPdf(filePath, mimeType);

    // Digital PDF text fast-path
    if (isPdf) {
      const digitalText = await pdfExtractor.extractText(filePath);
      if (digitalText && digitalText.length > 80) {
        const rawPages = digitalText.split(/\f/).map((t) => t.trim()).filter(Boolean);
        const pages: OcrPage[] = (rawPages.length > 0 ? rawPages : [digitalText]).map((text, idx) => ({
          page: idx + 1,
          text,
          source: 'pdf_text',
        }));
        cache[hash] = { v: CACHE_VERSION, saved_at: new Date().toISOString(), pages };
        saveCache();
        return pages;
      }
    }

    // Extract page images for scanned PDF or single image
    let base64Images: string[] = [];
    if (isPdf) {
      base64Images = pdfExtractor.extractEmbeddedImages(filePath, 60);
    } else {
      base64Images = [fs.readFileSync(filePath).toString('base64')];
    }

    if (base64Images.length === 0) return [];

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fintax_ocr_'));
    const imgPaths: string[] = [];
    try {
      for (let i = 0; i < base64Images.length; i++) {
        const b64 = base64Images[i];
        const ext = detectExtFromBase64(b64);
        const outFile = path.join(tmpDir, `page_${String(i + 1).padStart(3, '0')}.${ext}`);
        fs.writeFileSync(outFile, Buffer.from(b64, 'base64'));
        imgPaths.push(outFile);
      }

      let pages: OcrPage[] = [];
      if (await hasTesseract()) {
        console.log(`[OCR Service] Running Tesseract CPU OCR on ${imgPaths.length} page(s) of ${path.basename(filePath)}...`);
        pages = await runTesseractOnImages(imgPaths);
      } else if (process.platform === 'win32') {
        console.log(`[OCR Service] Running offline CPU WinRT OCR on ${imgPaths.length} page(s) of ${path.basename(filePath)}...`);
        pages = await runWinRtOcrBatch(imgPaths);
      }

      if (pages.some((p) => p.text.length > 0)) {
        cache[hash] = { v: CACHE_VERSION, saved_at: new Date().toISOString(), pages };
        saveCache();
      }
      return pages;
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  },
};
