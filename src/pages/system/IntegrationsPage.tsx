import { useState } from 'react';
import { App, Button, Descriptions, Modal, Space, Table, Tag, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import ExportButton from '../../components/ExportButton';
import { canEdit } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';

export default function SystemIntegrationsPage() {
  const { message, modal } = App.useApp();
  const entities = getEntities();
  const editable = canEdit('system');

  const exportSheet = {
    name: '接口任务',
    headers: ['接口', '类型', '计划', '上次执行', '状态', '点位数', '错误数', '重试次数'],
    rows: entities.integrations.map((e) => [e.name, e.type, e.schedule, e.lastRun, e.status, e.pointCount, e.errorCount, e.retryCount]),
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['系统管理', '数据接口与采集状态']}
        title="数据接口与采集状态"
        subtitle={
          <Space size={8} wrap>
            <span>上游为学校既有IoT平台：展示设备/点位、同步状态、错误与待补时段；不触发真实设备连接</span>
            <span className="muted">数据更新：{dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}</span>
          </Space>
        }
        extra={<ExportButton filename="接口任务状态" sheet={exportSheet} metaNote="接口任务状态导出；凭据不在界面与日志中展示明文" />}
      />

      <div className="table-card">
        <h4 className="section-title">接口任务</h4>
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={entities.integrations}
          columns={[
            { title: '接口', dataIndex: 'name' },
            { title: '类型', dataIndex: 'type', width: 100 },
            { title: '计划', dataIndex: 'schedule', width: 100 },
            { title: '上次执行', dataIndex: 'lastRun', width: 140 },
            {
              title: '状态', dataIndex: 'status', width: 90,
              render: (s: string) => <Tag color={s === 'success' ? 'green' : s === 'warning' ? 'orange' : 'red'}>{s === 'success' ? '正常' : s === 'warning' ? '部分异常' : '失败'}</Tag>,
            },
            { title: '点位数', dataIndex: 'pointCount', width: 80, align: 'right' as const },
            { title: '错误数', dataIndex: 'errorCount', width: 70, align: 'right' as const },
            { title: '重试', dataIndex: 'retryCount', width: 70, align: 'right' as const },
            {
              title: '操作', width: 100,
              render: (_v, e) => editable ? (
                <a onClick={() => {
                  entities.actions.retryEndpoint(e.id, '徐明');
                  message.success(`已手动重试「${e.name}」，任务为幂等设计，不会重复入库`);
                }}>手动重试</a>
              ) : null,
            },
          ]}
          expandable={{
            expandedRowRender: (e) => (
              <div className="small">
                {e.lastError ? <div style={{ color: '#d4380d' }}>最近错误：{e.lastError}</div> : <div className="muted">无错误记录</div>}
                {e.backlogWindows?.map((b, i) => (
                  <div key={i}>
                    待补时段：<Tag color="orange">{entities.meteringPoints.find((p) => p.id === b.pointId)?.name ?? b.pointId}</Tag>
                    {b.from} 起 {b.to}；{b.reason}
                  </div>
                ))}
                <div className="muted small mt8">中断恢复后不覆盖已审核的修正版本；补传数据去重后相关区间自动重算。</div>
              </div>
            ),
          }}
        />
      </div>

      <div className="chart-grid c2">
        <div className="table-card" style={{ background: '#fff', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)', padding: '8px 12px' }}>
          <h4 className="section-title">采集网关心跳</h4>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={entities.iotGateways}
            columns={[
              { title: '网关', dataIndex: 'name' },
              { title: '校区', dataIndex: 'campusId', width: 90, render: (c: string) => entities.campuses.find((x) => x.id === c)?.name ?? c },
              { title: '位置', dataIndex: 'location', width: 150 },
              {
                title: '状态', dataIndex: 'online', width: 80,
                render: (v: boolean) => v ? <Tag color="green">在线</Tag> : <Tag color="red">离线</Tag>,
              },
              { title: '最后心跳', dataIndex: 'lastHeartbeat', width: 150 },
            ]}
          />
        </div>
        <div className="table-card" style={{ background: '#fff', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)', padding: '8px 12px' }}>
          <h4 className="section-title">接入说明与凭据策略</h4>
          <Descriptions size="small" bordered column={1}>
            <Descriptions.Item label="上游平台">{entities.integrations.length > 0 ? '明川大学物联网平台（IoT）' : '—'}</Descriptions.Item>
            <Descriptions.Item label="接入内容">设备/点位元数据、实时值与状态、历史时序、数据质量标记</Descriptions.Item>
            <Descriptions.Item label="点位绑定">在「计量关系与点位维护」由能源管理员人工逐点绑定并校验语义，系统不自动推断</Descriptions.Item>
            <Descriptions.Item label="凭据策略">接入凭据加密存储，不在界面与日志展示明文；按最小必要授权</Descriptions.Item>
            <Descriptions.Item label="失败处理">任务失败可重试（幂等，不重复入库）；积压任务独立技术监控，与业务告警区分</Descriptions.Item>
          </Descriptions>
        </div>
      </div>
      <div className="muted small mt8">
        本页展示IoT平台作为业务意义上的上游数据来源：仪表数据更新时间来自最近一次采集记录时间戳，
        不表示与真实设备的实时连接。
      </div>

      {editable && (
        <div className="table-card mt12" style={{ background: '#fffbe6', borderRadius: 8, border: '1px solid #ffe58f', padding: '10px 14px' }}>
          <h4 className="section-title">演示数据维护</h4>
          <Space direction="vertical" size={4}>
            <span className="small">
              演示期间的建筑档案、校历、价格方案、告警处置、工单、补录与账单核对等修改均保存在当前浏览器（localStorage）。
              重置将清除这些编辑结果并恢复初始演示数据，操作不可撤销。
            </span>
            <Button
              size="small"
              danger
              icon={<ReloadOutlined />}
              onClick={() => {
                modal.confirm({
                  title: '确认重置演示数据？',
                  content: '将清除本浏览器中保存的全部演示修改（建筑/校历/价格/告警/工单/补录/账单状态等），恢复初始数据。该操作不可撤销。',
                  okText: '重置',
                  okButtonProps: { danger: true },
                  cancelText: '取消',
                  onOk: () => {
                    message.info('正在重置演示数据…');
                    entities.actions.resetDemo();
                  },
                });
              }}
            >
              重置演示数据
            </Button>
          </Space>
        </div>
      )}
    </div>
  );
}