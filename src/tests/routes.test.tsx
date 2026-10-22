// @vitest-environment jsdom
/**
 * 全路由渲染诊断：每个菜单路由以超级管理员视角挂载，断言页面标题与正文内容出现，
 * 用于排查“部分界面空白”问题——任何页面组件渲染失败/白屏都会在此暴露。
 * ECharts 在 jsdom 无 Canvas，以桩替换（不影响页面其余内容渲染验证）。
 */
import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useIdentity } from '../stores/identity';
import { useNavigation } from '../stores/navigation';

vi.mock('echarts-for-react', () => ({
  default: () => <div data-testid="echarts-stub" style={{ height: 100 }} />,
}));

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  if (!window.ResizeObserver) {
    class RO {
      observe() { /* noop */ }
      unobserve() { /* noop */ }
      disconnect() { /* noop */ }
    }
    window.ResizeObserver = RO as unknown as typeof ResizeObserver;
  }
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => undefined;
  }
});

beforeEach(() => {
  cleanup();
  useNavigation.setState({ trail: [], nextIsMenuJump: false });
  useIdentity.getState().setUserId('U-SUPER');
});

import { AppRouter } from '../app/App';

const ROUTES: { path: string; expectText: string }[] = [
  { path: '/dashboard/campus', expectText: '校园综合概览' },
  { path: '/dashboard/campus/C-E', expectText: '东校区总览' },
  { path: '/dashboard/campus/C-W', expectText: '西校区总览' },
  { path: '/dashboard/energy', expectText: '能源专题驾驶舱' },
  { path: '/monitor/electricity', expectText: '电力运行监测' },
  { path: '/monitor/water', expectText: '用水监测' },
  { path: '/monitor/gas', expectText: '天然气监测' },
  { path: '/monitor/thermal', expectText: '供热供冷与生活热水监测' },
  { path: '/monitor/equipment', expectText: '重点用能设备监测' },
  { path: '/monitor/building/B-TA', expectText: '明德楼（教学楼A）' },
  { path: '/analysis/overview', expectText: '校园总量与趋势' },
  { path: '/analysis/categories', expectText: '分类分项能耗分析' },
  { path: '/analysis/buildings', expectText: '建筑排行与能效对比' },
  { path: '/analysis/comparison', expectText: '同比环比与用能结构' },
  { path: '/analysis/calendar', expectText: '教学日历与非教学时段分析' },
  { path: '/analysis/balance', expectText: '能源平衡与计量覆盖' },
  { path: '/scenarios/teaching', expectText: '教学楼用能管理' },
  { path: '/scenarios/laboratory', expectText: '科研实验楼用能管理' },
  { path: '/scenarios/dormitory', expectText: '学生宿舍用能管理' },
  { path: '/scenarios/dining', expectText: '学生食堂能耗管理' },
  { path: '/scenarios/library-sports', expectText: '图书馆与体育场馆专题' },
  { path: '/scenarios/public', expectText: '公共设施与校园照明' },
  { path: '/scenarios/departments', expectText: '学院/责任部门用能' },
  { path: '/scenarios/plant', expectText: '能源站与管网运行' },
  { path: '/costs/overview', expectText: '能源费用总览' },
  { path: '/costs/pricing', expectText: '价格方案管理' },
  { path: '/costs/bills', expectText: '能源账单核对' },
  { path: '/costs/allocation', expectText: '学院成本分摊' },
  { path: '/costs/budget', expectText: '能源预算与超支分析' },
  { path: '/alarms', expectText: '告警中心' },
  { path: '/alarms/AL-2026-0412', expectText: '兰园1号公寓夜间持续用水异常' },
  { path: '/alarms/rules', expectText: '预置告警规则' },
  { path: '/work-orders', expectText: '维修/排查工单' },
  { path: '/reports', expectText: '能耗统计报表' },
  { path: '/reports/public-institutions', expectText: '公共机构能源资源统计表' },
  { path: '/efficiency/targets', expectText: '节能目标与能耗定额' },
  { path: '/efficiency/projects', expectText: '节能措施与项目管理' },
  { path: '/efficiency/evaluation', expectText: '节能公示与管理考核' },
  { path: '/efficiency/carbon', expectText: '碳排放核算（范围一/范围二）' },
  { path: '/base/buildings', expectText: '校区与建筑档案' },
  { path: '/base/departments', expectText: '组织责任单位与责任归属' },
  { path: '/base/calendar', expectText: '学年日历与开放时间管理' },
  { path: '/base/meters', expectText: '计量器具台账' },
  { path: '/base/metering', expectText: '计量关系与点位维护' },
  { path: '/base/data-quality', expectText: '数据质量与人工补录' },
  { path: '/system/users', expectText: '用户、角色与数据范围' },
  { path: '/system/integrations', expectText: '数据接口与采集状态' },
  { path: '/system/audit', expectText: '审计与数据血缘查询' },
];

describe('全路由渲染诊断（超级管理员视角）', () => {
  for (const route of ROUTES) {
    it(`${route.path} → 渲染「${route.expectText}」且正文非空、无403`, async () => {
      const { container } = render(
        <MemoryRouter initialEntries={[route.path]}>
          <AppRouter />
        </MemoryRouter>,
      );
      await waitFor(() => {
        expect(container.textContent).toContain(route.expectText);
      }, { timeout: 15000 });
      // 无权限页/错误页不应出现
      expect(container.querySelector('.ant-result-403')).toBeNull();
      // 正文内容量校验（页面主体渲染充分，非空白；大屏以图表为主、文字精简，阈值取低值）
      const textLen = container.textContent?.length ?? 0;
      expect(textLen).toBeGreaterThan(200);
    }, 30000);
  }
});