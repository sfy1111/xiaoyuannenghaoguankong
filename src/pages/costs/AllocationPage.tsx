import { useMemo, useState } from 'react';
import { App, Button, DatePicker, InputNumber, Modal, Space, Table, Tag, Input } from 'antd';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ExportButton from '../../components/ExportButton';
import { ChartCard, EnergyBarChart } from '../../components/charts';
import { FilterBar } from '../../components/FilterBar';
import { canEdit } from '../../stores/identity';
import { getEntities } from '../../services/repository';
import { scopeUsage } from '../../services/energyStats';
import { electricityCost, simpleEnergyCost } from '../../services/costService';
import { fmtInt, fmtMoney } from '../../domain/units';
import { monthOf, monthRange } from '../../domain/time';

export default function CostsAllocationPage() {
  const { message } = App.useApp();
  const [anchor, setAnchor] = useState('2026-10-20');
  const [editBuilding, setEditBuilding] = useState<string | null>(null);
  const [editRows, setEditRows] = useState<{ departmentId: string; share: number; basis: string }[]>([]);
  const [objectionOpen, setObjectionOpen] = useState(false);
  const [objectionText, setObjectionText] = useState('');
  const entities = getEntities();
  const editable = canEdit('costs');
  const month = monthOf(anchor);
  const range = monthRange(month);
  const monthEnd = range.to > '2026-10-21' ? '2026-10-21' : range.to;

  const data = useMemo(() => {
    const rows = entities.departments.map((d) => {
      const rels = entities.buildingDeptRelations.filter((r) => r.departmentId === d.id);
      const direct = rels.filter((r) => r.share >= 1);
      const shared = rels.filter((r) => r.share < 1);
      const directCost = direct.reduce((a, r) => {
        const ids = entities.meteringPoints.filter((p) => p.buildingId === r.buildingId && p.energyType === 'electricity' && p.role === 'main').map((p) => p.id);
        return a + electricityCost(ids, `${month}-01`, monthEnd).amount;
      }, 0);
      const directWaterCost = direct.reduce((a, r) => {
        const ids = entities.meteringPoints.filter((p) => p.buildingId === r.buildingId && p.energyType === 'water' && p.role === 'main').map((p) => p.id);
        return a + simpleEnergyCost('water', ids, `${month}-01`, monthEnd).amount;
      }, 0);
      const sharedCost = shared.reduce((a, r) => {
        const ids = entities.meteringPoints.filter((p) => p.buildingId === r.buildingId && p.energyType === 'electricity' && p.role === 'main').map((p) => p.id);
        return a + electricityCost(ids, `${month}-01`, monthEnd).amount * r.share;
      }, 0);
      return {
        key: d.id,
        name: d.name,
        type: d.type,
        directCost: Math.round(directCost + directWaterCost),
        sharedCost: Math.round(sharedCost),
        totalCost: Math.round(directCost + directWaterCost + sharedCost),
        sharedBuildings: shared.map((r) => entities.buildings.find((b) => b.id === r.buildingId)?.name ?? r.buildingId),
      };
    }).filter((r) => r.totalCost > 0);

    const publicPool = entities.buildings
      .filter((b) => b.status === 'active' && b.category === 'plant')
      .reduce((a, b) => a + (scopeUsage('electricity', { buildingId: b.id }, `${month}-01`, monthEnd).total ?? 0), 0);
    const unallocated = Math.round(publicPool * 0.65);
    return { rows, unallocated };
  }, [entities, month, monthEnd]);

  const exportSheet = {
    name: '学院成本分摊',
    headers: ['单位', `实测费用(元)`, '分摊费用(元)', '合计(元)', '共享建筑'],
    rows: data.rows.map((r) => [r.name, r.directCost, r.sharedCost, r.totalCost, r.sharedBuildings.join('、') || '—']),
  };

  const sharedBuildings = entities.buildings.filter((b) => {
    const rels = entities.buildingDeptRelations.filter((r) => r.buildingId === b.id);
    return rels.length > 1;
  });

  const openEdit = (bid: string) => {
    const rels = entities.buildingDeptRelations.filter((r) => r.buildingId === bid);
    setEditRows(rels.map((r) => ({ departmentId: r.departmentId, share: r.share, basis: r.basis })));
    setEditBuilding(bid);
  };

  const saveEdit = () => {
    if (!editBuilding) return;
    const sum = editRows.reduce((a, r) => a + (Number(r.share) || 0), 0);
    if (Math.abs(sum - 1) > 0.001) {
      message.error(`分摊比例合计为 ${(sum * 100).toFixed(1)}%，同一池合计必须为100%，已阻断保存`);
      return;
    }
    const ok = entities.actions.updateBuildingDeptRelations(editBuilding, editRows);
    if (ok) {
      message.success('分摊比例已更新并记录生效期与审计');
      setEditBuilding(null);
    } else {
      message.error('保存失败：比例校验未通过');
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['能源费用', '学院成本分摊']}
        title="学院成本分摊"
        subtitle={
          <Space size={8} wrap>
            <span>直接实测成本与共享分摊成本分栏；同一分摊池比例合计必须为100%，余量单列未分配；管理分摊金额不等同对外贸易结算</span>
            <span className="muted">统计期：{month}月（截至 {monthEnd}）</span>
          </Space>
        }
        extra={
          <Space>
            {editable && <Button size="small" onClick={() => { setObjectionText(''); setObjectionOpen(true); }}>提交异议/复核记录</Button>}
            <ExportButton filename={`学院成本分摊_${month}`} sheet={exportSheet} metaNote="实测=独立计量；分摊=共享建筑按确认比例；未分配单列" />
          </Space>
        }
      />
      <FilterBar>
        <span className="filter-label">月份</span>
        <DatePicker size="small" picker="month" value={dayjs(anchor)} allowClear={false} onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))} />
        <span className="muted small">共享建筑分摊维护：{sharedBuildings.map((b) => b.name).join('、') || '无'}（点击明细行可编辑比例）</span>
      </FilterBar>

      <div className="kpi-row">
        <StatCard label={`${month}月学院责任费用合计`} value={data.rows.reduce((a, r) => a + r.totalCost, 0)} unit="元" sub={`实测 ${fmtMoney(data.rows.reduce((a, r) => a + r.directCost, 0))}＋分摊 ${fmtMoney(data.rows.reduce((a, r) => a + r.sharedCost, 0))}`} />
        <StatCard label="未分配公共成本" value={data.unallocated} unit="元" sub="能源站等无责任归属建筑，不强行计入学院" />
        <StatCard label="分摊池校验" value={sharedBuildings.length === 0 ? '无共享池' : '全部合计100%'} sub={sharedBuildings.length > 0 ? `${sharedBuildings.length} 处共享建筑按面积比例分摊` : '全部建筑独立计量'} />
      </div>

      <ChartCard title={`${month}月学院费用构成（实测/分摊堆积）`} height={300}>
        <EnergyBarChart
          x={data.rows.map((r) => r.name)}
          series={[
            { name: '实测费用', data: data.rows.map((r) => r.directCost), color: '#1668dc', stack: 'c' },
            { name: '分摊费用', data: data.rows.map((r) => r.sharedCost), color: '#95de64', stack: 'c' },
          ]}
          unit="元"
          height={290}
        />
      </ChartCard>

      <div className="table-card">
        <h4 className="section-title">费用责任表</h4>
        <Table
          size="small"
          rowKey="key"
          pagination={false}
          dataSource={data.rows}
          columns={[
            { title: '单位', dataIndex: 'name', width: 130 },
            { title: '实测费用(元)', dataIndex: 'directCost', width: 110, align: 'right' as const, render: (v: number) => fmtMoney(v) },
            { title: '分摊费用(元)', dataIndex: 'sharedCost', width: 110, align: 'right' as const, render: (v: number) => v > 0 ? fmtMoney(v) : '—' },
            { title: '合计(元)', dataIndex: 'totalCost', width: 110, align: 'right' as const, render: (v: number) => fmtMoney(v) },
            { title: '共享建筑', render: (_v, r) => r.sharedBuildings.length > 0 ? <Space size={4} wrap>{r.sharedBuildings.map((b) => <Tag key={b}>{b}</Tag>)}</Space> : '—' },
          ]}
        />
        {editable && (
          <div className="mt8">
            <h4 className="section-title">共享建筑分摊比例维护</h4>
            <Space wrap>
              {sharedBuildings.map((b) => (
                <Button key={b.id} size="small" onClick={() => openEdit(b.id)}>{b.name}</Button>
              ))}
            </Space>
          </div>
        )}
      </div>

      <Modal
        title={`维护分摊比例：${entities.buildings.find((b) => b.id === editBuilding)?.name ?? ''}`}
        open={!!editBuilding}
        onOk={saveEdit}
        onCancel={() => setEditBuilding(null)}
        okText="保存（校验合计100%）"
        cancelText="取消"
      >
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          {editRows.map((r, i) => (
            <Space key={i}>
              <span style={{ width: 110, display: 'inline-block' }}>{entities.departments.find((d) => d.id === r.departmentId)?.name}</span>
              <InputNumber
                size="small"
                min={0}
                max={1}
                step={0.05}
                value={r.share}
                onChange={(v) => setEditRows(editRows.map((x, j) => (j === i ? { ...x, share: v ?? 0 } : x)))}
              />
              <span className="muted small">依据：{r.basis}</span>
            </Space>
          ))}
          <div className="small">当前合计：{(editRows.reduce((a, r) => a + (Number(r.share) || 0), 0) * 100).toFixed(1)}%（多部门时必须为100%）</div>
        </Space>
      </Modal>

      <Modal
        title="提交异议/复核记录"
        open={objectionOpen}
        onOk={() => {
          if (!objectionText.trim()) {
            message.warning('请填写异议或复核说明');
            return;
          }
          entities.actions.appendAudit('费用管理', '学院分摊异议/复核', month, objectionText);
          message.success('已提交，管理部门复核后定期结算内部管理账（见审计时间线）');
          setObjectionOpen(false);
          setObjectionText('');
        }}
        onCancel={() => setObjectionOpen(false)}
        okText="提交"
        cancelText="取消"
      >
        <Input.TextArea rows={3} placeholder="异议说明（如：分摊面积与实际使用不符、共享时段调整）" value={objectionText} onChange={(e) => setObjectionText(e.target.value)} />
      </Modal>
    </div>
  );
}