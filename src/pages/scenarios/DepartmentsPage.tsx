import { useMemo, useState } from 'react';
import { App, Button, DatePicker, Input, Modal, Space, Table, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ExportButton from '../../components/ExportButton';
import { ChartCard, EnergyBarChart } from '../../components/charts';
import { CampusSelect, FilterBar } from '../../components/FilterBar';
import { useFilters } from '../../stores/filters';
import { userScope, canEdit } from '../../stores/identity';
import { getEntities } from '../../services/repository';
import { scopeUsage } from '../../services/energyStats';
import { electricityCost } from '../../services/costService';
import { CATEGORY_LABEL, fmtInt, fmtMoney } from '../../domain/units';
import { monthOf, monthRange } from '../../domain/time';

export default function ScenarioDepartmentsPage() {
  const { message } = App.useApp();
  const { campusId } = useFilters();
  const [anchor, setAnchor] = useState('2026-10-20');
  const entities = getEntities();
  const scope = useMemo(() => userScope(campusId), [campusId]);
  const editable = canEdit('costs');
  const month = monthOf(anchor);
  const range = monthRange(month);
  const monthEnd = range.to > '2026-10-21' ? '2026-10-21' : range.to;

  const data = useMemo(() => {
    const rows = entities.departments.map((d) => {
      const relations = entities.buildingDeptRelations.filter((r) => r.departmentId === d.id);
      const directBuildings = relations.filter((r) => r.share >= 1).map((r) => r.buildingId);
      const sharedRelations = relations.filter((r) => r.share < 1);

      const measuredUsage = directBuildings.reduce((a, bid) => {
        const u = scopeUsage('electricity', { buildingId: bid }, `${month}-01`, monthEnd);
        return a + (u.total ?? 0);
      }, 0);
      const allocatedUsage = sharedRelations.reduce((a, r) => {
        const u = scopeUsage('electricity', { buildingId: r.buildingId }, `${month}-01`, monthEnd);
        return a + (u.total ?? 0) * r.share;
      }, 0);

      const measuredCost = directBuildings.reduce((a, bid) => {
        const ids = entities.meteringPoints.filter((p) => p.buildingId === bid && p.energyType === 'electricity' && p.role === 'main').map((p) => p.id);
        return a + electricityCost(ids, `${month}-01`, monthEnd).amount;
      }, 0);
      const allocatedCost = sharedRelations.reduce((a, r) => {
        const ids = entities.meteringPoints.filter((p) => p.buildingId === r.buildingId && p.energyType === 'electricity' && p.role === 'main').map((p) => p.id);
        return a + electricityCost(ids, `${month}-01`, monthEnd).amount * r.share;
      }, 0);

      const area = relations.reduce((a, r) => {
        const b = entities.buildings.find((x) => x.id === r.buildingId);
        return a + (b ? b.assessmentArea * r.share : 0);
      }, 0);

      const unallocatedPool = entities.buildings.filter((b) =>
        b.status === 'active' && !entities.buildingDeptRelations.some((r) => r.buildingId === b.id),
      ).reduce((a, b) => a + (scopeUsage('electricity', { buildingId: b.id }, `${month}-01`, monthEnd).total ?? 0), 0);

      return {
        key: d.id,
        name: d.name,
        type: d.type,
        manager: d.manager,
        directCount: directBuildings.length,
        sharedCount: sharedRelations.length,
        measuredUsage: Math.round(measuredUsage),
        allocatedUsage: Math.round(allocatedUsage),
        totalUsage: Math.round(measuredUsage + allocatedUsage),
        measuredCost: Math.round(measuredCost),
        allocatedCost: Math.round(allocatedCost),
        totalCost: Math.round(measuredCost + allocatedCost),
        area: Math.round(area),
        unallocatedPool: Math.round(unallocatedPool),
        relations,
      };
    }).filter((r) => r.totalUsage > 0 || r.measuredCost > 0);

    const shareCheck = entities.buildings.map((b) => {
      const rels = entities.buildingDeptRelations.filter((r) => r.buildingId === b.id);
      const sum = rels.reduce((a, r) => a + r.share, 0);
      return { key: b.id, name: b.name, sum, ok: rels.length === 0 || Math.abs(sum - 1) < 0.001 };
    }).filter((r) => !r.ok);

    return { rows, shareCheck };
  }, [entities, month, monthEnd, scope]);

  const exportSheet = {
    name: '学院责任用能',
    headers: ['单位', '类型', '负责人', '实测用电(kWh)', '分摊用电(kWh)', '合计(kWh)', '实测费用(元)', '分摊费用(元)', '合计费用(元)', '责任面积(m²)'],
    rows: data.rows.map((r) => [
      r.name, r.type, r.manager, r.measuredUsage, r.allocatedUsage, r.totalUsage, r.measuredCost, r.allocatedCost, r.totalCost, r.area,
    ]),
  };

  const doConfirm = (deptName: string) => {
    entities.actions.appendAudit('校园专题', '学院责任确认', deptName, `${deptName}联络员确认${month}月责任用能与分摊结果，异议期结束`);
    message.success(`${deptName}确认已记录（时间线见审计页）`);
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['校园专题', '学院责任用能']}
        title="学院/责任部门用能"
        subtitle={
          <Space size={8} wrap>
            <span>实测与分摊分栏列示；分摊依据共享建筑面积/使用比例并展示生效期；学校公共能源单列未分配</span>
            <span className="muted">统计期：{month}月（截至 {monthEnd}）</span>
          </Space>
        }
        extra={<ExportButton filename={`学院责任用能_${month}`} sheet={exportSheet} metaNote={`实测=独立计量建筑主表；分摊=共享建筑×确认比例；管理分摊不等同对外结算`} />}
      />
      <FilterBar>
        <span className="filter-label">校区</span>
        <CampusSelect value={campusId} onChange={(v) => useFilters.getState().setCampus(v)} />
        <span className="filter-label">月份</span>
        <DatePicker size="small" picker="month" value={dayjs(anchor)} allowClear={false} onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))} />
        {data.shareCheck.length > 0 && <Tag color="red">{data.shareCheck.length} 处分摊比例合计异常</Tag>}
      </FilterBar>

      <div className="kpi-row">
        <StatCard label={`${month}月责任单位合计用电`} value={data.rows.reduce((a, r) => a + r.totalUsage, 0)} unit="kWh" sub={`其中实测 ${fmtInt(data.rows.reduce((a, r) => a + r.measuredUsage, 0))}，分摊 ${fmtInt(data.rows.reduce((a, r) => a + r.allocatedUsage, 0))}`} />
        <StatCard label={`${month}月责任费用合计`} value={data.rows.reduce((a, r) => a + r.totalCost, 0)} unit="元" sub="内部管理口径，不作对外结算" />
        <StatCard label="未分配公共用能" value={data.rows[0]?.unallocatedPool ?? 0} unit="kWh" sub="无责任归属建筑（如能源站）单列，不强行计入某学院" />
        <StatCard label="分摊比例校验" value={data.shareCheck.length === 0 ? '全部合规' : data.shareCheck.length + ' 处异常'} sub="同一池分摊比例合计须为100%" />
      </div>

      <ChartCard title={`${month}月学院责任用电对比（实测+分摊堆积）`} height={300} note="实测与分摊分开显示；共享资源不重复全额归属">
        <EnergyBarChart
          x={data.rows.map((r) => r.name)}
          series={[
            { name: '实测', data: data.rows.map((r) => r.measuredUsage), color: '#1668dc', stack: 'd' },
            { name: '分摊', data: data.rows.map((r) => r.allocatedUsage), color: '#95de64', stack: 'd' },
          ]}
          unit="kWh"
          height={290}
        />
      </ChartCard>

      <div className="table-card">
        <h4 className="section-title">责任单位明细</h4>
        <Table
          size="small"
          rowKey="key"
          pagination={false}
          dataSource={data.rows}
          columns={[
            { title: '单位', dataIndex: 'name', width: 120 },
            { title: '类型', dataIndex: 'type', width: 80, render: (t: string) => <Tag color={t === '学院' ? 'purple' : 'default'}>{t}</Tag> },
            { title: '实测用电(kWh)', dataIndex: 'measuredUsage', width: 110, align: 'right' as const },
            { title: '分摊用电(kWh)', dataIndex: 'allocatedUsage', width: 110, align: 'right' as const, render: (v: number) => v > 0 ? <Tooltip title="按共享建筑面积/使用比例分摊"><span style={{ color: '#389e0d' }}>{fmtInt(v)}</span></Tooltip> : '—' },
            { title: '合计(kWh)', dataIndex: 'totalUsage', width: 100, align: 'right' as const, render: (v: number) => fmtInt(v) },
            { title: '责任费用(元)', dataIndex: 'totalCost', width: 110, align: 'right' as const, render: (v: number) => fmtMoney(v) },
            { title: '责任面积(m²)', dataIndex: 'area', width: 100, align: 'right' as const, render: (v: number) => fmtInt(v) },
            {
              title: '操作', width: 80,
              render: (_v, r) => (
                <a onClick={() => doConfirm(r.name)}>确认</a>
              ),
            },
          ]}
          expandable={{
            expandedRowRender: (r) => (
              <div className="small">
                {r.relations.map((rel) => {
                  const b = entities.buildings.find((x) => x.id === rel.buildingId);
                  return (
                    <div key={rel.id}>
                      {b?.name}（{CATEGORY_LABEL[b?.category ?? 'teaching']}）：比例 {(rel.share * 100).toFixed(0)}%，依据：{rel.basis}，生效 {rel.validFrom}
                      {rel.share < 1 && '，计入分摊栏'}
                    </div>
                  );
                })}
                <div className="muted small mt8">共享成本不重复全额归属；分摊依据可追溯（历史版本见审计页）。</div>
              </div>
            ),
          }}
        />
        {data.shareCheck.length > 0 && (
          <div style={{ color: '#cf1322' }} className="small mt8">
            分摊比例异常：{data.shareCheck.map((s) => `${s.name}（合计${(s.sum * 100).toFixed(0)}%）`).join('、')}——无效分摊比例被阻断，请修正后重新确认。
          </div>
        )}
        {editable && <div className="muted small mt8">责任关系维护入口：基础档案→组织责任单位；分摊比例编辑会在保存时校验合计100%。</div>}
      </div>
    </div>
  );
}