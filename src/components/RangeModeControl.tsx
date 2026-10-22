import { DatePicker, Segmented, Space } from 'antd';
import dayjs from 'dayjs';
import { useFilters, syncFiltersToUrl, currentRange, DATA_START, DATA_END, type DateMode } from '../stores/filters';

/** 统计区间控件（按日/按月/按年 + 日期），全局状态唯一来源，供驾驶舱/校区总览/大屏复用 */
export default function RangeModeControl({ showLabel = true }: { showLabel?: boolean }) {
  const { dateMode, setDateMode, date, setDate } = useFilters();
  const picker = dateMode === 'year' ? 'year' : dateMode === 'month' ? 'month' : 'date';
  return (
    <Space size={6}>
      {showLabel && <span className="muted small">统计区间</span>}
      <Segmented
        size="small"
        value={dateMode}
        options={[
          { value: 'day', label: '按日' },
          { value: 'month', label: '按月' },
          { value: 'year', label: '按年' },
        ]}
        onChange={(v) => {
          setDateMode(v as DateMode);
          syncFiltersToUrl();
        }}
      />
      <DatePicker
        size="small"
        picker={picker}
        value={dayjs(date)}
        allowClear={false}
        disabledDate={(d) => d.isBefore(dayjs(DATA_START)) || d.isAfter(dayjs(DATA_END))}
        onChange={(v) => {
          if (v) {
            setDate(v.format('YYYY-MM-DD'));
            syncFiltersToUrl();
          }
        }}
      />
      <span className="muted small">{currentRange(dateMode, date).label}</span>
    </Space>
  );
}