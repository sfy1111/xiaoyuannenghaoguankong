import { create } from 'zustand';
import { getEntities } from '../services/repository';
import { MENU } from '../app/menu';

/**
 * 钻取导航轨迹：记录“我是从哪里点进来的”，面包屑按真实跳转链展示，
 * 上一级始终可见且可一键返回；点击左侧菜单视为开启新任务（轨迹重置）。
 */

export interface NavEntry {
  path: string;
  title: string;
}

interface NavigationState {
  trail: NavEntry[];
  nextIsMenuJump: boolean;
  /** 下一次导航来自左侧菜单/首页等入口：重置轨迹 */
  markMenuJump(): void;
  /** 路由变化时维护轨迹（含浏览器返回识别） */
  onLocationChange(path: string): void;
  /** 回跳到轨迹中的某一级（截断其后条目） */
  goTo(path: string): void;
}

const TRAIL_LIMIT = 8;

export function resolveTitle(pathname: string): string {
  for (const group of MENU) {
    for (const leaf of group.children) {
      if (leaf.key === pathname) return leaf.label;
    }
  }
  const entities = getEntities();
  if (pathname === '/dashboard/campus' || pathname === '/') return '校园综合概览';
  if (pathname.startsWith('/dashboard/campus/')) {
    const id = pathname.split('/').pop() ?? '';
    const c = entities.campuses.find((x) => x.id === id);
    return c ? `${c.name}总览` : '校区总览';
  }
  if (pathname.startsWith('/monitor/building/')) {
    const id = pathname.split('/').pop() ?? '';
    const b = entities.buildings.find((x) => x.id === id);
    return b ? b.name : '楼宇详情';
  }
  if (pathname.startsWith('/alarms/')) {
    const id = pathname.split('/').pop() ?? '';
    const a = entities.alarms.find((x) => x.id === id);
    return a ? a.title : '告警详情';
  }
  return '详情页';
}

export const useNavigation = create<NavigationState>((set, get) => ({
  trail: [],
  nextIsMenuJump: false,
  markMenuJump: () => set({ nextIsMenuJump: true }),
  onLocationChange: (path) => {
    const { trail, nextIsMenuJump } = get();
    const title = resolveTitle(path);
    if (nextIsMenuJump) {
      set({ trail: [{ path, title }], nextIsMenuJump: false });
      return;
    }
    const len = trail.length;
    if (len === 0) {
      set({ trail: [{ path, title }] });
      return;
    }
    if (trail[len - 1].path === path) {
      const copy = [...trail];
      copy[len - 1] = { path, title };
      set({ trail: copy });
      return;
    }
    // 浏览器“后退”到上一级：轨迹随之回退
    if (len >= 2 && trail[len - 2].path === path) {
      set({ trail: trail.slice(0, len - 1) });
      return;
    }
    set({ trail: [...trail, { path, title }].slice(-TRAIL_LIMIT) });
  },
  goTo: (path) => {
    const { trail } = get();
    const idx = trail.findIndex((e) => e.path === path);
    if (idx >= 0) set({ trail: trail.slice(0, idx + 1) });
  },
}));

/** 返回上一级目标（无轨迹时为 null） */
export function previousEntry(): NavEntry | null {
  const { trail } = useNavigation.getState();
  return trail.length >= 2 ? trail[trail.length - 2] : null;
}