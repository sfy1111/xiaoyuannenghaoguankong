import { useMemo, useState } from 'react';
import { App, Button, DatePicker, Segmented, Select, Space, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { CampusSelect, CategorySelect, FilterBar } from '../../components/FilterBar';
import { useFilters, DATA_START, DATA_END } from '../../stores/filters';
import { userScope } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';
import { downloadCsv, downloadXlsx, type SheetData } from '../../services/exportService';
import { scopeUsage, dailyRows, scopeMonthly, scopeDaily, buildingSubitems } from '../../services/energyStats';
import { electricityCost } from '../../services/costService';
import { intensity, pctChange } from '../../domain/analysis';
import { CATEGORY_LABEL, ENERGY_LABEL, ENERGY_UNIT, fmtInt } from '../../domain/units';
import { daysBetween, lastNDays, monthOf, rangeMonths, monthRange } from '../../domain/time';
import { DAY_TYPE_LABEL, resolveDay } from '../../domain/calendar';
import type { EnergyType } from '../../domain/types';

type ReportType = 'daily' | 'monthly' | 'term' | 'yearly';

const REPORT_META: Record<ReportType, { label: string; desc: string }> = {
  daily: { label: '能耗日报', desc: '单日分能源用量、建筑明细与数据质量' },
  monthly: { label: '能耗月报', desc: '自然月汇总、峰平谷结构、建筑强度与同比' },
  term: { label: '学期报', desc: '学期口径累计、日类型分解与类别对比' },
  yearly: { label: '年报', desc: '年度（按数据窗口）累计与月度趋势' },
};

export default function ReportsPage() {
  const { message } = App.useApp();
  const { campusId } = useFilters();
  const entities = getEntities();
  const [reportType, setReportType] = useState<ReportType>('monthly');
  const [anchor, setAnchor] = useState('2026-10-20');
  const [category, setCategory] = useState<'all' | string>('all');
  const [generated, setGenerated] = useState<{ at: string; type: string; range: string } | null>(null);
  const scope = useMemo(() => userScope(campusId, category === 'all' ? undefined : category), [campusId, category]);

  const report = useMemo(() => {
    const energies: EnergyType[] = ['electricity', 'water', 'gas', 'cooling', 'heat', 'hotWater'];
    let from = anchor;
    let to = anchor;
    if (reportType === 'daily') {
      from = anchor; to = anchor;
    } else if (reportType === 'monthly') {
      const r = monthRange(monthOf(anchor));
      from = r.from; to = r.to > DATA_END ? DATA_END : r.to;
    } else if (reportType === 'term') {
      const sem = entities.calendar.semesters.find((s) => s.id === 'SEM-2026A');
      from = sem?.start ?? '2026-08-31';
      to = DATA_END;
    } else {
      from = '2026-01-01';
      to = DATA_END;
    }

    const energySummary = energies.map((e) => {
      const u = scopeUsage(e, scope, from, to);
      return {
        key: e,
        energy: e,
        usage: u.total,
        unit: ENERGY_UNIT[e],
        coverage: u.coverage,
        incomplete: u.incomplete,
        hasMissing: u.hasMissing,
        hasEstimated: u.hasEstimated,
        hasManual: u.hasManualCorrected,
      };
    }).filter((r) => r.usage !== null && r.usage > 0);

    const buildings = entities.buildings.filter(
      (b) => b.status === 'active' && (scope.campusId === 'all' || b.campusId === scope.campusId) && (!scope.buildingIds || scope.buildingIds.includes(b.id)) && (category === 'all' || b.category === category),
    );
    const buildingRows = buildings.map((b) => {
      const elec = scopeUsage('electricity', { buildingId: b.id }, from, to);
      const water = scopeUsage('water', { buildingId: b.id }, from, to);
      return {
        key: b.id,
        name: b.name,
        category: CATEGORY_LABEL[b.category],
        campus: b.campusId === 'C-E' ? '东校区' : '西校区',
        area: b.assessmentArea,
        elec: elec.total ?? 0,
        water: water.total ?? 0,
        intensity: intensity(elec.total, b.assessmentArea),
        coverage: elec.coverage,
        incomplete: elec.incomplete || water.incomplete,
      };
    }).filter((r) => r.elec > 0 || r.water > 0).sort((a, b) => b.elec - a.elec);

    const costRows = (() => {
      const feedIds = entities.meteringPoints
        .filter((p) => p.energyType === 'electricity' && !p.buildingId && p.role === 'main' && (campusId === 'all' || p.campusId === campusId))
        .map((p) => p.id);
      const cost = electricityCost(feedIds, from, to);
      return cost.bySegment.map((s) => ({ key: s.name, name: s.name, usage: s.usage, price: s.price, amount: s.amount }));
    })();

    const monthlyTrend = reportType === 'yearly'
      ? scopeMonthly('electricity', scope, rangeMonths('2025-09', monthOf(anchor))).filter((r) => r.total > 0)
      : [];

    const dayTypeRows = reportType === 'term'
      ? (() => {
        const daily = scopeDaily('electricity', scope, from, to);
        const map = new Map<string, { sum: number; days: number }>();
        for (const r of daily) {
          const t = resolveDay(r.date, entities.calendar).dayType;
          const e = map.get(t) ?? { sum: 0, days: 0 };
          e.sum += r.total; e.days += 1;
          map.set(t, e);
        }
        return [...map.entries()].map(([t, v]) => ({ key: t, label: DAY_TYPE_LABEL[t as 'teaching'], days: v.days, total: Math.round(v.sum), avg: v.days > 0 ? Math.round(v.sum / v.days) : 0 }));
      })()
      : [];

    const yoyRow = (() => {
      if (reportType !== 'monthly') return null;
      const m = monthOf(anchor);
      const ym = dayjs(m + '-01').subtract(1, 'year').format('YYYY-MM');
      if (`${ym}-01` < DATA_START) return null;
      const yRange = monthRange(ym);
      const cur = scopeUsage('electricity', scope, from, to).total;
      const base = scopeUsage('electricity', scope, yRange.from, yRange.to > DATA_END ? DATA_END : yRange.to).total;
      return { month: m, baseMonth: ym, cur, base, change: pctChange(cur, base) };
    })();

    return { from, to, energySummary, buildingRows, costRows, monthlyTrend, dayTypeRows, yoyRow };
  }, [reportType, anchor, scope, category, campusId, entities]);

  const sheets = (): SheetData[] => {
    const meta: SheetData = {
      name: '报表说明',
      headers: ['项目', '内容'],
      rows: [
        ['报表类型', REPORT_META[reportType].label],
        ['统计范围', `${campusId === 'all' ? '全部校区' : entities.campuses.find((c) => c.id === campusId)?.name}${category === 'all' ? '，全部建筑类别' : '，' + CATEGORY_LABEL[category as 'teaching']} `],
        ['统计期间', `${report.from} 至 ${report.to}（${daysBetween(report.from, report.to)}天）`],
        ['统计口径', '电力=校区进线关口表（购入边界）；水=总进水表；分表仅作分项不重复计入'],
        ['数据质量', '缺失/无效样本不计入并保留标记；估算与人工修正计入并标注'],
        ['单位', '电 kWh、水/气 m³、冷/热/热水 kWh、金额 元'],
        ['编制时间', dayjs(META.asOf).format('YYYY-MM-DD HH:mm')],
        ['是否折标', '否（未配置折标系数，不展示综合吨标煤）'],
        ['是否含人工补录', '是（经审批的补录标记为人工修正）'],
      ],
    };
    const summary: SheetData = {
      name: '能源汇总',
      headers: ['能源', `用量`, '单位', '覆盖率(%)', '质量说明'],
      rows: report.energySummary.map((r) => [
        ENERGY_LABEL[r.energy], typeof r.usage === 'number' ? Math.round(r.usage) : '缺失', r.unit,
        (r.coverage * 100).toFixed(1),
        r.hasMissing ? '含缺失样本' : r.incomplete ? '含无效样本' : r.hasEstimated ? '含估算值' : r.hasManual ? '含人工修正' : '完整',
      ]),
    };
    const buildings: SheetData = {
      name: '建筑明细',
      headers: ['建筑', '类别', '校区', '考核面积(m²)', `用电量(kWh)`, '单位面积电耗(kWh/m²)', '用水量(m³)', '覆盖率(%)'],
      rows: report.buildingRows.map((r) => [
        r.name, r.category, r.campus, r.area, Math.round(r.elec),
        r.intensity === null ? '不可计算' : r.intensity.toFixed(3), Math.round(r.water), (r.coverage * 100).toFixed(1),
      ]),
    };
    const cost: SheetData = {
      name: '分时电费',
      headers: ['时段', '电量(kWh)', '电价(元/kWh)', '金额(元)'],
      rows: report.costRows.map((r) => [r.name, Math.round(r.usage), r.price, Math.round(r.amount)]),
    };
    const out = [meta, summary, buildings, cost];
    if (report.monthlyTrend.length > 0) {
      out.push({
        name: '月度趋势',
        headers: ['月份', '用电量(kWh)', '覆盖率(%)'],
        rows: report.monthlyTrend.map((r) => [r.date, Math.round(r.total), (r.coverage * 100).toFixed(1)]),
      });
    }
    if (report.dayTypeRows.length > 0) {
      out.push({
        name: '日类型分解',
        headers: ['日类型', '天数', '用电量(kWh)', '日均(kWh)'],
        rows: report.dayTypeRows.map((r) => [r.label, r.days, r.total, r.avg]),
      });
    }
    if (report.yoyRow) {
      out.push({
        name: '同比说明',
        headers: ['本期', '基期', '本期电量(kWh)', '基期电量(kWh)', '同比(%)'],
        rows: [[report.yoyRow.month, report.yoyRow.baseMonth, Math.round(report.yoyRow.cur ?? 0), Math.round(report.yoyRow.base ?? 0), report.yoyRow.change === null ? '不可计算' : report.yoyRow.change.toFixed(1)]],
      });
    }
    return out;
  };

  const doExport = (fmt: 'csv' | 'xlsx') => {
    const s = sheets();
    const fname = `${REPORT_META[reportType].label}_${report.from}_${campusId === 'all' ? '全校' : campusId}`;
    const note = `统计期间 ${report.from}至${report.to}；口径见报表说明工作表；编制时间 ${dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}`;
    if (fmt === 'xlsx') {
      downloadXlsx(fname, s, note);
      message.success('Excel 文件已生成并开始下载（内容与页面预览一致）');
    } else {
      downloadCsv(fname, s[0], note);
      downloadCsv(`${fname}_能源汇总`, s[1], note);
      downloadCsv(`${fname}_建筑明细`, s[2], note);
      message.success('CSV 文件已生成并开始下载（内容与页面预览一致）');
    }
    setGenerated({ at: dayjs(META.asOf).format('YYYY-MM-DD HH:mm'), type: REPORT_META[reportType].label, range: `${report.from}至${report.to}` });
  };

  const exportRecords = entities.auditLogs.filter((l) => l.module === '报表中心').slice(0, 6);

  return (
    <div>
      <PageHeader
        breadcrumb={['报表中心', '能耗统计报表']}
        title="能耗统计报表（日报/月报/学期报/年报）"
        subtitle={
          <Space size={8} wrap>
            <span>表头展示统计范围、单位与数据质量，正文与能耗分析同口径；导出保留筛选条件与生成时间</span>
            <span className="muted">数据更新：{dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}</span>
          </Space>
        }
        extra={
          <Space>
            <Button size="small" onClick={() => doExport('csv')}>导出 CSV</Button>
            <Button size="small" type="primary" onClick={() => doExport('xlsx')}>导出 Excel（多工作表）</Button>
          </Space>
        }
      />
      <FilterBar>
        <span className="filter-label">报表</span>
        <Segmented size="small" value={reportType} options={(Object.keys(REPORT_META) as ReportType[]).map((t) => ({ value: t, label: REPORT_META[t].label }))} onChange={(v) => setReportType(v as ReportType)} />
        <span className="filter-label">校区</span>
        <CampusSelect value={campusId} onChange={(v) => useFilters.getState().setCampus(v)} />
        <span className="filter-label">建筑类别</span>
        <CategorySelect value={category} onChange={setCategory} />
        <span className="filter-label">{reportType === 'yearly' ? '年度' : '日期'}</span>
        <DatePicker
          size="small"
          picker={reportType === 'monthly' || reportType === 'yearly' ? 'month' : 'date'}
          value={dayjs(anchor)}
          allowClear={false}
          disabledDate={(d) => d.isBefore(dayjs(DATA_START)) || d.isAfter(dayjs(DATA_END))}
          onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))}
        />
        <span className="muted small">{REPORT_META[reportType].desc}</span>
      </FilterBar>

      <div className="chart-grid c2">
        <div className="table-card" style={{ background: '#fff', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)', padding: '8px 12px' }}>
          <h4 className="section-title">报表说明（导出文件首页同内容）</h4>
          <Table
            size="small"
            rowKey="k"
            pagination={false}
            dataSource={[
              { k: '报表类型', v: REPORT_META[reportType].label },
              { k: '统计范围', v: `${campusId === 'all' ? '全部校区' : entities.campuses.find((c) => c.id === campusId)?.name}${category === 'all' ? '' : '·' + CATEGORY_LABEL[category as 'teaching']}` },
              { k: '统计期间', v: `${report.from} 至 ${report.to}（${daysBetween(report.from, report.to)}天）` },
              { k: '统计口径', v: '校区购入边界与建筑主表口径，父子表不重复计入；缺失不按0计' },
              { k: '数据质量', v: '估算/人工修正/缺失在明细中标注，未配置折标系数不输出综合吨标煤' },
            ]}
            columns={[
              { dataIndex: 'k', width: 100, render: (v: string) => <b>{v}</b> },
              { dataIndex: 'v' },
            ]}
          />
        </div>
        <div className="table-card" style={{ background: '#fff', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)', padding: '8px 12px' }}>
          <h4 className="section-title">分能源汇总（{report.from} 至 {report.to}）</h4>
          <Table
            size="small"
            rowKey="key"
            pagination={false}
            dataSource={report.energySummary}
            columns={[
              { title: '能源', dataIndex: 'energy', render: (e: EnergyType) => ENERGY_LABEL[e] },
              { title: '用量', dataIndex: 'usage', align: 'right' as const, render: (v: number | null) => v === null ? '—' : fmtInt(Math.round(v)) },
              { title: '单位', dataIndex: 'unit', width: 70 },
              { title: '覆盖率', dataIndex: 'coverage', width: 90, render: (c: number) => `${(c * 100).toFixed(1)}%` },
              {
                title: '质量', width: 120,
                render: (_v, r) => r.hasMissing ? <Tag color="orange">含缺失</Tag> : r.incomplete ? <Tag color="red">含无效</Tag> : r.hasEstimated ? <Tag color="gold">含估算</Tag> : r.hasManual ? <Tag color="blue">含人工修正</Tag> : <Tag color="green">完整</Tag>,
              },
            ]}
          />
          {report.yoyRow && (
            <div className="small mt8">
              同比：{report.yoyRow.month} 用电 {fmtInt(Math.round(report.yoyRow.cur ?? 0))} kWh，去年同期（{report.yoyRow.baseMonth}）{fmtInt(Math.round(report.yoyRow.base ?? 0))} kWh，
              {report.yoyRow.change === null ? '基期缺失不可计算' : `${report.yoyRow.change >= 0 ? '+' : ''}${report.yoyRow.change.toFixed(1)}%`}
            </div>
          )}
        </div>
      </div>

      <div className="table-card mt12">
        <h4 className="section-title">建筑明细（与能耗分析同口径）</h4>
        <Table
          size="small"
          rowKey="key"
          pagination={{ pageSize: 10 }}
          dataSource={report.buildingRows}
          columns={[
            { title: '建筑', dataIndex: 'name' },
            { title: '类别', dataIndex: 'category', width: 100 },
            { title: '校区', dataIndex: 'campus', width: 76 },
            { title: '考核面积(m²)', dataIndex: 'area', width: 110, align: 'right' as const, render: (v: number) => fmtInt(v) },
            { title: '用电量(kWh)', dataIndex: 'elec', width: 110, align: 'right' as const, render: (v: number) => fmtInt(Math.round(v)) },
            { title: '单位面积电耗', dataIndex: 'intensity', width: 110, align: 'right' as const, render: (v: number | null) => v === null ? '不可计算' : v.toFixed(3) },
            { title: '用水量(m³)', dataIndex: 'water', width: 100, align: 'right' as const, render: (v: number) => fmtInt(Math.round(v)) },
            { title: '覆盖率', dataIndex: 'coverage', width: 84, render: (c: number) => `${(c * 100).toFixed(1)}%` },
          ]}
        />
      </div>

      <div className="chart-grid c2 mt12">
        <div className="table-card" style={{ background: '#fff', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)', padding: '8px 12px' }}>
          <h4 className="section-title">分时电费（测算）</h4>
          <Table
            size="small"
            rowKey="key"
            pagination={false}
            dataSource={report.costRows}
            columns={[
              { title: '时段', dataIndex: 'name' },
              { title: '电量(kWh)', dataIndex: 'usage', align: 'right' as const, render: (v: number) => fmtInt(Math.round(v)) },
              { title: '电价', dataIndex: 'price', width: 90, render: (v: number) => v.toFixed(2) },
              { title: '金额(元)', dataIndex: 'amount', align: 'right' as const, render: (v: number) => fmtInt(Math.round(v)) },
            ]}
          />
          <div className="muted small mt8">仅含分时电度费；不含基本电费、需量费与税费。</div>
        </div>
        <div>
          {report.dayTypeRows.length > 0 && (
            <div className="table-card mb12" style={{ background: '#fff', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)', padding: '8px 12px' }}>
              <h4 className="section-title">学期日类型分解</h4>
              <Table
                size="small"
                rowKey="key"
                pagination={false}
                dataSource={report.dayTypeRows}
                columns={[
                  { title: '日类型', dataIndex: 'label' },
                  { title: '天数', dataIndex: 'days', width: 80 },
                  { title: '用电量(kWh)', dataIndex: 'total', align: 'right' as const },
                  { title: '日均(kWh)', dataIndex: 'avg', align: 'right' as const },
                ]}
              />
            </div>
          )}
          <div className="table-card" style={{ background: '#fff', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)', padding: '8px 12px' }}>
            <h4 className="section-title">导出记录（审计留痕）</h4>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={exportRecords}
              columns={[
                { title: '时间', dataIndex: 'time', width: 130 },
                { title: '操作人', dataIndex: 'actor', width: 84 },
                { title: '内容', dataIndex: 'detail', ellipsis: true },
              ]}
            />
            {generated && (
              <div className="small mt8" style={{ color: '#389e0d' }}>
                本次导出：{generated.type}（{generated.range}）于 {generated.at} 生成并记录
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="muted small mt8">
        报表明细合计与同口径分析页一致；如对导出结果有疑问，可在审计页查看导出条件。数据窗口 {DATA_START} 至 {DATA_END}，
        年报按窗口内可得期间编制并注明。
      </div>
    </div>
  );
}