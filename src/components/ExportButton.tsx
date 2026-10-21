import { Dropdown, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { downloadCsv, downloadXlsx, type SheetData } from '../services/exportService';

export default function ExportButton({ filename, sheet, metaNote, extraSheets }: {
  filename: string;
  sheet: SheetData;
  metaNote?: string;
  extraSheets?: SheetData[];
}) {
  const items: MenuProps['items'] = [
    { key: 'csv', label: '导出 CSV' },
    { key: 'xlsx', label: '导出 Excel（xlsx）' },
  ];
  return (
    <Dropdown
      menu={{
        items,
        onClick: ({ key }) => {
          if (key === 'csv') {
            downloadCsv(filename, sheet, metaNote);
            message.success('已生成 CSV 文件并开始下载');
          } else {
            downloadXlsx(filename, extraSheets ? extraSheets : [sheet], metaNote);
            message.success('已生成 Excel 文件并开始下载');
          }
        },
      }}
    >
      <a onClick={(e) => e.preventDefault()} style={{ fontSize: 13 }}>
        <DownloadOutlined /> 导出
      </a>
    </Dropdown>
  );
}