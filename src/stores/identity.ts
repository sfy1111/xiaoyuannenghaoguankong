import { create } from 'zustand';
import { getEntities, setAuditActorProvider } from '../services/repository';
import type { Building, Role, User } from '../domain/types';

interface IdentityState {
  userId: string;
  setUserId(id: string): void;
}

const USER_STORAGE_KEY = 'mingchuan-energy-user';

function initialUserId(): string {
  try {
    const saved = localStorage.getItem(USER_STORAGE_KEY);
    if (saved && getEntities().users.some((u) => u.id === saved)) return saved;
  } catch { /* ignore */ }
  return 'U-ZHANG';
}

export const useIdentity = create<IdentityState>((set) => ({
  userId: initialUserId(),
  setUserId: (id) => {
    try {
      localStorage.setItem(USER_STORAGE_KEY, id);
    } catch {
      /* 非浏览器环境跳过持久化 */
    }
    set({ userId: id });
  },
}));

setAuditActorProvider(() => {
  try {
    const u = getEntities().users.find((x) => x.id === useIdentity.getState().userId);
    return u ? u.name : '演示用户';
  } catch {
    return '演示用户';
  }
});

export function currentUser(): User {
  const ent = getEntities();
  return ent.users.find((u) => u.id === useIdentity.getState().userId) ?? ent.users[0];
}

export function currentRole(): Role {
  const ent = getEntities();
  const user = currentUser();
  return ent.roles.find((r) => r.id === user.roleId) ?? ent.roles[0];
}

export function canView(module: string): boolean {
  return currentRole().canView.includes(module);
}

export function canEdit(module: string): boolean {
  return currentRole().canEdit.includes(module);
}

export function canApprove(module: string): boolean {
  return currentRole().canApprove.includes(module);
}

export function visibleCampusIds(): string[] {
  return currentRole().allowedCampusIds;
}

/** 学院联络员等受限角色：仅可见与授权部门存在责任关系的建筑 */
export function visibleBuildings(): Building[] {
  const ent = getEntities();
  const role = currentRole();
  const campusIds = visibleCampusIds();
  const base = ent.buildings.filter((b) => b.status === 'active' && campusIds.includes(b.campusId));
  if (!role.departmentId) return base;
  const allowed = new Set<string>();
  for (const rel of ent.buildingDeptRelations) {
    if (rel.departmentId === role.departmentId) allowed.add(rel.buildingId);
  }
  for (const b of ent.buildings) {
    if (b.departmentId === role.departmentId) allowed.add(b.id);
  }
  return base.filter((b) => allowed.has(b.id));
}

export function campusAllowedByUser(campusId: string): boolean {
  return visibleCampusIds().includes(campusId);
}

export interface UserScope {
  campusId: 'all' | string;
  category?: string;
  buildingId?: string;
  buildingIds?: string[];
  restricted: boolean;
}

/** 将页面筛选与当前角色数据范围合并；受限角色改按授权校区/建筑集合统计 */
export function userScope(campusId: 'all' | string, category?: string, buildingId?: string): UserScope {
  const ent = getEntities();
  const role = currentRole();
  const allowed = visibleCampusIds();
  const seesAll = allowed.length === ent.campuses.length;
  let resolved: 'all' | string = campusId;
  if (campusId !== 'all' && !allowed.includes(campusId)) {
    resolved = seesAll ? 'all' : allowed[0] ?? 'all';
  } else if (campusId === 'all' && !seesAll) {
    // 受限角色选择“全部校区”时收窄为授权校区，避免越权汇总
    resolved = allowed[0] ?? 'all';
  }
  if (role.departmentId) {
    const buildings = visibleBuildings();
    return { campusId: resolved, category, buildingId, buildingIds: buildings.map((b) => b.id), restricted: true };
  }
  return { campusId: resolved, category, buildingId, restricted: !seesAll };
}

export function visibleOptions<T extends { campusId: string; id: string }>(items: T[]): T[] {
  const allowed = visibleCampusIds();
  return items.filter((i) => allowed.includes(i.campusId));
}