import {
  DashboardOutlined, ThunderboltOutlined, ExperimentOutlined, BarChartOutlined, BankOutlined,
  PayCircleOutlined, AlertOutlined, FileTextOutlined, AimOutlined, DatabaseOutlined,
  SettingOutlined, BulbOutlined, BuildOutlined, DotChartOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import { canView } from '../stores/identity';
import type { MenuProps } from 'antd';

export interface MenuLeaf {
  key: string;
  label: string;
  module: string;
  hidden?: boolean;
}

export interface MenuGroup {
  key: string;
  label: string;
  module: string;
  icon: ReactNode;
  children: MenuLeaf[];
}

export const MENU: MenuGroup[] = [
  {
    key: 'dashboard', label: '综合驾驶舱', module: 'dashboard', icon: <DashboardOutlined />,
    children: [
      { key: '/dashboard/campus', label: '校园综合概览', module: 'dashboard' },
      { key: '/dashboard/campus/C-E', label: '东校区总览', module: 'dashboard' },
      { key: '/dashboard/campus/C-W', label: '西校区总览', module: 'dashboard' },
      { key: '/dashboard/energy', label: '能源专题大屏', module: 'dashboard' },
    ],
  },
  {
    key: 'monitoring', label: '能源监测', module: 'monitoring', icon: <ThunderboltOutlined />,
    children: [
      { key: '/monitor/electricity', label: '电力运行监测', module: 'monitoring' },
      { key: '/monitor/water', label: '用水监测', module: 'monitoring' },
      { key: '/monitor/gas', label: '天然气监测', module: 'monitoring' },
      { key: '/monitor/thermal', label: '供热供冷与生活热水', module: 'monitoring' },
      { key: '/monitor/equipment', label: '重点用能设备', module: 'monitoring' },
    ],
  },
  {
    key: 'analytics', label: '能耗分析', module: 'analytics', icon: <BarChartOutlined />,
    children: [
      { key: '/analysis/overview', label: '校园总量与趋势', module: 'analytics' },
      { key: '/analysis/categories', label: '分类分项能耗', module: 'analytics' },
      { key: '/analysis/buildings', label: '建筑排行与能效对比', module: 'analytics' },
      { key: '/analysis/comparison', label: '同比环比与用能结构', module: 'analytics' },
      { key: '/analysis/calendar', label: '教学日历分析', module: 'analytics' },
      { key: '/analysis/balance', label: '能源平衡与计量覆盖', module: 'analytics' },
    ],
  },
  {
    key: 'scenarios', label: '校园专题', module: 'scenarios', icon: <BankOutlined />,
    children: [
      { key: '/scenarios/teaching', label: '教学楼用能', module: 'scenarios' },
      { key: '/scenarios/laboratory', label: '科研实验楼', module: 'scenarios' },
      { key: '/scenarios/dormitory', label: '学生宿舍', module: 'scenarios' },
      { key: '/scenarios/dining', label: '学生食堂', module: 'scenarios' },
      { key: '/scenarios/library-sports', label: '图书馆/体育馆', module: 'scenarios' },
      { key: '/scenarios/public', label: '公共设施与照明', module: 'scenarios' },
      { key: '/scenarios/departments', label: '学院责任用能', module: 'scenarios' },
      { key: '/scenarios/plant', label: '能源站与管网', module: 'scenarios' },
    ],
  },
  {
    key: 'costs', label: '能源费用', module: 'costs', icon: <PayCircleOutlined />,
    children: [
      { key: '/costs/overview', label: '能源费用总览', module: 'costs' },
      { key: '/costs/pricing', label: '价格方案管理', module: 'costs' },
      { key: '/costs/bills', label: '账单核对', module: 'costs' },
      { key: '/costs/allocation', label: '学院成本分摊', module: 'costs' },
      { key: '/costs/budget', label: '能源预算', module: 'costs' },
    ],
  },
  {
    key: 'alarms', label: '告警与工单', module: 'alarms', icon: <AlertOutlined />,
    children: [
      { key: '/alarms', label: '告警中心', module: 'alarms' },
      { key: '/alarms/rules', label: '告警规则', module: 'alarms' },
      { key: '/work-orders', label: '运维工单', module: 'alarms' },
    ],
  },
  {
    key: 'reports', label: '报表中心', module: 'reports', icon: <FileTextOutlined />,
    children: [
      { key: '/reports', label: '能耗统计报表', module: 'reports' },
      { key: '/reports/public-institutions', label: '公共机构统计表', module: 'reports' },
    ],
  },
  {
    key: 'efficiency', label: '节能管理', module: 'efficiency', icon: <AimOutlined />,
    children: [
      { key: '/efficiency/targets', label: '节能目标与定额', module: 'efficiency' },
      { key: '/efficiency/projects', label: '节能措施与项目', module: 'efficiency' },
      { key: '/efficiency/evaluation', label: '节能公示与考核', module: 'efficiency' },
      { key: '/efficiency/carbon', label: '碳排放核算', module: 'efficiency' },
    ],
  },
  {
    key: 'foundation', label: '基础档案', module: 'foundation', icon: <DatabaseOutlined />,
    children: [
      { key: '/base/buildings', label: '校区与建筑档案', module: 'foundation' },
      { key: '/base/departments', label: '组织责任单位', module: 'foundation' },
      { key: '/base/calendar', label: '学年日历与开放时间', module: 'foundation' },
      { key: '/base/meters', label: '计量器具台账', module: 'foundation' },
      { key: '/base/metering', label: '计量关系与点位维护', module: 'foundation' },
      { key: '/base/data-quality', label: '数据质量与补录', module: 'foundation' },
    ],
  },
  {
    key: 'system', label: '系统管理', module: 'system', icon: <SettingOutlined />,
    children: [
      { key: '/system/users', label: '用户与角色', module: 'system' },
      { key: '/system/integrations', label: '数据接口与采集状态', module: 'system' },
      { key: '/system/audit', label: '审计与操作记录', module: 'system' },
    ],
  },
];

export function visibleMenu(): MenuGroup[] {
  return MENU.filter((g) => canView(g.module));
}

export function menuItems(): MenuProps['items'] {
  return visibleMenu().map((g) => ({
    key: g.key,
    icon: g.icon,
    label: g.label,
    children: g.children.map((leaf) => ({ key: leaf.key, label: leaf.label })),
  }));
}

export function defaultOpenKeys(): string[] {
  return visibleMenu().map((g) => g.key);
}

export const MODULE_ICONS = {
  dashboard: <DotChartOutlined />,
  monitoring: <ThunderboltOutlined />,
  analytics: <BarChartOutlined />,
  scenarios: <BuildOutlined />,
  costs: <PayCircleOutlined />,
  alarms: <AlertOutlined />,
  reports: <FileTextOutlined />,
  efficiency: <BulbOutlined />,
  foundation: <DatabaseOutlined />,
  system: <SettingOutlined />,
};