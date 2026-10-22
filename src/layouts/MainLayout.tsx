import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import { Avatar, App, Badge, Breadcrumb, Dropdown, Layout, Menu, Space, Tag, Tooltip, theme } from 'antd';
import { BellOutlined, UserOutlined, GlobalOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { menuItems, defaultOpenKeys, MENU } from '../app/menu';
import { useIdentity, currentRole, visibleCampusIds } from '../stores/identity';
import { useFilters, currentRange } from '../stores/filters';
import { getEntities, useEntities, META } from '../services/repository';
import dayjs from 'dayjs';

const { Header, Sider, Content } = Layout;

function HeaderControls() {
  const navigate = useNavigate();
  // 订阅告警/工单状态，切换角色或处置告警后角标实时更新
  // 校区/统计区间筛选由各业务页统一筛选栏提供（全局状态共享），顶部不再重复放置校区选择器
  const pendingAlarms = useEntities(
    (s) => s.alarms.filter((a) => a.status === 'pending' || a.status === 'processing' || a.status === 'reviewing').length,
  );

  return (
    <Space size={4} wrap style={{ justifyContent: 'flex-end', width: '100%' }}>
      <Tag color="blue" style={{ marginInlineEnd: 4 }}>数据更新 {dayjs(META.asOf).format('MM-DD HH:mm')}</Tag>
      <Tooltip title="告警中心">
        <Badge count={pendingAlarms} size="small">
          <BellOutlined style={{ fontSize: 17, color: pendingAlarms > 0 ? '#fa8c16' : undefined }} onClick={() => navigate('/alarms')} />
        </Badge>
      </Tooltip>
    </Space>
  );
}

function RoleSwitcher() {
  const { userId, setUserId } = useIdentity();
  const { message } = App.useApp();
  const entities = getEntities();
  const user = entities.users.find((u) => u.id === userId) ?? entities.users[0];
  const role = currentRole();
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: entities.users.map((u) => {
          const r = entities.roles.find((x) => x.id === u.roleId);
          return {
            key: u.id,
            label: (
              <div>
                <div style={{ fontWeight: 600 }}>{u.name}（{r?.name}）</div>
                <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>{u.title}</div>
              </div>
            ),
          };
        }),
        selectedKeys: [userId],
        onClick: ({ key }) => {
          if (key === userId) return;
          setUserId(key as string);
          const picked = entities.users.find((u) => u.id === key);
          const pickedRole = entities.roles.find((r) => r.id === picked?.roleId);
          message.success(`已切换到「${picked?.name} · ${pickedRole?.name}」视角：菜单、可操作按钮与数据范围按该角色刷新`);
        },
      }}
    >
      <Space style={{ cursor: 'pointer' }} size={6}>
        <Avatar size={26} icon={<UserOutlined />} style={{ background: '#1668dc' }} />
        <span>{user.name}</span>
        <span className="muted small">{role.name}视角</span>
      </Space>
    </Dropdown>
  );
}

export default function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { restoreFromUrl } = useFilters();
  const [collapsed, setCollapsed] = useState(false);
  const { token } = theme.useToken();
  // 订阅当前用户身份：切换角色时菜单重算、内容区整体重挂载（权限与数据范围随之刷新）
  const userId = useIdentity((s) => s.userId);

  useEffect(() => {
    restoreFromUrl();
  }, [restoreFromUrl]);

  // 角色切换后，将越界的校区筛选收敛到授权范围
  useEffect(() => {
    const allowed = visibleCampusIds();
    const seesAll = allowed.length === getEntities().campuses.length;
    const { campusId } = useFilters.getState();
    if (campusId !== 'all' && !allowed.includes(campusId)) {
      useFilters.getState().setCampus(seesAll ? 'all' : allowed[0]);
    } else if (campusId === 'all' && !seesAll) {
      useFilters.getState().setCampus(allowed[0]);
    }
  }, [userId]);

  const selectedKey = useMemo(() => {
    const path = location.pathname;
    if (path.startsWith('/dashboard/campus/C-E')) return '/dashboard/campus/C-E';
    if (path.startsWith('/dashboard/campus/C-W')) return '/dashboard/campus/C-W';
    if (path.startsWith('/dashboard/campus')) return '/dashboard/campus';
    for (const group of MENU) {
      for (const leaf of group.children) {
        if (path === leaf.key) return leaf.key;
      }
    }
    const prefixes: [string, string][] = [
      ['/monitor/building/', '/monitor/electricity'],
      ['/alarms/', '/alarms'],
      ['/dashboard/energy', '/dashboard/energy'],
    ];
    for (const [prefix, key] of prefixes) {
      if (path.startsWith(prefix) && prefix !== '/alarms/') return key;
    }
    if (path.startsWith('/alarms/')) return '/alarms';
    return path;
  }, [location.pathname]);

  const breadcrumb = useMemo(() => {
    const path = location.pathname;
    const items: { title: string; path?: string }[] = [{ title: '首页', path: '/dashboard/campus' }];
    for (const group of MENU) {
      if (path.startsWith('/dashboard/campus/') && (path.endsWith('/C-E') || path.endsWith('/C-W'))) {
        items.push({ title: '综合驾驶舱' }, { title: '校区总览' });
        return items;
      }
      if (path.startsWith('/dashboard/campus')) {
        items.push({ title: '综合驾驶舱' }, { title: '校园综合概览' });
        return items;
      }
      if (path.startsWith('/monitor/building/')) {
        items.push({ title: '能源监测' }, { title: '单栋楼宇详情' });
        return items;
      }
      if (path.startsWith('/alarms/') && path !== '/alarms/rules') {
        items.push({ title: '告警与工单' }, { title: '告警详情' });
        return items;
      }
      for (const leaf of group.children) {
        if (leaf.key === path) {
          items.push({ title: group.label }, { title: leaf.label });
          return items;
        }
      }
    }
    return items;
  }, [location.pathname]);

  const { label } = currentRange(useFilters.getState().dateMode, useFilters.getState().date);

  return (
    <Layout className="app-main">
      <Sider
        className="app-sider"
        width={216}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
      >
        <div className="logo" onClick={() => navigate('/dashboard/campus')} style={{ cursor: 'pointer' }}>
          <GlobalOutlined className="logo-icon" />
          {!collapsed && <span>{META.systemName}</span>}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          items={menuItems()}
          defaultOpenKeys={defaultOpenKeys()}
          selectedKeys={[selectedKey]}
          onClick={({ key }) => {
            if (String(key).startsWith('/')) navigate(String(key));
          }}
        />
      </Sider>
      <Layout>
        <Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          <Space size={8}>
            <span
              onClick={() => setCollapsed(!collapsed)}
              style={{ cursor: 'pointer', fontSize: 16, color: token.colorText }}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </span>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{META.schoolName}</span>
            <span className="muted small">统计区间：{label}</span>
          </Space>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1, justifyContent: 'flex-end' }}>
            <HeaderControls />
            <RoleSwitcher />
          </div>
        </Header>
        <Content className="app-content">
          <Breadcrumb
            className="breadcrumb"
            items={breadcrumb.map((b, i) => ({ title: b.path && i < breadcrumb.length - 1 ? <a onClick={() => navigate(b.path!)}>{b.title}</a> : b.title }))}
            style={{ marginBottom: 8 }}
          />
          <Outlet key={userId} />
        </Content>
      </Layout>
    </Layout>
  );
}