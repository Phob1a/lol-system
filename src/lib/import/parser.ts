import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { normalizeHeader, type RawRow } from './validators';

export type ParsedFile = {
  headers: string[];        // normalized header keys (e.g. "gameId")
  rawHeaders: string[];     // original header strings
  rows: RawRow[];           // each row as { normalizedKey: cellValue }
};

export const MAX_ROWS = 5000;
export const MAX_BYTES = 10 * 1024 * 1024;

export class ImportParseError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'ImportParseError';
  }
}

function buildRows(rawHeaders: string[], dataRows: unknown[][]): ParsedFile {
  const headers = rawHeaders.map(normalizeHeader);
  const rows: RawRow[] = dataRows.slice(0, MAX_ROWS).map((cells) => {
    const obj: RawRow = {};
    headers.forEach((h, i) => {
      obj[h] = cells[i] ?? '';
    });
    return obj;
  });
  return { headers, rawHeaders, rows };
}

export async function parseCsv(buffer: ArrayBuffer): Promise<ParsedFile> {
  const text = new TextDecoder('utf-8').decode(buffer);
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: 'greedy',
    delimiter: '',
  });
  if (result.errors.length > 0 && result.data.length === 0) {
    throw new ImportParseError('CSV 解析失败', 'CSV_PARSE_ERROR');
  }
  const all = result.data;
  if (all.length === 0) {
    throw new ImportParseError('文件为空', 'EMPTY');
  }
  const [headerRow, ...dataRows] = all;
  return buildRows(headerRow.map((h) => String(h ?? '')), dataRows);
}

export function parseXlsx(buffer: ArrayBuffer): ParsedFile {
  const wb = XLSX.read(buffer, { type: 'array' });
  const firstName = wb.SheetNames[0];
  if (!firstName) throw new ImportParseError('XLSX 文件无 sheet', 'EMPTY');
  const ws = wb.Sheets[firstName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
    blankrows: false,
  });
  if (rows.length === 0) throw new ImportParseError('文件为空', 'EMPTY');
  const [headerRow, ...dataRows] = rows;
  return buildRows((headerRow as unknown[]).map((h) => String(h ?? '')), dataRows);
}

export async function parseUploadedFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<ParsedFile> {
  if (buffer.byteLength > MAX_BYTES) {
    throw new ImportParseError(`文件超过 ${Math.round(MAX_BYTES / 1024 / 1024)}MB 上限`, 'TOO_LARGE');
  }
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) return parseCsv(buffer);
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return parseXlsx(buffer);
  throw new ImportParseError('仅支持 CSV / XLSX 文件', 'BAD_TYPE');
}
