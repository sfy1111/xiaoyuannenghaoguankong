import { useMemo, useState } from 'react';
import { App, Button, DatePicker, Descriptions, Segmented, Space, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import ExportButton from '../../components/ExportButton';
import { FilterBar } from '../../components/FilterBar';
import { getEntities, studentsOfMonth } from '../../services/repository';
import { scopeUsage } from '../../services/energyStats';
import { fmtInt } from '../../domain/units';
import { monthRange } from '../../domain/time';

type PeriodTab = 'term' | 'year';

export default function PublicInstitutionsPage() {
  const { message } = App.useApp();
  const [tab, setTab] = useState<PeriodTab>('year');
  const [anchor, setAnchor] = useState('2026-10-20');
  const entities = getEntities();

  const data = useMemo(() => {
    let from: string;
    let to: string;
    let label: string;
    if (tab === 'year') {
      from = '2026-01-01';
      to = anchor;
      label = '2026年度（截至10月20日）';
    } else {
      from = '2026-08-31';
      to = anchor;
      label = '2026-2027学年秋季学期（截至10月20日）';
    }
    const elec = scopeUsage('electricity', { campusId: 'all' }, from, to);
    const water = scopeUsage('water', { campusId: 'all' }, from, to);
    const gas = scopeUsage('gas', { campusId: 'all' }, from, to);
    const cooling = scopeUsage('cooling', { campusId: 'all' }, from, to);
    const heat = scopeUsage('heat', { campusId: 'all' }, from, to);
    const students = studentsOfMonth(anchor.slice(0, 7));
    const area = entities.buildings.filter((b) => b.status === 'active').reduce((a, b) => a + b.assessmentArea, 0);
    const campusArea = entities.campuses.reduce((a, c) => a + c.area, 0);
    return { from, to, label, elec, water, gas, cooling, heat, students, area, campusArea };
  }, [tab, anchor, entities]);

  const exportSheet = {
    name: '公共机构能源资源统计',
    headers: ['统计项目', '数值', '单位', '备注'],
    rows: [
      ['统计期间', data.label, '', `${data.from}至${data.to}`],
      ['用电量', fmtInt(Math.round(data.elec.total ?? 0)), 'kWh', data.elec.incomplete ? '含缺失样本未计' : '购入边界口径'],
      ['用水量', fmtInt(Math.round(data.water.total ?? 0)), 'm³', data.water.incomplete ? '含缺失样本未计' : '总进水表口径'],
      ['天然气量', fmtInt(Math.round(data.gas.total ?? 0)), 'm³', '工况体积，未做标况换算'],
      ['供冷量', fmtInt(Math.round(data.cooling.total ?? 0)), 'kWh', '能源站产出侧（内部转换，不与购入量相加）'],
      ['供热量', fmtInt(Math.round(data.heat.total ?? 0)), 'kWh', '能源站产出侧（内部转换，不与购入量相加）'],
      ['综合能源消费量', '未填报', 'tce', '未配置能源折标系数，不提供折标数值'],
      ['建筑总面积', fmtInt(data.campusArea), 'm²', '校区占地面积口径'],
      ['考核建筑面积', fmtInt(data.area), 'm²', '在用建筑考核面积合计'],
      ['在校学生数', data.students ? fmtInt(data.students.total) : '缺少数据', '人', `${anchor.slice(0, 7)}月注册口径`],
      ['生均用电量', data.students && data.elec.total ? (data.elec.total / data.students.total).toFixed(1) : '不可计算', 'kWh/生', '分母为当期注册学生数'],
      ['单位面积用电', data.elec.total ? (data.elec.total / data.area).toFixed(2) : '不可计算', 'kWh/m²', '分母为考核建筑面积'],
      ['数据质量说明', '缺失/无效样本不计入；人工补录经审批标记', '', '完整率见数据质量页'],
    ],
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['报表中心', '公共机构统计表']}
        title="公共机构能源资源统计表"
        subtitle={
          <Space size={8} wrap>
            <span>按公共机构报送口径生成的固定模板；与报送口径不一致的数据不默认替代，缺少佐证资料处注明</span>
            <span className="muted">折标数值在未配置系数时不填报（不提供伪造值）</span>
          </Space>
        }
        extra={
          <Space>
            <Button size="small" onClick={() => { message.info('审核说明：本表数据与驾驶舱/分析页同口径生成；正式上报前需后勤处与财务处联合复核并留存导出记录'); }}>审核说明</Button>
            <ExportButton filename={`公共机构能源资源统计_${tab === 'year' ? '2026年度' : '2026秋季学期'}`} sheet={exportSheet} metaNote={`固定报表模板；统计期间${data.label}；单位与口径见报表备注列`} />
          </Space>
        }
      />
      <FilterBar>
        <span className="filter-label">统计期</span>
        <Segmented size="small" value={tab} options={[{ value: 'year', label: '年度' }, { value: 'term', label: '学期' }]} onChange={(v) => setTab(v as PeriodTab)} />
        <span className="filter-label">截止</span>
        <DatePicker size="small" value={dayjs(anchor)} allowClear={false} onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))} />
        <span className="muted small">不同主管部门表式可能变化，实际报送按适用表格执行</span>
      </FilterBar>

      <div className="table-card">
        <h4 className="section-title">能源资源消费统计（{data.label}）</h4>
        <Table
          size="small"
          rowKey="item"
          pagination={false}
          dataSource={[
            { item: '用电量', value: fmtInt(Math.round(data.elec.total ?? 0)), unit: 'kWh', note: '购入边界（进线关口表）口径' },
            { item: '用水量', value: fmtInt(Math.round(data.water.total ?? 0)), unit: 'm³', note: '总进水表（购水）口径' },
            { item: '天然气量', value: fmtInt(Math.round(data.gas.total ?? 0)), unit: 'm³', note: '工况体积，未做标况换算' },
            { item: '供冷量（内部转换）', value: fmtInt(Math.round(data.cooling.total ?? 0)), unit: 'kWh', note: '能源站产出侧；不与购入电量相加，防止重复统计' },
            { item: '供热量（内部转换）', value: fmtInt(Math.round(data.heat.total ?? 0)), unit: 'kWh', note: '能源站产出侧；不与购入电量相加' },
            { item: '综合能源消费量', value: <Tag color="orange">未填报</Tag>, unit: 'tce', note: '未配置折标系数与统计边界，不提供折标数值' },
            { item: '生均用电量', value: data.students && data.elec.total ? (data.elec.total / data.students.total).toFixed(1) : '不可计算', unit: 'kWh/生', note: `分母：${anchor.slice(0, 7)}月注册学生 ${data.students ? fmtInt(data.students.total) : '—'} 人` },
            { item: '单位面积用电', value: data.elec.total ? (data.elec.total / data.area).toFixed(2) : '不可计算', unit: 'kWh/m²', note: `分母：考核建筑面积 ${fmtInt(data.area)} m²` },
          ]}
          columns={[
            { title: '统计项目', dataIndex: 'item', width: 180 },
            { title: '数值', dataIndex: 'value', width: 140, align: 'right' as const },
            { title: '单位', dataIndex: 'unit', width: 80 },
            { title: '口径备注', dataIndex: 'note' },
          ]}
        />
      </div>

      <div className="table-card">
        <h4 className="section-title">上报核对事项</h4>
        <Descriptions size="small" bordered column={1}>
          <Descriptions.Item label="数据一致性">与能耗分析、驾驶舱同口径生成；导出记录在审计页留痕</Descriptions.Item>
          <Descriptions.Item label="缺数处理">缺失/无效样本不计入统计并保留标记；估算与人工修正计入并标注</Descriptions.Item>
          <Descriptions.Item label="佐证资料">建筑面积以学校权威台账为准；学生人数以注册口径月度快照为准；缺少项在备注注明</Descriptions.Item>
          <Descriptions.Item label="人工确认">正式报送前需人工确认各项数值并签署（本演示完成数据生成与导出，不替代报送流程）</Descriptions.Item>
        </Descriptions>
      </div>
    </div>
  );
}