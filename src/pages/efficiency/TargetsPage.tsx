import { useMemo, useState } from 'react';
import { App, DatePicker, InputNumber, Modal, Progress, Space, Table, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ExportButton from '../../components/ExportButton';
import { ChartCard, EnergyBarChart } from '../../components/charts';
import { CampusSelect, FilterBar } from '../../components/FilterBar';
import { useFilters } from '../../stores/filters';
import { canEdit } from '../../stores/identity';
import { getEntities, occupancyOf, mealsOf } from '../../services/repository';
import { scopeUsage, dailyRows, buildingSubitems } from '../../services/energyStats';
import { intensity, perCapita } from '../../domain/analysis';
import { fmtInt } from '../../domain/units';
import type { TargetEntry } from '../../domain/types';

export default function EfficiencyTargetsPage() {
  const { message } = App.useApp();
  const { campusId } = useFilters();
  const [anchor, setAnchor] = useState('2026-10-20');
  const [editTarget, setEditTarget] = useState<TargetEntry | null>(null);
  const [editValue, setEditValue] = useState<number>(0);
  const entities = getEntities();
  const editable = canEdit('targets');

  const data = useMemo(() => {
    const from = '2026-01-01';
    const to = anchor;
    const yearElec = scopeUsage('electricity', { campusId }, from, to);
    const yearWater = scopeUsage('water', { campusId }, from, to);

    const teachingBuildings = entities.buildings.filter((b) => b.status === 'active' && b.category === 'teaching' && (campusId === 'all' || b.campusId === campusId));
    const teachUsage = teachingBuildings.reduce((a, b) => a + (scopeUsage('electricity', { buildingId: b.id }, from, to).total ?? 0), 0);
    const teachArea = teachingBuildings.reduce((a, b) => a + b.assessmentArea, 0);
    const teachIntensity = teachArea > 0 ? teachUsage / teachArea : null;

    const dorms = entities.buildings.filter((b) => b.status === 'active' && b.category === 'dormitory');
    const dormPerCapita = (() => {
      const totalWater = dorms.reduce((a, b) => a + (scopeUsage('water', { buildingId: b.id }, '2026-09-01', '2026-09-30').total ?? 0), 0);
      const residents = dorms.reduce((a, b) => a + (occupancyOf(b.id, '2026-09')?.residents ?? 0), 0);
      return perCapita(totalWater, residents || null);
    })();

    const canteenGas = (() => {
      const gas = scopeUsage('gas', { buildingId: 'B-C1' }, '2026-09-01', '2026-09-30').total ?? 0;
      const gas2 = scopeUsage('gas', { buildingId: 'B-C2' }, '2026-09-01', '2026-09-30').total ?? 0;
      const meals = (mealsOf('B-C1', '2026-09') ?? 0) + (mealsOf('B-C2', '2026-09') ?? 0);
      return meals > 0 ? ((gas + gas2) / meals) * 1000 : null;
    })();

    const lcSub = buildingSubitems('B-LC', 'electricity', from, to);
    const lcSpecial = lcSub.subitems.find((s) => s.point.subitem === '特殊用电')?.usage.total ?? 0;
    const lcTotal = lcSub.mainUsage.total ?? 0;
    const lcArea = entities.buildings.find((b) => b.id === 'B-LC')?.assessmentArea ?? 0;
    const lcIntensityEx = lcArea > 0 ? Math.max(0, lcTotal - lcSpecial) / lcArea : null;

    const icMain = scopeUsage('electricity', { buildingId: 'B-IC' }, from, to).total ?? 0;
    const icIT = dailyRows(['P-IC-L3'], from, to).reduce((a, r) => a + r.total, 0);
    const icShare = icMain > 0 ? (icIT / icMain) * 100 : null;

    const actualOf = (t: TargetEntry): number | null => {
      switch (t.id) {
        case 'TG-ELEC-2026': return yearElec.total;
        case 'TG-WATER-2026': return yearWater.total;
        case 'TG-TEACH-INT': return teachIntensity;
        case 'TG-DORM-WATER': return dormPerCapita;
        case 'TG-CANTEEN-GAS': return canteenGas;
        case 'TG-LC-INT': return lcIntensityEx;
        case 'TG-IC-PUE': return icShare;
        default: return null;
      }
    };

    const rows = entities.targets.map((t) => {
      const actual = actualOf(t);
      const isLower = t.direction === 'lower';
      const achievement = actual !== null && t.target !== 0
        ? isLower ? (t.target / actual) * 100 : (actual / t.target) * 100
        : null;
      const met = actual !== null ? (isLower ? actual <= t.target * 1.1 : actual >= t.target * 0.95) : null;
      const progress = actual !== null && t.target !== 0
        ? isLower ? Math.min(150, (actual / t.target) * 100) : Math.min(150, (actual / t.target) * 100)
        : null;
      return { ...t, key: t.id, actual, achievement, met, progress };
    });
    return { rows, yearElec, teachIntensity, dormPerCapita, canteenGas, lcIntensityEx, icShare };
  }, [entities, anchor, campusId]);

  const exportSheet = {
    name: '节能目标',
    headers: ['目标对象', '指标', '单位', '目标值', '当前实绩', '达标状态', '适用口径'],
    rows: data.rows.map((r) => [
      r.scopeName, r.indicator, r.unit, r.target,
      r.actual === null ? '不可计算（分母缺失或样本不足）' : Math.round(r.actual * 100) / 100,
      r.met === null ? '待判断' : r.met ? '达标' : '超标',
      r.basis,
    ]),
  };

  const saveTarget = () => {
    if (!editTarget) return;
    entities.actions.updateTarget(editTarget.id, { target: editValue });
    message.success('目标已调整（保留原版本于审计），复核后生效');
    setEditTarget(null);
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['节能管理', '节能目标与定额']}
        title="节能目标与能耗定额"
        subtitle={
          <Space size={8} wrap>
            <span>目标完成率、达标数量与超标排行；不同建筑类型不适用统一限额，样本有效率不足标记待判断</span>
            <span className="muted">统计期：2026-01-01 至 {anchor}</span>
          </Space>
        }
        extra={<ExportButton filename="节能目标执行" sheet={exportSheet} metaNote={`目标口径与学校2026年节能工作方案；统计至${anchor}`} />}
      />
      <FilterBar>
        <span className="filter-label">校区</span>
        <CampusSelect value={campusId} onChange={(v) => useFilters.getState().setCampus(v)} />
        <span className="filter-label">截止</span>
        <DatePicker size="small" value={dayjs(anchor)} allowClear={false} onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))} />
        <span className="muted small">面积、人数等分母来源见目标备注；修改校历/人数后指标随统计重算</span>
      </FilterBar>

      <div className="kpi-row">
        <StatCard label="年度购电目标执行" value={data.yearElec.total} unit="kWh" sub={`目标 ≤310万 kWh（较上年降3%），当前执行 ${((data.yearElec.total ?? 0) / 3100000 * 100).toFixed(1)}%`} />
        <StatCard label="教学楼单位面积电耗" value={data.teachIntensity === null ? '不可计算' : Math.round(data.teachIntensity * 100) / 100} unit={data.teachIntensity === null ? undefined : 'kWh/m²'} sub="目标 ≤24（类均值对比）" />
        <StatCard label="宿舍人均月用水（9月）" value={data.dormPerCapita === null ? '不可计算' : Math.round(data.dormPerCapita * 100) / 100} unit={data.dormPerCapita === null ? undefined : 'm³/人·月'} sub="目标 ≤3.2" />
        <StatCard label="食堂餐均用气（9月）" value={data.canteenGas === null ? '不可计算（供餐量缺失）' : Math.round(data.canteenGas * 10) / 10} unit={data.canteenGas === null ? undefined : 'm³/千餐'} sub="目标 ≤42" />
        <StatCard label="达标目标数" value={data.rows.filter((r) => r.met === true).length} unit={`/ ${data.rows.length}`} sub={`超标 ${data.rows.filter((r) => r.met === false).length} 项`} />
      </div>

      <div className="table-card">
        <h4 className="section-title">目标执行明细</h4>
        <Table
          size="small"
          rowKey="key"
          pagination={false}
          dataSource={data.rows}
          columns={[
            { title: '对象', dataIndex: 'scopeName', width: 110 },
            { title: '指标', dataIndex: 'indicator' },
            { title: '单位', dataIndex: 'unit', width: 100 },
            { title: '目标值', dataIndex: 'target', width: 90, align: 'right' as const, render: (v: number, r) => `${r.direction === 'lower' ? '≤' : '≥'}${v}` },
            {
              title: '当前实绩', dataIndex: 'actual', width: 130, align: 'right' as const,
              render: (v: number | null) => v === null ? <Tooltip title="分母缺失或样本有效率不足"><Tag color="orange">待判断</Tag></Tooltip> : Math.round(v * 100) / 100,
            },
            {
              title: '执行进度', width: 200,
              render: (_v, r) => r.progress === null ? '—' : (
                <Progress
                  percent={Math.round(r.progress)}
                  size="small"
                  strokeColor={r.met === null ? '#d48806' : r.met ? '#52c41a' : '#cf1322'}
                  format={(p) => `${p}%`}
                />
              ),
            },
            {
              title: '状态', dataIndex: 'met', width: 84,
              render: (v: boolean | null) => v === null ? <Tag color="orange">待判断</Tag> : v ? <Tag color="green">达标</Tag> : <Tag color="red">超标</Tag>,
            },
            {
              title: '操作', width: 70,
              render: (_v, r) => editable ? <a onClick={() => { setEditTarget(r); setEditValue(r.target); }}>调整</a> : null,
            },
          ]}
          expandable={{
            expandedRowRender: (r) => (
              <div className="small">
                <div>适用口径：{r.basis}</div>
                <div className="muted">说明：{r.note}</div>
                <div className="muted">责任人：{r.owner}；状态：{r.status}</div>
              </div>
            ),
          }}
        />
      </div>

      <ChartCard title="目标达标情况对比（实绩 vs 目标，按各指标单位归一显示完成率%）" height={300} note="越小越好指标：完成率=目标/实绩×100%；越大越好指标：完成率=实绩/目标×100%">
        <EnergyBarChart
          x={data.rows.map((r) => r.scopeName)}
          series={[{
            name: '完成率',
            data: data.rows.map((r) => r.achievement === null ? null : Math.round(r.achievement)),
            color: '#1668dc',
          }]}
          unit="%"
          height={290}
          showLegend={false}
        />
      </ChartCard>
      <div className="muted small mt8">
        超标原因归因示例：格物楼单位面积电耗（不含实验设备专项）已剔除24小时必要运行回路单独计量的部分；
        食堂餐均指标在供餐量缺失月份不参与考核（假期停业月）。
      </div>

      <Modal
        title={`调整节能目标：${editTarget?.indicator ?? ''}`}
        open={!!editTarget}
        onOk={saveTarget}
        onCancel={() => setEditTarget(null)}
        okText="保存（审计留痕）"
        cancelText="取消"
      >
        <Space direction="vertical" size={6}>
          <div className="small">目标对象：{editTarget?.scopeName}；单位：{editTarget?.unit}</div>
          <InputNumber value={editValue} onChange={(v) => setEditValue(v ?? 0)} style={{ width: 200 }} />
          <div className="muted small">目标调整保留原版本；考核口径变更需主管批准。</div>
        </Space>
      </Modal>
    </div>
  );
}