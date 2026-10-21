import { useMemo, useState } from 'react';
import { App, Button, DatePicker, Input, Modal, Select, Space, Table, Tag } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ExportButton from '../../components/ExportButton';
import { ChartCard, EnergyBarChart, EnergyLineChart } from '../../components/charts';
import { BuildingSelect, CampusSelect, FilterBar } from '../../components/FilterBar';
import { useFilters } from '../../stores/filters';
import { userScope, canEdit } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';
import {
  scopeUsage, scopeHourly, teachingStats, scopeDaily,
} from '../../services/energyStats';
import { DAY_TYPE_LABEL, resolveDay } from '../../domain/calendar';
import { ENERGY_COLOR, fmtInt } from '../../domain/units';
import { rangeDays, shiftDay } from '../../domain/time';

export default function ScenarioTeachingPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { campusId } = useFilters();
  const [buildingId, setBuildingId] = useState<string>('B-TA');
  const [dayFilter, setDayFilter] = useState<'all' | 'teaching' | 'weekend' | 'vacation' | 'exam' | 'holiday'>('all');
  const [from, setFrom] = useState('2026-09-01');
  const [to, setTo] = useState('2026-10-20');
  const [patrolOpen, setPatrolOpen] = useState(false);
  const [patrolNote, setPatrolNote] = useState('');
  const entities = getEntities();
  const scope = useMemo(() => userScope(campusId), [campusId]);

  const teachingBuildings = entities.buildings.filter(
    (b) => b.status === 'active' && b.category === 'teaching' && (scope.campusId === 'all' || b.campusId === scope.campusId) && (!scope.buildingIds || scope.buildingIds.includes(b.id)),
  );
  const building = entities.buildings.find((b) => b.id === buildingId) ?? teachingBuildings[0];

  const data = useMemo(() => {
    if (!building) return null;
    const usage = scopeUsage('electricity', { buildingId: building.id }, from, to);
    const teach = teachingStats(building.id, from, to);
    const daily = scopeDaily('electricity', { buildingId: building.id }, from, to);

    const days = rangeDays(from, to);
    const nightLoads: number[] = [];
    for (const d of days) {
      const rows = scopeHourly('electricity', { buildingId: building.id }, d, d);
      const night = rows.slice(0, 6).filter((r) => r.value !== null).map((r) => r.value as number);
      if (night.length > 0) {
        night.sort((a, b) => a - b);
        nightLoads.push(night[Math.floor(night.length / 2)]);
      }
    }
    nightLoads.sort((a, b) => a - b);
    const nightBase = nightLoads.length > 0 ? nightLoads[Math.floor(nightLoads.length / 2)] : null;

    const dayTypeAvg = (types: string[]) => {
      const list = daily.filter((r) => types.includes(resolveDay(r.date, entities.calendar).dayType) && r.total > 0);
      return list.length > 0 ? { avg: list.reduce((a, r) => a + r.total, 0) / list.length, days: list.length } : null;
    };
    const teachingAvg = dayTypeAvg(['teaching']);
    const examAvg = dayTypeAvg(['exam']);
    const vacationAvg = dayTypeAvg(['vacation', 'holiday']);
    const weekendAvg = dayTypeAvg(['weekend']);

    const filteredDaily = dayFilter === 'all' ? daily : daily.filter((r) => resolveDay(r.date, entities.calendar).dayType === dayFilter);

    const rank = teachingBuildings.map((b) => {
      const u = scopeUsage('electricity', { buildingId: b.id }, from, to);
      const t = teachingStats(b.id, from, to);
      const night = (() => {
        const sample = scopeHourly('electricity', { buildingId: b.id }, to, to).slice(0, 6).filter((r) => r.value !== null);
        return sample.length ? Math.min(...sample.map((r) => r.value as number)) : null;
      })();
      return {
        id: b.id,
        name: b.name,
        usage: u.total ?? 0,
        nonTeachShare: t.nonTeachingShare,
        nightBase: night,
        incomplete: u.incomplete,
      };
    }).sort((a, b) => b.usage - a.usage);

    // 空课时持续高负荷线索：假期/周末白天连续高负荷日
    const clues = daily
      .filter((r) => {
        const t = resolveDay(r.date, entities.calendar).dayType;
        if (t !== 'vacation' && t !== 'holiday' && t !== 'weekend') return false;
        const hours = scopeHourly('electricity', { buildingId: building.id }, r.date, r.date);
        const daytime = hours.slice(8, 18).filter((h) => h.value !== null);
        if (daytime.length < 6) return false;
        const avg = daytime.reduce((a, h) => a + (h.value as number), 0) / daytime.length;
        return avg > 15;
      })
      .slice(-5);

    return { usage, teach, daily, nightBase, teachingAvg, examAvg, vacationAvg, weekendAvg, filteredDaily, rank, clues };
  }, [building, from, to, dayFilter, entities, scope, teachingBuildings]);

  if (!building || !data) {
    return <PageHeader breadcrumb={['校园专题', '教学楼用能']} title="教学楼用能" subtitle="当前范围内无教学楼档案" />;
  }

  const exportSheet = {
    name: '教学楼用能分析',
    headers: ['日期', '日类型', '用电量(kWh)', '是否教学时段为主'],
    rows: data.filteredDaily.map((r) => [
      r.date, DAY_TYPE_LABEL[resolveDay(r.date, entities.calendar).dayType], Math.round(r.total), '',
    ]),
  };

  const submitPatrol = () => {
    if (!patrolNote.trim()) {
      message.warning('请填写巡查关注点');
      return;
    }
    entities.actions.createWorkOrder(
      {
        title: `${building.name}空课时持续高负荷巡查`,
        source: '人工创建（教学楼专题）',
        alertId: null,
        type: '节能巡查',
        campusId: building.campusId,
        buildingId: building.id,
        pointId: null,
        assignee: '陈志强',
        assigneeDept: '后勤保障处物业运维',
        priority: 'medium',
        deadline: dayjs(META.asOf).add(7, 'day').format('YYYY-MM-DD'),
      },
      '王建国',
    );
    message.success('巡查工单已生成并派至物业运维，可在工单列表跟踪');
    setPatrolOpen(false);
    setPatrolNote('');
    navigate('/work-orders');
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['校园专题', '教学楼用能']}
        title="教学楼用能管理"
        subtitle={
          <Space size={8} wrap>
            <span>教学时间/非教学时间用能、假期低负荷对比与异常钻取；结论依据楼宇开放时间（以学校日历估计），不声称具体教室无人</span>
            <span className="muted">统计期：{from} 至 {to}</span>
          </Space>
        }
        extra={<ExportButton filename={`教学楼用能_${building.id}`} sheet={exportSheet} metaNote={`统计期：${from}至${to}；时间定义：校历+教学楼开放时间（${entities.calendar.openHours.find((o) => o.id === 'teaching')?.start}-${entities.calendar.openHours.find((o) => o.id === 'teaching')?.end}）`} />}
      />
      <FilterBar>
        <span className="filter-label">校区</span>
        <CampusSelect value={campusId} onChange={(v) => useFilters.getState().setCampus(v)} width={110} />
        <span className="filter-label">教学楼</span>
        <BuildingSelect value={building.id} onChange={(v) => setBuildingId(v as string)} campusId={campusId} category="teaching" allowAll={false} />
        <span className="filter-label">日期</span>
        <DatePicker.RangePicker
          size="small"
          value={[dayjs(from), dayjs(to)]}
          onChange={(v) => {
            if (v && v[0] && v[1]) {
              setFrom(v[0].format('YYYY-MM-DD'));
              setTo(v[1].format('YYYY-MM-DD'));
            }
          }}
        />
        <span className="filter-label">日类型</span>
        <Select size="small" style={{ width: 110 }} value={dayFilter} onChange={setDayFilter} options={[
          { value: 'all', label: '全部日期' },
          { value: 'teaching', label: '教学日' },
          { value: 'exam', label: '考试周' },
          { value: 'weekend', label: '周末' },
          { value: 'vacation', label: '寒暑假' },
          { value: 'holiday', label: '法定假日' },
        ]} />
        <Button size="small" onClick={() => { setFrom(shiftDay(to, -29)); setTo(to); }}>近30日</Button>
      </FilterBar>

      <div className="kpi-row">
        <StatCard label="统计期用电量" value={data.usage.total} unit="kWh" sub={`${from} 至 ${to}`} qualityNote={data.usage.incomplete ? '存在缺失样本' : undefined} />
        <StatCard label="教学时段用电" value={data.teach.teachingHoursUsage} unit="kWh" sub={`占比 ${data.teach.nonTeachingShare === null ? '—' : (100 - data.teach.nonTeachingShare).toFixed(1)}%`} />
        <StatCard
          label="非教学时段用电"
          value={data.teach.nonTeachingUsage}
          unit="kWh"
          sub={`占比 ${data.teach.nonTeachingShare === null ? '不可计算' : data.teach.nonTeachingShare.toFixed(1) + '%'}（不代表全部可节省）`}
        />
        <StatCard label="夜间基础负荷（中位）" value={data.nightBase === null ? null : Math.round(data.nightBase * 10) / 10} unit="kW" sub="00:00-06:00 小时功率中位数（诊断指标）" />
        <StatCard
          label="教学日均 / 假期日均"
          value={data.teachingAvg && data.vacationAvg ? (data.teachingAvg.avg / data.vacationAvg.avg).toFixed(2) : null}
          unit="倍"
          sub={`教学日 ${data.teachingAvg?.days ?? 0} 天，假期 ${data.vacationAvg?.days ?? 0} 天`}
        />
      </div>

      <div className="chart-grid c2">
        <ChartCard
          title="教学日 vs 假期 日内用电曲线（叠加）"
          height={300}
          note="悬停查看每小时能耗与所处时段；教学日双峰（上课/晚自习），假期仅值班基础负荷"
        >
          <EnergyLineChart
            x={Array.from({ length: 24 }, (_, h) => `${h}时`)}
            series={(() => {
              const pick = (types: string[]) => {
                const days = rangeDays(from, to);
                for (let i = days.length - 1; i >= 0; i--) {
                  if (types.includes(resolveDay(days[i], entities.calendar).dayType)) return days[i];
                }
                return null;
              };
              const td = pick(['teaching']);
              const vd = pick(['vacation', 'holiday']);
              const series = [];
              if (td) {
                const rows = scopeHourly('electricity', { buildingId: building.id }, td, td);
                series.push({ name: `教学日 ${td.slice(5)}`, data: rows.map((r) => r.value === null ? null : Math.round(r.value * 10) / 10), color: ENERGY_COLOR.electricity });
              }
              if (vd) {
                const rows = scopeHourly('electricity', { buildingId: building.id }, vd, vd);
                series.push({ name: `假期日 ${vd.slice(5)}`, data: rows.map((r) => r.value === null ? null : Math.round(r.value * 10) / 10), color: '#fa8c16', dashed: true });
              }
              return series;
            })()}
            unit="kWh/h"
            height={290}
          />
        </ChartCard>
        <ChartCard
          title={`逐日用电（${dayFilter === 'all' ? '全部日期' : DAY_TYPE_LABEL[dayFilter]}）`}
          height={300}
          note="颜色越深用电越高；周末/假期高负荷日进入线索列表"
        >
          <EnergyBarChart
            x={data.filteredDaily.map((r) => r.date.slice(5))}
            series={[{
              name: '日用电量',
              data: data.filteredDaily.map((r) => (r.total > 0 ? Math.round(r.total) : null)),
              color: dayFilter === 'vacation' || dayFilter === 'holiday' ? '#fa8c16' : ENERGY_COLOR.electricity,
            }]}
            unit="kWh"
            height={290}
            showLegend={false}
          />
        </ChartCard>
      </div>

      <div className="chart-grid c2">
        <ChartCard title="教学楼用电排行（统计期）" height={320} note="点击柱条进入楼宇详情">
          <EnergyBarChart
            x={data.rank.map((r) => r.name.length > 7 ? r.name.slice(0, 7) + '…' : r.name)}
            series={[{ name: '用电量', data: data.rank.map((r) => Math.round(r.usage)), color: ENERGY_COLOR.electricity }]}
            unit="kWh"
            height={310}
            showLegend={false}
            onEvent={(p) => {
              const found = data.rank.find((r) => (r.name.length > 7 ? r.name.slice(0, 7) + '…' : r.name) === p.name);
              if (found) navigate(`/monitor/building/${found.id}?from=${from}&to=${to}&campus=${campusId}`);
            }}
          />
        </ChartCard>
        <div className="table-card" style={{ background: '#fff', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)', padding: '8px 12px' }}>
          <h4 className="section-title">空课时持续高负荷线索（周末/假期日间均值 &gt; 15 kWh）</h4>
          <Table
            size="small"
            rowKey="date"
            pagination={false}
            dataSource={data.clues}
            columns={[
              { title: '日期', dataIndex: 'date', width: 100 },
              { title: '日类型', dataIndex: 'dayType', width: 90, render: (_v, r) => <Tag color="orange">{DAY_TYPE_LABEL[resolveDay(r.date, entities.calendar).dayType]}</Tag> },
              { title: '日用电(kWh)', dataIndex: 'total', align: 'right' as const, render: (v: number) => fmtInt(Math.round(v)) },
              {
                title: '操作', width: 130,
                render: () => canEdit('alarms') ? <a onClick={() => setPatrolOpen(true)}>生成巡查任务</a> : <Link to="/alarms">查看告警</Link>,
              },
            ]}
          />
          {data.clues.length === 0 && <div className="muted" style={{ padding: 10 }}>统计期内无周末/假期日间持续高负荷线索</div>}
          <div className="muted small mt8">
            注：教学楼B国庆假期日间负荷偏高已触发告警（
            <Link to="/alarms/AL-2026-0413">告警详情</Link>），处置进度与工单联动。
            夜间负荷为诊断指标，不代表可节省电量。
          </div>
        </div>
      </div>

      <Modal
        title={`生成巡查任务：${building.name}`}
        open={patrolOpen}
        onOk={submitPatrol}
        onCancel={() => setPatrolOpen(false)}
        okText="派单至物业运维"
        cancelText="取消"
      >
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <div className="small">巡查对象：{building.name}（{building.code}）；类型：节能巡查</div>
          <Input.TextArea rows={3} value={patrolNote} onChange={(e) => setPatrolNote(e.target.value)} placeholder="填写巡查关注点，如：假期空调/照明是否按要求断电、教室设备待机情况" />
        </Space>
      </Modal>
    </div>
  );
}