'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import styles from './RechartsLineChart.module.css';

export interface ChartDataPoint {
  label: string;           // e.g. "1 พ.ย.", "พ.ย. 69", "2569"
  fullDate?: string;       // e.g. "วันศุกร์ที่ 7 พฤศจิกายน 2569"
  value: number;           // main metric value
  secondaryValue?: number; // e.g. total hours
  secondaryLabel?: string; // e.g. "ชั่วโมงทุน"
}

interface Props {
  data: ChartDataPoint[];
  metricName: string;
  unit: string;
  color?: string;
  title?: string;
  subtitle?: string;
}

export default function RechartsLineChart({
  data,
  metricName,
  unit,
  color = '#c81e24',
  title,
  subtitle,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [chartType, setChartType] = useState<'area' | 'bar'>('area');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Summary statistics
  const { total, avg, peak } = useMemo(() => {
    if (data.length === 0) return { total: 0, avg: 0, peak: 0 };
    const vals = data.map((d) => d.value);
    const sum = vals.reduce((a, b) => a + b, 0);
    const max = Math.max(...vals, 0);
    const average = Math.round((sum / data.length) * 10) / 10;
    return { total: sum, avg: average, peak: max };
  }, [data]);

  // Custom Recharts Tooltip
  const renderCustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const current = payload[0].payload as ChartDataPoint;

    return (
      <div className={styles.tooltipCard}>
        <div className={styles.tooltipDate}>
          {current.fullDate || current.label}
        </div>
        <div className={styles.tooltipRow}>
          <span className={styles.tooltipMetricLabel}>
            <span className={styles.dot} style={{ backgroundColor: color }} />
            {metricName}:
          </span>
          <strong className={styles.tooltipValue} style={{ color }}>
            {current.value.toLocaleString()} {unit}
          </strong>
        </div>
        {typeof current.secondaryValue === 'number' && (
          <div className={styles.tooltipSubRow}>
            {current.secondaryLabel || 'ข้อมูลเพิ่มเติม'}:{' '}
            <strong>{current.secondaryValue.toLocaleString()}</strong>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.chartCard}>
      {/* Header & Controls */}
      <div className={styles.chartHeader}>
        <div className={styles.headerTitleGroup}>
          {title && <h3 className={styles.title}>{title}</h3>}
          {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
        </div>

        <div className={styles.chartControls}>
          <div className={styles.typeToggleGroup}>
            <button
              type="button"
              className={`${styles.typeBtn} ${
                chartType === 'area' ? styles.typeBtnActive : ''
              }`}
              onClick={() => setChartType('area')}
            >
              กราฟเส้นโค้ง
            </button>
            <button
              type="button"
              className={`${styles.typeBtn} ${
                chartType === 'bar' ? styles.typeBtnActive : ''
              }`}
              onClick={() => setChartType('bar')}
            >
              กราฟแท่ง
            </button>
          </div>
        </div>
      </div>

      {/* Quick KPI summary bar */}
      <div className={styles.kpiBar}>
        <div className={styles.kpiItem}>
          <span className={styles.kpiLabel}>ยอดรวมทั้งหมด ({metricName})</span>
          <strong className={styles.kpiValue} style={{ color }}>
            {total.toLocaleString()} {unit}
          </strong>
        </div>
        <div className={styles.kpiItem}>
          <span className={styles.kpiLabel}>ค่าเฉลี่ยต่อช่วง</span>
          <strong className={styles.kpiValue}>
            {avg.toLocaleString()} {unit}
          </strong>
        </div>
        <div className={styles.kpiItem}>
          <span className={styles.kpiLabel}>จุดสูงสุด (Peak)</span>
          <strong className={styles.kpiValue}>
            {peak.toLocaleString()} {unit}
          </strong>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className={styles.chartContainer}>
        {!mounted ? (
          <div className={styles.emptyBox}>กำลังเตรียมแสดงผลกราฟ...</div>
        ) : data.length === 0 ? (
          <div className={styles.emptyBox}>ไม่พบข้อมูลในช่วงเวลาที่เลือก</div>
        ) : chartType === 'area' ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 20, right: 20, left: -10, bottom: 5 }}
            >
              <defs>
                <linearGradient id="primaryAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.42} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e2e8f0"
              />
              <XAxis
                dataKey="label"
                stroke="#64748b"
                tick={{ fontSize: 12, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 12, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
                allowDecimals={false}
              />
              <Tooltip content={renderCustomTooltip} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#primaryAreaGrad)"
                activeDot={{
                  r: 6,
                  stroke: '#ffffff',
                  strokeWidth: 2.5,
                  fill: color,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 20, right: 20, left: -10, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e2e8f0"
              />
              <XAxis
                dataKey="label"
                stroke="#64748b"
                tick={{ fontSize: 12, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 12, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
                allowDecimals={false}
              />
              <Tooltip content={renderCustomTooltip} />
              <Bar
                dataKey="value"
                fill={color}
                radius={[6, 6, 0, 0]}
                maxBarSize={50}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
