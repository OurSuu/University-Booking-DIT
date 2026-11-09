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

export interface MetricConfig {
  key: string;
  label: string;
  unit: string;
  color: string;
}

export interface ChartDataPoint {
  label: string;           // e.g. "1 พ.ย.", "พ.ย. 69", "2569"
  fullDate?: string;       // e.g. "วันศุกร์ที่ 7 พฤศจิกายน 2569"
  value?: number;          // backwards compatibility
  announcedHours?: number;
  registrations?: number;
  jobs?: number;
  secondaryValue?: number;
  secondaryLabel?: string;
  [key: string]: any;
}

interface Props {
  data: ChartDataPoint[];
  activeMetrics?: MetricConfig[];
  allMetrics?: MetricConfig[];
  onToggleMetric?: (key: string) => void;
  // Optional single-metric fallback props
  metricName?: string;
  unit?: string;
  color?: string;
  title?: string;
  subtitle?: string;
}

export default function RechartsLineChart({
  data,
  activeMetrics: passedActiveMetrics,
  allMetrics: passedAllMetrics,
  onToggleMetric,
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

  // Standardize active and all metrics
  const activeMetrics: MetricConfig[] = useMemo(() => {
    if (passedActiveMetrics && passedActiveMetrics.length > 0) {
      return passedActiveMetrics;
    }
    return [
      {
        key: 'value',
        label: metricName || 'ข้อมูล',
        unit: unit || '',
        color: color || '#c81e24',
      },
    ];
  }, [passedActiveMetrics, metricName, unit, color]);

  const allMetrics: MetricConfig[] = useMemo(() => {
    if (passedAllMetrics && passedAllMetrics.length > 0) {
      return passedAllMetrics;
    }
    return activeMetrics;
  }, [passedAllMetrics, activeMetrics]);

  // Summary statistics for every metric
  const metricSummaries = useMemo(() => {
    const map: Record<string, { total: number; avg: number; peak: number }> = {};
    for (const m of allMetrics) {
      if (data.length === 0) {
        map[m.key] = { total: 0, avg: 0, peak: 0 };
        continue;
      }
      const vals = data.map((d) => Number(d[m.key] ?? (m.key === 'value' ? d.value : 0) ?? 0));
      const sum = vals.reduce((a, b) => a + b, 0);
      const max = Math.max(...vals, 0);
      const average = Math.round((sum / data.length) * 10) / 10;
      map[m.key] = { total: sum, avg: average, peak: max };
    }
    return map;
  }, [data, allMetrics]);

  // Custom Multi-Metric Tooltip
  const renderCustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const current = payload[0].payload as ChartDataPoint;

    return (
      <div className={styles.tooltipCard}>
        <div className={styles.tooltipDate}>
          {current.fullDate || current.label}
        </div>
        {activeMetrics.map((m) => {
          const val = Number(current[m.key] ?? (m.key === 'value' ? current.value : 0) ?? 0);
          return (
            <div key={m.key} className={styles.tooltipRow}>
              <span className={styles.tooltipMetricLabel}>
                <span className={styles.dot} style={{ backgroundColor: m.color }} />
                {m.label}:
              </span>
              <strong className={styles.tooltipValue} style={{ color: m.color }}>
                {val.toLocaleString()} {m.unit}
              </strong>
            </div>
          );
        })}
        {activeMetrics.length === 1 && typeof current.secondaryValue === 'number' && (
          <div className={styles.tooltipSubRow}>
            {current.secondaryLabel || 'ข้อมูลเพิ่มเติม'}:{' '}
            <strong>{current.secondaryValue.toLocaleString()}</strong>
          </div>
        )}
      </div>
    );
  };

  const isMulti = activeMetrics.length > 1;

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

      {/* KPI Summary Bar */}
      {!isMulti ? (
        // Single Metric KPI bar
        (() => {
          const m = activeMetrics[0];
          const summary = metricSummaries[m.key] || { total: 0, avg: 0, peak: 0 };
          return (
            <div className={styles.kpiBar}>
              <div className={styles.kpiItem}>
                <span className={styles.kpiLabel}>ยอดรวมทั้งหมด ({m.label})</span>
                <strong className={styles.kpiValue} style={{ color: m.color }}>
                  {summary.total.toLocaleString()} {m.unit}
                </strong>
              </div>
              <div className={styles.kpiItem}>
                <span className={styles.kpiLabel}>ค่าเฉลี่ยต่อช่วง</span>
                <strong className={styles.kpiValue}>
                  {summary.avg.toLocaleString()} {m.unit}
                </strong>
              </div>
              <div className={styles.kpiItem}>
                <span className={styles.kpiLabel}>จุดสูงสุด (Peak)</span>
                <strong className={styles.kpiValue}>
                  {summary.peak.toLocaleString()} {m.unit}
                </strong>
              </div>
            </div>
          );
        })()
      ) : (
        // Multi-Metric Comparison Cards
        <div className={styles.kpiBarMulti}>
          {activeMetrics.map((m) => {
            const summary = metricSummaries[m.key] || { total: 0, avg: 0, peak: 0 };
            return (
              <div
                key={m.key}
                className={styles.kpiCardMulti}
                style={{ borderLeftColor: m.color }}
              >
                <div className={styles.kpiCardMultiHeader}>
                  <span className={styles.dot} style={{ backgroundColor: m.color }} />
                  {m.label}
                </div>
                <div className={styles.kpiCardMultiValue} style={{ color: m.color }}>
                  {summary.total.toLocaleString()} <span style={{ fontSize: '0.85rem' }}>{m.unit}</span>
                </div>
                <span className={styles.kpiCardMultiSub}>
                  เฉลี่ย {summary.avg} {m.unit}/ช่วง • สูงสุด {summary.peak} {m.unit}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Interactive Legend Bar (Clickable to Toggle Lines) */}
      {allMetrics.length > 1 && (
        <div className={styles.legendBar}>
          <span className={styles.legendTitle}>เส้นข้อมูลในกราฟ:</span>
          <div className={styles.legendBadges}>
            {allMetrics.map((m) => {
              const isActive = activeMetrics.some((am) => am.key === m.key);
              const summary = metricSummaries[m.key];
              return (
                <button
                  key={m.key}
                  type="button"
                  className={`${styles.legendBtn} ${
                    isActive ? styles.legendBtnActive : styles.legendBtnInactive
                  }`}
                  onClick={() => onToggleMetric?.(m.key)}
                  style={{
                    borderColor: isActive ? m.color : undefined,
                    color: isActive ? m.color : undefined,
                    backgroundColor: isActive ? `${m.color}10` : undefined,
                  }}
                  title={isActive ? `คลิกเพื่อซ่อนเส้น ${m.label}` : `คลิกเพื่อแสดงเส้น ${m.label}`}
                >
                  <span
                    className={styles.legendDot}
                    style={{ backgroundColor: isActive ? m.color : '#94a3b8' }}
                  />
                  <span
                    style={{
                      textDecoration: isActive ? 'none' : 'line-through',
                      opacity: isActive ? 1 : 0.6,
                    }}
                  >
                    {m.label}
                  </span>
                  <span className={styles.legendValueBadge}>
                    ({summary?.total?.toLocaleString() ?? 0} {m.unit})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

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
                {activeMetrics.map((m) => (
                  <linearGradient
                    key={`grad-${m.key}`}
                    id={`grad-${m.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={m.color}
                      stopOpacity={isMulti ? 0.16 : 0.42}
                    />
                    <stop
                      offset="95%"
                      stopColor={m.color}
                      stopOpacity={0.01}
                    />
                  </linearGradient>
                ))}
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
              {activeMetrics.map((m) => (
                <Area
                  key={m.key}
                  type="monotone"
                  dataKey={m.key}
                  name={m.label}
                  stroke={m.color}
                  strokeWidth={isMulti ? 2.5 : 3}
                  fillOpacity={1}
                  fill={`url(#grad-${m.key})`}
                  activeDot={{
                    r: 5.5,
                    stroke: '#ffffff',
                    strokeWidth: 2,
                    fill: m.color,
                  }}
                />
              ))}
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
              {activeMetrics.map((m) => (
                <Bar
                  key={m.key}
                  dataKey={m.key}
                  name={m.label}
                  fill={m.color}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={isMulti ? 26 : 50}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
