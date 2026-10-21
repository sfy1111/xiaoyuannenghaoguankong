import type { ThemeConfig } from 'antd';

export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: '#1668dc',
    borderRadius: 8,
    fontSize: 14,
    colorBgLayout: '#f5f7fa',
    colorBgContainer: '#ffffff',
  },
  components: {
    Layout: {
      siderBg: '#001529',
      headerBg: '#ffffff',
      headerHeight: 52,
    },
    Menu: {
      darkItemBg: '#001529',
      darkSubMenuItemBg: '#000c17',
    },
    Card: {
      paddingLG: 16,
    },
    Table: {
      headerBg: '#fafafa',
    },
  },
};