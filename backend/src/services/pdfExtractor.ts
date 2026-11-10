import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// ---------------------------------------------------------------------------
// Helpers for decoding embedded PDF image XObjects (scanned pages / photos)
// ---------------------------------------------------------------------------

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

/**
 * Encodes raw 8-bit pixel rows into a PNG.
 * `filteredRows` must already contain one PNG filter byte at the start of every row.
 */
function encodePng(width: number, height: number, colorType: 0 | 2, filteredRows: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType; // 0 = gray, 2 = RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(filteredRows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function decodeAscii85(input: Buffer): Buffer {
  let s = input.toString('latin1');
  if (s.startsWith('<~')) s = s.slice(2);
  const end = s.indexOf('~>');
  if (end !== -1) s = s.slice(0, end);
  s = s.replace(/\s+/g, '');
  const out: number[] = [];
  let group: number[] = [];
  for (const ch of s) {
    if (ch === 'z' && group.length === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    const code = ch.charCodeAt(0) - 33;
    if (code < 0 || code > 84) continue;
    group.push(code);
    if (group.length === 5) {
      let v = 0;
      for (const g of group) v = v * 85 + g;
      out.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
      group = [];
    }
  }
  if (group.length > 0) {
    const n = group.length;
    while (group.length < 5) group.push(84);
    let v = 0;
    for (const g of group) v = v * 85 + g;
    const bytes = [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
    out.push(...bytes.slice(0, n - 1));
  }
  return Buffer.from(out);
}

function decodeAsciiHex(input: Buffer): Buffer {
  let s = input.toString('latin1').replace(/\s+/g, '');
  const end = s.indexOf('>');
  if (end !== -1) s = s.slice(0, end);
  if (s.length % 2 === 1) s += '0';
  return Buffer.from(s, 'hex');
}

function inflateSafe(data: Buffer): Buffer {
  try {
    return zlib.inflateSync(data);
  } catch {
    // Some PDF writers produce slightly truncated zlib streams
    return zlib.inflateSync(data, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
  }
}

interface PdfImageObject {
  dict: string;
  data: Buffer;
}

/** Locates every image XObject (dictionary + raw stream bytes) inside a PDF buffer. */
function findImageObjects(buf: Buffer): PdfImageObject[] {
  const text = buf.toString('latin1');
  const results: PdfImageObject[] = [];
  const objRe = /\d+\s+\d+\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(text)) !== null) {
    const objStart = m.index;
    const streamKw = text.indexOf('stream', objStart);
    const endObj = text.indexOf('endobj', objStart);
    if (streamKw === -1 || (endObj !== -1 && endObj < streamKw)) continue;
    const dict = text.slice(objStart, streamKw);
    if (!/\/Subtype\s*\/Image\b/.test(dict)) continue;

    let dataStart = streamKw + 'stream'.length;
    if (text[dataStart] === '\r') dataStart++;
    if (text[dataStart] === '\n') dataStart++;

    let dataEnd = -1;
    const lenMatch = dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/);
    if (lenMatch) {
      const len = parseInt(lenMatch[1], 10);
      if (text.startsWith('endstream', dataStart + len) || /^\s*endstream/.test(text.slice(dataStart + len, dataStart + len + 12))) {
        dataEnd = dataStart + len;
      }
    }
    if (dataEnd === -1) {
      dataEnd = text.indexOf('endstream', dataStart);
      if (dataEnd === -1) continue;
      while (dataEnd > dataStart && (text[dataEnd - 1] === '\n' || text[dataEnd - 1] === '\r')) dataEnd--;
    }
    results.push({ dict, data: buf.subarray(dataStart, dataEnd) });
    objRe.lastIndex = dataEnd;
  }
  return results;
}

/** Converts a single PDF image XObject into a base64 JPEG/PNG usable by vision models. */
function imageObjectToBase64(obj: PdfImageObject): string | null {
  const { dict } = obj;
  const width = parseInt((dict.match(/\/Width\s+(\d+)/) || [])[1] || '0', 10);
  const height = parseInt((dict.match(/\/Height\s+(\d+)/) || [])[1] || '0', 10);
  // Skip masks, icons and thumbnails
  if (width < 200 || height < 200) return null;
  if (/\/ImageMask\s+true/.test(dict)) return null;

  const filterMatch = dict.match(/\/Filter\s*(\[[^\]]*\]|\/\w+)/);
  const filters = filterMatch ? (filterMatch[1].match(/\/(\w+)/g) || []).map((f) => f.slice(1)) : [];

  let data: Buffer = obj.data;
  for (const f of filters) {
    if (f === 'ASCII85Decode' || f === 'A85') data = decodeAscii85(data);
    else if (f === 'ASCIIHexDecode' || f === 'AHx') data = decodeAsciiHex(data);
    else if (f === 'FlateDecode' || f === 'Fl') data = inflateSafe(data);
    else if (f === 'DCTDecode' || f === 'DCT') return data.toString('base64'); // already a JPEG
    else if (f === 'JPXDecode') return null; // JPEG2000 not supported by vision models
    else return null; // CCITT / JBIG2 / LZW not supported
  }

  const bpc = parseInt((dict.match(/\/BitsPerComponent\s+(\d+)/) || [])[1] || '8', 10);
  if (bpc !== 8) return null;

  const predictor = parseInt((dict.match(/\/Predictor\s+(\d+)/) || [])[1] || '1', 10);
  const hasPngPredictor = predictor >= 10;

  let components = 0;
  if (/\/DeviceRGB|\/CalRGB/.test(dict)) components = 3;
  else if (/\/DeviceGray|\/CalGray/.test(dict)) components = 1;
  else if (/\/DeviceCMYK/.test(dict)) components = 4;
  else if (/\/Indexed/.test(dict)) return null;
  if (!components) {
    // ICCBased / unknown: derive from data size
    const perRow = hasPngPredictor ? data.length / height - 1 : data.length / height;
    components = Math.round(perRow / width);
  }
  if (![1, 3, 4].includes(components)) return null;

  const rowBytes = width * components;
  const srcStride = hasPngPredictor ? rowBytes + 1 : rowBytes;
  if (data.length < srcStride * height) return null;

  let rows: Buffer;
  let colorType: 0 | 2 = components === 1 ? 0 : 2;

  if (components === 4) {
    // Undo PNG predictor first if necessary is complex; only support un-predicted CMYK
    if (hasPngPredictor) return null;
    const outStride = width * 3 + 1;
    rows = Buffer.alloc(outStride * height);
    for (let y = 0; y < height; y++) {
      rows[y * outStride] = 0;
      for (let x = 0; x < width; x++) {
        const si = y * rowBytes + x * 4;
        const c = data[si], mg = data[si + 1], ye = data[si + 2], k = data[si + 3];
        const di = y * outStride + 1 + x * 3;
        rows[di] = 255 - Math.min(255, c + k);
        rows[di + 1] = 255 - Math.min(255, mg + k);
        rows[di + 2] = 255 - Math.min(255, ye + k);
      }
    }
    colorType = 2;
  } else if (hasPngPredictor) {
    // PDF PNG-predictor rows are byte-identical to PNG scanlines (filter byte + data)
    rows = data.subarray(0, srcStride * height);
  } else {
    rows = Buffer.alloc((rowBytes + 1) * height);
    for (let y = 0; y < height; y++) {
      rows[y * (rowBytes + 1)] = 0;
      data.copy(rows, y * (rowBytes + 1) + 1, y * rowBytes, y * rowBytes + rowBytes);
    }
  }

  return encodePng(width, height, colorType, rows).toString('base64');
}

export const pdfExtractor = {
  isPdf(filePath: string, mimeType?: string): boolean {
    if (mimeType === 'application/pdf') return true;
    return path.extname(filePath).toLowerCase() === '.pdf';
  },

  async extractText(filePath: string): Promise<string> {
    try {
      // Dynamic import to support ESM
      const pdfParseModule = await import('pdf-parse-fork');
      const pdfParse = (pdfParseModule as any).default || pdfParseModule;
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      return (data && data.text) ? data.text.trim() : '';
    } catch (err: any) {
      console.warn('[PDF Extractor] Error extracting text from PDF:', err.message);
      return '';
    }
  },

  /**
   * Extracts the page scans / photos embedded inside a PDF as base64 images (JPEG or PNG)
   * so they can be sent to the vision model.
   * Supports DCTDecode (JPEG) as well as FlateDecode / ASCII85 / ASCIIHex raw bitmaps
   * (e.g. PDFs produced by ReportLab, phone scanner apps, "Print to PDF").
   * Filters out soft masks and tiny thumbnails.
   */
  extractEmbeddedImages(filePath: string, maxImages = 10): string[] {
    const images: string[] = [];
    try {
      const buf = fs.readFileSync(filePath);

      // 1. Structured parse of image XObjects (handles all common encodings)
      for (const obj of findImageObjects(buf)) {
        try {
          const b64 = imageObjectToBase64(obj);
          if (b64 && b64.length > 20000) {
            images.push(b64);
            if (images.length >= maxImages) break;
          }
        } catch (decErr: any) {
          console.warn('[PDF Extractor] Skipping undecodable embedded image:', decErr?.message);
        }
      }

      // 2. Legacy fallback: raw JPEG marker scan (for malformed PDFs)
      if (images.length === 0) {
        let idx = 0;
        while (idx < buf.length) {
          const soi = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]), idx);
          if (soi === -1) break;
          const eoi = buf.indexOf(Buffer.from([0xff, 0xd9]), soi + 2);
          if (eoi === -1) break;
          const imgBuf = buf.subarray(soi, eoi + 2);
          if (imgBuf.length > 50000) {
            images.push(imgBuf.toString('base64'));
            if (images.length >= maxImages) break;
          }
          idx = eoi + 2;
        }
      }
    } catch (err: any) {
      console.warn('[PDF Extractor] Error extracting embedded images:', err.message);
    }
    return images;
  },
};
