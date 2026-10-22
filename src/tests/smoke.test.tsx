// @vitest-environment jsdom
import { describe, expect, it, vi, beforeAll } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useIdentity, userScope } from '../stores/identity';
import { scopePointIds } from '../services/energyStats';

// ECharts 在 jsdom 中无 Canvas 环境，以轻量桩替换（真实浏览器不受影响）
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

import { AppRouter } from '../app/App';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRouter />
    </MemoryRouter>,
  );
}

describe('界面渲染冒烟测试', () => {
  it('校园综合概览页面能渲染出内容', async () => {
    const { container } = renderAt('/dashboard/campus');
    await waitFor(() => {
      expect(container.textContent).toContain('校园综合概览');
      expect(container.textContent).toContain('本期用电量');
      expect(container.textContent).toContain('建筑用电排行');
      expect(container.textContent).toContain('待处理异常事件');
    }, { timeout: 10000 });
  }, 20000);

  it('电力监测页面能渲染出内容', async () => {
    const { container } = renderAt('/monitor/electricity');
    await waitFor(() => {
      expect(container.textContent).toContain('电力运行监测');
      expect(container.textContent).toContain('当前总功率');
      expect(container.textContent).toContain('峰平谷用电结构');
    }, { timeout: 10000 });
  }, 20000);

  it('告警中心页面能渲染出内容', async () => {
    const { container } = renderAt('/alarms');
    await waitFor(() => {
      expect(container.textContent).toContain('告警中心');
      expect(container.textContent).toContain('夜间持续用水');
    }, { timeout: 10000 });
  }, 20000);

  it('楼宇详情深链接可渲染', async () => {
    const { container } = renderAt('/monitor/building/B-TA?from=2026-10-20&to=2026-10-20');
    await waitFor(() => {
      expect(container.textContent).toContain('明德楼（教学楼A）');
      expect(container.textContent).toContain('单位面积电耗');
    }, { timeout: 10000 });
  }, 20000);

  it('404 页面可渲染', async () => {
    const { container } = renderAt('/not-exist-route');
    await waitFor(() => expect(container.textContent).toContain('页面不存在'), { timeout: 8000 });
  }, 20000);

  it('切换角色后菜单、视角标识与数据范围随之变化', async () => {
    const { container } = renderAt('/dashboard/campus');
    await waitFor(() => {
      expect(container.textContent).toContain('校园综合概览');
      expect(container.textContent).toContain('系统管理');
    }, { timeout: 10000 });

    // 默认为后勤能源主管（张启明）：可见系统管理与费用明细
    expect(container.textContent).toContain('后勤能源主管');

    // 切换到能源管理员（王建国，仅东校区）
    act(() => {
      useIdentity.getState().setUserId('U-WANG');
    });
    await waitFor(() => {
      expect(container.textContent).toContain('能源管理员');
      // 能源管理员可查看费用（只读），但无系统管理模块
      expect(container.textContent).not.toContain('系统管理');
      expect(container.textContent).toContain('费用总览');
    }, { timeout: 10000 });
    // 数据范围收窄至东校区：userScope('all') 不再包含西校区
    expect(userScope('all').campusId).toBe('C-E');
    expect(scopePointIds('electricity', userScope('all')).every((pid) => pid.startsWith('P-E') || pid === 'P-EL')).toBe(true);

    // 切换到学院联络员（刘晓东，仅机械工程学院）
    act(() => {
      useIdentity.getState().setUserId('U-LIU');
    });
    await waitFor(() => {
      expect(container.textContent).toContain('学院联络员');
      // 学院联络员菜单仅保留驾驶舱/分析/专题
      expect(container.textContent).not.toContain('电力运行监测');
      expect(container.textContent).not.toContain('告警与工单');
      expect(container.textContent).not.toContain('基础档案');
    }, { timeout: 10000 });
    // 数据范围收窄至授权建筑（格物楼）
    const liaisonScope = userScope('all');
    expect(liaisonScope.buildingIds).toEqual(['B-LC']);
    expect(scopePointIds('electricity', liaisonScope).every((pid) => pid.startsWith('P-LC'))).toBe(true);

    // 恢复默认视角
    act(() => {
      useIdentity.getState().setUserId('U-ZHANG');
    });
    await waitFor(() => expect(container.textContent).toContain('后勤能源主管'), { timeout: 10000 });
  }, 30000);

  it('超级管理员视角可见并可操作全部模块', async () => {
    const { container } = renderAt('/dashboard/campus');
    await waitFor(() => expect(container.textContent).toContain('校园综合概览'), { timeout: 10000 });

    act(() => {
      useIdentity.getState().setUserId('U-SUPER');
    });
    await waitFor(() => {
      expect(container.textContent).toContain('超级管理员');
      // 全部菜单组可见（此前各受限角色均会隐藏其中一部分）
      for (const label of ['综合驾驶舱', '能源监测', '能耗分析', '校园专题', '能源费用', '告警与工单', '报表中心', '节能管理', '基础档案', '系统管理']) {
        expect(container.textContent).toContain(label);
      }
    }, { timeout: 10000 });

    // 超级管理员可进入系统管理与费用等全部模块且不出现403
    const systemPage = renderAt('/system/users');
    await waitFor(() => expect(systemPage.container.textContent).toContain('用户、角色与数据范围'), { timeout: 10000 });
    const costsPage = renderAt('/costs/pricing');
    await waitFor(() => expect(costsPage.container.textContent).toContain('价格方案管理'), { timeout: 10000 });

    act(() => {
      useIdentity.getState().setUserId('U-ZHANG');
    });
    await waitFor(() => expect(container.textContent).toContain('后勤能源主管'), { timeout: 10000 });
  }, 30000);
});