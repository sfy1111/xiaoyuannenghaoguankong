import type { BuildingCategory, EnergyType } from './types';

export const ENERGY_LABEL: Record<EnergyType, string> = {
  electricity: '电力',
  water: '用水',
  gas: '天然气',
  heat: '供热',
  cooling: '供冷',
  hotWater: '生活热水',
};

export const ENERGY_UNIT: Record<EnergyType, string> = {
  electricity: 'kWh',
  water: 'm³',
  gas: 'm³',
  heat: 'kWh',
  cooling: 'kWh',
  hotWater: 'kWh',
};

export const ENERGY_COLOR: Record<EnergyType, string> = {
  electricity: '#1677ff',
  water: '#13c2c2',
  gas: '#fa8c16',
  heat: '#f5222d',
  cooling: '#722ed1',
  hotWater: '#faad14',
};

export const ENERGY_COLOR_ALPHA: Record<EnergyType, string> = {
  electricity: 'rgba(22,119,255,0.18)',
  water: 'rgba(19,194,194,0.18)',
  gas: 'rgba(250,140,22,0.18)',
  heat: 'rgba(245,34,45,0.18)',
  cooling: 'rgba(114,46,209,0.18)',
  hotWater: 'rgba(250,173,20,0.18)',
};

export const ALL_ENERGY_TYPES: EnergyType[] = ['electricity', 'water', 'gas', 'cooling', 'heat', 'hotWater'];

export const CATEGORY_LABEL: Record<BuildingCategory, string> = {
  teaching: '教学楼',
  lab: '实验科研楼',
  library: '图书馆',
  dormitory: '学生宿舍',
  canteen: '学生食堂',
  office: '行政办公',
  gym: '体育场馆',
  datacenter: '信息中心',
  logistics: '后勤服务',
  plant: '能源站',
};

export const ALL_CATEGORIES: BuildingCategory[] = [
  'teaching', 'lab', 'library', 'dormitory', 'canteen', 'office', 'gym', 'datacenter', 'logistics', 'plant',
];

export const SUBITEM_COLORS: Record<string, string> = {
  '照明插座': '#1677ff',
  '空调': '#13c2c2',
  '动力': '#fa8c16',
  '特殊用电': '#722ed1',
};

export function fmtNumber(v: number | null | undefined, decimals = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return v.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return Math.round(v).toLocaleString('zh-CN');
}

export function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return '¥' + fmtInt(v);
}

export function fmtEnergy(v: number | null | undefined, energy: EnergyType): string {
  return `${fmtNumber(v, energy === 'water' || energy === 'gas' ? 1 : 0)} ${ENERGY_UNIT[energy]}`;
}

export function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '不可计算';
  return `${v >= 0 ? '' : ''}${v.toFixed(decimals)}%`;
}

export function fmtPctSigned(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '不可计算';
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}%`;
}

export function smartDecimals(v: number): number {
  if (Math.abs(v) >= 10000) return 0;
  if (Math.abs(v) >= 100) return 1;
  return 2;
}