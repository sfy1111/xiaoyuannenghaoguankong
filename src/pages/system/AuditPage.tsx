import { useMemo, useState } from 'react';
import { Drawer, Input, Select, Space, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import ExportButton from '../../components/ExportButton';
import { getEntities, META } from '../../services/repository';

export default function SystemAuditPage() {
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<(typeof entities.auditLogs)[number] | null>(null);
  const entities = getEntities();

  const rows = useMemo(() => {
    let list = entities.auditLogs;
    if (moduleFilter !== 'all') list = list.filter((l) => l.module === moduleFilter);
    if (search) {
      list = list.filter((l) => l.detail.includes(search) || l.actor.includes(search) || l.objectId.includes(search) || l.action.includes(search));
    }
    return [...list].sort((a, b) => (a.time < b.time ? 1 : -1));
  }, [entities, moduleFilter, search]);

  const modules = ['全部模块', ...new Set(entities.auditLogs.map((l) => l.module))];

  const exportSheet = {
    name: '审计日志',
    headers: ['时间', '操作人', '模块', '操作', '对象', '详情', '变更前', '变更后'],
    rows: rows.map((l) => [l.time, l.actor, l.module, l.action, l.objectId, l.detail, l.before, l.after]),
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['系统管理', '审计与操作记录']}
        title="审计与数据血缘查询"
        subtitle={
          <Space size={8} wrap>
            <span>点位绑定、表计更换、价格版本、日历变更、补录审批、告警处置、报表导出等关键修改均可追溯操作者与变更前后值</span>
            <span className="muted">审计记录不可由普通管理员删除</span>
          </Space>
        }
        extra={<ExportButton filename="审计日志" sheet={exportSheet} metaNote={`导出含操作记录；生成时间：${dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}`} />}
      />
      <div className="filter-bar">
        <Select
          size="small"
          style={{ width: 140 }}
          value={moduleFilter}
          onChange={setModuleFilter}
          options={modules.map((m, i) => ({ value: i === 0 ? 'all' : m, label: m }))}
        />
        <Input size="small" allowClear placeholder="搜索操作人/对象/内容" style={{ width: 220 }} value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="muted small">共 {rows.length} 条记录（含演示期预置与本次会话操作）</span>
      </div>

      <Table
        size="small"
        rowKey="id"
        dataSource={rows}
        pagination={{ pageSize: 15 }}
        onRow={(r) => ({ onClick: () => setDetail(r), style: { cursor: 'pointer' } })}
        columns={[
          { title: '时间', dataIndex: 'time', width: 140 },
          { title: '操作人', dataIndex: 'actor', width: 90 },
          { title: '模块', dataIndex: 'module', width: 100, render: (m: string) => <Tag>{m}</Tag> },
          { title: '操作', dataIndex: 'action', width: 130 },
          { title: '对象', dataIndex: 'objectId', width: 130 },
          { title: '详情', dataIndex: 'detail', ellipsis: true },
        ]}
      />

      <Drawer open={!!detail} onClose={() => setDetail(null)} width={640} title={detail ? `${detail.module} · ${detail.action}` : ''}>
        {detail && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Table
              size="small"
              rowKey="k"
              pagination={false}
              dataSource={[
                { k: '记录编号', v: detail.id },
                { k: '时间', v: detail.time },
                { k: '操作人', v: detail.actor },
                { k: '对象', v: detail.objectId },
                { k: '详情', v: detail.detail },
                { k: '变更前', v: detail.before || '—' },
                { k: '变更后', v: detail.after || '—' },
              ]}
              columns={[
                { dataIndex: 'k', width: 100, render: (v: string) => <b>{v}</b> },
                { dataIndex: 'v' },
              ]}
            />
            <div className="muted small">
              按系统保留期限归档；导出中保留操作记录；个人信息按最小必要展示。血缘追溯路径：
              楼宇能耗 → 计量点（含绑定版本）→ IoT属性与时段样本，可在计量关系页与数据质量页逐级查看。
            </div>
          </Space>
        )}
      </Drawer>
    </div>
  );
}