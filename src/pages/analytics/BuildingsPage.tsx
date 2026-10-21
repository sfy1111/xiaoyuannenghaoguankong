import { useMemo, useState } from 'react';
import { Segmented, Space, Table, Tag, DatePicker, Tooltip } from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import ExportButton from '../../components/ExportButton';
import { ChartCard, EnergyBarChart } from '../../components/charts';
import { IncompleteNote } from '../../components/StatusTags';
import { CampusSelect, CategorySelect, FilterBar } from '../../components/FilterBar';
import { useFilters, DATA_END } from '../../stores/filters';
import { userScope } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';
import { scopeUsage } from '../../services/energyStats';
import { intensity, pctChange } from '../../domain/analysis';
import { CATEGORY_LABEL, fmtInt } from '../../domain/units';
import { lastNDays } from '../../domain/time';

type RankMode = 'absolute' | 'intensity';

export default function AnalysisBuildingsPage() {
  const navigate = useNavigate();
  const { campusId } = useFilters();
  const [category, setCategory] = useState<'all' | string>('all');
  const [anchor, setAnchor] = useState('2026-10-20');
  const [mode, setMode] = useState<RankMode>('absolute');
  const entities = getEntities();

  const rows = useMemo(() => {
    const from = lastNDays(anchor, 30)[0];
    const to = anchor;
    const prevFrom = dayjs(from).subtract(30, 'day').format('YYYY-MM-DD');
    const prevTo = dayjs(from).subtract(1, 'day').format('YYYY-MM-DD');
    const list = entities.buildings.filter(
      (b) => b.status === 'active' && (campusId === 'all' || b.campusId === campusId),
    );
    return list.map((b) => {
      const usage = scopeUsage('electricity', { buildingId: b.id }, from, to);
      const prevUsage = scopeUsage('electricity', { buildingId: b.id }, prevFrom, prevTo);
      const int = intensity(usage.total, b.assessmentArea);
      const hasSpecialEquipment = entities.meteringPoints.some(
        (p) => p.buildingId === b.id && p.subitem === '特殊用电' && (p.alwaysOn || p.equipmentTag),
      );
      return {
        id: b.id,
        name: b.name,
        category: b.category,
        campus: b.campusId,
        area: b.assessmentArea,
        usage: usage.total ?? 0,
        intensity: int,
        yoy: pctChange(usage.total, prevUsage.total),
        coverage: usage.coverage,
        incomplete: usage.incomplete,
        hasMissing: usage.hasMissing,
        hasEstimated: usage.hasEstimated,
        hasInvalid: usage.hasInvalid,
        hasManual: usage.hasManualCorrected,
        hasSpecialEquipment,
        comparable: b.assessmentArea > 0,
      };
    }).filter((r) => r.usage > 0);
  }, [anchor, campusId, entities]);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => category === 'all' || r.category === category)
      .sort((a, b) => (mode === 'absolute' ? b.usage - a.usage : (b.intensity ?? -1) - (a.intensity ?? -1)));
  }, [rows, category, mode]);

  const rankValue = (r: (typeof rows)[number]) => (mode === 'absolute' ? r.usage : r.intensity ?? -1);

  const exportSheet = {
    name: '建筑排行',
    headers: ['排名', '建筑', '类别', '校区', `用电量(kWh)`, '考核面积(m²)', '单位面积电耗(kWh/m²)', '环比30日(%)', '覆盖率(%)', '特殊设备', '适用评价'],
    rows: filtered.map((r, i) => [
      i + 1, r.name, CATEGORY_LABEL[r.category], r.campus === 'C-E' ? '东校区' : '西校区',
      Math.round(r.usage), r.area, r.intensity === null ? '不可计算' : r.intensity.toFixed(3),
      r.yoy === null ? '不可计算' : r.yoy.toFixed(1), (r.coverage * 100).toFixed(1),
      r.hasSpecialEquipment ? '含24h专用设备' : '—',
      r.comparable ? '适用' : '面积缺失不可比',
    ]),
  };

  const categoryAvg = useMemo(() => {
    const map = new Map<string, { sum: number; n: number }>();
    for (const r of rows) {
      if (r.intensity === null) continue;
      const e = map.get(r.category) ?? { sum: 0, n: 0 };
      e.sum += r.intensity; e.n += 1;
      map.set(r.category, e);
    }
    return new Map([...map.entries()].map(([k, v]) => [k, v.sum / v.n]));
  }, [rows]);

  return (
    <div>
      <PageHeader
        breadcrumb={['能耗分析', '建筑排行与能效对比']}
        title="建筑排行与能效对比"
        subtitle={
          <Space size={8} wrap>
            <span>统计期：近30日（{lastNDays(anchor, 30)[0]} 至 {anchor}）</span>
            <span className="muted">默认同类型建筑比较；绝对量与单位面积强度分列；数据有效覆盖率不足90%标记待判断</span>
          </Space>
        }
        extra={<ExportButton filename={`建筑排行_${anchor}`} sheet={exportSheet} metaNote={`统计期：近30日至${anchor}；单位面积电耗＝主表电量÷考核面积；生成时间：${dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}`} />}
      />
      <FilterBar>
        <span className="filter-label">校区</span>
        <CampusSelect value={campusId} onChange={(v) => useFilters.getState().setCampus(v)} />
        <span className="filter-label">建筑类别</span>
        <CategorySelect value={category} onChange={setCategory} />
        <span className="filter-label">排序口径</span>
        <Segmented size="small" value={mode} options={[{ value: 'absolute', label: '总用电量' }, { value: 'intensity', label: '单位面积电耗' }]} onChange={(v) => setMode(v as RankMode)} />
        <span className="filter-label">截止</span>
        <DatePicker size="small" value={dayjs(anchor)} allowClear={false} onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))} />
        <span className="muted small">不同类别建筑不适用统一评分：实验楼与教学楼分开比较</span>
      </FilterBar>

      <ChartCard title={`建筑${mode === 'absolute' ? '用电量' : '单位面积电耗'}排行（近30日）`} height={360} note="点击柱条进入楼宇详情；含24小时专用设备的建筑以标记区分，不与普通建筑统一评分">
        <EnergyBarChart
          x={filtered.slice(0, 16).reverse().map((r) => r.name.length > 8 ? r.name.slice(0, 8) + '…' : r.name)}
          series={[{
            name: mode === 'absolute' ? '用电量(kWh)' : 'kWh/m²',
            data: filtered.slice(0, 16).reverse().map((r) => mode === 'absolute' ? Math.round(r.usage) : r.intensity === null ? null : Math.round(r.intensity * 1000) / 1000),
            color: '#1668dc',
          }]}
          unit={mode === 'absolute' ? 'kWh' : 'kWh/m²'}
          height={350}
          showLegend={false}
          onEvent={(p) => {
            const found = filtered.find((r) => (r.name.length > 8 ? r.name.slice(0, 8) + '…' : r.name) === p.name);
            if (found) navigate(`/monitor/building/${found.id}?from=${lastNDays(anchor, 30)[0]}&to=${anchor}&campus=${campusId}&back=${encodeURIComponent('/analysis/buildings')}`);
          }}
        />
      </ChartCard>

      <div className="table-card">
        <Table
          size="small"
          rowKey="id"
          pagination={{ pageSize: 12 }}
          dataSource={filtered}
          onRow={(r) => ({
            onClick: () => navigate(`/monitor/building/${r.id}?from=${lastNDays(anchor, 30)[0]}&to=${anchor}&campus=${campusId}&back=${encodeURIComponent('/analysis/buildings')}`),
            style: { cursor: 'pointer' },
          })}
          columns={[
            {
              title: '排名', width: 60, render: (_v, r) => {
                const idx = filtered.findIndex((x) => x.id === r.id) + 1;
                return idx <= 3 ? <Tag color={idx === 1 ? 'gold' : idx === 2 ? 'default' : 'orange'}>{idx}</Tag> : idx;
              },
            },
            { title: '建筑', dataIndex: 'name' },
            { title: '类别', dataIndex: 'category', width: 96, render: (c: string) => CATEGORY_LABEL[c as keyof typeof CATEGORY_LABEL] },
            { title: '用电量(kWh)', dataIndex: 'usage', width: 110, align: 'right' as const, render: (v: number) => fmtInt(v) },
            {
              title: '单位面积电耗(kWh/m²)', width: 140, align: 'right' as const,
              render: (_v, r) => r.intensity === null
                ? <Tooltip title="考核面积为0或缺失，不可计算"><span style={{ color: '#fa8c16' }}>不可计算</span></Tooltip>
                : (
                  <span>
                    {r.intensity.toFixed(3)}
                    {categoryAvg.get(r.category) !== undefined && (
                      <span className="muted small">（类均 {(categoryAvg.get(r.category) ?? 0).toFixed(3)}）</span>
                    )}
                  </span>
                ),
            },
            {
              title: '环比30日', dataIndex: 'yoy', width: 100, align: 'right' as const,
              render: (v: number | null) => v === null ? <Tooltip title="基期数据不足或为0，不可计算"><span className="muted">不可计算</span></Tooltip> : <span style={{ color: v > 0 ? '#cf1322' : '#389e0d' }}>{v >= 0 ? '+' : ''}{v.toFixed(1)}%</span>,
            },
            {
              title: '覆盖率', dataIndex: 'coverage', width: 90,
              render: (c: number) => c < 0.9 ? <Tooltip title="样本有效率不足90%，强度结论标记待判断"><Tag color="orange">{(c * 100).toFixed(1)}%</Tag></Tooltip> : <Tag color="green">{(c * 100).toFixed(1)}%</Tag>,
            },
            { title: '数据质量', width: 110, render: (_v, r) => <IncompleteNote hasMissing={r.hasMissing} hasEstimated={r.hasEstimated} hasInvalid={r.hasInvalid} hasManual={r.hasManual} /> },
            {
              title: '特殊设备', width: 100, render: (_v, r) => r.hasSpecialEquipment
                ? <Tooltip title="含24小时必要运行设备（实验设备/机房IT/热泵等），评价时应单独列示专项扣除"><Tag color="purple">含专项</Tag></Tooltip>
                : '—',
            },
          ]}
        />
      </div>
      <div className="muted small mt8">
        评价说明：单位面积电耗采用考核面积口径；样本覆盖率不足90%的建筑不生成“优秀/较差”结论；
        排除高耗能专用设备仅在单独计量且符合口径时支持。{DATA_END} 为数据窗口末端。
      </div>
    </div>
  );
}