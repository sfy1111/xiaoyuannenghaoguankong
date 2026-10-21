import { useMemo, useState } from 'react';
import { DatePicker, Drawer, Space, Table, Tag, Descriptions } from 'antd';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ExportButton from '../../components/ExportButton';
import { ChartCard, EnergyLineChart } from '../../components/charts';
import PointPreviewDrawer from '../../components/PointPreviewDrawer';
import { FilterBar } from '../../components/FilterBar';
import { getEntities, META } from '../../services/repository';
import { dailyRows, scopeHourly } from '../../services/energyStats';
import { ENERGY_COLOR, ENERGY_LABEL, fmtInt } from '../../domain/units';
import { lastNDays } from '../../domain/time';
import type { MeteringPoint } from '../../domain/types';

const EQUIP_LABEL: Record<string, string> = {
  'lab-equipment': '实验专用设备',
  it: '机房IT设备',
  kitchen: '厨房设备',
  chiller: '冷水机组',
  heatpump: '热泵热水系统',
  'gym-ac': '场馆空调',
  boiler: '锅炉',
  pool: '泳池系统',
};

export default function EquipmentMonitorPage() {
  const [anchor, setAnchor] = useState('2026-10-20');
  const [detail, setDetail] = useState<MeteringPoint | null>(null);
  const [pointDrawer, setPointDrawer] = useState<string | null>(null);
  const entities = getEntities();

  const equipment = useMemo(
    () => entities.meteringPoints.filter((p) => p.equipmentTag),
    [entities],
  );

  const rows = useMemo(() => {
    const days30 = lastNDays(anchor, 30);
    return equipment.map((p) => {
      const daily = dailyRows([p.id], days30[0], anchor);
      const total = daily.reduce((a, r) => a + r.total, 0);
      const activeDays = daily.filter((r) => r.total > 0).length;
      const hourRows = scopeHourly('electricity', { buildingId: p.buildingId ?? '' }, anchor, anchor);
      const latestHour = dailyRows([p.id], anchor, anchor)[0];
      const running = (latestHour?.total ?? 0) > 0;
      const alarms = entities.alarms.filter((a) => a.pointId === p.id);
      const workOrders = entities.workOrders.filter((w) => w.pointId === p.id);
      return {
        key: p.id,
        point: p,
        name: p.name,
        tag: p.equipmentTag!,
        building: p.buildingId ? entities.buildings.find((b) => b.id === p.buildingId)?.name ?? '—' : '—',
        energy: p.energyType,
        total: Math.round(total),
        activeDays,
        avgDaily: activeDays > 0 ? Math.round(total / activeDays) : 0,
        running,
        alwaysOn: !!p.alwaysOn,
        alarms: alarms.length,
        workOrders: workOrders.length,
        hourRows,
      };
    });
  }, [equipment, anchor, entities]);

  const exportSheet = {
    name: '重点设备',
    headers: ['设备回路', '设备类型', '所属建筑', `近30日用电(kWh)`, '运行天数', '当前状态', '关联告警', '关联工单'],
    rows: rows.map((r) => [
      r.name, EQUIP_LABEL[r.tag] ?? r.tag, r.building, r.total, r.activeDays,
      r.running ? '运行' : '停机', r.alarms, r.workOrders,
    ]),
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['能源监测', '重点用能设备']}
        title="重点用能设备监测"
        subtitle={
          <Space size={8} wrap>
            <span>大型设备专用回路：能耗趋势、运行天数与开停状态（取自计量数据）；COP/PUE仅在边界与数据条件满足时计算</span>
            <span className="muted">数据更新：{dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}</span>
          </Space>
        }
        extra={<ExportButton filename="重点设备台账" sheet={exportSheet} metaNote="设备用能=独立分表实测；运行状态缺失时按停机/无数据显示，不做估算" />}
      />
      <FilterBar>
        <span className="filter-label">监测日</span>
        <DatePicker size="small" value={dayjs(anchor)} allowClear={false} onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))} />
        <span className="muted small">运行时长按“日用量大于0”折算运行天数；运行状态缺失不估算运行小时</span>
      </FilterBar>

      <div className="kpi-row">
        <StatCard label="重点设备回路" value={rows.length} unit="条" sub={`覆盖 ${new Set(rows.map((r) => r.building)).size} 栋建筑`} />
        <StatCard label="监测日运行中" value={rows.filter((r) => r.running).length} unit="台" sub="按监测日最后小时用量>0判定" />
        <StatCard label="24小时必要运行" value={rows.filter((r) => r.alwaysOn).length} unit="台" sub="实验设备/IT/热泵等，节能评价单列" />
        <StatCard label="近30日设备总用电" value={rows.reduce((a, r) => a + r.total, 0)} unit="kWh" sub="全部专用分表合计" />
      </div>

      <div className="table-card">
        <h4 className="section-title">设备清单</h4>
        <Table
          size="small"
          rowKey="key"
          pagination={false}
          dataSource={rows}
          onRow={(r) => ({ onClick: () => setDetail(r.point), style: { cursor: 'pointer' } })}
          columns={[
            { title: '设备回路', dataIndex: 'name' },
            { title: '类型', dataIndex: 'tag', width: 110, render: (t: string) => <Tag color="purple">{EQUIP_LABEL[t] ?? t}</Tag> },
            { title: '所属建筑', dataIndex: 'building', width: 140 },
            { title: '近30日用电(kWh)', dataIndex: 'total', width: 120, align: 'right' as const, render: (v: number) => fmtInt(v) },
            { title: '日均(kWh)', dataIndex: 'avgDaily', width: 90, align: 'right' as const, render: (v: number) => fmtInt(v) },
            { title: '运行天数', dataIndex: 'activeDays', width: 84, align: 'right' as const },
            {
              title: '状态', dataIndex: 'running', width: 90,
              render: (v: boolean, r) => v ? <Tag color="green">运行</Tag> : <Tag color="default">{r.alwaysOn ? '疑似停机' : '停机'}</Tag>,
            },
            { title: '告警/工单', width: 90, render: (_v, r) => `${r.alarms}/${r.workOrders}` },
          ]}
        />
      </div>

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        width={680}
        title={detail?.name}
        extra={detail ? <a onClick={() => setPointDrawer(detail.id)}>原始读数</a> : undefined}
      >
        {detail && (() => {
          const row = rows.find((r) => r.key === detail.id);
          const days30 = lastNDays(anchor, 30);
          const daily = dailyRows([detail.id], days30[0], anchor);
          return (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Descriptions size="small" bordered column={2}>
                <Descriptions.Item label="设备类型">{EQUIP_LABEL[detail.equipmentTag ?? ''] ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="所属建筑">{row?.building}</Descriptions.Item>
                <Descriptions.Item label="能源">{ENERGY_LABEL[detail.energyType]}</Descriptions.Item>
                <Descriptions.Item label="运行特征">{detail.alwaysOn ? '24小时必要运行' : '按需运行'}</Descriptions.Item>
                <Descriptions.Item label="近30日用电">{fmtInt(row?.total ?? 0)} kWh</Descriptions.Item>
                <Descriptions.Item label="日均用电">{fmtInt(row?.avgDaily ?? 0)} kWh</Descriptions.Item>
                <Descriptions.Item label="能效指标" span={2}>
                  {detail.equipmentTag === 'chiller'
                    ? `COP = 供冷产出 ÷ 机组电耗（近30日），见能源站与管网页`
                    : detail.equipmentTag === 'it'
                      ? `IT用电占比 = IT分表 ÷ 机房总表（PUE参考），见节能目标页`
                      : '该设备边界数据不足，COP/PUE不可计算'}
                </Descriptions.Item>
                <Descriptions.Item label="设备责任人" span={2}>
                  {detail.buildingId ? entities.departments.find((d) => d.id === entities.buildings.find((b) => b.id === detail.buildingId)?.departmentId)?.name ?? '—' : '—'}
                </Descriptions.Item>
              </Descriptions>
              <ChartCard title="近30日设备用电趋势" height={280}>
                <EnergyLineChart
                  x={daily.map((r) => r.date.slice(5))}
                  series={[{ name: '日用电', data: daily.map((r) => (r.total > 0 ? Math.round(r.total) : null)), color: ENERGY_COLOR.electricity, area: true }]}
                  unit="kWh"
                  height={270}
                  showLegend={false}
                />
              </ChartCard>
            </Space>
          );
        })()}
      </Drawer>

      <PointPreviewDrawer pointId={pointDrawer} open={!!pointDrawer} onClose={() => setPointDrawer(null)} />
    </div>
  );
}