import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import { Avatar, App, Badge, Breadcrumb, Button, Dropdown, Layout, Menu, Space, Tag, Tooltip, theme } from 'antd';
import { ArrowLeftOutlined, BellOutlined, UserOutlined, GlobalOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { menuItems, defaultOpenKeys, MENU } from '../app/menu';
import { useIdentity, currentRole, visibleCampusIds } from '../stores/identity';
import { useFilters, currentRange } from '../stores/filters';
import { useNavigation, resolveTitle } from '../stores/navigation';
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
      <Tag color="blue" className="header-asof" style={{ marginInlineEnd: 4, whiteSpace: 'nowrap' }}>数据更新 {dayjs(META.asOf).format('MM-DD HH:mm')}</Tag>
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
      <div className="role-switcher">
        <Avatar size={26} icon={<UserOutlined />} style={{ background: '#1668dc' }} />
        <span className="role-switcher-name">{user.name}</span>
        <Tooltip title={`${role.name}视角`}>
          <span className="muted small role-switcher-role">{role.name}视角</span>
        </Tooltip>
      </div>
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

  // 钻取导航轨迹：随路由变化维护（识别菜单入口/页内钻取/浏览器后退）
  const trail = useNavigation((s) => s.trail);
  useEffect(() => {
    useNavigation.getState().onLocationChange(location.pathname);
  }, [location.pathname]);

  const goTrailTo = (path: string) => {
    useNavigation.getState().goTo(path);
    navigate(path);
  };

  const breadcrumb = useMemo(() => {
    // 有跳转轨迹时按“来源链”展示（每级可点击回跳）；直接打开/无轨迹时回退静态菜单位置
    if (trail.length > 1) {
      const items: { title: ReactNode }[] = [];
      const startsAtHome = trail[0].path === '/dashboard/campus';
      if (!startsAtHome) {
        items.push({
          title: <a onClick={() => { useNavigation.getState().markMenuJump(); navigate('/dashboard/campus'); }}>首页</a>,
        });
      }
      trail.slice(0, -1).forEach((e) => {
        items.push({ title: <a onClick={() => goTrailTo(e.path)}>{e.title}</a> });
      });
      items.push({ title: trail[trail.length - 1].title });
      return items;
    }
    const path = location.pathname;
    const items: { title: ReactNode }[] = [
      { title: <a onClick={() => { useNavigation.getState().markMenuJump(); navigate('/dashboard/campus'); }}>首页</a> },
    ];
    for (const group of MENU) {
      if (path.startsWith('/dashboard/campus/') && (path.endsWith('/C-E') || path.endsWith('/C-W'))) {
        items.push({ title: '综合驾驶舱' }, { title: resolveTitle(path) });
        return items;
      }
      if (path.startsWith('/dashboard/campus')) {
        items.push({ title: '综合驾驶舱' }, { title: '校园综合概览' });
        return items;
      }
      if (path.startsWith('/monitor/building/')) {
        items.push({ title: '能源监测' }, { title: resolveTitle(path) });
        return items;
      }
      if (path.startsWith('/alarms/') && path !== '/alarms/rules') {
        items.push({ title: '告警与工单' }, { title: resolveTitle(path) });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trail, location.pathname]);

  const prevEntry = trail.length >= 2 ? trail[trail.length - 2] : null;

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
        <div className="logo" onClick={() => { useNavigation.getState().markMenuJump(); navigate('/dashboard/campus'); }} style={{ cursor: 'pointer' }}>
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
            if (String(key).startsWith('/')) {
              useNavigation.getState().markMenuJump();
              navigate(String(key));
            }
          }}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="header-left">
            <span
              onClick={() => setCollapsed(!collapsed)}
              style={{ cursor: 'pointer', fontSize: 16, color: token.colorText, flex: '0 0 auto' }}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </span>
            <span className="header-school">{META.schoolName}</span>
            <span className="muted small header-range" title={`统计区间：${label}`}>统计区间：{label}</span>
          </div>
          <div className="header-right">
            <HeaderControls />
            <RoleSwitcher />
          </div>
        </Header>
        <Content className="app-content">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <Breadcrumb
              className="breadcrumb"
              items={breadcrumb}
              style={{ marginBottom: 0, minWidth: 0, overflow: 'hidden' }}
            />
            {prevEntry && (
              <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => goTrailTo(prevEntry.path)} style={{ flex: '0 0 auto' }}>
                返回：{prevEntry.title}
              </Button>
            )}
          </div>
          <Outlet key={userId} />
        </Content>
      </Layout>
    </Layout>
  );
}