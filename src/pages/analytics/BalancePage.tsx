import { useMemo, useState } from 'react';
import { Segmented, Space, Table, Tag, DatePicker, Modal, Input, Select, App } from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import ExportButton from '../../components/ExportButton';
import { ChartCard, EnergySankey } from '../../components/charts';
import { CampusSelect, FilterBar } from '../../components/FilterBar';
import { useFilters } from '../../stores/filters';
import { userScope, canEdit } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';
import { campusBalance } from '../../services/energyStats';
import { ENERGY_LABEL, fmtInt } from '../../domain/units';
import { lastNDays } from '../../domain/time';

type EnergyTab = 'electricity' | 'water' | 'cooling' | 'heat';

const TAB_LABEL: Record<EnergyTab, string> = {
  electricity: '电力',
  water: '供水',
  cooling: '供冷',
  heat: '供热',
};

export default function AnalysisBalancePage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { campusId } = useFilters();
  const [tab, setTab] = useState<EnergyTab>('electricity');
  const [anchor, setAnchor] = useState('2026-10-20');
  const [modalOpen, setModalOpen] = useState(false);
  const [suggest, setSuggest] = useState('');
  const [suggestType, setSuggestType] = useState('补计量建议');
  const entities = getEntities();
  const scope = useMemo(() => userScope(campusId), [campusId]);

  const from = lastNDays(anchor, 30)[0];
  const to = anchor;

  const balances = useMemo(() => {
    const campusIds = campusId === 'all' ? ['C-E', 'C-W'] : [campusId];
    return campusIds
      .filter((c) => c === scope.campusId || scope.campusId === 'all')
      .map((cid) => ({ cid, bal: campusBalance(cid, tab, from, to) }));
  }, [campusId, scope, tab, from, to]);

  const sankey = useMemo(() => {
    if (balances.length === 0) return null;
    const b = balances[0];
    const nodes: { name: string }[] = [];
    const links: { source: string; target: string; value: number }[] = [];
    const entranceName = `${TAB_LABEL[tab]}入口`;
    nodes.push({ name: entranceName });
    for (const r of b.bal.buildingRows) {
      nodes.push({ name: r.name });
      links.push({ source: entranceName, target: r.name, value: r.total });
    }
    for (const r of b.bal.publicRows) {
      nodes.push({ name: r.name });
      links.push({ source: entranceName, target: r.name, value: r.total });
    }
    if (b.bal.uncovered !== null && b.bal.uncovered > 0) {
      nodes.push({ name: '未分项/计量差额' });
      links.push({ source: entranceName, target: '未分项/计量差额', value: b.bal.uncovered });
    }
    return { nodes, links, campus: b.cid };
  }, [balances]);

  const exportSheet = {
    name: '能源平衡',
    headers: ['校区', '能源', `边界总量（${tab === 'water' ? 'm³' : 'kWh'}）`, '建筑合计', '公共设施', '已覆盖合计', '未分项差额', '差额占比(%)'],
    rows: balances.map(({ cid, bal }) => [
      entities.campuses.find((c) => c.id === cid)?.name ?? cid,
      TAB_LABEL[tab],
      bal.boundary.total ?? '缺失',
      Math.round(bal.buildingTotal),
      Math.round(bal.publicTotal),
      Math.round(bal.coveredTotal),
      bal.uncovered === null ? '—' : Math.round(bal.uncovered),
      bal.uncoveredPct === null ? '不可计算' : bal.uncoveredPct.toFixed(1),
    ]),
  };

  const submitSuggestion = () => {
    if (!suggest.trim()) {
      message.warning('请填写建议内容');
      return;
    }
    entities.actions.createWorkOrder(
      {
        title: `${TAB_LABEL[tab]}计量覆盖排查建议`,
        source: '人工创建（能源平衡分析）',
        alertId: null,
        type: suggestType,
        campusId: campusId === 'all' ? 'C-E' : campusId,
        buildingId: null,
        pointId: null,
        assignee: '王建国',
        assigneeDept: '后勤保障处能源管理办公室',
        priority: 'medium',
        deadline: dayjs(META.asOf).add(14, 'day').format('YYYY-MM-DD'),
      },
      '张启明',
    );
    message.success('已生成补计量建议工单，可在「告警与工单→运维工单」查看进度');
    setModalOpen(false);
    setSuggest('');
    navigate('/work-orders');
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['能耗分析', '能源平衡与计量覆盖']}
        title="能源平衡与计量覆盖"
        subtitle={
          <Space size={8} wrap>
            <span>入口（购入/产出）与已确认分项分别统计，差额仅称“未分项/计量差额”，未经证实不解释为线路损耗</span>
            <span className="muted">统计期：近30日（{from} 至 {to}）</span>
          </Space>
        }
        extra={<ExportButton filename={`能源平衡_${anchor}`} sheet={exportSheet} metaNote={`统计期：${from}至${to}；边界：${TAB_LABEL[tab]}入口/产出总表；生成时间：${dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}`} />}
      />
      <FilterBar>
        <span className="filter-label">校区</span>
        <CampusSelect value={campusId} onChange={(v) => useFilters.getState().setCampus(v)} />
        <span className="filter-label">能源</span>
        <Segmented size="small" value={tab} options={(Object.keys(TAB_LABEL) as EnergyTab[]).map((t) => ({ value: t, label: TAB_LABEL[t] }))} onChange={(v) => setTab(v as EnergyTab)} />
        <span className="filter-label">截止</span>
        <DatePicker size="small" value={dayjs(anchor)} allowClear={false} onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))} />
        {canEdit('foundation') && (
          <a onClick={() => setModalOpen(true)}>发起补计量建议单</a>
        )}
      </FilterBar>

      {tab === 'cooling' || tab === 'heat' ? (
        <div className="muted mb12" style={{ background: '#fff', padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)' }}>
          {TAB_LABEL[tab]}为西校区能源站集中供能系统，产出侧总表与建筑侧计量分别统计；能源站输入电/气与产出冷热为能源转换关系，不重复计入能源消费总量。
          {anchor.slice(5, 7) >= '05' && anchor.slice(5, 7) <= '09' && tab === 'heat' && ' 当前为非供暖季，供热数据为0属正常。'}
          {tab === 'cooling' && (anchor.slice(5, 7) < '05' || anchor.slice(5, 7) > '09') && ' 当前为非制冷季，供冷数据为0属正常。'}
        </div>
      ) : null}

      <div className="chart-grid c2">
        {sankey && (
          <ChartCard
            title={`${entities.campuses.find((c) => c.id === sankey.campus)?.name} ${TAB_LABEL[tab]}计量流向（近30日）`}
            height={400}
            note="流向图为计量关系示意，节点为计量对象；未分项差额为入口-已覆盖部分"
          >
            <EnergySankey nodes={sankey.nodes} links={sankey.links} height={390} />
          </ChartCard>
        )}
        <div className="table-card" style={{ background: '#fff', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)', padding: '8px 12px' }}>
          <h4 className="section-title">平衡明细表</h4>
          <Table
            size="small"
            rowKey={(r) => r.key}
            pagination={false}
            scroll={{ y: 330 }}
            dataSource={[
              ...balances[0]?.bal.buildingRows.map((r) => ({ key: r.buildingId, name: r.name, kind: '建筑', total: r.total })) ?? [],
              ...balances[0]?.bal.publicRows.map((r) => ({ key: r.pointId, name: r.name, kind: '公共设施', total: r.total })) ?? [],
              ...balances.slice(1).flatMap(({ cid, bal }) => [
                { key: cid + '-boundary', name: `${entities.campuses.find((c) => c.id === cid)?.name}入口`, kind: '校区边界', total: bal.boundary.total ?? 0 },
                { key: cid + '-uncovered', name: `${entities.campuses.find((c) => c.id === cid)?.name}未分项`, kind: '差额', total: bal.uncovered ?? 0 },
              ]),
            ]}
            columns={[
              { title: '计量对象', dataIndex: 'name' },
              { title: '类型', dataIndex: 'kind', width: 90, render: (k: string) => <Tag>{k}</Tag> },
              { title: `近30日${tab === 'water' ? '用量(m³)' : '用量(kWh)'}`, dataIndex: 'total', align: 'right' as const, render: (v: number) => fmtInt(Math.round(v)) },
            ]}
          />
          <Space direction="vertical" size={4} className="mt8">
            {balances.map(({ cid, bal }) => (
              <div key={cid}>
                <b>{entities.campuses.find((c) => c.id === cid)?.name}</b>：
                {ENERGY_LABEL[tab]}入口 {fmtInt(Math.round(bal.boundary.total ?? 0))}，已覆盖 {fmtInt(Math.round(bal.coveredTotal))}，
                差额 <span style={{ color: bal.anomaly ? '#cf1322' : undefined }}>{fmtInt(Math.round(bal.uncovered ?? 0))}</span>（{bal.uncoveredPct === null ? '不可计算' : bal.uncoveredPct.toFixed(1) + '%'}）
                {bal.anomaly && <Tag color="red" style={{ marginLeft: 6 }}>计量关系异常</Tag>}
              </div>
            ))}
            <div className="muted small">
              完整或交叉计量时不得给出精确线损/漏损结论；如需排查计量覆盖，前往
              <a onClick={() => navigate('/base/metering')}>计量关系维护</a>
              查看参与计算点位。
            </div>
          </Space>
        </div>
      </div>

      <Modal
        title="发起补计量建议单"
        open={modalOpen}
        onOk={submitSuggestion}
        onCancel={() => setModalOpen(false)}
        okText="生成工单"
        cancelText="取消"
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div className="small">建议类型</div>
          <Select style={{ width: '100%' }} value={suggestType} onChange={setSuggestType} options={[
            { value: '补计量建议', label: '补计量建议（增设计量点）' },
            { value: '计量核查', label: '计量核查（排查表计异常）' },
          ]} />
          <div className="small">建议内容（将生成运维工单并纳入审计）</div>
          <Input.TextArea
            rows={4}
            value={suggest}
            onChange={(e) => setSuggest(e.target.value)}
            placeholder={`例如：${TAB_LABEL[tab]}未分项差额占比偏高，建议对配电房备用回路/绿化片区增设计量点`}
          />
        </Space>
      </Modal>
    </div>
  );
}