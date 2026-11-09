'use client';

import { useState, useMemo } from 'react';
import { JobAnnouncement, getTodayStr, normalizeMajorName } from '@/types';
import { formatThaiDate } from './DayDetailModal';
import styles from './DashboardCalendar.module.css';

const DAYS_OF_WEEK = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const THAI_MONTH_NAMES = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

interface Props {
  jobs: JobAnnouncement[];
  selectedDate: string | null;
  onSelectDate: (dateStr: string | null) => void;
  onOpenDayDetail: (dateStr: string) => void;
  selectedMajor?: string;
}

export default function DashboardCalendar({
  jobs,
  selectedDate,
  onSelectDate,
  onOpenDayDetail,
  selectedMajor,
}: Props) {
  const today = new Date();
  const todayStr = getTodayStr();

  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth());

  const goToPrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const goToCurrentMonth = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  };

  // Filter jobs if a specific major filter is selected
  const displayJobs = useMemo(() => {
    if (!selectedMajor) return jobs;
    return jobs.filter((j) =>
      j.shifts.some((s) =>
        s.registrations.some(
          (r) => normalizeMajorName(r.faculty) === selectedMajor
        )
      )
    );
  }, [jobs, selectedMajor]);

  // Build calendar cells (42 cells)
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

  const calendarCells: { day: number; inMonth: boolean; dateStr: string }[] = [];

  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const pm = currentMonth === 0 ? 11 : currentMonth - 1;
    const py = currentMonth === 0 ? currentYear - 1 : currentYear;
    calendarCells.push({
      day: d,
      inMonth: false,
      dateStr: `${py}-${String(pm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push({
      day: d,
      inMonth: true,
      dateStr: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    });
  }

  const remaining = 42 - calendarCells.length;
  for (let d = 1; d <= remaining; d++) {
    const nm = currentMonth === 11 ? 0 : currentMonth + 1;
    const ny = currentMonth === 11 ? currentYear + 1 : currentYear;
    calendarCells.push({
      day: d,
      inMonth: false,
      dateStr: `${ny}-${String(nm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    });
  }

  const getJobsForDate = (dateStr: string): JobAnnouncement[] =>
    displayJobs.filter((j) => j.date === dateStr);

  return (
    <section className={styles.calendarSection}>
      {/* Header */}
      <div className={styles.calendarHeader}>
        <div className={styles.headerTitleGroup}>
          <h3 className={styles.title}>
            ปฏิทินงานชั่วโมงทุนประจำเดือน
            {selectedMajor && (
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: 'var(--primary)',
                  background: 'var(--primary-light)',
                  padding: '0.15rem 0.55rem',
                  borderRadius: '6px',
                  border: '1px solid var(--primary-border)',
                }}
              >
                กรองสาขา: {selectedMajor}
              </span>
            )}
          </h3>
          <span className={styles.subtitle}>
            คลิกที่ช่องวันที่เพื่อกรองตารางรายชื่อนักศึกษาด้านล่างให้ตรงกับวันนั้น
            หรือกดดูรายละเอียดงาน
          </span>
        </div>

        <div className={styles.monthNavGroup}>
          <button
            type="button"
            className={styles.navIconBtn}
            onClick={goToPrevMonth}
            aria-label="เดือนก่อนหน้า"
          >
            ◀
          </button>
          <span className={styles.monthTitle}>
            {THAI_MONTH_NAMES[currentMonth]} {currentYear + 543}{' '}
            <span className={styles.christianYear}>({currentYear})</span>
          </span>
          <button
            type="button"
            className={styles.navIconBtn}
            onClick={goToNextMonth}
            aria-label="เดือนถัดไป"
          >
            ▶
          </button>
          <button
            type="button"
            className={styles.todayBtn}
            onClick={goToCurrentMonth}
          >
            วันนี้
          </button>
        </div>
      </div>

      {/* Active Date Filter Banner */}
      {selectedDate && (
        <div className={styles.activeFilterBanner}>
          <div className={styles.filterBannerLeft}>
            <span>กำลังกรองตารางเฉพาะวันที่:</span>
            <span className={styles.filterDateBadge}>
              {formatThaiDate(selectedDate)}
            </span>
            <button
              type="button"
              className={styles.openModalBtn}
              onClick={() => onOpenDayDetail(selectedDate)}
            >
              เปิดดูรายละเอียดงาน / รายชื่อนักศึกษาของวันนี้
            </button>
          </div>
          <button
            type="button"
            className={styles.clearDateBtn}
            onClick={() => onSelectDate(null)}
          >
            ✕ ล้างตัวกรองวัน (แสดงทุกวัน)
          </button>
        </div>
      )}

      {/* Calendar Grid */}
      <div className={styles.calendarWrapper}>
        <div className={styles.weekHeader}>
          {DAYS_OF_WEEK.map((day) => (
            <div key={day} className={styles.weekDay}>
              {day}
            </div>
          ))}
        </div>

        <div className={styles.grid}>
          {calendarCells.map((cell, idx) => {
            const dayJobs = getJobsForDate(cell.dateStr);
            const isToday = cell.dateStr === todayStr;
            const isSelected = selectedDate === cell.dateStr;

            let cellTotalCap = 0;
            let cellTotalReg = 0;
            for (const j of dayJobs) {
              for (const s of j.shifts) {
                cellTotalCap += s.capacity;
                cellTotalReg += s.registrations.length;
              }
            }
            const cellRemaining = Math.max(0, cellTotalCap - cellTotalReg);
            const cellFull = dayJobs.length > 0 && cellRemaining === 0;

            let cellClass = styles.dayCell;
            if (!cell.inMonth) cellClass += ` ${styles.otherMonth}`;
            if (isToday) cellClass += ` ${styles.todayCell}`;
            if (isSelected) cellClass += ` ${styles.selectedCell}`;

            return (
              <div
                key={idx}
                className={cellClass}
                onClick={() => {
                  if (selectedDate === cell.dateStr) {
                    onSelectDate(null);
                  } else {
                    onSelectDate(cell.dateStr);
                  }
                }}
                title={
                  dayJobs.length > 0
                    ? `คลิกเพื่อกรองตารางเฉพาะวัน ${formatThaiDate(cell.dateStr)} (มี ${dayJobs.length} งาน)`
                    : `คลิกเพื่อกรองตารางเฉพาะวัน ${formatThaiDate(cell.dateStr)}`
                }
              >
                <div className={styles.dayHeader}>
                  <span
                    className={`${styles.dayNumber} ${
                      isToday ? styles.todayBadge : ''
                    }`}
                  >
                    {cell.day}
                  </span>

                  {dayJobs.length > 0 && (
                    <span
                      className={
                        cellFull ? styles.badgeFull : styles.badgeAvail
                      }
                    >
                      {cellFull ? 'เต็ม' : `ว่าง ${cellRemaining}`}
                    </span>
                  )}
                </div>

                {/* Job Chips in Cell */}
                <div className={styles.jobsInCell}>
                  {dayJobs.map((job) => {
                    const jobCap = job.shifts.reduce(
                      (sum, s) => sum + s.capacity,
                      0
                    );
                    const jobReg = job.shifts.reduce(
                      (sum, s) => sum + s.registrations.length,
                      0
                    );
                    const jobFull = jobReg >= jobCap;

                    const hoursArr = job.shifts.map((s) => s.hours);
                    const minH = Math.min(...hoursArr);
                    const maxH = Math.max(...hoursArr);
                    const hoursLabel =
                      minH === maxH ? `${minH} ชม.` : `${minH}-${maxH} ชม.`;

                    return (
                      <div
                        key={job.id}
                        className={`${styles.jobChip} ${
                          jobFull ? styles.jobChipFull : ''
                        }`}
                      >
                        <span className={styles.jobChipTitle}>{job.title}</span>
                        <div className={styles.jobChipMeta}>
                          <span>{hoursLabel}</span>
                          <span>
                            {jobReg}/{jobCap} คน
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className={styles.footerLegend}>
        <div className={styles.legendItem}>
          <span className={styles.dotAvail} /> งานที่ยังมีที่นั่งว่าง
        </div>
        <div className={styles.legendItem}>
          <span className={styles.dotFull} /> งานที่ผู้ลงทะเบียนเต็มแล้ว
        </div>
        <div className={styles.legendItem}>
          <span className={styles.dotSelected} /> วันที่เลือกเพื่อกรองตารางด้านล่าง (คลิกซ้ำเพื่อยกเลิก)
        </div>
      </div>
    </section>
  );
}
