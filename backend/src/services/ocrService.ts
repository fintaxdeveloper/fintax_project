import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { pdfExtractor } from './pdfExtractor.js';

const execFileAsync = promisify(execFile);

export interface OcrLine {
  text: string;
  x: number;
  y: number;
  width: number;
}

export interface OcrPage {
  page: number;
  text: string;
  source: 'pdf_text' | 'tesseract' | 'winrt_ocr';
  imageWidth?: number;
  lines?: OcrLine[];
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

  // Batch WinRT OCR script with 300-dpi upscale + grayscale contrast preprocessing + spatial line boxes
  const psScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
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
  $linesArr = @()
  $imgW = 0
  $tmpPre = "$fp.pre.png"
  try {
    $src = [System.Drawing.Bitmap]::FromFile($fp)
    $scale = if ($src.Width -lt 2200) { [Math]::Min(2.5, 2400.0 / [Math]::Max(1, $src.Width)) } else { 1.0 }
    $nw = [int]($src.Width * $scale)
    $nh = [int]($src.Height * $scale)
    $imgW = $nw
    $dst = New-Object System.Drawing.Bitmap($nw, $nh)
    $g = [System.Drawing.Graphics]::FromImage($dst)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $cm = New-Object System.Drawing.Imaging.ColorMatrix
    $c = 1.15; $t = 0.5 * (1.0 - $c)
    $cm.Matrix00 = 0.299 * $c; $cm.Matrix01 = 0.299 * $c; $cm.Matrix02 = 0.299 * $c
    $cm.Matrix10 = 0.587 * $c; $cm.Matrix11 = 0.587 * $c; $cm.Matrix12 = 0.587 * $c
    $cm.Matrix20 = 0.114 * $c; $cm.Matrix21 = 0.114 * $c; $cm.Matrix22 = 0.114 * $c
    $cm.Matrix40 = $t; $cm.Matrix41 = $t; $cm.Matrix42 = $t
    $ia = New-Object System.Drawing.Imaging.ImageAttributes
    $ia.SetColorMatrix($cm)
    $g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $nw, $nh)), 0, 0, $src.Width, $src.Height, [System.Drawing.GraphicsUnit]::Pixel, $ia)
    $g.Dispose(); $src.Dispose()
    $dst.Save($tmpPre, [System.Drawing.Imaging.ImageFormat]::Png)
    $dst.Dispose()

    $fs = [System.IO.File]::OpenRead($tmpPre)
    $stream = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($fs)
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    $fs.Dispose()
    $text = ($result.Lines | ForEach-Object { $_.Text }) -join "\`n"
    if ($text) {
      $text = $text -replace '[\x00-\x08\x0B\x0C\x0E-\x1F]', ' '
    }
    foreach ($ln in $result.Lines) {
      $w0 = $ln.Words | Select-Object -First 1
      if ($w0) {
        $lTxt = ($ln.Text -replace '[\x00-\x08\x0B\x0C\x0E-\x1F]', ' ').Trim()
        if ($lTxt) {
          $linesArr += [PSCustomObject]@{
            text = $lTxt
            x = [int]$w0.BoundingRect.X
            y = [int]$w0.BoundingRect.Y
            width = [int]$w0.BoundingRect.Width
          }
        }
      }
    }
  } catch {
    $text = ''
  } finally {
    if (Test-Path $tmpPre) { Remove-Item $tmpPre -Force -ErrorAction SilentlyContinue }
  }
  $out += [PSCustomObject]@{ file = $fp; text = $text; imageWidth = $imgW; lines = $linesArr }
}
$out | ConvertTo-Json -Depth 5 -Compress
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
    const sanitized = trimmed.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]+/g, ' ');
    const parsed = JSON.parse(sanitized);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr.map((item: any, idx: number) => ({
      page: idx + 1,
      text: String(item?.text || '').trim(),
      source: 'winrt_ocr' as const,
      ...(item?.imageWidth ? { imageWidth: Number(item.imageWidth) } : {}),
      ...(Array.isArray(item?.lines) ? { lines: item.lines } : {}),
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
  async extractPages(
    filePath: string,
    mimeType?: string,
    checksum?: string,
    opts?: { forceRefresh?: boolean; requireSpatial?: boolean }
  ): Promise<OcrPage[]> {
    if (!fs.existsSync(filePath)) return [];

    const hash =
      checksum ||
      crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

    const cache = loadCache();
    const cached = cache[hash];
    const hasSpatial = cached?.pages?.some((p) => Array.isArray(p.lines) && p.lines.length > 0);
    if (
      !opts?.forceRefresh &&
      (!opts?.requireSpatial || hasSpatial) &&
      cached &&
      cached.v === CACHE_VERSION &&
      Array.isArray(cached.pages) &&
      cached.pages.length > 0
    ) {
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
      base64Images = pdfExtractor.extractEmbeddedImages(filePath, 200);
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
