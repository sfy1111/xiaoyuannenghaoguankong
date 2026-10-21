import { useMemo, useState } from 'react';
import { App, Button, Form, Input, Modal, Select, Space, Table, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import ExportButton from '../../components/ExportButton';
import { canEdit } from '../../stores/identity';
import { getEntities } from '../../services/repository';
import { scopeUsage } from '../../services/energyStats';
import { CATEGORY_LABEL, fmtInt } from '../../domain/units';
import type { Building, Department } from '../../domain/types';

export default function FoundationDepartmentsPage() {
  const { message } = App.useApp();
  const entities = getEntities();
  const [editBuilding, setEditBuilding] = useState<Building | null>(null);
  const [deptModal, setDeptModal] = useState<Department | 'new' | null>(null);
  const [form] = Form.useForm();
  const editable = canEdit('foundation');

  const rows = useMemo(() => {
    const from = '2026-10-01';
    const to = '2026-10-20';
    return entities.departments.map((d) => {
      const relations = entities.buildingDeptRelations.filter((r) => r.departmentId === d.id);
      const buildings = relations.map((r) => entities.buildings.find((b) => b.id === r.buildingId)).filter((b): b is Building => !!b);
      const area = relations.reduce((a, r) => {
        const b = entities.buildings.find((x) => x.id === r.buildingId);
        return a + (b ? b.assessmentArea * r.share : 0);
      }, 0);
      const usage = relations.reduce((a, r) => {
        const b = entities.buildings.find((x) => x.id === r.buildingId);
        if (!b) return a;
        const u = scopeUsage('electricity', { buildingId: b.id }, from, to).total ?? 0;
        return a + u * r.share;
      }, 0);
      const sharedCount = relations.filter((r) => r.share < 1).length;
      return {
        ...d,
        key: d.id,
        buildings,
        relations,
        area: Math.round(area),
        usage: Math.round(usage),
        sharedCount,
      };
    });
  }, [entities]);

  const exportSheet = {
    name: '组织责任单位',
    headers: ['单位编码', '名称', '类型', '负责人', '责任建筑数', '责任面积(m²)', '本期责任用电(kWh·分摊)', '共享建筑数'],
    rows: rows.map((r) => [
      r.code, r.name, r.type, r.manager, r.buildings.length, r.area, r.usage, r.sharedCount,
    ]),
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['基础档案', '组织责任单位']}
        title="组织责任单位与责任归属"
        subtitle="责任归属与费用分摊是两件事：实测优先，共享建筑按确认比例登记；责任变更留历史，仅影响后续期间"
        extra={
          <Space>
            {editable && (
              <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => {
                form.resetFields();
                form.setFieldsValue({ code: '', name: '', type: '学院', manager: '', phone: '', campusIds: ['C-E'], costCenter: '' });
                setDeptModal('new');
              }}>新增单位</Button>
            )}
            <ExportButton filename="组织责任单位" sheet={exportSheet} metaNote="责任面积=Σ(建筑面积×责任比例)；本期责任用电含分摊部分并注明" />
          </Space>
        }
      />
      <Table
        size="small"
        rowKey="id"
        dataSource={rows}
        pagination={false}
        columns={[
          { title: '单位', dataIndex: 'name', width: 130 },
          { title: '编码', dataIndex: 'code', width: 80 },
          { title: '类型', dataIndex: 'type', width: 90, render: (t: string) => <Tag color={t === '学院' ? 'purple' : t === '教学单位' ? 'blue' : 'default'}>{t}</Tag> },
          { title: '负责人', dataIndex: 'manager', width: 80 },
          { title: '责任建筑', width: 220, render: (_v, r) => (
            <Space size={4} wrap>
              {r.buildings.map((b) => <Tag key={b.id}>{b.name}</Tag>)}
              {r.buildings.length === 0 && <span className="muted">—</span>}
            </Space>
          ) },
          { title: '责任面积(m²)', dataIndex: 'area', width: 110, align: 'right' as const, render: (v: number) => fmtInt(v) },
          { title: '本月责任用电(kWh)', dataIndex: 'usage', width: 130, align: 'right' as const, render: (v: number) => fmtInt(v) },
          {
            title: '共享分摊', width: 100,
            render: (_v, r) => r.sharedCount > 0 ? <Tag color="gold">{r.sharedCount} 处共享</Tag> : <Tag>全部独立计量</Tag>,
          },
          {
            title: '操作', width: 130,
            render: (_v, r) => editable ? (
              <Space size={6}>
                <a onClick={() => {
                  form.setFieldsValue({ code: r.code, name: r.name, type: r.type, manager: r.manager, phone: r.phone, campusIds: r.campusIds, costCenter: r.costCenter });
                  setDeptModal(r);
                }}>编辑</a>
                <a onClick={() => setEditBuilding(r.buildings[0] ?? null)}>维护归属</a>
              </Space>
            ) : null,
          },
        ]}
      />
      <div className="muted small mt8">
        支持一栋建筑多个责任部门（如明川楼行政合署办公按面积分摊5个部门）；多部门分摊比例合计须为100%，余量单列“未分配”。
        责任统计不改变实测用能；学院视角的费用分摊见「能源费用 → 学院成本分摊」。
      </div>

      <Modal
        title={editBuilding ? `维护责任归属：${editBuilding.name}` : '维护责任归属'}
        open={!!editBuilding}
        onCancel={() => setEditBuilding(null)}
        footer={null}
        width={720}
      >
        {editBuilding && (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={entities.buildingDeptRelations.filter((r) => r.buildingId === editBuilding.id)}
              columns={[
                { title: '部门', render: (_v, r) => entities.departments.find((d) => d.id === r.departmentId)?.name ?? r.departmentId },
                { title: '比例', dataIndex: 'share', width: 90, render: (v: number) => `${(v * 100).toFixed(0)}%` },
                { title: '依据', dataIndex: 'basis' },
                { title: '生效起', dataIndex: 'validFrom', width: 100 },
              ]}
            />
            <div className="muted small">
              分摊比例修改入口：在「能源费用 → 学院成本分摊」页按成本分摊口径维护；此处为责任归属档案。
              当前比例合计 {(entities.buildingDeptRelations.filter((r) => r.buildingId === editBuilding.id).reduce((a, r) => a + r.share, 0) * 100).toFixed(0)}%。
            </div>
          </Space>
        )}
      </Modal>

      <Modal
        title={deptModal === 'new' ? '新增组织单位' : `编辑单位：${deptModal ? deptModal.name : ''}`}
        open={!!deptModal}
        onOk={async () => {
          const v = await form.validateFields();
          if (deptModal === 'new') {
            const created = entities.actions.addDepartment({
              code: v.code, name: v.name, parent: null, type: v.type, manager: v.manager,
              phone: v.phone || '—', campusIds: v.campusIds, costCenter: v.costCenter || '—', validFrom: dayjs('2026-10-21').format('YYYY-MM-DD'),
            });
            if (!created) {
              message.error('单位编码已存在（编码须唯一），请修改后重试');
              return;
            }
            message.success(`单位「${v.name}」已建档；可在建筑档案与分摊页建立责任归属`);
          } else if (deptModal) {
            entities.actions.updateDepartment(deptModal.id, { name: v.name, type: v.type, manager: v.manager, phone: v.phone });
            message.success('单位档案已更新（责任变更留历史，仅影响后续期间）');
          }
          setDeptModal(null);
        }}
        onCancel={() => setDeptModal(null)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="单位编码（唯一）" rules={[{ required: true }]}><Input disabled={deptModal !== 'new'} placeholder="如 ORG-13" /></Form.Item>
          <Form.Item name="name" label="单位名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="type" label="单位性质" rules={[{ required: true }]}>
            <Select options={['学院', '管理部门', '教学单位', '教学辅助', '后勤服务', '商户'].map((t) => ({ value: t, label: t }))} />
          </Form.Item>
          <Form.Item name="manager" label="负责人" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="phone" label="联系电话"><Input placeholder="如 025-8816xxxx" /></Form.Item>
          {deptModal === 'new' && (
            <Form.Item name="campusIds" label="管理校区" rules={[{ required: true }]}>
              <Select mode="multiple" options={entities.campuses.map((c) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
          )}
          {deptModal === 'new' && <Form.Item name="costCenter" label="成本中心"><Input placeholder="如 CC-1013" /></Form.Item>}
        </Form>
      </Modal>
    </div>
  );
}