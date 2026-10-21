import { useMemo, useState } from 'react';
import {
  App, Button, Calendar, Card, DatePicker, Form, Input, Modal, Select, Space, Table, Tag,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { canEdit, canApprove } from '../../stores/identity';
import { getEntities } from '../../services/repository';
import { DAY_TYPE_LABEL, resolveDay } from '../../domain/calendar';
import { CATEGORY_LABEL } from '../../domain/units';
import type { DayType } from '../../domain/types';

const DAY_TYPE_COLOR: Record<DayType, string> = {
  teaching: '#e6f4ff',
  exam: '#f9f0ff',
  weekend: '#f5f5f5',
  vacation: '#fff7e6',
  holiday: '#fff1f0',
  special: '#f6ffed',
};

export default function FoundationCalendarPage() {
  const { message, modal } = App.useApp();
  const entities = getEntities();
  const cal = entities.calendar;
  const [month, setMonth] = useState(dayjs('2026-10-01'));
  const [dayModal, setDayModal] = useState<{ open: boolean; date?: string }>({ open: false });
  const [semModal, setSemModal] = useState(false);
  const [examModal, setExamModal] = useState(false);
  const [hoursTarget, setHoursTarget] = useState<string | null>(null);
  const [form] = Form.useForm<{ name: string; type: 'holiday' | 'special'; start: dayjs.Dayjs; end: dayjs.Dayjs }>();
  const [semForm] = Form.useForm<{ name: string; type: 'term' | 'winterBreak' | 'summerBreak'; start: dayjs.Dayjs; end: dayjs.Dayjs }>();
  const [examForm] = Form.useForm<{ name: string; start: dayjs.Dayjs; end: dayjs.Dayjs }>();
  const [hoursForm] = Form.useForm();

  const editable = canEdit('calendar');
  const approvable = canApprove('calendar');

  const cellInfo = (date: dayjs.Dayjs) => {
    const iso = date.format('YYYY-MM-DD');
    const resolved = resolveDay(iso, cal);
    return { iso, resolved };
  };

  const specialDaysOfMonth = useMemo(
    () => cal.specialDays.filter((s) => dayjs(s.date).isSame(month, 'month') || dayjs(s.end).isSame(month, 'month')),
    [cal, month],
  );

  const submitDay = async () => {
    const values = await form.validateFields();
    const start = values.start.format('YYYY-MM-DD');
    const end = values.end.format('YYYY-MM-DD');
    if (end < start) {
      message.error('结束日期不能早于开始日期');
      return;
    }
    const overlap = cal.specialDays.find((s) => {
      const sameType = s.type === values.type;
      return sameType && !(s.end < start || end < s.date);
    });
    if (overlap) {
      message.error(`与已有特殊日「${overlap.name}」（${overlap.date}至${overlap.end}）重叠，同类型日期不可重复定义`);
      return;
    }
    entities.actions.addSpecialDay({ date: start, end, type: values.type, name: values.name });
    message.success('校历已保存，教学时段分析、假期对比与非教学时段告警将按新校历重新计算');
    setDayModal({ open: false });
  };

  const submitHours = async () => {
    const values = await hoursForm.validateFields();
    const rule = cal.openHours.find((o) => o.id === hoursTarget);
    if (!rule) return;
    const patch: Record<string, string> = {};
    if (values.start) patch.start = values.start;
    if (values.end) patch.end = values.end;
    if (values.examExtension) patch.examExtension = values.examExtension;
    if (values.breakStart) patch.breakStart = values.breakStart;
    if (values.breakEnd) patch.breakEnd = values.breakEnd;
    if (patch.start && patch.end && patch.start >= patch.end) {
      message.error('开放开始时间必须早于结束时间');
      return;
    }
    entities.actions.updateOpenHours(rule.id, patch);
    message.success(`${rule.category} 开放时间已更新，时段分析联动刷新`);
    setHoursTarget(null);
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['基础档案', '学年日历与开放时间']}
        title="学年日历与开放时间管理"
        subtitle={
          <Space size={8} wrap>
            <span>学期、考试周、寒暑假、法定假日与建筑开放时间统一维护；变更后相关分析按新校历重算</span>
            <span className="muted">{editable ? '当前角色可维护校历' : '当前角色仅可查看，维护需后勤主管权限'}</span>
          </Space>
        }
        extra={editable ? <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setDayModal({ open: true }); }}>新增特殊日</Button> : undefined}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
        <Card size="small" title={month.format('YYYY年MM月')} extra={<DatePicker size="small" picker="month" value={month} allowClear={false} onChange={(v) => v && setMonth(v)} />} styles={{ body: { padding: 8 } }}>
          <Calendar
            fullscreen={false}
            value={month}
            onSelect={(d) => setMonth(d)}
            cellRender={(current, info) => {
              if (info.type !== 'date') return info.originNode;
              const { resolved } = cellInfo(current as dayjs.Dayjs);
              return (
                <div
                  style={{
                    background: DAY_TYPE_COLOR[resolved.dayType],
                    borderRadius: 4,
                    padding: '2px 6px',
                    textAlign: 'center',
                    minHeight: 36,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{(current as dayjs.Dayjs).date()}</div>
                  <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.55)' }}>{DAY_TYPE_LABEL[resolved.dayType]}</div>
                  {resolved.specialName && <div style={{ fontSize: 10, color: '#d4380d' }}>{resolved.specialName.slice(0, 6)}</div>}
                </div>
              );
            }}
          />
          <Space size={12} wrap style={{ marginTop: 8 }}>
            {(Object.keys(DAY_TYPE_LABEL) as DayType[]).map((t) => (
              <span key={t} className="small">
                <span style={{ display: 'inline-block', width: 12, height: 12, background: DAY_TYPE_COLOR[t], borderRadius: 3, verticalAlign: -2, marginRight: 4, border: '1px solid rgba(0,0,0,0.1)' }} />
                {DAY_TYPE_LABEL[t]}
              </span>
            ))}
          </Space>
        </Card>

        <Card size="small" title="本月特殊日" styles={{ body: { padding: 8 } }}>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={specialDaysOfMonth}
            columns={[
              { title: '名称', dataIndex: 'name' },
              { title: '类型', dataIndex: 'type', width: 90, render: (t: string) => <Tag color={t === 'holiday' ? 'red' : 'green'}>{t === 'holiday' ? '法定假日' : '特殊活动日'}</Tag> },
              { title: '日期', width: 150, render: (_v, s) => s.date === s.end ? s.date : `${s.date} 至 ${s.end}` },
              {
                title: '', width: 40,
                render: (_v, s) => editable ? (
                  <a style={{ color: '#cf1322' }} onClick={() => {
                    modal.confirm({
                      title: '删除特殊日',
                      content: `确认删除「${s.name}」？删除后相关时段将回归学期/周末默认日类型。`,
                      onOk: () => {
                        entities.actions.removeSpecialDay(s.id);
                        message.success('已删除，时段分析按默认日类型重算');
                      },
                    });
                  }}><DeleteOutlined /></a>
                ) : null,
              },
            ]}
          />
          {specialDaysOfMonth.length === 0 && <div className="muted" style={{ padding: 8 }}>本月无特殊日定义</div>}
          <div className="muted small mt8">调休工作日与临时开放日按“特殊活动日”登记；历史校历调整需主管复核生效。</div>
        </Card>
      </div>

      <div className="chart-grid c2 mt12">
        <Card size="small" title="学期与假期结构" styles={{ body: { padding: 8 }}}
          extra={editable ? (
            <Space size={6}>
              <Button size="small" onClick={() => { semForm.resetFields(); semForm.setFieldsValue({ name: '', type: 'term', start: dayjs('2027-02-22'), end: dayjs('2027-06-30') }); setSemModal(true); }}>新增学期/假期</Button>
              <Button size="small" onClick={() => { examForm.resetFields(); examForm.setFieldsValue({ name: '', start: dayjs('2027-01-04'), end: dayjs('2027-01-15') }); setExamModal(true); }}>新增考试周</Button>
            </Space>
          ) : undefined}
        >
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={cal.semesters}
            columns={[
              { title: '名称', dataIndex: 'name' },
              { title: '类型', dataIndex: 'type', width: 90, render: (t: string) => <Tag color={t === 'term' ? 'blue' : 'orange'}>{t === 'term' ? '学期' : t === 'summerBreak' ? '暑假' : '寒假'}</Tag> },
              { title: '起止', width: 190, render: (_v, s) => `${s.start} 至 ${s.end}` },
              ...(editable ? [{
                title: '', width: 50,
                render: (_v: unknown, s: { id: string; name: string }) => (
                  <a style={{ color: '#cf1322' }} onClick={() => {
                    modal.confirm({
                      title: '删除学期/假期',
                      content: `确认删除「${s.name}」？删除后该期间日类型回归默认口径，教学时段分析按新校历重算（需主管复核）。`,
                      onOk: () => {
                        entities.actions.removeSemester(s.id);
                        message.success('已删除，时段分析按默认口径重算');
                      },
                    });
                  }}>删除</a>
                ),
              }] : []),
            ]}
          />
          <h4 className="section-title mt12">考试周</h4>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={cal.examWeeks}
            columns={[
              { title: '名称', dataIndex: 'name' },
              { title: '起止', width: 190, render: (_v, w) => `${w.start} 至 ${w.end}` },
              ...(editable ? [{
                title: '', width: 50,
                render: (_v: unknown, w: { id: string; name: string }) => (
                  <a style={{ color: '#cf1322' }} onClick={() => {
                    modal.confirm({
                      title: '删除考试周',
                      content: `确认删除「${w.name}」？删除后该期间按普通教学日统计。`,
                      onOk: () => {
                        entities.actions.removeExamWeek(w.id);
                        message.success('考试周已删除');
                      },
                    });
                  }}>删除</a>
                ),
              }] : []),
            ]}
          />
          {editable && <div className="muted small mt8">校验规则：同类型学期/假期不得重叠；考试周须落在某学期内且不得与其他考试周重叠。</div>}
        </Card>
        <Card size="small" title="建筑类别开放时间" styles={{ body: { padding: 8 } }} extra={<span className="muted small">时段分析的时间边界来源</span>}>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={cal.openHours}
            onRow={(r) => ({ style: { cursor: editable ? 'pointer' : undefined }, onClick: () => { if (!editable) return; setHoursTarget(r.id); hoursForm.setFieldsValue({ start: r.start, end: r.end, examExtension: r.examExtension, breakStart: r.breakStart, breakEnd: r.breakEnd }); } })}
            columns={[
              { title: '类别', dataIndex: 'category', width: 100, render: (c: string) => CATEGORY_LABEL[c as keyof typeof CATEGORY_LABEL] ?? c },
              { title: '教学日', width: 110, render: (_v, r) => `${r.start}-${r.end}` },
              { title: '考试周', width: 90, dataIndex: 'examExtension' },
              { title: '假期', width: 110, render: (_v, r) => `${r.breakStart}-${r.breakEnd}` },
              { title: '说明', render: (_v, r) => <span className="muted small">{r.remark}</span> },
            ]}
          />
          {editable && <div className="muted small mt8">点击行编辑开放时间</div>}
        </Card>
      </div>

      <Modal
        title="新增特殊日"
        open={dayModal.open}
        onOk={submitDay}
        onCancel={() => setDayModal({ open: false })}
        okText="保存（触发分析重算）"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如 2027年元旦假期" />
          </Form.Item>
          <Space>
            <Form.Item name="start" label="开始日期" rules={[{ required: true, message: '请选择开始日期' }]}>
              <DatePicker />
            </Form.Item>
            <Form.Item name="end" label="结束日期" rules={[{ required: true, message: '请选择结束日期' }]}>
              <DatePicker />
            </Form.Item>
          </Space>
          <Form.Item name="type" label="类型" rules={[{ required: true }]} initialValue="holiday">
            <Select options={[{ value: 'holiday', label: '法定假日（停课）' }, { value: 'special', label: '特殊活动日（如校庆，建筑照常开放）' }]} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="新增学期/假期"
        open={semModal}
        onOk={async () => {
          const v = await semForm.validateFields();
          const created = entities.actions.addSemester({
            name: v.name,
            type: v.type,
            start: v.start.format('YYYY-MM-DD'),
            end: v.end.format('YYYY-MM-DD'),
          });
          if (!created) {
            message.error('保存被阻止：起止日期非法，或与同类型学期/假期重叠（同一校区主要学期不应无说明重叠）');
            return;
          }
          message.success('学期/假期已保存，教学时段分析按新校历重算');
          setSemModal(false);
        }}
        onCancel={() => setSemModal(false)}
        okText="保存（触发重算）"
        cancelText="取消"
      >
        <Form form={semForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input placeholder="如 2026-2027学年春季学期" /></Form.Item>
          <Space>
            <Form.Item name="type" label="类型" rules={[{ required: true }]}>
              <Select options={[
                { value: 'term', label: '学期' },
                { value: 'winterBreak', label: '寒假' },
                { value: 'summerBreak', label: '暑假' },
              ]} />
            </Form.Item>
            <Form.Item name="start" label="开始日期" rules={[{ required: true }]}><DatePicker /></Form.Item>
            <Form.Item name="end" label="结束日期" rules={[{ required: true }]}><DatePicker /></Form.Item>
          </Space>
        </Form>
      </Modal>

      <Modal
        title="新增考试周"
        open={examModal}
        onOk={async () => {
          const v = await examForm.validateFields();
          const created = entities.actions.addExamWeek({
            name: v.name,
            start: v.start.format('YYYY-MM-DD'),
            end: v.end.format('YYYY-MM-DD'),
          });
          if (!created) {
            message.error('保存被阻止：考试周须落在某学期内，且不得与其他考试周重叠');
            return;
          }
          message.success('考试周已保存；图书馆等延长开放时段分析将同步生效');
          setExamModal(false);
        }}
        onCancel={() => setExamModal(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={examForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input placeholder="如 2026-2027学年秋季学期期末考试周" /></Form.Item>
          <Space>
            <Form.Item name="start" label="开始日期" rules={[{ required: true }]}><DatePicker /></Form.Item>
            <Form.Item name="end" label="结束日期" rules={[{ required: true }]}><DatePicker /></Form.Item>
          </Space>
        </Form>
      </Modal>

      <Modal
        title={`维护开放时间：${hoursTarget}`}
        open={!!hoursTarget}
        onOk={submitHours}
        onCancel={() => setHoursTarget(null)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={hoursForm} layout="vertical">
          <Space>
            <Form.Item name="start" label="教学日开放开始" rules={[{ required: true }]}>
              <Input placeholder="07:00" />
            </Form.Item>
            <Form.Item name="end" label="教学日开放结束" rules={[{ required: true }]}>
              <Input placeholder="22:30" />
            </Form.Item>
          </Space>
          <Space>
            <Form.Item name="examExtension" label="考试周开放至">
              <Input placeholder="23:00" />
            </Form.Item>
            <Form.Item name="breakStart" label="假期开放开始">
              <Input placeholder="08:30" />
            </Form.Item>
            <Form.Item name="breakEnd" label="假期开放结束">
              <Input placeholder="17:30" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
      {approvable && <div className="muted small mt8">提示：日历版本变更需主管复核后对分析生效，历史期间指标按变更时点版本重算并保留版本标记。</div>}
    </div>
  );
}