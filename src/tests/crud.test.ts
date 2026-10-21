import { describe, expect, it, beforeAll } from 'vitest';
import { getEntities } from '../services/repository';
import { billRowOf } from '../services/costService';
import { buildingSubitems, scopePointIds } from '../services/energyStats';
import { useIdentity } from '../stores/identity';

beforeAll(() => {
  useIdentity.getState().setUserId('U-ZHANG');
});

describe('用户管理 CRUD', () => {
  it('新增用户：账号唯一性校验与审计留痕', () => {
    const ent = getEntities();
    const before = ent.users.length;
    const created = ent.actions.addUser({
      account: 'testuser01', name: '测试用户', title: '能源管理办公室工程师',
      roleId: 'R-MANAGER', departmentId: 'D-HQC',
    });
    expect(created).not.toBeNull();
    expect(getEntities().users.length).toBe(before + 1);
    expect(getEntities().auditLogs.some((l) => l.objectId === created!.id && l.action === '创建用户')).toBe(true);
    // 重复账号被阻止
    const dup = ent.actions.addUser({
      account: 'testuser01', name: '重复用户', title: '—',
      roleId: 'R-MANAGER', departmentId: 'D-HQC',
    });
    expect(dup).toBeNull();
    // 角色调整（权限授予与回收）写入审计
    ent.actions.updateUser(created!.id, { roleId: 'R-FINANCE' });
    expect(getEntities().auditLogs.some((l) => l.objectId === created!.id && l.action === '权限授予与回收')).toBe(true);
    // 停用保留历史
    ent.actions.setUserStatus(created!.id, 'inactive');
    expect(getEntities().users.find((u) => u.id === created!.id)!.status).toBe('inactive');
    expect(getEntities().users.length).toBe(before + 1);
  });
});

describe('账单录入', () => {
  it('录入账单后按录入金额对账，差额=录入金额-平台测算', () => {
    const ent = getEntities();
    const bill = ent.actions.addBill({
      period: '2026-10',
      energyType: 'electricity',
      campusId: 'C-E',
      billNo: 'EL202610TEST01',
      billedUsage: 150000,
      billedAmount: 112500,
    });
    expect(bill).not.toBeNull();
    const row = billRowOf(bill!);
    expect(row.billedUsage).toBe(150000);
    expect(row.billedAmount).toBe(112500);
    expect(row.difference).toBeCloseTo(112500 - row.estimatedAmount, 1);
    expect(row.status).toBe('pending');
    // 编号唯一
    const dup = ent.actions.addBill({
      period: '2026-10', energyType: 'electricity', campusId: 'C-E',
      billNo: 'EL202610TEST01', billedUsage: 1, billedAmount: 1,
    });
    expect(dup).toBeNull();
    // 负数被阻止
    const bad = ent.actions.addBill({
      period: '2026-10', energyType: 'water', campusId: 'C-E',
      billNo: 'WT202610TEST02', billedUsage: -5, billedAmount: 10,
    });
    expect(bad).toBeNull();
  });
});

describe('校历维护', () => {
  it('新增学期：同类型重叠被阻止', () => {
    const ent = getEntities();
    const ok = ent.actions.addSemester({
      name: '2026-2027学年春季学期（测试）',
      type: 'term',
      start: '2027-02-22',
      end: '2027-06-30',
    });
    expect(ok).not.toBeNull();
    // 与现有学期（2026-2027秋季：08-31~2027-01-15）不重叠 → 成功
    const overlap = ent.actions.addSemester({
      name: '重叠学期（测试）',
      type: 'term',
      start: '2026-12-01',
      end: '2027-01-10',
    });
    expect(overlap).toBeNull();
    // 起止倒挂被阻止
    const reversed = ent.actions.addSemester({
      name: '倒挂假期（测试）', type: 'summerBreak', start: '2027-08-30', end: '2027-07-01',
    });
    expect(reversed).toBeNull();
  });

  it('新增考试周：须落在学期内且不重叠', () => {
    const ent = getEntities();
    const ok = ent.actions.addExamWeek({ name: '2026-2027学年秋季学期期末考试周（测试）', start: '2026-12-28', end: '2027-01-08' });
    expect(ok).not.toBeNull();
    // 不在学期内
    const outside = ent.actions.addExamWeek({ name: '假期考试周（测试）', start: '2027-07-01', end: '2027-07-05' });
    expect(outside).toBeNull();
    // 与已存在考试周重叠
    const overlap = ent.actions.addExamWeek({ name: '重叠考试周（测试）', start: '2027-01-05', end: '2027-01-10' });
    expect(overlap).toBeNull();
  });
});

describe('组织单位 CRUD', () => {
  it('新增单位：编码唯一', () => {
    const ent = getEntities();
    const created = ent.actions.addDepartment({
      code: 'ORG-TEST01', name: '测试学院', parent: null, type: '学院', manager: '测试负责人',
      phone: '—', campusIds: ['C-E'], costCenter: 'CC-9001', validFrom: '2026-10-01',
    });
    expect(created).not.toBeNull();
    const dup = ent.actions.addDepartment({
      code: 'ORG-TEST01', name: '重复学院', parent: null, type: '学院', manager: '—',
      phone: '—', campusIds: ['C-E'], costCenter: '—', validFrom: '2026-10-01',
    });
    expect(dup).toBeNull();
    ent.actions.updateDepartment(created!.id, { manager: '新负责人' });
    expect(getEntities().departments.find((d) => d.id === created!.id)!.manager).toBe('新负责人');
  });
});

describe('节能项目 CRUD', () => {
  it('新建/编辑/验收归档', () => {
    const ent = getEntities();
    const project = ent.actions.saveProject({
      name: '测试节能项目', buildings: ['B-TB'], type: '照明改造', status: 'inProgress',
      implementDate: '2026-10-01', baseline: { from: '2026-04-01', to: '2026-06-30', note: '基期' },
      measure: '更换灯具', investment: 10000, plannedSaving: 5, owner: '张启明',
      evaluation: '实施中', evidence: '测试',
    });
    expect(project).not.toBeNull();
    const edited = ent.actions.saveProject({ ...project!, plannedSaving: 8 });
    expect(getEntities().projects.find((p) => p.id === project!.id)!.plannedSaving).toBe(8);
    ent.actions.archiveProject(project!.id, '验收完成（测试）：未经校正的变化量');
    expect(getEntities().projects.find((p) => p.id === project!.id)!.status).toBe('completed');
    expect(getEntities().auditLogs.some((l) => l.action === '项目验收归档' && l.objectId === project!.id)).toBe(true);
    void edited;
  });
});

describe('预算调整', () => {
  it('调整预算保留记录与原因', () => {
    const ent = getEntities();
    ent.actions.adjustBudget('2026-11', 'electricity', 320000, '新增实验楼投用（测试）');
    const adj = getEntities().budgetAdjustments.find((a) => a.month === '2026-11' && a.energyType === 'electricity');
    expect(adj).not.toBeNull();
    expect(adj!.amount).toBe(320000);
    expect(adj!.reason).toContain('新增实验楼');
    expect(getEntities().auditLogs.some((l) => l.action === '预算调整' && l.detail.includes('原预算版本保留'))).toBe(true);
    // 负数被阻止
    ent.actions.adjustBudget('2026-12', 'water', -100, '非法（测试）');
    expect(getEntities().budgetAdjustments.find((a) => a.month === '2026-12' && a.energyType === 'water')).toBeUndefined();
  });
});

describe('计量器具停用与计量关系', () => {
  it('停用器具留痕且历史保留', () => {
    const ent = getEntities();
    ent.actions.deactivateMeter('M-EL', '测试停用：回路改造');
    expect(getEntities().meters.find((m) => m.id === 'M-EL')!.status).toBe('inactive');
    expect(getEntities().auditLogs.some((l) => l.action === '停用计量器具' && l.objectId === 'M-EL')).toBe(true);
    // 再次停用无效（已非在用）
    ent.actions.deactivateMeter('M-EL', '再次停用');
    expect(getEntities().auditLogs.filter((l) => l.action === '停用计量器具' && l.objectId === 'M-EL').length).toBe(1);
  });

  it('新增计量关系入库且不产生重复计量', () => {
    const ent = getEntities();
    const before = ent.meterRelations.length;
    // 新增：西校区进线 直含 冷水机组专用表（此前经能源站总表间接包含）
    ent.actions.addMeterRelation('P-WF1', 'P-EP-CH', 'contains');
    // 重复新增被阻止
    ent.actions.addMeterRelation('P-WF1', 'P-EP-CH', 'contains');
    expect(getEntities().meterRelations.length).toBe(before + 1);
    // 西校区电力边界仍只取进线关口表，父表与子表不重复计入
    const ids = scopePointIds('electricity', { campusId: 'C-W' });
    expect(ids).toEqual(['P-WF1']);
    // 能源站分项解析包含新增子节点
    const sub = buildingSubitems('B-EP', 'electricity', '2026-10-20', '2026-10-20');
    expect(sub.subitems.some((s) => s.point.id === 'P-EP-CH')).toBe(true);
  });
});