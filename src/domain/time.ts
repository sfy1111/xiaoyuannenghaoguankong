import dayjs from 'dayjs';

export const TZ_OFFSET = '+08:00';

export function d(date: string | Date | dayjs.Dayjs): dayjs.Dayjs {
  return dayjs(date);
}

export function iso(date: string | Date | dayjs.Dayjs): string {
  return dayjs(date).format('YYYY-MM-DD');
}

export function monthOf(date: string): string {
  return dayjs(date).format('YYYY-MM');
}

export function hourTs(date: string, hour: number): string {
  return `${dayjs(date).format('YYYY-MM-DD')}T${String(hour).padStart(2, '0')}:00:00${TZ_OFFSET}`;
}

export function rangeDays(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = dayjs(from);
  const end = dayjs(to);
  while (!cur.isAfter(end, 'day')) {
    out.push(cur.format('YYYY-MM-DD'));
    cur = cur.add(1, 'day');
  }
  return out;
}

export function rangeMonths(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = dayjs(from).startOf('month');
  const end = dayjs(to).startOf('month');
  while (!cur.isAfter(end, 'month')) {
    out.push(cur.format('YYYY-MM'));
    cur = cur.add(1, 'month');
  }
  return out;
}

export function monthRange(month: string): { from: string; to: string } {
  const base = dayjs(month + '-01');
  return { from: base.format('YYYY-MM-DD'), to: base.endOf('month').format('YYYY-MM-DD') };
}

export function lastNDays(endDate: string, n: number): string[] {
  const end = dayjs(endDate);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(end.subtract(i, 'day').format('YYYY-MM-DD'));
  return out;
}

export function shiftDay(date: string, days: number): string {
  return dayjs(date).add(days, 'day').format('YYYY-MM-DD');
}

export function sameDayLastWeek(date: string): string {
  return dayjs(date).subtract(7, 'day').format('YYYY-MM-DD');
}

export function daysBetween(from: string, to: string): number {
  return dayjs(to).diff(dayjs(from), 'day') + 1;
}

export function nowOfAsOf(asOf: string): string {
  return dayjs(asOf).format('YYYY-MM-DD HH:mm');
}

export function compareAsc(a: string, b: string): number {
  return dayjs(a).valueOf() - dayjs(b).valueOf();
}