import type { ReactNode } from 'react';
import { Breadcrumb } from 'antd';
import { useNavigate } from 'react-router-dom';

export default function PageHeader({ title, subtitle, breadcrumb, extra, info }: {
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumb?: string[];
  extra?: ReactNode;
  info?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="page-header">
      <Breadcrumb
        className="breadcrumb"
        items={(breadcrumb ?? []).map((b, i) => ({
          title: i === 0 ? <a onClick={() => navigate(-1)}>{b}</a> : b,
        }))}
      />
      <div className="page-title-row">
        <h2 className="page-title">{title}</h2>
        {info}
        <div style={{ marginLeft: 'auto' }}>{extra}</div>
      </div>
      {subtitle && <div className="page-subtitle">{subtitle}</div>}
    </div>
  );
}