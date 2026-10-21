import { useMemo, useState } from 'react';
import { Segmented, Space, Table, Tag, DatePicker } from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ExportButton from '../../components/ExportButton';
import { ChartCard, EnergyBarChart, EnergyPieChart, EnergyStackedBar } from '../../components/charts';
import { CampusSelect, CategorySelect, FilterBar } from '../../components/FilterBar';
import { useFilters, DATA_END } from '../../stores/filters';
import { userScope } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';
import { scopeUsage, buildingSubitems, dailyRows } from '../../services/energyStats';
import { ENERGY_COLOR, CATEGORY_LABEL, ALL_CATEGORIES, SUBITEM_COLORS, fmtInt } from '../../domain/units';
import { lastNDays } from '../../domain/time';

export default function AnalysisCategoriesPage() {
  const navigate = useNavigate();
  const { campusId } = useFilters();
  const [anchor, setAnchor] = useState('2026-10-20');
  const [category, setCategory] = useState<'all' | string>('all');
  const entities = getEntities();
  const scope = useMemo(() => userScope(campusId, category === 'all' ? undefined : category), [campusId, category]);

  const data = useMemo(() => {
    const days30 = lastNDays(anchor, 30);
    const from = days30[0];
    const to = anchor;
    const totalUsage = scopeUsage('electricity', scope, from, to);

    const categoryRows = ALL_CATEGORIES.map((c) => {
      const buildings = entities.buildings.filter(
        (b) => b.status === 'active' && b.category === c && (scope.campusId === 'all' || b.campusId === scope.campusId) && (!scope.buildingIds || scope.buildingIds.includes(b.id)),
      );
      const usage = buildings.reduce((a, b) => a + (scopeUsage('electricity', { buildingId: b.id }, from, to).total ?? 0), 0);
      const area = buildings.reduce((a, b) => a + b.assessmentArea, 0);
      return {
        key: c,
        label: CATEGORY_LABEL[c],
        buildings: buildings.length,
        usage,
        area,
        intensity: area > 0 && usage > 0 ? usage / area : null,
        share: totalUsage.total && totalUsage.total > 0 ? (usage / totalUsage.total) * 100 : null,
      };
    }).filter((r) => r.buildings > 0);

    const subitemTotals = new Map<string, number>();
    let coveredTotal = 0;
    const subitemDetail: { name: string; pointId: string; building: string; usage: number; share: number | null }[] = [];
    const buildingsInScope = entities.buildings.filter(
      (b) => b.status === 'active' && (scope.campusId === 'all' || b.campusId === scope.campusId) && (!scope.buildingIds || scope.buildingIds.includes(b.id)) && (category === 'all' || b.category === category),
    );
    for (const b of buildingsInScope) {
      const sub = buildingSubitems(b.id, 'electricity', from, to);
      coveredTotal += sub.coveredTotal;
      for (const s of sub.subitems) {
        const key = s.point.subitem ?? s.point.name;
        subitemTotals.set(key, (subitemTotals.get(key) ?? 0) + (s.usage.total ?? 0));
        subitemDetail.push({
          name: key,
          pointId: s.point.id,
          building: b.name,
          usage: s.usage.total ?? 0,
          share: s.usage.total !== null && sub.coveredTotal > 0 ? (s.usage.total / sub.coveredTotal) * 100 : null,
        });
      }
    }
    const coveredShare = totalUsage.total && totalUsage.total > 0 ? (coveredTotal / totalUsage.total) * 100 : null;

    const days = lastNDays(anchor, 30);
    const buildingsOf = (cat: string): string[] =>
      entities.buildings.filter((b) => b.status === 'active' && b.category === cat && (scope.campusId === 'all' || b.campusId === scope.campusId) && (!scope.buildingIds || scope.buildingIds.includes(b.id))).map((b) => b.id);
    const daily30Of = (bid: string) => {
      const ids = entities.meteringPoints.filter((p) => p.buildingId === bid && p.energyType === 'electricity' && p.role === 'main').map((p) => p.id);
      return ids.length === 0 ? [] : dailyRows(ids, from, to);
    };
    const categoryTrendSeries = categoryRows.slice(0, 6).map((c) => {
      const rows = buildingsOf(c.key).flatMap((bid) => daily30Of(bid));
      const byDate = new Map<string, number>();
      for (const r of rows) byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.total);
      return {
        name: c.label,
        data: days.map((d) => Math.round(byDate.get(d) ?? 0)),
        color: ENERGY_COLOR.electricity,
        stack: 'cat',
        type: 'bar' as const,
      };
    });

    return { totalUsage, categoryRows, subitemTotals, coveredTotal, coveredShare, subitemDetail, days, categoryTrendSeries, from, to };
  }, [anchor, scope, category, entities]);

  const exportSheet = {
    name: '分类分项统计',
    headers: ['建筑类别', '建筑数', `用电量(kWh)`, '考核面积(m²)', '单位面积电耗(kWh/m²)', '占比(%)'],
    rows: data.categoryRows.map((r) => [r.label, r.buildings, Math.round(r.usage), r.area, r.intensity === null ? '不可计算' : r.intensity.toFixed(3), r.share === null ? '不可计算' : r.share.toFixed(1)]),
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['能耗分析', '分类分项能耗']}
        title="分类分项能耗分析"
        subtitle={
          <Space size={8} wrap>
            <span>近30日口径（{data.from} 至 {data.to}）；分类＝建筑用途，分项＝用电系统支路，两维度独立统计不相互相加</span>
            <span className="muted">数据更新：{dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}</span>
          </Space>
        }
        extra={<ExportButton filename={`分类分项统计_${anchor}`} sheet={exportSheet} metaNote={`统计期：${data.from}至${data.to}；分类口径：建筑考核用途；分项口径：分表实测支路`} />}
      />
      <FilterBar>
        <span className="filter-label">校区</span>
        <CampusSelect value={campusId} onChange={(v) => useFilters.getState().setCampus(v)} />
        <span className="filter-label">建筑类别</span>
        <CategorySelect value={category} onChange={setCategory} />
        <span className="filter-label">截止</span>
        <DatePicker size="small" value={dayjs(anchor)} allowClear={false} onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))} />
        <span className="muted small">分项未覆盖部分不做“其余均归照明”的自动归集，单独列为未分项</span>
      </FilterBar>

      <div className="kpi-row">
        <StatCard label="近30日用电总量" value={data.totalUsage.total} unit="kWh" qualityNote={data.totalUsage.incomplete ? '存在缺失/无效样本' : undefined} />
        <StatCard label="分项计量覆盖电量" value={data.coveredTotal} unit="kWh" sub={`占主表总量 ${data.coveredShare === null ? '不可计算' : data.coveredShare.toFixed(1)}%`} />
        <StatCard label="未分项差额" value={data.totalUsage.total !== null ? Math.round(data.totalUsage.total - data.coveredTotal) : null} unit="kWh" sub="主表−分项合计，含无分表建筑；不解释为损耗" />
        <StatCard label="建筑类别数" value={data.categoryRows.length} unit="类" sub="分类即建筑用途分组" />
      </div>

      <div className="chart-grid c2">
        <ChartCard title="建筑类别用电构成（kWh）" height={320}>
          <EnergyPieChart
            data={data.categoryRows.map((r, i) => ({
              name: r.label,
              value: Math.round(r.usage),
              color: ['#1668dc', '#13c2c2', '#722ed1', '#fa8c16', '#f5222d', '#faad14', '#52c41a', '#2f54eb', '#eb2f96', '#a0d911'][i % 10],
            }))}
            unit="kWh"
            height={310}
            onEvent={(name) => {
              const row = data.categoryRows.find((r) => r.label === name);
              if (row) setCategory(row.key);
            }}
          />
        </ChartCard>
        <ChartCard title="分类用电趋势（近30日堆积，kWh）" height={320} note="堆积为已分类建筑主表合计，分项支路不重复计入">
          <EnergyStackedBar
            x={data.days.map((d) => d.slice(5))}
            series={data.categoryTrendSeries}
            unit="kWh"
            height={310}
          />
        </ChartCard>
      </div>

      <div className="chart-grid c2">
        <ChartCard title="用电分项结构（分表实测支路，kWh）" height={320} note="分项覆盖率不足100%时，未分项部分不自动归入任何分项">
          <EnergyBarChart
            x={[...data.subitemTotals.keys()]}
            series={[{
              name: '分项用量',
              data: [...data.subitemTotals.entries()].map(([k, v]) => Math.round(v)),
              color: ENERGY_COLOR.electricity,
            }]}
            unit="kWh"
            height={310}
            showLegend={false}
          />
        </ChartCard>
        <div className="table-card" style={{ background: '#fff', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)', padding: '8px 12px' }}>
          <h4 className="section-title">分类统计表</h4>
          <Table
            size="small"
            rowKey="key"
            pagination={false}
            dataSource={data.categoryRows}
            onRow={(r) => ({ onClick: () => setCategory(r.key === category ? 'all' : r.key), style: { cursor: 'pointer' } })}
            columns={[
              { title: '类别', dataIndex: 'label' },
              { title: '建筑数', dataIndex: 'buildings', width: 70, align: 'right' as const },
              { title: '用电量(kWh)', dataIndex: 'usage', align: 'right' as const, render: (v: number) => fmtInt(Math.round(v)) },
              { title: '面积(m²)', dataIndex: 'area', width: 110, align: 'right' as const, render: (v: number) => fmtInt(v) },
              { title: '强度(kWh/m²)', dataIndex: 'intensity', width: 110, align: 'right' as const, render: (v: number | null) => v === null ? '不可计算' : v.toFixed(3) },
              { title: '占比', dataIndex: 'share', width: 80, align: 'right' as const, render: (v: number | null) => v === null ? '—' : `${v.toFixed(1)}%` },
            ]}
          />
          <h4 className="section-title mt12">分项计量点贡献清单（可查看依据）</h4>
          <Table
            size="small"
            rowKey={(r) => r.pointId + r.building}
            pagination={{ pageSize: 8 }}
            dataSource={data.subitemDetail}
            columns={[
              { title: '分项', dataIndex: 'name', width: 90, render: (v: string) => <Tag color={SUBITEM_COLORS[v] ? undefined : 'default'}>{v}</Tag> },
              { title: '建筑', dataIndex: 'building' },
              { title: '近30日用量(kWh)', dataIndex: 'usage', width: 120, align: 'right' as const, render: (v: number) => fmtInt(Math.round(v)) },
              { title: '占本楼分项比', dataIndex: 'share', width: 100, align: 'right' as const, render: (v: number | null) => v === null ? '—' : `${v.toFixed(1)}%` },
              {
                title: '', width: 60, render: (_v, r) => (
                  <a onClick={() => navigate(`/monitor/building/${entities.buildings.find((b) => b.name === r.building)?.id}?from=${data.from}&to=${data.to}`)}>楼宇</a>
                ),
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}