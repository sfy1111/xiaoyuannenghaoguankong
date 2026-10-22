import { create } from 'zustand';
import dayjs from 'dayjs';
import meta from '../data/meta.json';
import campusesJson from '../data/campuses.json';
import buildingsJson from '../data/buildings.json';
import floorsJson from '../data/floors.json';
import departmentsJson from '../data/departments.json';
import relationsJson from '../data/buildingDepartmentRelations.json';
import metersJson from '../data/meters.json';
import pointsJson from '../data/meteringPoints.json';
import meterRelationsJson from '../data/meterRelations.json';
import iotJson from '../data/iotProperties.json';
import calendarJson from '../data/campusCalendar.json';
import enrollmentJson from '../data/enrollmentAndOccupancy.json';
import diningJson from '../data/diningMeals.json';
import pricesJson from '../data/prices.json';
import billsJson from '../data/energyBills.json';
import alarmRulesJson from '../data/alarmRules.json';
import alarmsJson from '../data/alarms.json';
import workOrdersJson from '../data/workOrders.json';
import targetsJson from '../data/targets.json';
import budgetJson from '../data/budget.json';
import rolesJson from '../data/roles.json';
import usersJson from '../data/users.json';
import auditLogsJson from '../data/auditLogs.json';
import integrationsJson from '../data/integrations.json';
import projectsJson from '../data/energyProjects.json';
import { telemetrySeedCorrections, setTelemetryProviders, invalidateTelemetry } from './telemetry';
import type {
  Alarm, AlarmRule, AuditLog, Building, BuildingDeptRelation, BudgetAdjustment, CampusCalendarData, Campus, DataCorrection,
  Department, EnergyBill, EnergyProject, EnergyType, Floor, IotCandidate, IotGateway, IntegrationEndpoint, Meter,
  MeterRelation, MeteringPoint, PricePlan, Semester, ExamWeek, SpecialDay, TargetEntry, User, WorkOrder,
} from '../domain/types';

export const META = meta as {
  schoolName: string; systemName: string; dataVersion: string; asOf: string;
  timezone: string; statisticalBoundary: string; dataWindow: { start: string; end: string; note: string };
  features: Record<string, boolean>; notes: string[];
};

export interface EntityCollections {
  campuses: Campus[];
  buildings: Building[];
  floors: Floor[];
  departments: Department[];
  buildingDeptRelations: BuildingDeptRelation[];
  meters: Meter[];
  meteringPoints: MeteringPoint[];
  meterRelations: MeterRelation[];
  iotGateways: IotGateway[];
  iotCandidates: IotCandidate[];
  calendar: CampusCalendarData;
  enrollment: typeof enrollmentJson;
  dining: typeof diningJson;
  prices: PricePlan[];
  energyBills: EnergyBill[];
  alarmRules: AlarmRule[];
  alarms: Alarm[];
  workOrders: WorkOrder[];
  targets: TargetEntry[];
  roles: typeof rolesJson;
  users: User[];
  auditLogs: AuditLog[];
  integrations: IntegrationEndpoint[];
  corrections: DataCorrection[];
  projects: EnergyProject[];
  budgetAdjustments: BudgetAdjustment[];
}

export const budget = budgetJson as typeof budgetJson & { monthlyBudget: { month: string; electricity: number; water: number; gas: number }[] };

function baseCollections(): EntityCollections {
  return {
    campuses: campusesJson as unknown as Campus[],
    buildings: [...(buildingsJson as unknown as Building[])],
    floors: [...(floorsJson as unknown as Floor[])],
    departments: [...(departmentsJson as unknown as Department[])],
    buildingDeptRelations: [...(relationsJson as unknown as BuildingDeptRelation[])],
    meters: [...(metersJson as unknown as Meter[])],
    meteringPoints: [...(pointsJson as unknown as MeteringPoint[])],
    meterRelations: [...(meterRelationsJson as unknown as MeterRelation[])],
    iotGateways: [...(iotJson as { gateways: IotGateway[]; candidateProperties: IotCandidate[] }).gateways],
    iotCandidates: [...(iotJson as { gateways: IotGateway[]; candidateProperties: IotCandidate[] }).candidateProperties],
    calendar: JSON.parse(JSON.stringify(calendarJson)) as unknown as CampusCalendarData,
    enrollment: enrollmentJson,
    dining: diningJson,
    prices: [...(pricesJson as unknown as PricePlan[])],
    energyBills: [...(billsJson as unknown as EnergyBill[])],
    alarmRules: [...(alarmRulesJson as unknown as AlarmRule[])],
    alarms: JSON.parse(JSON.stringify(alarmsJson)) as unknown as Alarm[],
    workOrders: JSON.parse(JSON.stringify(workOrdersJson)) as unknown as WorkOrder[],
    targets: [...(targetsJson as unknown as TargetEntry[])],
    roles: rolesJson,
    users: [...(usersJson as unknown as User[])],
    auditLogs: [...(auditLogsJson as unknown as AuditLog[])],
    integrations: JSON.parse(JSON.stringify(integrationsJson)) as unknown as IntegrationEndpoint[],
    corrections: JSON.parse(JSON.stringify(telemetrySeedCorrections)) as DataCorrection[],
    projects: JSON.parse(JSON.stringify(projectsJson)) as unknown as EnergyProject[],
    budgetAdjustments: [] as BudgetAdjustment[],
  };
}

const STORAGE_KEY = 'mingchuan-energy-demo-v1';
const PERSISTED_KEYS: (keyof EntityCollections)[] = [
  'buildings', 'floors', 'departments', 'buildingDeptRelations', 'meters', 'meteringPoints',
  'meterRelations', 'iotGateways', 'iotCandidates', 'calendar', 'prices', 'energyBills',
  'alarmRules', 'alarms', 'workOrders', 'targets', 'users', 'auditLogs', 'integrations', 'corrections',
  'projects', 'budgetAdjustments',
];

interface EntityActions {
  appendAudit(module: string, action: string, objectId: string, detail: string, before?: string, after?: string): void;
  addBuilding(input: Omit<Building, 'id' | 'status' | 'code'> & { code: string }): Building | null;
  updateBuilding(id: string, patch: Partial<Building>): void;
  setBuildingStatus(id: string, status: 'active' | 'inactive'): void;
  addMeter(input: Omit<Meter, 'id'>): Meter | null;
  replaceMeter(oldId: string, input: Omit<Meter, 'id' | 'status' | 'swap'>, oldTerminalReading: number, reason: string): void;
  bindIotProperty(pointId: string, propertyId: string, reason: string): boolean;
  unbindIotProperty(pointId: string, reason: string): void;
  addMeterRelation(parentId: string, childId: string, relationType: 'contains' | 'supplies'): void;
  removeMeterRelation(id: string): void;
  addSpecialDay(input: Omit<SpecialDay, 'id'>): void;
  removeSpecialDay(id: string): void;
  updateOpenHours(id: string, patch: { start?: string; end?: string; examExtension?: string; breakStart?: string; breakEnd?: string }): void;
  savePricePlan(plan: PricePlan): boolean;
  deactivatePricePlan(id: string): void;
  setBillReview(id: string, patch: { differenceReason?: string; status?: 'pending' | 'confirmed' | 'archived' }): void;
  confirmAlarm(id: string, handler: string, note: string, actor: string): void;
  suspendAlarm(id: string, note: string, actor: string): void;
  markAlarmFalse(id: string, note: string, actor: string): void;
  createWorkOrderFromAlarm(alertId: string, input: { assignee: string; assigneeDept: string; deadline: string; type: string; note: string }, actor: string): WorkOrder | null;
  createWorkOrder(input: {
    title: string; source: string; alertId: string | null; type: string;
    campusId: string; buildingId: string | null; pointId: string | null;
    assignee: string; assigneeDept: string; priority: 'high' | 'medium' | 'low';
    deadline: string; result?: string | null;
  }, actor: string): WorkOrder | null;
  updateAlarmTimeline(id: string, item: { time: string; actor: string; action: string; note: string }, status?: Alarm['status'], handler?: string | null): void;
  acceptWorkOrder(id: string, actor: string): void;
  submitWorkOrderResult(id: string, result: string, actor: string): void;
  reviewWorkOrder(id: string, pass: boolean, note: string, reviewer: string): void;
  closeAlarmByReview(id: string, note: string, actor: string): void;
  submitCorrection(correction: Omit<DataCorrection, 'id' | 'status' | 'appliedAt' | 'reviewer' | 'reviewNote' | 'reviewedAt'>): DataCorrection;
  reviewCorrection(id: string, approve: boolean, note: string, reviewer: string): void;
  updateAlarmRule(id: string, patch: Partial<AlarmRule>): void;
  updateTarget(id: string, patch: Partial<TargetEntry>): void;
  retryEndpoint(id: string, actor: string): void;
  updateBuildingDeptRelations(buildingId: string, rows: { departmentId: string; share: number; basis: string }[]): boolean;
  addUser(input: { account: string; name: string; title: string; roleId: string; departmentId: string }): User | null;
  updateUser(id: string, patch: Partial<Pick<User, 'roleId' | 'title' | 'departmentId'>>): void;
  setUserStatus(id: string, status: 'active' | 'inactive'): void;
  addBill(input: {
    period: string; energyType: EnergyType; campusId: string; billNo: string;
    billedUsage: number; billedAmount: number; differenceReason?: string; entryNote?: string;
  }): EnergyBill | null;
  deactivateMeter(id: string, reason: string): void;
  addSemester(input: { name: string; type: Semester['type']; start: string; end: string }): Semester | null;
  removeSemester(id: string): void;
  addExamWeek(input: { name: string; start: string; end: string }): ExamWeek | null;
  removeExamWeek(id: string): void;
  addDepartment(input: Omit<Department, 'id'>): Department | null;
  updateDepartment(id: string, patch: Partial<Pick<Department, 'name' | 'manager' | 'phone' | 'type'>>): void;
  saveProject(project: Omit<EnergyProject, 'id'> & { id?: string }): EnergyProject | null;
  archiveProject(id: string, evaluation: string, evidence?: string): void;
  adjustBudget(month: string, energyType: 'electricity' | 'water' | 'gas', amount: number, reason: string): void;
  resetDemo(): void;
}

export type EntityStore = EntityCollections & { actions: EntityActions };

function loadPersisted(): Partial<EntityCollections> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version: string; data: Partial<EntityCollections> };
    if (parsed.version !== META.dataVersion) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function persist(state: EntityStore): void {
  try {
    const data: Record<string, unknown> = {};
    for (const key of PERSISTED_KEYS) {
      data[key] = state[key];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: META.dataVersion, data }));
  } catch {
    /* 存储不可用时跳过持久化 */
  }
}

let auditSeq = 1;
let actorProvider: () => string = () => '演示用户';

export function setAuditActorProvider(fn: () => string): void {
  actorProvider = fn;
}

export const useEntities = create<EntityStore>((set, get) => {
  const base = baseCollections();
  const persisted = loadPersisted();
  const initial = persisted ? { ...base, ...persisted } : base;
  // 用户列表按 ID 合并：JSON 中新增的内置用户（如超级管理员）始终可见，
  // 已有用户以本地持久化（含运行期新增/编辑/停用）为准
  if (persisted?.users) {
    const persistedIds = new Set(persisted.users.map((u) => u.id));
    initial.users = [...persisted.users, ...base.users.filter((u) => !persistedIds.has(u.id))];
  }

  const withAudit = (
    module: string, action: string, objectId: string, detail: string,
    before?: string, after?: string,
  ) => {
    const state = get();
    const now = dayjs(META.asOf).format('YYYY-MM-DD HH:mm');
    const id = `AUD-RUN-${String(Date.now()).slice(-6)}-${auditSeq++}`;
    const log: AuditLog = {
      id, time: now, actor: actorProvider(),
      module, action, objectId, detail, before: before ?? '', after: after ?? '',
    };
    set({ auditLogs: [log, ...state.auditLogs] });
  };

  const actions: EntityActions = {
    appendAudit: (module, action, objectId, detail, before, after) => withAudit(module, action, objectId, detail, before, after),

    addBuilding(input) {
      const state = get();
      if (state.buildings.some((b) => b.code === input.code)) return null;
      const id = `B-${input.code}`;
      const building: Building = { ...input, id, status: 'active' };
      set({ buildings: [...state.buildings, building] });
      withAudit('基础档案', '新增建筑', id, `新增建筑${input.name}（${input.code}），面积${input.buildingArea}m²`);
      persist(get());
      return building;
    },
    updateBuilding(id, patch) {
      const state = get();
      const before = state.buildings.find((b) => b.id === id);
      set({ buildings: state.buildings.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
      withAudit('基础档案', '编辑建筑', id, `更新建筑档案字段`, JSON.stringify(before?.name), JSON.stringify(patch));
      persist(get());
    },
    setBuildingStatus(id, status) {
      const state = get();
      set({ buildings: state.buildings.map((b) => (b.id === id ? { ...b, status } : b)) });
      withAudit('基础档案', status === 'inactive' ? '停用建筑' : '启用建筑', id, `建筑状态变更为${status === 'inactive' ? '停用' : '启用'}，历史能耗数据保留`);
      persist(get());
    },
    addMeter(input) {
      const state = get();
      if (state.meters.some((m) => m.meterNo === input.meterNo)) return null;
      const id = `M-${input.meterNo}`;
      const meter: Meter = { ...input, id };
      set({ meters: [...state.meters, meter] });
      withAudit('计量档案', '新增计量器具', id, `新增${input.name}（表号${input.meterNo}）`);
      persist(get());
      return meter;
    },
    replaceMeter(oldId, input, oldTerminalReading, reason) {
      const state = get();
      const old = state.meters.find((m) => m.id === oldId);
      if (!old) return;
      const newId = `M-${input.meterNo}`;
      const newMeter: Meter = { ...input, id: newId, status: 'active' };
      const swappedOld: Meter = {
        ...old,
        status: 'replaced',
        swap: {
          replacedAt: dayjs(META.asOf).format('YYYY-MM-DD HH:mm'),
          terminalReading: oldTerminalReading,
          reason,
          newMeterId: newId,
        },
      };
      set({
        meters: [...state.meters.filter((m) => m.id !== oldId), swappedOld, newMeter],
        meteringPoints: state.meteringPoints.map((p) =>
          p.meterId === oldId ? { ...p, meterId: newId, iotPropertyId: `IOT-P-${p.id.replace('P-', '')}` } : p,
        ),
      });
      withAudit('计量档案', '表计更换', oldId, `更换为${input.name}（表号${input.meterNo}），旧表终止示值${oldTerminalReading}`, old.meterNo, input.meterNo);
      persist(get());
    },
    bindIotProperty(pointId, propertyId, reason) {
      const state = get();
      const point = state.meteringPoints.find((p) => p.id === pointId);
      const prop = state.iotCandidates.find((c) => c.id === propertyId);
      if (!point || !prop) return false;
      if (prop.energyType !== point.energyType) return false;
      if (prop.unit !== point.unit) return false;
      if (prop.valueType !== point.readingType) return false;
      const before = point.iotPropertyId ?? '未绑定';
      set({
        meteringPoints: state.meteringPoints.map((p) => (p.id === pointId ? { ...p, iotPropertyId: propertyId } : p)),
        iotCandidates: state.iotCandidates.map((c) =>
          c.id === propertyId ? { ...c, boundPointId: pointId } : c.id === before ? { ...c, boundPointId: null } : c,
        ),
      });
      withAudit('计量关系', '绑定IoT属性', pointId, `点位绑定IoT属性${propertyId}，理由：${reason}`, String(before), propertyId);
      persist(get());
      return true;
    },
    unbindIotProperty(pointId, reason) {
      const state = get();
      const point = state.meteringPoints.find((p) => p.id === pointId);
      if (!point || !point.iotPropertyId) return;
      const before = point.iotPropertyId;
      set({
        meteringPoints: state.meteringPoints.map((p) => (p.id === pointId ? { ...p, iotPropertyId: null } : p)),
        iotCandidates: state.iotCandidates.map((c) => (c.id === before ? { ...c, boundPointId: null } : c)),
      });
      withAudit('计量关系', '解绑IoT属性', pointId, `解绑IoT属性，理由：${reason}`, before, '未绑定');
      persist(get());
    },
    addMeterRelation(parentId, childId, relationType) {
      const state = get();
      if (state.meterRelations.some((r) => r.parentId === parentId && r.childId === childId)) return;
      const id = `MR-R-${Date.now().toString().slice(-6)}`;
      set({
        meterRelations: [...state.meterRelations, {
          id, parentId, childId, relationType, validFrom: dayjs(META.asOf).format('YYYY-MM-DD'),
        }],
      });
      withAudit('计量关系', '维护计量拓扑', parentId, `新增关系：${childId}（${relationType === 'contains' ? '包含' : '供给'}）`);
      persist(get());
    },
    removeMeterRelation(id) {
      const state = get();
      const rel = state.meterRelations.find((r) => r.id === id);
      set({ meterRelations: state.meterRelations.filter((r) => r.id !== id) });
      if (rel) withAudit('计量关系', '移除计量拓扑', rel.parentId, `移除与${rel.childId}的${rel.relationType}关系`);
      persist(get());
    },
    addSpecialDay(input) {
      const state = get();
      set({ calendar: { ...state.calendar, specialDays: [...state.calendar.specialDays, { ...input, id: `SD-R-${Date.now().toString().slice(-6)}` }] } });
      withAudit('基础档案', '校历特殊日维护', input.date, `新增特殊日：${input.name}（${input.type === 'holiday' ? '法定假日' : '特殊活动日'}），教学时段分析将按新校历重新计算`);
      invalidateTelemetry();
      persist(get());
    },
    removeSpecialDay(id) {
      const state = get();
      const sd = state.calendar.specialDays.find((s) => s.id === id);
      set({ calendar: { ...state.calendar, specialDays: state.calendar.specialDays.filter((s) => s.id !== id) } });
      if (sd) withAudit('基础档案', '删除校历特殊日', sd.date, `删除特殊日：${sd.name}`);
      invalidateTelemetry();
      persist(get());
    },
    updateOpenHours(id, patch) {
      const state = get();
      set({
        calendar: {
          ...state.calendar,
          openHours: state.calendar.openHours.map((o) => (o.id === id ? { ...o, ...patch } : o)),
        },
      });
      withAudit('基础档案', '维护开放时间', id, `更新建筑开放时段，时段分析联动更新`);
      persist(get());
    },
    savePricePlan(plan) {
      const state = get();
      const conflict = state.prices.find(
        (p) => p.energyType === plan.energyType && p.id !== plan.id &&
          !(p.validTo < plan.validFrom || plan.validTo < p.validFrom),
      );
      if (conflict) return false;
      const exists = state.prices.some((p) => p.id === plan.id);
      set({
        prices: exists
          ? state.prices.map((p) => (p.id === plan.id ? plan : p))
          : [...state.prices, plan],
      });
      withAudit('费用管理', exists ? '修改价格方案' : '新增价格方案', plan.id, `${plan.name}，有效期${plan.validFrom}至${plan.validTo}，相关费用测算将按新方案重新计算`);
      persist(get());
      return true;
    },
    deactivatePricePlan(id) {
      const state = get();
      const plan = state.prices.find((p) => p.id === id);
      set({ prices: state.prices.map((p) => (p.id === id ? { ...p, status: 'inactive' } : p)) });
      if (plan) withAudit('费用管理', '停用价格方案', id, `停用${plan.name}，已过账期测算结果不受影响`);
      persist(get());
    },
    setBillReview(id, patch) {
      const state = get();
      const bill = state.energyBills.find((b) => b.id === id);
      set({ energyBills: state.energyBills.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
      if (bill) {
        withAudit(
          '费用管理',
          patch.status === 'confirmed' ? '账单核对确认' : patch.status === 'archived' ? '账单归档' : '填写差异原因',
          id,
          `账期${bill.period}（${bill.supplier}）${patch.differenceReason ? '差异原因：' + patch.differenceReason : ''}`,
        );
      }
      persist(get());
    },
    confirmAlarm(id, handler, note, actor) {
      const state = get();
      const alarm = state.alarms.find((a) => a.id === id);
      if (!alarm) return;
      const item = { time: dayjs(META.asOf).format('YYYY-MM-DD HH:mm'), actor, action: '确认告警', note };
      set({
        alarms: state.alarms.map((a) =>
          a.id === id ? { ...a, status: 'processing', handler, timeline: [...a.timeline, item] } : a,
        ),
      });
      withAudit('告警处置', '告警确认', id, `${alarm.title}：${note}，确认人${handler}`);
      persist(get());
    },
    suspendAlarm(id, note, actor) {
      const state = get();
      const alarm = state.alarms.find((a) => a.id === id);
      if (!alarm) return;
      const item = { time: dayjs(META.asOf).format('YYYY-MM-DD HH:mm'), actor, action: '暂挂告警', note };
      set({
        alarms: state.alarms.map((a) =>
          a.id === id ? { ...a, status: 'suspended', timeline: [...a.timeline, item] } : a,
        ),
      });
      withAudit('告警处置', '告警暂挂', id, `${alarm.title}：${note}`);
      persist(get());
    },
    markAlarmFalse(id, note, actor) {
      const state = get();
      const alarm = state.alarms.find((a) => a.id === id);
      if (!alarm) return;
      const item = { time: dayjs(META.asOf).format('YYYY-MM-DD HH:mm'), actor, action: '判定误报', note };
      set({
        alarms: state.alarms.map((a) =>
          a.id === id ? { ...a, status: 'closed', isFalse: true, timeline: [...a.timeline, item] } : a,
        ),
      });
      withAudit('告警处置', '判定误报', id, `${alarm.title}：${note}，历史能耗与事件记录保留`);
      persist(get());
    },
    createWorkOrderFromAlarm(alertId, input, actor) {
      const state = get();
      const alarm = state.alarms.find((a) => a.id === alertId);
      if (!alarm || alarm.workOrderId) return null;
      const id = `WO-R-${Date.now().toString().slice(-6)}`;
      const wo: WorkOrder = {
        id, code: `WO-202610-${String(state.workOrders.length + 21).padStart(4, '0')}`,
        title: `${alarm.title}现场处置`,
        source: `告警 ${alarm.id}`, alertId,
        type: input.type, campusId: alarm.campusId, buildingId: alarm.buildingId, pointId: alarm.pointId,
        assignee: input.assignee, assigneeDept: input.assigneeDept,
        priority: alarm.severity === 'critical' ? 'high' : alarm.severity === 'major' ? 'high' : 'medium',
        deadline: input.deadline, status: 'assigned',
        createdAt: dayjs(META.asOf).format('YYYY-MM-DD HH:mm'),
        startedAt: null, completedAt: null,
        actions: [{ time: dayjs(META.asOf).format('YYYY-MM-DD HH:mm'), actor, action: '创建并派单', note: input.note }],
        result: null, reviewer: null, reviewNote: null, reviewedAt: null,
      };
      const item = { time: wo.createdAt, actor, action: '派发工单', note: `生成工单${wo.code}，指派${input.assignee}（${input.assigneeDept}）` };
      set({
        workOrders: [wo, ...state.workOrders],
        alarms: state.alarms.map((a) => (a.id === alertId ? { ...a, workOrderId: id, status: 'processing', timeline: [...a.timeline, item] } : a)),
      });
      withAudit('告警处置', '告警派单', alertId, `${alarm.title} → 工单${wo.code}，负责人${input.assignee}`);
      persist(get());
      return wo;
    },
    createWorkOrder(input, actor) {
      const state = get();
      const id = `WO-R-${Date.now().toString().slice(-6)}`;
      const wo: WorkOrder = {
        id,
        code: `WO-202610-${String(state.workOrders.length + 21).padStart(4, '0')}`,
        title: input.title,
        source: input.source,
        alertId: input.alertId,
        type: input.type,
        campusId: input.campusId,
        buildingId: input.buildingId,
        pointId: input.pointId,
        assignee: input.assignee,
        assigneeDept: input.assigneeDept,
        priority: input.priority,
        deadline: input.deadline,
        status: 'assigned',
        createdAt: dayjs(META.asOf).format('YYYY-MM-DD HH:mm'),
        startedAt: null,
        completedAt: null,
        actions: [{ time: dayjs(META.asOf).format('YYYY-MM-DD HH:mm'), actor, action: '创建并派单', note: input.source }],
        result: input.result ?? null,
        reviewer: null,
        reviewNote: null,
        reviewedAt: null,
      };
      set({ workOrders: [wo, ...state.workOrders] });
      withAudit('运维工单', '创建工单', id, `${wo.title}，指派${wo.assignee}`);
      persist(get());
      return wo;
    },
    updateAlarmTimeline(id, item, status, handler) {
      const state = get();
      set({
        alarms: state.alarms.map((a) =>
          a.id === id ? { ...a, status: status ?? a.status, handler: handler ?? a.handler, timeline: [...a.timeline, item] } : a,
        ),
      });
      persist(get());
    },
    acceptWorkOrder(id, actor) {
      const state = get();
      const now = dayjs(META.asOf).format('YYYY-MM-DD HH:mm');
      set({
        workOrders: state.workOrders.map((w) =>
          w.id === id ? { ...w, status: 'processing', startedAt: now, actions: [...w.actions, { time: now, actor, action: '接单开始处理', note: '现场处理中' }] } : w,
        ),
      });
      withAudit('运维工单', '接单', id, `${actor}接单开始处理`);
      persist(get());
    },
    submitWorkOrderResult(id, result, actor) {
      const state = get();
      const now = dayjs(META.asOf).format('YYYY-MM-DD HH:mm');
      const wo = state.workOrders.find((w) => w.id === id);
      set({
        workOrders: state.workOrders.map((w) =>
          w.id === id ? { ...w, status: 'reviewing', result, completedAt: now, actions: [...w.actions, { time: now, actor, action: '提交处理结果', note: result }] } : w,
        ),
        alarms: state.alarms.map((a) =>
          wo && a.id === wo.alertId ? { ...a, status: 'reviewing', timeline: [...a.timeline, { time: now, actor, action: '提交处理结果', note: result }] } : a,
        ),
      });
      withAudit('运维工单', '提交处理结果', id, result);
      persist(get());
    },
    reviewWorkOrder(id, pass, note, reviewer) {
      const state = get();
      const now = dayjs(META.asOf).format('YYYY-MM-DD HH:mm');
      const wo = state.workOrders.find((w) => w.id === id);
      set({
        workOrders: state.workOrders.map((w) =>
          w.id === id
            ? {
                ...w,
                status: pass ? 'completed' : 'processing',
                reviewer, reviewNote: note, reviewedAt: now,
                actions: [...w.actions, { time: now, actor: reviewer, action: pass ? '复核通过' : '复核退回', note }],
              }
            : w,
        ),
      });
      withAudit('运维工单', pass ? '复核通过' : '复核退回', id, note);
      persist(get());
    },
    closeAlarmByReview(id, note, actor) {
      const state = get();
      const now = dayjs(META.asOf).format('YYYY-MM-DD HH:mm');
      const alarm = state.alarms.find((a) => a.id === id);
      set({
        alarms: state.alarms.map((a) =>
          a.id === id ? { ...a, status: 'closed', timeline: [...a.timeline, { time: now, actor, action: '复核关闭', note }] } : a,
        ),
      });
      if (alarm) withAudit('告警处置', '复核关闭', id, `${alarm.title}：${note}`);
      persist(get());
    },
    submitCorrection(correction) {
      const state = get();
      const entry: DataCorrection = {
        ...correction,
        id: `CR-R-${Date.now().toString().slice(-6)}`,
        status: 'pending',
        appliedAt: dayjs(META.asOf).format('YYYY-MM-DD HH:mm'),
        reviewer: null, reviewNote: null, reviewedAt: null,
      };
      set({ corrections: [entry, ...state.corrections] });
      withAudit('数据质量', '提交补录申请', entry.id, `点位${entry.pointId}，时段${entry.start}至${entry.end}，原因：${entry.reason}`);
      persist(get());
      return entry;
    },
    reviewCorrection(id, approve, note, reviewer) {
      const state = get();
      const now = dayjs(META.asOf).format('YYYY-MM-DD HH:mm');
      const cr = state.corrections.find((c) => c.id === id);
      set({
        corrections: state.corrections.map((c) =>
          c.id === id ? { ...c, status: approve ? 'approved' : 'rejected', reviewer, reviewNote: note, reviewedAt: now } : c,
        ),
      });
      if (cr) {
        withAudit(
          '数据质量', approve ? '补录审批通过' : '补录审批退回', id,
          `点位${cr.pointId}时段${cr.start}至${cr.end}${approve ? '，原始缺失样本保留，补录值标记为人工修正' : ''}：${note}`,
        );
      }
      invalidateTelemetry();
      persist(get());
    },
    updateAlarmRule(id, patch) {
      const state = get();
      set({ alarmRules: state.alarmRules.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
      withAudit('告警规则', '维护规则参数', id, `更新规则${id}：${JSON.stringify(patch)}`);
      persist(get());
    },
    updateTarget(id, patch) {
      const state = get();
      set({ targets: state.targets.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
      withAudit('节能管理', '调整节能目标', id, `更新目标${id}`);
      persist(get());
    },
    retryEndpoint(id, actor) {
      const state = get();
      const ep = state.integrations.find((e) => e.id === id);
      if (!ep) return;
      const now = dayjs(META.asOf).format('YYYY-MM-DD HH:mm');
      set({
        integrations: state.integrations.map((e) =>
          e.id === id ? { ...e, lastRun: now, retryCount: e.retryCount + 1, status: e.status === 'warning' ? 'warning' : 'success' } : e,
        ),
      });
      withAudit('系统管理', '接口任务重试', id, `${actor}手动重试${ep.name}，重试次数${ep.retryCount + 1}`);
      persist(get());
    },
    updateBuildingDeptRelations(buildingId, rows) {
      const state = get();
      const building = state.buildings.find((b) => b.id === buildingId);
      if (!building) return false;
      const shareSum = rows.reduce((a, r) => a + Number(r.share), 0);
      if (rows.length > 1 && Math.abs(shareSum - 1) > 0.001) return false;
      const others = state.buildingDeptRelations.filter((r) => r.buildingId !== buildingId);
      const updated: BuildingDeptRelation[] = rows.map((r, i) => ({
        id: `R-${buildingId}-${i + 1}`,
        buildingId,
        departmentId: r.departmentId,
        share: Number(r.share),
        basis: r.basis,
        validFrom: '2026-01-01',
        status: 'confirmed',
      }));
      set({ buildingDeptRelations: [...others, ...updated] });
      withAudit('基础档案', '维护责任归属', buildingId, `更新${building.name}责任部门及分摊比例，比例合计${(shareSum * 100).toFixed(1)}%`);
      persist(get());
      return true;
    },

    addUser(input) {
      const state = get();
      if (!input.account.trim() || state.users.some((u) => u.account === input.account.trim())) return null;
      const user: User = {
        id: `U-${Date.now().toString().slice(-6)}`,
        account: input.account.trim(),
        name: input.name,
        title: input.title,
        roleId: input.roleId,
        departmentId: input.departmentId,
        phone: '—',
        status: 'active',
        lastLogin: '未登录',
        authType: '统一身份认证',
      };
      set({ users: [...state.users, user] });
      withAudit('系统管理', '创建用户', user.id, `新增用户「${input.name}」（${input.account}），角色${get().roles.find((r) => r.id === input.roleId)?.name ?? input.roleId}`);
      persist(get());
      return user;
    },
    updateUser(id, patch) {
      const state = get();
      const before = state.users.find((u) => u.id === id);
      set({ users: state.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) });
      if (before) {
        const roleNames = patch.roleId ? `${get().roles.find((r) => r.id === before.roleId)?.name} → ${get().roles.find((r) => r.id === patch.roleId)?.name}` : '';
        withAudit('系统管理', '权限授予与回收', id, `更新用户「${before.name}」角色/岗位${roleNames ? `（${roleNames}）` : ''}`);
      }
      persist(get());
    },
    setUserStatus(id, status) {
      const state = get();
      const user = state.users.find((u) => u.id === id);
      set({ users: state.users.map((u) => (u.id === id ? { ...u, status } : u)) });
      if (user) {
        withAudit('系统管理', status === 'inactive' ? '停用用户' : '启用用户', id, `「${user.name}」${status === 'inactive' ? '停用，历史审批记录保留' : '重新启用'}`);
      }
      persist(get());
    },

    addBill(input) {
      const state = get();
      if (state.energyBills.some((b) => b.billNo === input.billNo)) return null;
      if (input.billedUsage < 0 || input.billedAmount < 0) return null;
      const points = state.meteringPoints.filter((p) =>
        p.campusId === input.campusId &&
        p.energyType === input.energyType &&
        (input.energyType === 'electricity'
          ? p.role === 'main' && !p.buildingId
          : input.energyType === 'water'
            ? p.role === 'main' && !p.buildingId
            : p.role === 'main'));
      const supplier = input.energyType === 'electricity' ? '明川市供电公司' : input.energyType === 'water' ? '明川市自来水公司' : '明川市燃气公司';
      const bill: EnergyBill = {
        id: `BILL-R-${Date.now().toString().slice(-6)}`,
        period: input.period,
        energyType: input.energyType,
        campusId: input.campusId,
        supplier,
        billingPointIds: points.map((p) => p.id),
        billNo: input.billNo,
        usageDeltaPct: 0,
        extraFee: 0,
        extraFeeNote: null,
        differenceReason: input.differenceReason ?? null,
        status: 'pending',
        confirmedBy: null,
        confirmedAt: null,
        billedUsageOverride: input.billedUsage,
        billedAmountOverride: input.billedAmount,
        entryNote: input.entryNote,
      };
      set({ energyBills: [bill, ...state.energyBills] });
      withAudit('费用管理', '录入供应商账单', bill.id, `账期${input.period}（${supplier}），账单编号${input.billNo}，抄见量${input.billedUsage}，账单金额${input.billedAmount}元；进入待核对`);
      persist(get());
      return bill;
    },

    deactivateMeter(id, reason) {
      const state = get();
      const meter = state.meters.find((m) => m.id === id);
      if (!meter || meter.status !== 'active') return;
      set({ meters: state.meters.map((m) => (m.id === id ? { ...m, status: 'inactive' } : m)) });
      withAudit('计量档案', '停用计量器具', id, `${meter.name}停用，理由：${reason}；关联计量点历史数据保留`);
      persist(get());
    },

    addSemester(input) {
      const state = get();
      if (input.start > input.end) return null;
      const overlap = state.calendar.semesters.find((s) =>
        s.type === input.type && !(s.end < input.start || input.end < s.start));
      if (overlap) return null;
      const semester: Semester = {
        id: `SEM-R-${Date.now().toString().slice(-6)}`,
        academicYearId: input.start.slice(0, 4) <= '2025' ? 'AY-2025' : 'AY-2026',
        name: input.name,
        start: input.start,
        end: input.end,
        type: input.type,
      };
      set({ calendar: { ...state.calendar, semesters: [...state.calendar.semesters, semester] } });
      withAudit('基础档案', '新增学期/假期', semester.id, `${input.name}（${input.start}至${input.end}）；时段分析按新校历重算`);
      invalidateTelemetry();
      persist(get());
      return semester;
    },
    removeSemester(id) {
      const state = get();
      const sem = state.calendar.semesters.find((s) => s.id === id);
      set({ calendar: { ...state.calendar, semesters: state.calendar.semesters.filter((s) => s.id !== id) } });
      if (sem) withAudit('基础档案', '删除学期/假期', id, `删除「${sem.name}」，相关期间日类型回归默认口径（需主管复核）`);
      invalidateTelemetry();
      persist(get());
    },
    addExamWeek(input) {
      const state = get();
      if (input.start > input.end) return null;
      const inSemester = state.calendar.semesters.some((s) => s.type === 'term' && input.start >= s.start && input.end <= s.end);
      if (!inSemester) return null;
      const overlap = state.calendar.examWeeks.find((w) => !(w.end < input.start || input.end < w.start));
      if (overlap) return null;
      const week: ExamWeek = { id: `EX-R-${Date.now().toString().slice(-6)}`, name: input.name, start: input.start, end: input.end };
      set({ calendar: { ...state.calendar, examWeeks: [...state.calendar.examWeeks, week] } });
      withAudit('基础档案', '新增考试周', week.id, `${input.name}（${input.start}至${input.end}）；须落在学期内且不与其他考试周重叠`);
      invalidateTelemetry();
      persist(get());
      return week;
    },
    removeExamWeek(id) {
      const state = get();
      const w = state.calendar.examWeeks.find((x) => x.id === id);
      set({ calendar: { ...state.calendar, examWeeks: state.calendar.examWeeks.filter((x) => x.id !== id) } });
      if (w) withAudit('基础档案', '删除考试周', id, `删除「${w.name}」`);
      invalidateTelemetry();
      persist(get());
    },

    addDepartment(input) {
      const state = get();
      if (!input.code.trim() || state.departments.some((d) => d.code === input.code.trim())) return null;
      const dept: Department = { ...input, id: `D-${input.code.trim()}` };
      set({ departments: [...state.departments, dept] });
      withAudit('基础档案', '新增组织单位', dept.id, `新增「${input.name}」（${input.type}），负责人${input.manager}`);
      persist(get());
      return dept;
    },
    updateDepartment(id, patch) {
      const state = get();
      const before = state.departments.find((d) => d.id === id);
      set({ departments: state.departments.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
      if (before) withAudit('基础档案', '编辑组织单位', id, `更新「${before.name}」档案（责任变更仅影响后续期间）`);
      persist(get());
    },

    saveProject(input) {
      const state = get();
      const exists = input.id ? state.projects.some((p) => p.id === input.id) : false;
      const project: EnergyProject = {
        ...input,
        id: input.id ?? `EP-R-${Date.now().toString().slice(-6)}`,
      };
      set({ projects: exists ? state.projects.map((p) => (p.id === project.id ? project : p)) : [project, ...state.projects] });
      withAudit('节能管理', exists ? '编辑节能项目' : '新建节能项目', project.id, `${project.name}（${project.type}，${project.status === 'completed' ? '已验收' : project.status === 'inProgress' ? '实施中' : '计划中'}），计划节能${project.plannedSaving}%`);
      persist(get());
      return project;
    },
    archiveProject(id, evaluation, evidence) {
      const state = get();
      const project = state.projects.find((p) => p.id === id);
      if (!project) return;
      set({
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, status: 'completed', evaluation, evidence: evidence ?? p.evidence } : p),
      });
      withAudit('节能管理', '项目验收归档', id, `${project.name}归档；评估结论：${evaluation}`);
      persist(get());
    },

    adjustBudget(month, energyType, amount, reason) {
      const state = get();
      if (amount < 0) return;
      const adj: BudgetAdjustment = {
        id: `BA-R-${Date.now().toString().slice(-6)}`,
        month,
        energyType,
        amount: Math.round(amount),
        reason,
        adjustedBy: '张启明',
        adjustedAt: dayjs(META.asOf).format('YYYY-MM-DD HH:mm'),
      };
      set({ budgetAdjustments: [adj, ...state.budgetAdjustments] });
      withAudit('费用管理', '预算调整', `${month}/${energyType}`, `调整为 ${adj.amount} 元；原因：${reason}；原预算版本保留（预算调整记录 ${adj.id}）`);
      persist(get());
    },

    resetDemo() {
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    },
  };

  return { ...initial, actions };
});

// 注入遥测引擎所需的数据提供者（校历与补录）
setTelemetryProviders({
  calendar: () => useEntities.getState().calendar,
  corrections: () => useEntities.getState().corrections,
});

export function getEntities(): EntityStore {
  return useEntities.getState();
}

export const ENROLLMENT = enrollmentJson;
export const DINING = diningJson;

export function studentsOfMonth(month: string): { east: number; west: number; total: number } | null {
  const row = enrollmentJson.monthlyStudents.find((m) => m.month === month);
  if (!row) return null;
  return { east: row.east, west: row.west, total: row.east + row.west };
}

export function occupancyOf(buildingId: string, month: string): { occupancyRate: number; residents: number } | null {
  const row = enrollmentJson.dormOccupancy.find((o) => o.buildingId === buildingId && o.month === month);
  if (!row) return null;
  return { occupancyRate: row.occupancyRate, residents: row.residents };
}

export function mealsOf(canteenId: string, month: string): number | null {
  const row = diningJson.canteenMeals.find((m) => m.canteenId === canteenId && m.month === month);
  return row ? row.meals : null;
}