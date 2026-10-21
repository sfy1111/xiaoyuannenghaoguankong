import { Outlet } from 'react-router-dom';

export default function ScreenLayout() {
  return (
    <div className="screen-layout">
      <Outlet />
    </div>
  );
}