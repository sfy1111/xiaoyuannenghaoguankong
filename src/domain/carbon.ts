import type { CarbonFactor } from './types';

/**
 * 碳排放测算（范围一/范围二）——纯计算，不含 UI。
 *
 * 边界规则（与平台计量边界一致，防止重复统计）：
 * - 范围一：天然气燃烧（食堂、锅炉等），按购入气量 × 燃烧因子；
 * - 范围二：外购电力，按校区进线关口表购入电量 × 电网平均因子；
 * - 内部转换产出的冷量/热量/生活热水不单独计入（其输入电/气已计入范围一/二）；
 * - 供冷/供热产出侧、用水不计入温室气体核算对象。
 */

export interface CarbonBreakdown {
  /** 参与核算的能源用量（kWh 或 m³） */
  usage: number;
  factorValue: number;
  factorId: string;
  /** tCO₂，保留2位 */
  co2: number;
}

export interface CarbonResult {
  scope1: CarbonBreakdown;
  scope2: CarbonBreakdown;
  total: number;
  /** 用量统计存在缺失样本时为 true，测算值如实标注不完整 */
  incomplete: boolean;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function carbonFromUsage(
  elecUsage: number | null,
  gasUsage: number | null,
  gridFactor: CarbonFactor,
  gasFactor: CarbonFactor,
  opts?: { incomplete?: boolean },
): CarbonResult {
  const elec = elecUsage ?? 0;
  const gas = gasUsage ?? 0;
  // 电网因子单位 tCO₂/MWh：kWh → MWh
  const scope2Co2 = (elec / 1000) * gridFactor.value;
  // 燃气因子单位 tCO₂/万m³：m³ → 万m³
  const scope1Co2 = (gas / 10000) * gasFactor.value;
  const scope1: CarbonBreakdown = { usage: gas, factorValue: gasFactor.value, factorId: gasFactor.id, co2: round2(scope1Co2) };
  const scope2: CarbonBreakdown = { usage: elec, factorValue: gridFactor.value, factorId: gridFactor.id, co2: round2(scope2Co2) };
  // 总量由已舍入分量求和再舍入，保证“合计=范围一+范围二”在展示层严格成立
  return {
    scope1,
    scope2,
    total: round2(scope1.co2 + scope2.co2),
    incomplete: elecUsage === null || gasUsage === null || (opts?.incomplete ?? false),
  };
}