import { useState } from 'react';
import { Alert, App, Button, Form, Input, Modal, Select, Space, Table, Tag, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { useIdentity, currentRole, canView, canEdit, canApprove } from '../../stores/identity';
import { getEntities } from '../../services/repository';
import { MENU } from '../../app/menu';
import type { Role, User } from '../../domain/types';

const ACTION_LABEL: Record<string, string> = {
  canView: '可见',
  canEdit: '可编辑',
  canApprove: '可审批',
};

export default function SystemUsersPage() {
  const { userId, setUserId } = useIdentity();
  const { message, modal } = App.useApp();
  const entities = getEntities();
  const role = currentRole();
  const modules = MENU.map((g) => ({ key: g.module, label: g.label }));
  const editable = canEdit('system');
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [form] = Form.useForm();

  const openAdd = () => {
    form.resetFields();
    form.setFieldsValue({ account: '', name: '', title: '', roleId: 'R-MANAGER', departmentId: 'D-HQC' });
    setAddOpen(true);
  };

  const submitAdd = async () => {
    const v = await form.validateFields();
    const created = entities.actions.addUser(v);
    if (!created) {
      message.error('账号已存在（账号须唯一），请修改后重试');
      return;
    }
    message.success(`用户「${v.name}」已创建（初始角色按所选授权，未登录），历史审批与审计规则保持有效`);
    setAddOpen(false);
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    const v = await form.validateFields();
    entities.actions.updateUser(editTarget.id, { roleId: v.roleId, title: v.title, departmentId: v.departmentId });
    if (editTarget.id === userId) {
      message.info('已修改当前视角用户的角色，界面将按新权限刷新');
    } else {
      message.success('用户角色与岗位已更新（权限授予与回收写入审计）');
    }
    setEditTarget(null);
  };

  const toggleStatus = (u: User) => {
    if (u.id === userId) {
      message.warning('不能停用当前登录视角用户');
      return;
    }
    modal.confirm({
      title: u.status === 'active' ? `停用用户「${u.name}」？` : `启用用户「${u.name}」？`,
      content: '停用后该账号不可用，但其历史审批记录全部保留；重新启用可恢复。',
      okText: u.status === 'active' ? '停用' : '启用',
      cancelText: '取消',
      onOk: () => {
        entities.actions.setUserStatus(u.id, u.status === 'active' ? 'inactive' : 'active');
        message.success(u.status === 'active' ? '用户已停用，历史记录保留' : '用户已启用');
      },
    });
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['系统管理', '用户与角色']}
        title="用户、角色与数据范围"
        subtitle="按角色+校区/建筑/部门数据范围授权；“能查看”与“能修改/审批”分离；前端演示权限不是正式安全认证"
        extra={editable ? <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd}>新增用户</Button> : undefined}
      />
      <Alert
        className="mb12"
        type="info"
        showIcon
        message="演示说明"
        description="本系统不提供登录页与真实认证，右上角切换“角色视角”演示不同权限的菜单与数据范围差异。生产环境须由服务端按角色和责任校区做数据授权。"
      />

      <div className="chart-grid c2">
        <div className="table-card" style={{ background: '#fff', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)', padding: '8px 12px' }}>
          <h4 className="section-title">用户清单（点击切换演示视角）</h4>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={entities.users}
            rowClassName={(r) => (r.id === userId ? 'ant-table-row-selected' : '')}
            onRow={(r) => ({ onClick: () => setUserId(r.id), style: { cursor: 'pointer' } })}
            columns={[
              { title: '姓名', dataIndex: 'name', width: 90 },
              { title: '岗位', dataIndex: 'title', ellipsis: true },
              { title: '角色', dataIndex: 'roleId', width: 110, render: (r: string) => <Tag color="blue">{entities.roles.find((x) => x.id === r)?.name}</Tag> },
              { title: '最近登录', dataIndex: 'lastLogin', width: 130 },
              {
                title: '状态', dataIndex: 'status', width: 76,
                render: (s: string, u) => <Tag color={s === 'active' ? 'green' : 'default'}>{s === 'active' ? '启用' : '停用'}{u.id === userId ? '（当前）' : ''}</Tag>,
              },
              ...(editable ? [{
                title: '操作', width: 130,
                render: (_v: unknown, u: User) => (
                  <Space size={4}>
                    <a onClick={(e) => {
                      e.stopPropagation();
                      form.setFieldsValue({ roleId: u.roleId, title: u.title, departmentId: u.departmentId });
                      setEditTarget(u);
                    }}>编辑</a>
                    <a
                      style={{ color: u.status === 'active' ? '#cf1322' : '#389e0d' }}
                      onClick={(e) => { e.stopPropagation(); toggleStatus(u); }}
                    >
                      {u.status === 'active' ? '停用' : '启用'}
                    </a>
                  </Space>
                ),
              }] : []),
            ]}
          />
        </div>
        <div className="table-card" style={{ background: '#fff', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)', padding: '8px 12px' }}>
          <h4 className="section-title">当前角色：{role.name}</h4>
          <div className="small" style={{ marginBottom: 8 }}>{role.description}</div>
          <div className="small">数据范围：{role.allowedCampusIds.length === entities.campuses.length ? '全部校区' : role.allowedCampusIds.map((c) => entities.campuses.find((x) => x.id === c)?.name).join('、')}</div>
          {role.departmentId && <div className="small">授权部门：{entities.departments.find((d) => d.id === role.departmentId)?.name}（仅可见关联建筑）</div>}
          <div className="mt8">
            <b className="small">业务限制：</b>
            {role.restrictions.map((r) => <div key={r} className="muted small">· {r}</div>)}
          </div>
        </div>
      </div>

      <div className="table-card">
        <h4 className="section-title">角色权限矩阵（模块 × 可见/编辑/审批）</h4>
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={entities.roles}
          columns={[
            { title: '角色', dataIndex: 'name', width: 120 },
            { title: '数据范围', width: 130, render: (_v, r) => r.allowedCampusIds.length === entities.campuses.length ? '全部校区' : r.allowedCampusIds.map((c) => entities.campuses.find((x) => x.id === c)?.name).join('/') },
            ...modules.map((m) => ({
              title: m.label,
              render: (_v: unknown, r: Role) => {
                const view = r.canView.includes(m.key);
                const edit = r.canEdit.includes(m.key);
                const approve = r.canApprove.includes(m.key);
                if (!view) return <span className="muted">—</span>;
                return (
                  <Space size={2}>
                    <Tooltip title="可见"><Tag color="blue" style={{ marginInlineEnd: 0 }}>见</Tag></Tooltip>
                    {edit && <Tooltip title="可编辑"><Tag color="green" style={{ marginInlineEnd: 0 }}>编</Tag></Tooltip>}
                    {approve && <Tooltip title="可审批"><Tag color="purple" style={{ marginInlineEnd: 0 }}>审</Tag></Tooltip>}
                  </Space>
                );
              },
            })),
          ]}
        />
      </div>

      <div className="muted small mt8">
        当前视角权限速览：{modules.map((m) => `${m.label}=${canView(m.key) ? (canEdit(m.key) ? (canApprove(m.key) ? '见/编/审' : '见/编') : '见') : '无'}`).join('，')}。
        删除用户不删除其历史审批记录；财务账单与宿舍房间级数据需单独授权（本演示不提供房间级明细）。
      </div>

      <Modal
        title={addOpen ? '新增用户' : `编辑用户：${editTarget?.name ?? ''}`}
        open={addOpen || !!editTarget}
        onOk={addOpen ? submitAdd : submitEdit}
        onCancel={() => { setAddOpen(false); setEditTarget(null); }}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          {addOpen && (
            <Space size={12} style={{ display: 'flex' }}>
              <Form.Item name="account" label="账号（唯一）" rules={[{ required: true }, { pattern: /^[A-Za-z0-9_.-]+$/, message: '仅允许字母、数字与._-' }]}><Input placeholder="如 lisi01" /></Form.Item>
              <Form.Item name="name" label="姓名" rules={[{ required: true }]}><Input /></Form.Item>
            </Space>
          )}
          <Form.Item name="title" label="岗位/职务" rules={[{ required: true }]}><Input placeholder="如 能源管理办公室工程师" /></Form.Item>
          <Form.Item name="roleId" label="角色（决定可访问模块与数据范围）" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={entities.roles.map((r) => ({
                value: r.id,
                label: `${r.name}（${r.allowedCampusIds.length === entities.campuses.length ? '全部校区' : r.allowedCampusIds.map((c) => entities.campuses.find((x) => x.id === c)?.name).join('/')}）`,
              }))}
            />
          </Form.Item>
          <Form.Item name="departmentId" label="所属组织" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={entities.departments.map((d) => ({ value: d.id, label: d.name }))} />
          </Form.Item>
          <div className="muted small">角色变更即时生效于菜单与数据范围（权限授予与回收写入审计）；创建/停用不影响历史审批记录。</div>
        </Form>
      </Modal>
    </div>
  );
}