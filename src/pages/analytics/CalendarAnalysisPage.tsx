import { useMemo, useState } from 'react';
import { Select, Space, Table, Tag, Button } from 'antd';
import { CalendarOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ExportButton from '../../components/ExportButton';
import { ChartCard, EnergyBarChart, EnergyHeatmap, EnergyLineChart } from '../../components/charts';
import { CampusSelect, FilterBar } from '../../components/FilterBar';
import { useFilters } from '../../stores/filters';
import { userScope } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';
import { teachingStats, dailyRows } from '../../services/energyStats';
import { DAY_TYPE_LABEL, resolveDay } from '../../domain/calendar';
import { CATEGORY_LABEL, ENERGY_COLOR, fmtInt } from '../../domain/units';
import { rangeDays } from '../../domain/time';

export default function AnalysisCalendarPage() {
  const navigate = useNavigate();
  const { campusId } = useFilters();
  const entities = getEntities();
  const semesters = entities.calendar.semesters.filter((s) => s.type === 'term');
  const [semesterId, setSemesterId] = useState('SEM-2026A');
  const [category, setCategory] = useState<string>('teaching');
  const [focusBuilding, setFocusBuilding] = useState<string>('B-TA');
  const scope = useMemo(() => userScope(campusId), [campusId]);

  const semester = entities.calendar.semesters.find((s) => s.id === semesterId);
  const semesterRange = useMemo(() => {
    if (!semester) return { from: '2026-08-31', to: '2026-10-20' };
    const to = dayjs(semester.end).isAfter(dayjs(META.dataWindow.end)) ? META.dataWindow.end : semester.end;
    return { from: semester.start, to };
  }, [semester]);

  const data = useMemo(() => {
    const buildings = entities.buildings.filter(
      (b) => b.status === 'active' && b.category === category && (scope.campusId === 'all' || b.campusId === scope.campusId) && (!scope.buildingIds || scope.buildingIds.includes(b.id)),
    );
    const days = rangeDays(semesterRange.from, semesterRange.to);
    const dayTypes = days.map((d) => resolveDay(d, entities.calendar).dayType);

    const categoryDaily = days.map((d) => {
      const rows = buildings.flatMap((b) => {
        const ids = entities.meteringPoints.filter((p) => p.buildingId === b.id && p.energyType === 'electricity' && p.role === 'main').map((p) => p.id);
        return ids.length ? dailyRows(ids, d, d) : [];
      });
      const total = rows.reduce((a, r) => a + r.total, 0);
      const n = Math.max(1, buildings.length);
      return { date: d, dayType: resolveDay(d, entities.calendar).dayType, total: Math.round((total / n) * 10) / 10 };
    });

    const byType = ['teaching', 'weekend', 'exam', 'vacation', 'holiday'] as const;
    const dayTypeAvg = byType.map((t) => {
      const list = categoryDaily.filter((r) => r.dayType === t);
      const avg = list.length > 0 ? list.reduce((a, r) => a + r.total, 0) / list.length : null;
      return { key: t, label: DAY_TYPE_LABEL[t], days: list.length, avg };
    });

    const focusDaily = dailyRows(
      entities.meteringPoints.filter((p) => p.buildingId === focusBuilding && p.energyType === 'electricity' && p.role === 'main').map((p) => p.id),
      semesterRange.from,
      semesterRange.to,
    );

    const nonTeachRank = buildings.map((b) => {
      const stats = teachingStats(b.id, semesterRange.from, semesterRange.to);
      return {
        id: b.id,
        name: b.name,
        share: stats.nonTeachingShare,
        nonTeaching: stats.nonTeachingUsage,
        definition: stats.definition,
      };
    }).sort((a, b) => (b.share ?? -1) - (a.share ?? -1));

    const vacationBaseline = (() => {
      const list = categoryDaily.filter((r) => r.dayType === 'vacation' || r.dayType === 'holiday');
      if (list.length === 0) return null;
      const sorted = [...list].sort((a, b) => a.total - b.total);
      return sorted[Math.floor(sorted.length / 2)].total;
    })();
    const anomalyDays = categoryDaily
      .filter((r) => (r.dayType === 'vacation' || r.dayType === 'holiday') && vacationBaseline !== null && r.total > vacationBaseline * 1.8)
      .map((r) => ({ ...r, baseline: vacationBaseline }));

    const alarmLinks = entities.alarms.filter((a) => a.ruleId === 'AR-NONTEACH' || a.ruleId === 'AR-SURGE');

    const semesterExamWeeks = entities.calendar.examWeeks.filter((w) => w.start >= semesterRange.from && w.start <= semesterRange.to + '9');
    const semesterHolidays = entities.calendar.specialDays.filter((s) => s.end >= semesterRange.from && s.date <= semesterRange.to + '9');

    return { categoryDaily, dayTypeAvg, focusDaily, nonTeachRank, anomalyDays, alarmLinks, semesterExamWeeks, semesterHolidays, days };
  }, [category, scope, entities, semesterRange, focusBuilding]);

  const exportSheet = {
    name: '教学日历分析',
    headers: ['日期', '日类型', `${CATEGORY_LABEL[category as 'teaching']}日均用电(kWh)`],
    rows: data.categoryDaily.map((r) => [r.date, DAY_TYPE_LABEL[r.dayType], r.total]),
  };

  const focusOptions = entities.buildings
    .filter((b) => b.status === 'active' && b.category === category && (scope.campusId === 'all' || b.campusId === scope.campusId))
    .map((b) => ({ value: b.id, label: b.name }));

  return (
    <div>
      <PageHeader
        breadcrumb={['能耗分析', '教学日历分析']}
        title="教学日历与非教学时段分析"
        subtitle={
          <Space size={8} wrap>
            <span>基于校历学期、考试周、假期与建筑开放时间的同类日分析</span>
            <span className="muted">修改校历后（<Link to="/base/calendar">校历维护</Link>），本页查询随新校历重新计算</span>
          </Space>
        }
        extra={<ExportButton filename={`教学日历分析_${semesterId}`} sheet={exportSheet} metaNote={`学期：${semester?.name}；统计期：${semesterRange.from}至${semesterRange.to}；时间定义以学校校历为准`} />}
      />
      <FilterBar>
        <span className="filter-label">校区</span>
        <CampusSelect value={campusId} onChange={(v) => useFilters.getState().setCampus(v)} />
        <span className="filter-label">学期</span>
        <Select size="small" style={{ width: 220 }} value={semesterId} options={semesters.map((s) => ({ value: s.id, label: s.name }))} onChange={(v) => setSemesterId(v)} />
        <span className="filter-label">建筑类别</span>
        <Select size="small" style={{ width: 120 }} value={category} options={['teaching', 'lab', 'library', 'dormitory', 'canteen', 'office', 'gym'].map((c) => ({ value: c, label: CATEGORY_LABEL[c as 'teaching'] }))} onChange={(v) => { setCategory(v); const first = entities.buildings.find((b) => b.category === v); if (first) setFocusBuilding(first.id); }} />
        <span className="filter-label">重点建筑</span>
        <Select size="small" style={{ width: 180 }} showSearch optionFilterProp="label" value={focusBuilding} options={focusOptions} onChange={setFocusBuilding} />
        <Button size="small" icon={<CalendarOutlined />} onClick={() => navigate('/base/calendar')}>维护校历</Button>
      </FilterBar>

      <div className="kpi-row">
        {data.dayTypeAvg.filter((r) => r.days > 0).map((r) => (
          <StatCard
            key={r.key}
            label={`${r.label}日均用电（${r.days}天）`}
            value={r.avg === null ? null : Math.round(r.avg)}
            unit="kWh"
            sub={`${CATEGORY_LABEL[category as 'teaching']}类建筑均值`}
          />
        ))}
        <StatCard
          label="学期考试周/假期分布"
          value={`${data.semesterExamWeeks.length}/${data.semesterHolidays.length}`}
          unit="项"
          sub={data.semesterExamWeeks.map((w) => w.name).join('；') || '本学期无考试周'}
        />
      </div>

      <div className="chart-grid c2">
        <ChartCard
          title={`${CATEGORY_LABEL[category as 'teaching']}类建筑 学期逐日用电与日类型`}
          height={320}
          note="颜色区间断开处为缺失样本；日类型来自校历（教学日/周末/考试周/寒暑假/法定假日）"
        >
          <EnergyLineChart
            x={data.categoryDaily.map((r) => r.date.slice(5))}
            series={[
              { name: '日均用电', data: data.categoryDaily.map((r) => (r.total > 0 ? r.total : null)), color: ENERGY_COLOR.electricity, area: true },
            ]}
            unit="kWh"
            height={310}
            showLegend={false}
          />
        </ChartCard>
        <ChartCard title="各日类型日均用电对比（kWh/日）" height={320} note="同类日对比，避免简单“昨日环比”误报">
          <EnergyBarChart
            x={data.dayTypeAvg.map((r) => `${r.label}(${r.days}天)`)}
            series={[{ name: '日均用电', data: data.dayTypeAvg.map((r) => r.avg === null ? null : Math.round(r.avg)), color: ENERGY_COLOR.electricity }]}
            unit="kWh"
            height={310}
            showLegend={false}
          />
        </ChartCard>
      </div>

      <div className="chart-grid c2">
        <ChartCard
          title={`${entities.buildings.find((b) => b.id === focusBuilding)?.name ?? '重点建筑'} 学期用电日历（kWh）`}
          height={320}
          note="颜色越深用电越高；空白为缺失"
        >
          <EnergyHeatmap
            dates={data.focusDaily.map((r) => r.date)}
            values={data.focusDaily.map((r) => (r.total > 0 ? r.total : null))}
            unit="kWh"
            height={310}
          />
        </ChartCard>
        <div className="table-card" style={{ background: '#fff', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)', padding: '8px 12px' }}>
          <h4 className="section-title">教学时段与非教学时段统计（{CATEGORY_LABEL[category as 'teaching']}类）</h4>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={data.nonTeachRank}
            columns={[
              { title: '建筑', dataIndex: 'name' },
              {
                title: '非教学时段占比', dataIndex: 'share', width: 130, align: 'right' as const,
                render: (v: number | null) => v === null ? '不可计算' : <Tag color={v > 50 ? 'orange' : 'default'}>{v.toFixed(1)}%</Tag>,
              },
              { title: '非教学时段用电(kWh)', dataIndex: 'nonTeaching', width: 140, align: 'right' as const, render: (v: number | null) => fmtInt(v ?? 0) },
              {
                title: '时间定义', render: (_v, r) => (
                  <span className="muted small" style={{ display: 'inline-block', maxWidth: 220 }}>{r.definition}</span>
                ),
              },
            ]}
          />
          <div className="muted small mt8">
            注：实验楼、信息中心等24小时必要运行建筑不因夜间负荷判为异常；教学类建筑占比高提示假期管理检查。
          </div>
        </div>
      </div>

      <div className="chart-grid c2">
        <div className="table-card" style={{ background: '#fff', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)', padding: '8px 12px' }}>
          <h4 className="section-title">假期/假日高用电线索（超过假期基线1.8倍）</h4>
          <Table
            size="small"
            rowKey="date"
            pagination={false}
            dataSource={data.anomalyDays}
            columns={[
              { title: '日期', dataIndex: 'date', width: 100 },
              { title: '日类型', dataIndex: 'dayType', width: 90, render: (t: string) => <Tag color="orange">{DAY_TYPE_LABEL[t as 'teaching']}</Tag> },
              { title: '日均用电(kWh)', dataIndex: 'total', align: 'right' as const },
              { title: '假期基线(kWh)', dataIndex: 'baseline', align: 'right' as const, render: (v: number) => v.toFixed(1) },
              {
                title: '操作', width: 90, render: () => (
                  <Link to="/alarms">转告警核查</Link>
                ),
              },
            ]}
          />
          {data.anomalyDays.length === 0 && <div className="muted" style={{ padding: 10 }}>本学期暂无假期高用电线索</div>}
        </div>
        <div className="table-card" style={{ background: '#fff', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)', padding: '8px 12px' }}>
          <h4 className="section-title">相关告警事件（非教学时间高能耗规则）</h4>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={data.alarmLinks}
            onRow={(r) => ({ onClick: () => navigate(`/alarms/${r.id}`), style: { cursor: 'pointer' } })}
            columns={[
              { title: '事件', dataIndex: 'title' },
              { title: '建筑', width: 120, render: (_v, r) => entities.buildings.find((b) => b.id === r.buildingId)?.name ?? '—' },
              { title: '发生时间', dataIndex: 'time', width: 130 },
              { title: '状态', dataIndex: 'status', width: 90, render: (s: string) => <Tag color={s === 'closed' ? 'green' : s === 'pending' ? 'orange' : 'blue'}>{s === 'closed' ? '已关闭' : s === 'pending' ? '待确认' : s === 'processing' ? '处理中' : '待复核'}</Tag> },
            ]}
          />
          <div className="muted small mt8">
            管理者可对“特殊开放”进行解释并从不合理用能排行榜中排除，但不删除能源实耗记录。
            统计截至：{dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}。
          </div>
        </div>
      </div>
    </div>
  );
}