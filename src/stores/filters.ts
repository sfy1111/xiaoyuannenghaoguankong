import { create } from 'zustand';
import dayjs from 'dayjs';
import { META } from '../services/repository';

export type DateMode = 'day' | 'month' | 'year';

export const DATA_START = META.dataWindow.start;
export const DATA_END = META.dataWindow.end;
export const AS_OF = META.asOf;
export const DEFAULT_DATE = '2026-10-20';

interface FiltersState {
  campusId: 'all' | string;
  dateMode: DateMode;
  date: string;
  setCampus(id: 'all' | string): void;
  setDateMode(mode: DateMode): void;
  setDate(date: string): void;
  restoreFromUrl(): void;
}

function clampDate(date: string): string {
  const d = dayjs(date);
  if (d.isBefore(dayjs(DATA_START), 'day')) return DATA_START;
  if (d.isAfter(dayjs(DATA_END), 'day')) return DATA_END;
  return d.format('YYYY-MM-DD');
}

export const useFilters = create<FiltersState>((set, get) => ({
  campusId: 'all',
  dateMode: 'day',
  date: DEFAULT_DATE,
  setCampus: (id) => set({ campusId: id }),
  setDateMode: (mode) => set({ dateMode: mode }),
  setDate: (date) => set({ date: clampDate(date) }),
  restoreFromUrl: () => {
    const hash = window.location.hash;
    const qIdx = hash.indexOf('?');
    const params = qIdx >= 0
      ? new URLSearchParams(hash.slice(qIdx + 1))
      : new URLSearchParams(window.location.search);
    const campus = params.get('campus');
    const mode = params.get('mode');
    const date = params.get('date');
    set({
      campusId: campus === 'C-E' || campus === 'C-W' ? campus : 'all',
      dateMode: mode === 'day' || mode === 'month' || mode === 'year' ? mode : 'day',
      date: date ? clampDate(date) : get().date,
    });
  },
}));

/** 根据日期模式返回统计起止（截至数据窗口内） */
export function currentRange(dateMode: DateMode, date: string): { from: string; to: string; label: string; partialNote?: string } {
  const d = dayjs(date);
  if (dateMode === 'day') {
    const day = d.format('YYYY-MM-DD');
    const isToday = day === dayjs(DATA_END).format('YYYY-MM-DD');
    return { from: day, to: day, label: `本日（${day}）`, partialNote: isToday ? '本日统计截至数据更新时刻，非全日' : undefined };
  }
  if (dateMode === 'month') {
    const base = d.startOf('month');
    const end = d.endOf('month').isAfter(dayjs(DATA_END)) ? dayjs(DATA_END) : d.endOf('month');
    return { from: base.format('YYYY-MM-DD'), to: end.format('YYYY-MM-DD'), label: `本月（${base.format('YYYY-MM')}）`, partialNote: end.isBefore(d.endOf('month')) ? '本月统计截至数据更新时刻' : undefined };
  }
  const start = d.startOf('year').isBefore(dayjs(DATA_START)) ? dayjs(DATA_START) : d.startOf('year');
  const end = d.endOf('year').isAfter(dayjs(DATA_END)) ? dayjs(DATA_END) : d.endOf('year');
  return {
    from: start.format('YYYY-MM-DD'),
    to: end.format('YYYY-MM-DD'),
    label: `本年（${start.format('YYYY-MM-DD')} 至 ${end.format('YYYY-MM-DD')}）`,
    partialNote: start.isAfter(d.startOf('year')) || end.isBefore(d.endOf('year')) ? '数据窗口未覆盖完整年度' : undefined,
  };
}

/** 同步全局筛选到 URL（Hash 路由查询串，保持可刷新、可分享） */
export function syncFiltersToUrl(): void {
  const { campusId, dateMode, date } = useFilters.getState();
  const params = new URLSearchParams();
  params.set('campus', campusId);
  params.set('mode', dateMode);
  params.set('date', date);
  const path = (window.location.hash.split('?')[0]) || '#/dashboard/campus';
  // replaceState 不触发路由事件，仅同步地址栏
  window.history.replaceState(null, '', `${window.location.pathname}${path}?${params.toString()}`);
}