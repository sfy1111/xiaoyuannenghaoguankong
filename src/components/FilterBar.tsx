import type { ReactNode } from 'react';
import { Select } from 'antd';
import { getEntities } from '../services/repository';
import { visibleCampusIds } from '../stores/identity';
import { ALL_CATEGORIES, CATEGORY_LABEL, ENERGY_LABEL, ENERGY_UNIT } from '../domain/units';
import type { BuildingCategory, EnergyType } from '../domain/types';

export function FilterBar({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="filter-bar">
      {children}
      {extra && <span style={{ marginLeft: 'auto' }}>{extra}</span>}
    </div>
  );
}

export function useCampusOptions(allowAll = true) {
  const allowed = visibleCampusIds();
  const campuses = getEntities().campuses.filter((c) => allowed.includes(c.id));
  const seesAll = allowed.length === getEntities().campuses.length;
  return allowAll && seesAll
    ? [{ value: 'all', label: '全部校区' }, ...campuses.map((c) => ({ value: c.id, label: c.name }))]
    : campuses.map((c) => ({ value: c.id, label: c.name }));
}

export function useCategoryOptions(allowAll = true) {
  return allowAll
    ? [{ value: 'all', label: '全部类别' }, ...ALL_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))]
    : ALL_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));
}

export function useBuildingOptions(campusId: 'all' | string, category?: string, allowAll = true) {
  const allowed = visibleCampusIds();
  const buildings = getEntities().buildings.filter(
    (b) => b.status === 'active' &&
      (campusId === 'all' || b.campusId === campusId) &&
      allowed.includes(b.campusId) &&
      (!category || category === 'all' || b.category === category),
  );
  return allowAll
    ? [{ value: 'all', label: '全部建筑' }, ...buildings.map((b) => ({ value: b.id, label: b.name }))]
    : buildings.map((b) => ({ value: b.id, label: b.name }));
}

export function CampusSelect({ value, onChange, allowAll = true, width = 130 }: {
  value: 'all' | string; onChange: (v: 'all' | string) => void; allowAll?: boolean; width?: number;
}) {
  return <Select size="small" style={{ width }} value={value} options={useCampusOptions(allowAll)} onChange={onChange} />;
}

export function CategorySelect({ value, onChange, allowAll = true, width = 130 }: {
  value: 'all' | string; onChange: (v: 'all' | string) => void; allowAll?: boolean; width?: number;
}) {
  return <Select size="small" style={{ width }} value={value} options={useCategoryOptions(allowAll)} onChange={onChange} />;
}

export function BuildingSelect({ value, onChange, campusId = 'all', category, allowAll = true, width = 200 }: {
  value: 'all' | string; onChange: (v: 'all' | string) => void;
  campusId?: 'all' | string; category?: string; allowAll?: boolean; width?: number;
}) {
  return <Select size="small" showSearch optionFilterProp="label" style={{ width }} value={value} options={useBuildingOptions(campusId, category, allowAll)} onChange={onChange} />;
}

export function EnergySelect({ value, onChange, options, width = 120 }: {
  value: EnergyType; onChange: (v: EnergyType) => void; options?: EnergyType[]; width?: number;
}) {
  const list = options ?? ['electricity', 'water', 'gas', 'cooling', 'heat', 'hotWater'];
  return (
    <Select
      size="small"
      style={{ width }}
      value={value}
      options={list.map((e) => ({ value: e, label: `${ENERGY_LABEL[e]}（${ENERGY_UNIT[e]}）` }))}
      onChange={onChange}
    />
  );
}

export function categoryLabelOf(c: string): string {
  return CATEGORY_LABEL[c as BuildingCategory] ?? c;
}