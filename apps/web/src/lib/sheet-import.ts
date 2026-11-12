/**
 * Read a spreadsheet the shop picks from the computer: Excel (.xlsx) or CSV / TSV.
 * Returns rows of trimmed cell texts. The header row (if any) is kept: callers detect it.
 */
import { normalizeSearch } from '@/lib/search';

export const SHEET_ACCEPT = '.xlsx,.csv,.txt,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';

/** Split CSV text (quotes, "" escapes, , ; or tab — whichever the first line uses most). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] || '';
  const delimiter = [',', ';', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter(r => r.some(c => c !== ''));
}

export async function readSheet(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls')) throw new Error('File Excel đời cũ (.xls) chưa hỗ trợ — vui lòng "Lưu thành" .xlsx hoặc .csv.');
  if (name.endsWith('.xlsx')) {
    const readXlsxFile = (await import('read-excel-file')).default;
    const rows = await readXlsxFile(file);
    return rows
      .map(r => r.map(c => (c == null ? '' : c instanceof Date ? c.toISOString() : String(c)).trim()))
      .filter(r => r.some(c => c !== ''));
  }
  if (file.size > 5 * 1024 * 1024) throw new Error('File quá lớn (tối đa 5 MB).');
  const buffer = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buffer);
  // CSV saved by Excel in Windows-1258/1252 shows "�": try the Vietnamese code page
  if (text.includes('�')) {
    try { text = new TextDecoder('windows-1258').decode(buffer); } catch { /* keep utf-8 */ }
  }
  return parseCsv(text);
}

/** Index of the column whose header matches one of the aliases (accents and case ignored), or -1. */
export function findColumn(header: string[], aliases: string[]): number {
  const keys = header.map(h => normalizeSearch(h).replace(/[^a-z0-9 ]/g, '').trim());
  const wanted = aliases.map(a => normalizeSearch(a));
  let idx = keys.findIndex(k => wanted.includes(k));
  if (idx < 0) idx = keys.findIndex(k => wanted.some(w => k.startsWith(w) || k.includes(w)));
  return idx;
}

/** "45.000" / "45,000đ" / "12,5" → number (NaN when empty). */
export function toNumber(raw: string): number {
  const s = String(raw ?? '').trim();
  if (!s) return NaN;
  return Number(s.replace(/[^\d.,-]/g, '').replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.'));
}

/** Download rows as a CSV that Excel opens with Vietnamese letters intact (UTF-8 BOM). */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + rows.map(r => r.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
