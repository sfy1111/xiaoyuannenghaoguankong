import * as XLSX from 'xlsx';
import { getEntities } from './repository';

export interface SheetData {
  name: string;
  headers: string[];
  rows: (string | number | null)[][];
}

function recordExport(filename: string, detail: string): void {
  getEntities().actions.appendAudit('报表中心', '导出报表', filename, detail);
}

export function downloadCsv(filename: string, sheet: SheetData, metaNote?: string): void {
  const lines: string[] = [];
  if (metaNote) lines.push(metaNote);
  lines.push(sheet.headers.join(','));
  for (const row of sheet.rows) {
    lines.push(row.map((c) => (typeof c === 'string' && c.includes(',') ? `"${c.replace(/"/g, '""')}"` : c ?? '')).join(','));
  }
  const bom = '\uFEFF';
  const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
  recordExport(filename, `${detailOf(sheet)}；说明：${metaNote ?? '无'}`);
}

export function downloadXlsx(filename: string, sheets: SheetData[], metaNote?: string): void {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([sheet.headers, ...sheet.rows]);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 30));
  }
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  triggerDownload(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
  recordExport(filename, `${sheets.map((s) => detailOf(s)).join('；')}；说明：${metaNote ?? '无'}`);
}

function detailOf(sheet: SheetData): string {
  return `工作表「${sheet.name}」共${sheet.rows.length}行×${sheet.headers.length}列`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}