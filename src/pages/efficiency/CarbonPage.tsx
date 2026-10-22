import { useMemo, useState } from 'react';
import { App, Input, InputNumber, Modal, Space, Table, Tooltip } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import RangeModeControl from '../../components/RangeModeControl';
import ExportButton from '../../components/ExportButton';
import { ChartCard, EnergyBarChart, EnergyPieChart } from '../../components/charts';
import { CampusSelect, FilterBar } from '../../components/FilterBar';
import { useFilters, currentRange } from '../../stores/filters';
import { userScope, canEdit } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';
import { getCarbonFactors, carbonSummary, carbonTrend, buildingCarbonRows, carbonAreaDenominator } from '../../services/carbonService';
import { CATEGORY_LABEL, fmtInt } from '../../domain/units';

const SCOPE_COLORS = { scope1: '#fa8c16', scope2: '#1668dc' };

export default function CarbonPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { campusId, dateMode, date } = useFilters();
  const [editFactor, setEditFactor] = useState<string | null>(null);
  const [factorValue, setFactorValue] = useState<number>(0);
  const [factorReason, setFactorReason] = useState('');
  const entities = getEntities();
  const scope = useMemo(() => userScope(campusId), [campusId]);
  const range = useMemo(() => currentRange(dateMode, date), [dateMode, date]);
  const factors = getCarbonFactors();
  const factorEditable = canEdit('targets');

  const data = useMemo(() => {
    const summary = carbonSummary(scope.campusId, range.from, range.to);
    const trend = carbonTrend(scope.campusId, date, 12);
    const buildingRows = buildingCarbonRows(scope.campusId, range.from, range.to);
    const area = carbonAreaDenominator(scope.campusId);
    const intensity = summary && area > 0 ? summary.total / area : null;
    return { summary, trend, buildingRows, area, intensity };
  }, [scope, range, date]);

  if (!data.summary) {
    return (
      <div>
        <PageHeader
          breadcrumb={['节能管理', '碳排放核算']}
          title="碳排放核算"
          subtitle="排放因子未配置，不展示测算数值（不提供无依据的碳排放数字）"
          extra={<RangeModeControl />}
        />
      </div>
    );
  }

  const submitFactor = () => {
    if (!editFactor) return;
    if (!factorReason.trim()) {
      message.warning('请填写调整理由（审计留痕，因子须以最新官方发布为准）');
      return;
    }
    const ok = entities.actions.updateCarbonFactor(editFactor, factorValue, factorReason);
    if (ok) {
      message.success('排放因子已更新，测算结果已按新因子重算（历史供能数据不变）');
    } else {
      message.error('因子值必须为正数');
    }
    setEditFactor(null);
    setFactorReason('');
  };

  const exportSheet = {
    name: '碳排放测算',
    headers: ['项目', '数值', '单位', '口径'],
    rows: [
      ['统计期间', `${range.from} 至 ${range.to}`, '', range.label],
      ['范围一排放（天然气燃烧）', data.summary.scope1.co2, 'tCO₂', `气量 ${fmtInt(Math.round(data.summary.scope1.usage))} m³ × ${factors.gas?.value} ${factors.gas?.usageUnit}`],
      ['范围二排放（外购电力）', data.summary.scope2.co2, 'tCO₂', `电量 ${fmtInt(Math.round(data.summary.scope2.usage))} kWh × ${factors.grid?.value} ${factors.grid?.usageUnit}`],
      ['合计排放', data.summary.total, 'tCO₂', '范围一+范围二'],
      ['单位面积排放强度', data.intensity === null ? '不可计算' : (data.intensity / 1000).toFixed(5), 'tCO₂/m²', `分母：考核面积合计 ${fmtInt(data.area)} m²`],
    ],
  };

  const trendEnd = date;
  const trendStart = data.trend[0]?.month ?? '';

  return (
    <div>
      <PageHeader
        breadcrumb={['节能管理', '碳排放核算']}
        title="碳排放核算（范围一/范围二）"
        subtitle={
          <Space size={8} wrap>
            <span>统计区间：{range.label}{range.partialNote ? `（${range.partialNote}）` : ''}</span>
            <span className="muted">口径：购入电力（进线关口表）与购入天然气；内部转换冷/热/热水不重复计入</span>
            <span className="muted">数据更新：{dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}</span>
          </Space>
        }
        extra={
          <Space>
            <RangeModeControl />
            <ExportButton filename={`碳排放测算_${range.from}_${range.to}`} sheet={exportSheet} metaNote={`测算口径与排放因子来源随导出；因子版本以官方发布为准；生成时间：${dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}`} />
          </Space>
        }
      />
      <FilterBar>
        <span className="filter-label">校区</span>
        <CampusSelect value={campusId} onChange={(v) => useFilters.getState().setCampus(v)} />
        <span className="muted small">水为资源消耗，不属于温室气体核算对象；光伏未启用，无绿电抵扣项</span>
      </FilterBar>

      <div className="kpi-row">
        <StatCard
          label="范围二排放（外购电力）"
          value={data.summary.scope2.co2}
          unit="tCO₂"
          decimals={1}
          sub={`购入电量 ${fmtInt(Math.round(data.summary.scope2.usage))} kWh × ${factors.grid?.value} ${factors.grid?.usageUnit}`}
          qualityNote={data.summary.incomplete ? '用量存在缺失/无效样本，测算值不含该部分' : undefined}
        />
        <StatCard
          label="范围一排放（天然气燃烧）"
          value={data.summary.scope1.co2}
          unit="tCO₂"
          decimals={1}
          sub={`购入气量 ${fmtInt(Math.round(data.summary.scope1.usage))} m³ × ${factors.gas?.value} ${factors.gas?.usageUnit}`}
        />
        <StatCard
          label={`合计排放（${range.label}）`}
          value={data.summary.total}
          unit="tCO₂"
          decimals={1}
          sub="范围一 + 范围二"
        />
        <StatCard
          label="单位面积排放强度"
          value={data.intensity === null ? '不可计算' : Math.round(data.intensity * 1000) / 1000}
          unit={data.intensity === null ? undefined : 'tCO₂/㎡'}
          decimals={3}
          sub={`分母：考核面积合计 ${fmtInt(data.area)} m²（在用建筑）`}
        />
      </div>

      <div className="chart-grid c2">
        <ChartCard
          title={`近12月排放趋势（${trendStart} 至 ${trendEnd.slice(0, 7)}，tCO₂）`}
          height={320}
          note="固定近12月窗口；柱体为范围一+范围二堆积，与购入能源量同口径"
        >
          <EnergyBarChart
            x={data.trend.map((r) => r.month.slice(2))}
            series={[
              { name: '范围一（天然气）', data: data.trend.map((r) => r.scope1), color: SCOPE_COLORS.scope1, stack: 'co2' },
              { name: '范围二（外购电力）', data: data.trend.map((r) => r.scope2), color: SCOPE_COLORS.scope2, stack: 'co2' },
            ]}
            unit="tCO₂"
            height={310}
          />
        </ChartCard>
        <ChartCard title={`排放构成（${range.label}）`} height={320} note="同单位（tCO₂）构成；范围一为直接排放，范围二为间接排放">
          <EnergyPieChart
            data={[
              { name: `范围二·外购电力`, value: data.summary.scope2.co2, color: SCOPE_COLORS.scope2 },
              { name: `范围一·天然气`, value: data.summary.scope1.co2, color: SCOPE_COLORS.scope1 },
            ].filter((d) => d.value > 0)}
            unit="tCO₂"
            height={310}
          />
        </ChartCard>
      </div>

      <div className="chart-grid c2">
        <ChartCard
          title={`建筑碳排放排行（${range.label}，已计量部分）`}
          height={340}
          note="按建筑主表电量+建筑气量折算；校区合计按购入边界（含未分项差额），故略高于本表合计"
        >
          <EnergyBarChart
            x={data.buildingRows.slice(0, 12).map((r) => r.name.length > 7 ? r.name.slice(0, 7) + '…' : r.name)}
            series={[{ name: '折算排放', data: data.buildingRows.slice(0, 12).map((r) => Math.round(r.co2 * 10) / 10), color: '#595959' }]}
            unit="tCO₂"
            height={330}
            showLegend={false}
            onEvent={(p) => {
              const found = data.buildingRows.find((r) => (r.name.length > 7 ? r.name.slice(0, 7) + '…' : r.name) === p.name);
              if (found) navigate(`/monitor/building/${found.id}?from=${range.from}&to=${range.to}&campus=${campusId}`);
            }}
          />
        </ChartCard>
        <div className="table-card" style={{ background: '#fff', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)', padding: '8px 12px' }}>
          <h4 className="section-title">排放因子配置（参数化，来源可查）</h4>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={entities.carbonFactors}
            columns={[
              { title: '因子', dataIndex: 'name', width: 170, ellipsis: true },
              { title: '数值', dataIndex: 'value', width: 90, align: 'right' as const },
              { title: '单位', dataIndex: 'usageUnit', width: 110 },
              { title: '范围', dataIndex: 'scope', width: 170, ellipsis: true },
              {
                title: '来源/版本', ellipsis: true,
                render: (_v, f) => (
                  <Tooltip title={`${f.source}（${f.version}）${f.note ? '；' + f.note : ''}`}>
                    <span className="small">{f.source}</span>
                  </Tooltip>
                ),
              },
              ...(factorEditable ? [{
                title: '', width: 60,
                render: (_v: unknown, f: { id: string; value: number }) => (
                  <a onClick={() => { setEditFactor(f.id); setFactorValue(f.value); setFactorReason(''); }}><EditOutlined /> 维护</a>
                ),
              }] : []),
            ]}
          />
          <div className="muted small mt8">
            边界说明：范围一=食堂/锅炉天然气燃烧；范围二=外购电力。能源站由电/气转换产出的冷量、热量、生活热水
            <b>不重复计入</b>（其输入能源已在上述范围核算）；用水不作为温室气体核算对象。
            测算值供校内管理参考，<b>非经第三方核证的碳盘查结果</b>；正式上报须按适用标准的核算与核证要求执行。
          </div>
        </div>
      </div>

      <div className="muted small mt8">
        建筑排行点击可进入楼宇详情追溯用能来源；因子维护即时生效并写入审计（时间线见系统管理→审计）。
      </div>

      <Modal
        title={`维护排放因子：${entities.carbonFactors.find((f) => f.id === editFactor)?.name ?? ''}`}
        open={!!editFactor}
        onOk={submitFactor}
        onCancel={() => setEditFactor(null)}
        okText="保存（测算重算）"
        cancelText="取消"
      >
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <div className="small">当前值：{entities.carbonFactors.find((f) => f.id === editFactor)?.value} {entities.carbonFactors.find((f) => f.id === editFactor)?.usageUnit}</div>
          <InputNumber value={factorValue} onChange={(v) => setFactorValue(v ?? 0)} step={0.0001} style={{ width: 200 }} />
          <Input value={factorReason} onChange={(e) => setFactorReason(e.target.value)} placeholder="调整理由（必填：以最新官方发布为准）" />
          <div className="muted small">因子变更不修改历史用能数据，仅重算排放测算值；变更记录写入审计。</div>
        </Space>
      </Modal>
    </div>
  );
}