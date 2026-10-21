import dayjs from 'dayjs';
import type { CampusCalendarData, DayType, OpenHoursRule } from './types';

export interface ResolvedDay {
  date: string;
  dayType: DayType;
  semesterId: string | null;
  specialName: string | null;
}

function inRange(date: string, start: string, end: string): boolean {
  const t = dayjs(date);
  return !t.isBefore(dayjs(start), 'day') && !t.isAfter(dayjs(end), 'day');
}

export function resolveDay(date: string, cal: CampusCalendarData): ResolvedDay {
  const special = cal.specialDays.find((sd) => inRange(date, sd.date, sd.end));
  if (special) {
    return {
      date,
      dayType: special.type === 'holiday' ? 'holiday' : 'special',
      semesterId: null,
      specialName: special.name,
    };
  }
  const breakSem = cal.semesters.find((s) => s.type !== 'term' && inRange(date, s.start, s.end));
  if (breakSem) return { date, dayType: 'vacation', semesterId: breakSem.id, specialName: null };
  const term = cal.semesters.find((s) => s.type === 'term' && inRange(date, s.start, s.end));
  if (!term) return { date, dayType: 'vacation', semesterId: null, specialName: null };
  const exam = cal.examWeeks.find((w) => inRange(date, w.start, w.end));
  if (exam) return { date, dayType: 'exam', semesterId: term.id, specialName: exam.name };
  const weekday = dayjs(date).day();
  if (weekday === 0 || weekday === 6) return { date, dayType: 'weekend', semesterId: term.id, specialName: null };
  return { date, dayType: 'teaching', semesterId: term.id, specialName: null };
}

export const DAY_TYPE_LABEL: Record<DayType, string> = {
  teaching: '教学日',
  weekend: '周末',
  exam: '考试周',
  vacation: '寒暑假',
  holiday: '法定假日',
  special: '特殊活动日',
};

export function semesterOfDate(date: string, cal: CampusCalendarData) {
  return cal.semesters.find((s) => inRange(date, s.start, s.end)) || null;
}

export function openHoursFor(category: string, cal: CampusCalendarData, dayType: DayType): OpenHoursRule | null {
  const rule = cal.openHours.find((o) => o.category === category);
  if (!rule) return null;
  return rule;
}

/** 建筑在某日类型下的开放起止小时（0-23），24表示全天 */
export function openHourRange(rule: OpenHoursRule | null, dayType: DayType): { start: number; end: number } | null {
  if (!rule) return null;
  const parse = (s: string) => Number(s.slice(0, 2));
  if (dayType === 'exam' && rule.examExtension) return { start: parse(rule.start), end: parse(rule.examExtension) };
  if (dayType === 'vacation' || dayType === 'holiday') return { start: parse(rule.breakStart), end: parse(rule.breakEnd) };
  return { start: parse(rule.start), end: parse(rule.end) };
}

/** 该小时是否处于开放（教学/使用）时段 */
export function isOpenHour(rule: OpenHoursRule | null, dayType: DayType, hour: number): boolean {
  const range = openHourRange(rule, dayType);
  if (!range) return false;
  if (range.start === 0 && range.end >= 24) return true;
  return hour >= range.start && hour < range.end;
}

export function teachingDayLike(dayType: DayType): boolean {
  return dayType === 'teaching' || dayType === 'exam';
}