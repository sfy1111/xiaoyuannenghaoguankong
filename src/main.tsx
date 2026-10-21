import React from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { HashRouter } from 'react-router-dom';
import { appTheme } from './app/theme';
import { AppRouter } from './app/App';
import './styles/global.css';

dayjs.locale('zh-cn');

// 使用 Hash 路由：无需服务器 SPA 回退配置，任意静态服务器均可刷新直达页面
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider theme={appTheme} locale={zhCN}>
      <AntdApp>
        <HashRouter>
          <AppRouter />
        </HashRouter>
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>,
);