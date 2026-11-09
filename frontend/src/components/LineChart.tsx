'use client';

import { useState, useMemo } from 'react';
import styles from './LineChart.module.css';

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

export default function LineChart({
  data,
  metricName,
  unit,
  color = '#c81e24',
  title,
  subtitle,
}: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Dimensions
  const svgWidth = 800;
  const svgHeight = 280;
  const padLeft = 55;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 45;

  const innerWidth = svgWidth - padLeft - padRight;
  const innerHeight = svgHeight - padTop - padBottom;

  // Statistics
  const { maxVal, minVal, sumVal, avgVal, yTicks } = useMemo(() => {
    if (data.length === 0) {
      return { maxVal: 5, minVal: 0, sumVal: 0, avgVal: 0, yTicks: [0, 1, 2, 3, 4, 5] };
    }
    const vals = data.map((d) => d.value);
    const rawMax = Math.max(...vals, 1);
    const rawMin = 0;
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = Math.round((sum / data.length) * 10) / 10;

    // Nice round upper bound
    let upper = rawMax;
    if (upper <= 5) upper = 5;
    else if (upper <= 10) upper = 10;
    else if (upper <= 20) upper = 20;
    else if (upper <= 50) upper = 50;
    else if (upper <= 100) upper = 100;
    else upper = Math.ceil(upper / 10) * 10;

    const ticks = [0, Math.round(upper * 0.25), Math.round(upper * 0.5), Math.round(upper * 0.75), upper];
    return { maxVal: upper, minVal: rawMin, sumVal: sum, avgVal: avg, yTicks: ticks };
  }, [data]);

  // Points mapping
  const points = useMemo(() => {
    if (data.length === 0) return [];
    if (data.length === 1) {
      const x = padLeft + innerWidth / 2;
      const y = padTop + innerHeight - (data[0].value / maxVal) * innerHeight;
      return [{ x, y, point: data[0], idx: 0 }];
    }

    return data.map((d, i) => {
      const x = padLeft + (i / (data.length - 1)) * innerWidth;
      const y = padTop + innerHeight - (d.value / maxVal) * innerHeight;
      return { x, y, point: d, idx: i };
    });
  }, [data, innerWidth, innerHeight, padLeft, padTop, maxVal]);

  // SVG Paths
  const linePathD = useMemo(() => {
    if (points.length === 0) return '';
    if (points.length === 1) {
      return `M ${points[0].x - 15} ${points[0].y} L ${points[0].x + 15} ${points[0].y}`;
    }
    return points.reduce((acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`), '');
  }, [points]);

  const areaPathD = useMemo(() => {
    if (points.length === 0) return '';
    const bottomY = padTop + innerHeight;
    if (points.length === 1) {
      const p = points[0];
      return `M ${p.x - 15} ${bottomY} L ${p.x - 15} ${p.y} L ${p.x + 15} ${p.y} L ${p.x + 15} ${bottomY} Z`;
    }
    const first = points[0];
    const last = points[points.length - 1];
    const lineSegs = points.reduce((acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`), '');
    return `${lineSegs} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;
  }, [points, padTop, innerHeight]);

  // X axis labels spacing
  const xLabelInterval = useMemo(() => {
    if (data.length <= 12) return 1;
    if (data.length <= 20) return 2;
    if (data.length <= 31) return 3;
    return Math.ceil(data.length / 10);
  }, [data.length]);

  const activePoint = hoveredIdx !== null && points[hoveredIdx] ? points[hoveredIdx] : null;

  return (
    <div className={styles.chartContainer}>
      <div className={styles.chartTopRow}>
        <div className={styles.chartTitleWrap}>
          {title && <h3 className={styles.chartTitle}>{title}</h3>}
          {subtitle && <span className={styles.chartSub}>{subtitle}</span>}
        </div>

        <div className={styles.chartStatsSummary}>
          <div className={styles.summaryPill}>
            <span>รวมทั้งหมด:</span>
            <strong>
              {sumVal.toLocaleString()} {unit}
            </strong>
          </div>
          <div className={styles.summaryPill}>
            <span>เฉลี่ย:</span>
            <strong>
              {avgVal.toLocaleString()} {unit}
            </strong>
          </div>
          <div className={styles.summaryPill}>
            <span>สูงสุด:</span>
            <strong>
              {Math.max(...data.map((d) => d.value), 0).toLocaleString()} {unit}
            </strong>
          </div>
        </div>
      </div>

      {data.length === 0 ? (
        <div className={styles.emptyBox}>ไม่มีข้อมูลในช่วงเวลาที่เลือก</div>
      ) : (
        <div className={styles.svgWrap}>
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className={styles.svg}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <defs>
              <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                <stop offset="100%" stopColor={color} stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* Y Grid lines and Labels */}
            {yTicks.map((tick, i) => {
              const y = padTop + innerHeight - (tick / maxVal) * innerHeight;
              return (
                <g key={i}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={padLeft + innerWidth}
                    y2={y}
                    className={styles.gridLine}
                  />
                  <text
                    x={padLeft - 10}
                    y={y + 4}
                    textAnchor="end"
                    className={styles.axisText}
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {/* Area under curve */}
            <path d={areaPathD} fill="url(#chartAreaGrad)" className={styles.areaPath} />

            {/* Line curve */}
            <path d={linePathD} stroke={color} className={styles.linePath} />

            {/* Hover Columns (hit areas) */}
            {points.map((p, i) => {
              const colWidth = innerWidth / (points.length || 1);
              const xStart = Math.max(padLeft, p.x - colWidth / 2);
              return (
                <rect
                  key={`col-${i}`}
                  x={xStart}
                  y={padTop}
                  width={colWidth}
                  height={innerHeight}
                  className={styles.hoverColumn}
                  onMouseEnter={() => setHoveredIdx(i)}
                />
              );
            })}

            {/* Data Dots */}
            {points.map((p, i) => {
              const isHovered = hoveredIdx === i;
              return (
                <circle
                  key={`dot-${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={isHovered ? 6.5 : 4}
                  stroke={color}
                  className={`${styles.dataDot} ${isHovered ? styles.dataDotActive : ''}`}
                  onMouseEnter={() => setHoveredIdx(i)}
                />
              );
            })}

            {/* X Axis Labels */}
            {points.map((p, i) => {
              const isVisible =
                i === 0 ||
                i === points.length - 1 ||
                i % xLabelInterval === 0;

              if (!isVisible) return null;

              return (
                <text
                  key={`xlabel-${i}`}
                  x={p.x}
                  y={padTop + innerHeight + 22}
                  textAnchor="middle"
                  className={styles.axisText}
                >
                  {p.point.label}
                </text>
              );
            })}
          </svg>

          {/* Interactive Tooltip */}
          {activePoint && (
            <div
              className={styles.tooltip}
              style={{
                left: `${(activePoint.x / svgWidth) * 100}%`,
                top: `${(activePoint.y / svgHeight) * 100}%`,
              }}
            >
              <div className={styles.tooltipTitle}>
                {activePoint.point.fullDate || activePoint.point.label}
              </div>
              <div className={styles.tooltipValue}>
                {metricName}: {activePoint.point.value.toLocaleString()} {unit}
              </div>
              {typeof activePoint.point.secondaryValue === 'number' && (
                <div className={styles.tooltipSecondary}>
                  {activePoint.point.secondaryLabel || 'ชั่วโมงทุน'}:{' '}
                  {activePoint.point.secondaryValue.toLocaleString()} ชม.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
