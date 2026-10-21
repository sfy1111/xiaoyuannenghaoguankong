import type { ReactNode } from 'react';
import { Result, Button, Space } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { canView } from '../stores/identity';

export function RequireModule({ module, children }: { module: string; children: ReactNode }) {
  const navigate = useNavigate();
  if (!canView(module)) {
    return (
      <Result
        status="403"
        title="当前角色无权限访问该模块"
        subTitle={`该页面属于「${module}」模块，当前登录视角未被授权。可在右上角切换角色视角查看演示权限差异。`}
        extra={
          <Space>
            <Button type="primary" onClick={() => navigate('/dashboard/campus')}>返回校园综合概览</Button>
            <Link to="/system/users">查看角色权限矩阵</Link>
          </Space>
        }
      />
    );
  }
  return <>{children}</>;
}