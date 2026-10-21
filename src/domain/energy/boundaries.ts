import type { Building, MeteringPoint, MeterRelation, EnergyType } from '../types';

/**
 * 计量边界解析：所有统计必须经由该模块确定“哪些点位构成某对象的总量”，
 * 父表与子表不得重复计入。
 */

export interface BoundaryIndex {
  points: MeteringPoint[];
  relations: MeterRelation[];
}

export function pointsOfBuilding(idx: BoundaryIndex, buildingId: string, energyType: EnergyType): MeteringPoint[] {
  return idx.points.filter(
    (p) => p.buildingId === buildingId && p.energyType === energyType && p.role === 'main' && p.direction !== 'export',
  );
}

export function subitemsOfBuilding(idx: BoundaryIndex, buildingId: string, energyType: EnergyType): MeteringPoint[] {
  return idx.points.filter(
    (p) => p.buildingId === buildingId && p.energyType === energyType && p.role === 'submeter',
  );
}

/** 校区边界：总进线/总进水/能源站产出等关口点（role=main 且无 buildingId），不含建筑表，避免重复计量 */
export function pointsOfCampus(idx: BoundaryIndex, campusId: string, energyType: EnergyType): MeteringPoint[] {
  const boundary = idx.points.filter(
    (p) => p.campusId === campusId && p.energyType === energyType && !p.buildingId &&
      (p.role === 'main' || p.role === 'plantOutput'),
  );
  if (boundary.length > 0) return boundary;
  return idx.points.filter(
    (p) => p.campusId === campusId && p.energyType === energyType && p.role === 'main' && !p.buildingId,
  );
}

export interface BoundaryBreakdown {
  boundaryTotal: number | null;
  coveredTotal: number;
  coveredPointIds: string[];
  childrenTotal: number;
  childrenPointIds: string[];
  uncovered: number | null;
  uncoveredPct: number | null;
  anomaly: boolean;
}

/**
 * 边界分解：boundaryTotal 为边界（总表）量，covered 为已确认下属分项之和。
 * uncovered = 边界 - 分项（未分项/计量差额，非线路损耗）；负值视为计量关系异常。
 */
export function boundaryBreakdown(boundaryTotal: number | null, coveredTotal: number): BoundaryBreakdown {
  if (boundaryTotal === null) {
    return {
      boundaryTotal: null,
      coveredTotal,
      coveredPointIds: [],
      childrenPointIds: [],
      childrenTotal: 0,
      uncovered: null,
      uncoveredPct: null,
      anomaly: false,
    };
  }
  const uncovered = boundaryTotal - coveredTotal;
  return {
    boundaryTotal,
    coveredTotal,
    coveredPointIds: [],
    childrenPointIds: [],
    childrenTotal: coveredTotal,
    uncovered,
    uncoveredPct: boundaryTotal === 0 ? null : (uncovered / boundaryTotal) * 100,
    anomaly: uncovered < -0.5,
  };
}

/** 公共设施点位（道路照明、绿化等，不属于任何建筑） */
export function publicPointsOfCampus(idx: BoundaryIndex, campusId: string, energyType: EnergyType): MeteringPoint[] {
  return idx.points.filter((p) => p.campusId === campusId && p.energyType === energyType && p.role === 'public');
}

/** 判断某点是否为另一点的下属分项（避免把子表再计入总量） */
export function isDescendantOf(idx: BoundaryIndex, childId: string, parentId: string): boolean {
  const direct = idx.relations.some((r) => r.childId === childId && r.parentId === parentId);
  if (direct) return true;
  const parents = idx.relations.filter((r) => r.childId === childId).map((r) => r.parentId);
  return parents.some((p) => isDescendantOf(idx, p, parentId));
}

/** 汇总一组不重复计入的建筑点位：过滤掉同时出现父表的子表 */
export function deduplicatePoints(idx: BoundaryIndex, pointIds: string[]): string[] {
  const set = new Set(pointIds);
  return [...set].filter((id) => {
    const asChild = idx.relations.filter((r) => r.childId === id);
    return !asChild.some((r) => set.has(r.parentId));
  });
}

export function buildingsWithEnergy(idx: BoundaryIndex, buildings: Building[], energyType: EnergyType): Building[] {
  return buildings.filter((b) => pointsOfBuilding(idx, b.id, energyType).length > 0);
}