import { Result } from 'antd';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <Result
      status="404"
      title="404"
      subTitle="页面不存在，请从左侧菜单重新进入。"
      extra={<Link to="/dashboard/campus">返回校园综合概览</Link>}
    />
  );
}