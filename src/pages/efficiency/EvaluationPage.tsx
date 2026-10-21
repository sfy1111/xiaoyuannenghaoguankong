import { useMemo, useState } from 'react';
import { DatePicker, Space, Table, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ExportButton from '../../components/ExportButton';
import { ChartCard, EnergyBarChart } from '../../components/charts';
import { CampusSelect, FilterBar } from '../../components/FilterBar';
import { useFilters } from '../../stores/filters';
import { userScope } from '../../stores/identity';
import { getEntities } from '../../services/repository';
import { scopeUsage } from '../../services/energyStats';
import { intensity } from '../../domain/analysis';
import { CATEGORY_LABEL, fmtInt } from '../../domain/units';
import { lastNDays } from '../../domain/time';

export default function EfficiencyEvaluationPage() {
  const { campusId } = useFilters();
  const [anchor, setAnchor] = useState('2026-10-20');
  const entities = getEntities();
  const scope = useMemo(() => userScope(campusId), [campusId]);
  const projects = entities.projects;

  const rows = useMemo(() => {
    const from = lastNDays(anchor, 30)[0];
    return entities.buildings
      .filter((b) => b.status === 'active' && (scope.campusId === 'all' || b.campusId === scope.campusId) && (!scope.buildingIds || scope.buildingIds.includes(b.id)))
      .map((b) => {
        const u = scopeUsage('electricity', { buildingId: b.id }, from, anchor);
        const hasSpecial = entities.meteringPoints.some((p) => p.buildingId === b.id && p.subitem === '特殊用电' && p.alwaysOn);
        return {
          key: b.id,
          id: b.id,
          name: b.name,
          category: CATEGORY_LABEL[b.category],
          area: b.assessmentArea,
          usage: u.total ?? 0,
          int: intensity(u.total, b.assessmentArea),
          coverage: u.coverage,
          comparable: b.assessmentArea > 0 && u.coverage >= 0.9,
          hasSpecial,
        };
      })
      .filter((r) => r.usage > 0)
      .sort((a, b) => (b.int ?? -1) - (a.int ?? -1));
  }, [anchor, entities, scope]);

  const publicRows = rows.filter((r) => r.comparable && !r.hasSpecial);

  const exportSheet = {
    name: '节能公示',
    headers: ['建筑', '类别', '近30日用电(kWh)', '单位面积电耗(kWh/m²)', '是否可比', '含专项设备'],
    rows: publicRows.map((r) => [r.name, r.category, Math.round(r.usage), r.int === null ? '不可计算' : r.int.toFixed(3), r.comparable ? '可比' : '不可比', r.hasSpecial ? '是（单独列示）' : '否']),
  };

  const cases = projects.filter((p) => p.status === 'completed');

  return (
    <div>
      <PageHeader
        breadcrumb={['节能管理', '节能公示与考核']}
        title="节能公示与管理考核"
        subtitle={
          <Space size={8} wrap>
            <span>对外展示不含学生房间与个人敏感信息；未达可比条件建筑不发布结论性评价排名</span>
            <span className="muted">统计期：近30日（至 {anchor}）</span>
          </Space>
        }
        extra={<ExportButton filename="节能公示排行" sheet={exportSheet} metaNote={`公示范围：样本有效率≥90%且考核面积有效的建筑；统计期${lastNDays(anchor, 30)[0]}至${anchor}`} />}
      />
      <FilterBar>
        <span className="filter-label">校区</span>
        <CampusSelect value={campusId} onChange={(v) => useFilters.getState().setCampus(v)} />
        <span className="filter-label">截止</span>
        <DatePicker size="small" value={dayjs(anchor)} allowClear={false} onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))} />
        <span className="muted small">可比条件：考核面积有效、样本有效率≥90%、无未剥离的24小时专项设备</span>
      </FilterBar>

      <div className="kpi-row">
        <StatCard label="可比建筑数" value={publicRows.length} unit={`栋`} sub={`共 ${rows.length} 栋参与统计，其余标注不可比原因`} />
        <StatCard
          label="全校年度节电目标进度"
          value={(() => {
            const ytd = scopeUsage('electricity', { campusId }, '2026-01-01', anchor).total ?? 0;
            return ((ytd / 3100000) * 100).toFixed(1);
          })()}
          unit="%"
          sub="2026年购入电量目标≤310万kWh（较上年降3%）"
        />
        <StatCard label="已验收节能项目" value={cases.length} unit="个" sub={cases.map((c) => c.name.slice(0, 10)).join('、')} />
      </div>

      <ChartCard title="建筑单位面积电耗公示排行（近30日，仅可比建筑）" height={340} note="样本不足或含24小时专项设备的建筑不参与结论性排名，仅列示数据">
        <EnergyBarChart
          x={publicRows.slice(0, 16).map((r) => r.name.length > 8 ? r.name.slice(0, 8) + '…' : r.name)}
          series={[{ name: '单位面积电耗', data: publicRows.slice(0, 16).map((r) => r.int === null ? null : Math.round(r.int * 1000) / 1000), color: '#1668dc' }]}
          unit="kWh/m²"
          height={330}
          showLegend={false}
        />
      </ChartCard>

      <div className="table-card">
        <h4 className="section-title">公示明细（可嵌入校内展示屏/办公门户）</h4>
        <Table
          size="small"
          rowKey="key"
          pagination={false}
          dataSource={rows}
          columns={[
            {
              title: '排名', width: 60, render: (_v, r) => {
                const idx = publicRows.findIndex((x) => x.id === r.id);
                return idx >= 0 ? idx + 1 : <Tooltip title="不参与结论性排名"><span className="muted">—</span></Tooltip>;
              },
            },
            { title: '建筑', dataIndex: 'name' },
            { title: '类别', dataIndex: 'category', width: 100 },
            { title: '近30日用电(kWh)', dataIndex: 'usage', width: 120, align: 'right' as const, render: (v: number) => fmtInt(Math.round(v)) },
            { title: '单位面积电耗(kWh/m²)', dataIndex: 'int', width: 140, align: 'right' as const, render: (v: number | null) => v === null ? '不可计算' : v.toFixed(3) },
            {
              title: '可比性', width: 150,
              render: (_v, r) => r.comparable && !r.hasSpecial
                ? <Tag color="green">可比</Tag>
                : r.hasSpecial
                  ? <Tooltip title="含24小时必要运行设备（实验/IT/热泵），单独列示专项扣除"><Tag color="purple">含专项</Tag></Tooltip>
                  : <Tooltip title={`样本有效率 ${(r.coverage * 100).toFixed(0)}% 或面积无效`}><Tag color="orange">不可比</Tag></Tooltip>,
            },
          ]}
        />
      </div>

      <div className="chart-grid c2">
        <div className="table-card" style={{ background: '#fff', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)', padding: '8px 12px' }}>
          <h4 className="section-title">典型节能案例</h4>
          {cases.map((c) => (
            <div key={c.id} className="small" style={{ padding: '6px 0', borderBottom: '1px dashed rgba(0,0,0,0.08)' }}>
              <b>{c.name}</b>
              <div className="muted">{c.evaluation}</div>
            </div>
          ))}
        </div>
        <div className="table-card" style={{ background: '#fff', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)', padding: '8px 12px' }}>
          <h4 className="section-title">管理建议</h4>
          <div className="small" style={{ lineHeight: 1.8 }}>
            1. 教学楼假期日间持续负荷核查（结合巡查工单，见教学楼专题）；<br />
            2. 宿舍夜间最小流量异常完成现场排查后复核关闭告警；<br />
            3. 食堂餐均气量按月跟踪，供餐数据缺失月不参与考核；<br />
            4. 能源站COP持续监测，运行优化项目完成后归档评估；<br />
            5. 未分项计量差额按能源平衡页排查，必要时发起补计量建议单。
          </div>
        </div>
      </div>
    </div>
  );
}