'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  JobAnnouncement,
  DIT_MAJORS,
  normalizeMajorName,
  getTodayStr,
  isKysScholarship,
} from '@/types';
import { ToastProvider, useToast } from '@/components/Toast';
import RechartsLineChart, { ChartDataPoint } from '@/components/RechartsLineChart';
import PinManagementModal from '@/components/PinManagementModal';
import DashboardCalendar from '@/components/DashboardCalendar';
import DayDetailModal, { formatThaiDate } from '@/components/DayDetailModal';
import styles from './dashboard.module.css';

const THAI_MONTH_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

const THAI_MONTH_FULL = [
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

type ViewMode = 'day' | 'month' | 'year';
type MetricType = 'registrations' | 'hours' | 'jobs';

export default function DashboardPage() {
  return (
    <ToastProvider>
      <DashboardInner />
    </ToastProvider>
  );
}

function DashboardInner() {
  const { showToast } = useToast();
  const [jobs, setJobs] = useState<JobAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);

  // Authentication
  const [teacherPin, setTeacherPin] = useState<string>('');
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState<boolean>(false);
  const [isAuthChecked, setIsAuthChecked] = useState<boolean>(false);
  const [showPinManageModal, setShowPinManageModal] = useState<boolean>(false);

  // Filter States
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [metric, setMetric] = useState<MetricType>('registrations');
  const [selectedMajor, setSelectedMajor] = useState<string>('');

  const todayStr = getTodayStr();
  const currentYear = new Date().getFullYear();

  // Day range states (default to current month: 1st of month to today/end of month)
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // Selected year for month mode
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // Search & Calendar Date Filter in table
  const [tableSearch, setTableSearch] = useState<string>('');
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<string | null>(null);
  const [modalDetailDate, setModalDetailDate] = useState<string | null>(null);

  // 1. Check Session Storage for PIN on Mount and verify Admin role
  useEffect(() => {
    const savedPin = sessionStorage.getItem('dit_teacher_pin');
    if (savedPin) {
      fetch('/api/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: savedPin }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.valid && d.role === 'admin') {
            setTeacherPin(savedPin);
            sessionStorage.setItem('dit_teacher_role', 'admin');
          } else {
            setTeacherPin('');
            sessionStorage.removeItem('dit_teacher_role');
          }
        })
        .catch(() => setTeacherPin(''))
        .finally(() => setIsAuthChecked(true));
    } else {
      setIsAuthChecked(true);
    }
  }, []);

  // 2. Fetch Jobs Data
  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/jobs?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setJobs(data);
    } catch (err) {
      console.error('Error fetching jobs for dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (teacherPin) {
      fetchJobs();
    }
  }, [teacherPin, fetchJobs]);

  // Handle PIN Login (Strictly verify that role is admin)
  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput.trim()) return;
    setPinLoading(true);
    setPinError(null);

    try {
      const res = await fetch('/api/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setPinError(data.error || 'รหัส PIN ไม่ถูกต้อง');
        setPinLoading(false);
        return;
      }

      if (data.role !== 'admin') {
        setPinError(
          'สิทธิ์ไม่เพียงพอ: หน้านี้สงวนไว้สำหรับอาจารย์ผู้ดูแลระบบ (Master PIN) เท่านั้น รหัส PIN ปัจจุบันของท่านสามารถใช้สำหรับสร้างประกาศงานและถอนชื่อนักศึกษาได้ที่หน้าปฏิทินหลัก'
        );
        setPinLoading(false);
        return;
      }

      const verifiedPin = pinInput.trim();
      setTeacherPin(verifiedPin);
      sessionStorage.setItem('dit_teacher_pin', verifiedPin);
      sessionStorage.setItem('dit_teacher_role', 'admin');
      setPinLoading(false);
      showToast('ยินดีต้อนรับอาจารย์ผู้ดูแลระบบ เข้าสู่แดชบอร์ดสถิติ', 'success');
    } catch {
      setPinError('ไม่สามารถตรวจสอบรหัส PIN ได้');
      setPinLoading(false);
    }
  };

  const handleLogout = () => {
    setTeacherPin('');
    sessionStorage.removeItem('dit_teacher_pin');
    sessionStorage.removeItem('dit_teacher_role');
    showToast('ออกจากโหมดอาจารย์แล้ว', 'info');
  };

  // Quick Range Presets
  const handlePresetRange = (type: '7days' | '14days' | '30days' | 'thisMonth') => {
    const now = new Date();
    const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let start = end;

    if (type === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } else if (type === '14days') {
      const d = new Date();
      d.setDate(d.getDate() - 13);
      start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } else if (type === '30days') {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } else if (type === 'thisMonth') {
      start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      setEndDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`);
      setStartDate(start);
      return;
    }

    setStartDate(start);
    setEndDate(end);
  };

  // Filtered registrations in the active time frame
  const filteredData = useMemo(() => {
    const filteredJobs = jobs.filter((j) => {
      if (viewMode === 'day') {
        return j.date >= startDate && j.date <= endDate;
      }
      if (viewMode === 'month') {
        return j.date.startsWith(String(selectedYear));
      }
      return true; // year mode takes all
    });

    const registrationsList: {
      regId: number;
      jobId: number;
      jobTitle: string;
      jobDate: string;
      shiftLabel: string;
      timeRange: string;
      hours: number;
      studentId: string;
      studentName: string;
      faculty: string;
      scholarshipName: string;
      phone: string;
      allowKys: boolean;
    }[] = [];

    for (const job of filteredJobs) {
      for (const shift of job.shifts) {
        for (const reg of shift.registrations) {
          const normFaculty = normalizeMajorName(reg.faculty);
          if (!selectedMajor || normFaculty === selectedMajor) {
            registrationsList.push({
              regId: reg.id,
              jobId: job.id,
              jobTitle: job.title,
              jobDate: job.date,
              shiftLabel: shift.label,
              timeRange: shift.time_range,
              hours: shift.hours,
              studentId: reg.student_id,
              studentName: reg.student_name,
              faculty: normFaculty || reg.faculty,
              scholarshipName: reg.scholarship_name,
              phone: reg.phone || '',
              allowKys: job.allow_kys,
            });
          }
        }
      }
    }

    return {
      jobs: filteredJobs,
      registrations: registrationsList,
    };
  }, [jobs, viewMode, startDate, endDate, selectedYear, selectedMajor]);

  // Overall KPI metrics
  const kpis = useMemo(() => {
    const totalRegs = filteredData.registrations.length;
    const totalHours = filteredData.registrations.reduce((sum, r) => sum + r.hours, 0);
    const uniqueStudents = new Set(filteredData.registrations.map((r) => r.studentId)).size;
    const totalJobs = filteredData.jobs.length;

    let totalCapacity = 0;
    let totalFilled = 0;
    for (const j of filteredData.jobs) {
      for (const s of j.shifts) {
        totalCapacity += s.capacity;
        totalFilled += s.registrations.length;
      }
    }
    const occupancyRate =
      totalCapacity > 0 ? Math.round((totalFilled / totalCapacity) * 100) : 0;

    return {
      totalRegs,
      totalHours,
      uniqueStudents,
      totalJobs,
      occupancyRate,
    };
  }, [filteredData]);

  // Generate Line Chart Data Points based on View Mode and Metric
  const chartDataPoints: ChartDataPoint[] = useMemo(() => {
    if (viewMode === 'day') {
      if (!startDate || !endDate || startDate > endDate) return [];

      const start = new Date(startDate + 'T00:00:00');
      const end = new Date(endDate + 'T00:00:00');
      const points: ChartDataPoint[] = [];

      const cur = new Date(start);
      while (cur <= end) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;

        const dayRegs = filteredData.registrations.filter((r) => r.jobDate === dateStr);
        const dayJobs = filteredData.jobs.filter((j) => j.date === dateStr);
        const dayHours = dayRegs.reduce((acc, r) => acc + r.hours, 0);

        let val = 0;
        if (metric === 'registrations') val = dayRegs.length;
        else if (metric === 'hours') val = dayHours;
        else if (metric === 'jobs') val = dayJobs.length;

        const dayNum = cur.getDate();
        const monthShort = THAI_MONTH_SHORT[cur.getMonth()];
        const thaiYearShort = String((y + 543) % 100).padStart(2, '0');

        points.push({
          label: `${dayNum} ${monthShort}`,
          fullDate: `วันที่ ${dayNum} ${THAI_MONTH_FULL[cur.getMonth()]} ${y + 543}`,
          value: val,
          secondaryValue: dayHours,
          secondaryLabel: 'ชั่วโมงทุนรวม',
        });

        cur.setDate(cur.getDate() + 1);
      }
      return points;
    }

    if (viewMode === 'month') {
      const points: ChartDataPoint[] = [];
      for (let m = 0; m < 12; m++) {
        const monthStr = `${selectedYear}-${String(m + 1).padStart(2, '0')}`;
        const monthRegs = filteredData.registrations.filter((r) => r.jobDate.startsWith(monthStr));
        const monthJobs = filteredData.jobs.filter((j) => j.date.startsWith(monthStr));
        const monthHours = monthRegs.reduce((acc, r) => acc + r.hours, 0);

        let val = 0;
        if (metric === 'registrations') val = monthRegs.length;
        else if (metric === 'hours') val = monthHours;
        else if (metric === 'jobs') val = monthJobs.length;

        points.push({
          label: THAI_MONTH_SHORT[m],
          fullDate: `เดือน${THAI_MONTH_FULL[m]} ${selectedYear + 543}`,
          value: val,
          secondaryValue: monthHours,
          secondaryLabel: 'ชั่วโมงทุนรวม',
        });
      }
      return points;
    }

    if (viewMode === 'year') {
      const yearMap = new Map<number, { regs: number; hours: number; jobs: number }>();
      const currentBE = currentYear;
      for (let y = currentBE - 2; y <= currentBE + 1; y++) {
        yearMap.set(y, { regs: 0, hours: 0, jobs: 0 });
      }

      for (const j of jobs) {
        const y = Number(j.date.slice(0, 4));
        if (!yearMap.has(y)) {
          yearMap.set(y, { regs: 0, hours: 0, jobs: 0 });
        }
        const item = yearMap.get(y)!;
        item.jobs++;
        for (const s of j.shifts) {
          for (const r of s.registrations) {
            const normFaculty = normalizeMajorName(r.faculty);
            if (!selectedMajor || normFaculty === selectedMajor) {
              item.regs++;
              item.hours += s.hours;
            }
          }
        }
      }

      const sortedYears = Array.from(yearMap.keys()).sort((a, b) => a - b);
      return sortedYears.map((y) => {
        const item = yearMap.get(y)!;
        let val = 0;
        if (metric === 'registrations') val = item.regs;
        else if (metric === 'hours') val = item.hours;
        else if (metric === 'jobs') val = item.jobs;

        return {
          label: `ปี ${y + 543}`,
          fullDate: `ปี พ.ศ. ${y + 543} (${y})`,
          value: val,
          secondaryValue: item.hours,
          secondaryLabel: 'ชั่วโมงทุนรวม',
        };
      });
    }

    return [];
  }, [viewMode, metric, startDate, endDate, selectedYear, filteredData, jobs, currentYear, selectedMajor]);

  // Major distribution breakdown
  const majorBreakdown = useMemo(() => {
    const counts: Record<string, { regs: number; hours: number }> = {};
    for (const m of DIT_MAJORS) {
      counts[m] = { regs: 0, hours: 0 };
    }

    for (const r of filteredData.registrations) {
      const major = normalizeMajorName(r.faculty);
      if (counts[major]) {
        counts[major].regs++;
        counts[major].hours += r.hours;
      } else {
        counts[major] = {
          regs: 1,
          hours: r.hours,
        };
      }
    }

    const total = filteredData.registrations.length || 1;
    return DIT_MAJORS.map((m) => {
      const stat = counts[m] || { regs: 0, hours: 0 };
      const pct = Math.round((stat.regs / total) * 100);
      return {
        name: m,
        regs: stat.regs,
        hours: stat.hours,
        percentage: pct,
      };
    }).sort((a, b) => b.regs - a.regs);
  }, [filteredData]);

  // Scholarship distribution breakdown
  const scholarshipBreakdown = useMemo(() => {
    let kysCount = 0;
    let otherCount = 0;
    let kysHours = 0;
    let otherHours = 0;

    for (const r of filteredData.registrations) {
      if (isKysScholarship(r.scholarshipName)) {
        kysCount++;
        kysHours += r.hours;
      } else {
        otherCount++;
        otherHours += r.hours;
      }
    }

    return {
      kysCount,
      otherCount,
      kysHours,
      otherHours,
    };
  }, [filteredData]);

  // Table rows with search filter and calendar date filter
  const tableRows = useMemo(() => {
    let rows = filteredData.registrations;
    if (calendarSelectedDate) {
      rows = rows.filter((r) => r.jobDate === calendarSelectedDate);
    }
    const q = tableSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.studentId.toLowerCase().includes(q) ||
        r.studentName.toLowerCase().includes(q) ||
        r.faculty.toLowerCase().includes(q) ||
        r.jobTitle.toLowerCase().includes(q) ||
        r.scholarshipName.toLowerCase().includes(q)
    );
  }, [filteredData.registrations, tableSearch, calendarSelectedDate]);

  if (!isAuthChecked) {
    return null;
  }

  // Not authenticated as Teacher: Show PIN Prompt
  if (!teacherPin) {
    return (
      <div className={styles.dashboardWrapper}>
        <div className={styles.pinAuthCard}>
          <div className={styles.pinIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>

          <div>
            <h2 className={styles.pinTitle}>แดชบอร์ดสถิติสำหรับอาจารย์</h2>
            <p className={styles.pinSub}>
              กรุณากรอกรหัส PIN สำหรับอาจารย์เพื่อเข้าสู่ระบบรายงานสถิติและกราฟวิเคราะห์ข้อมูล
            </p>
          </div>

          <form onSubmit={handlePinSubmit} className={styles.pinForm}>
            <input
              type="password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="กรอกรหัส PIN (เช่น 1234)"
              autoFocus
              required
              className={styles.pinInput}
            />

            {pinError && <div className={styles.errorBox}>{pinError}</div>}

            <button type="submit" className={styles.pinSubmitBtn} disabled={pinLoading}>
              {pinLoading ? 'กำลังตรวจสอบ...' : 'เข้าสู่หน้าแดชบอร์ด'}
            </button>
          </form>

          <Link href="/" className={styles.backBtn} style={{ justifyContent: 'center' }}>
            ← กลับสู่หน้าปฏิทินงาน
          </Link>
        </div>
      </div>
    );
  }

  const metricLabel =
    metric === 'registrations'
      ? 'จำนวนนักศึกษาลงทะเบียน'
      : metric === 'hours'
      ? 'ชั่วโมงทุนสะสม'
      : 'จำนวนประกาศงาน';

  const metricUnit = metric === 'registrations' ? 'คน' : metric === 'hours' ? 'ชม.' : 'งาน';

  return (
    <div className={styles.dashboardWrapper}>
      <div className={styles.container}>
        {/* Top Header */}
        <header className={styles.topHeader}>
          <div className={styles.brandGroup}>
            <img src="/dit-logo.png" alt="DIT RSU Logo" className={styles.ditLogo} />
            <div className={styles.brandTitles}>
              <span className={styles.brandBadge}>DIT RSU • ระบบชั่วโมงทุน</span>
              <h1>แดชบอร์ดสถิติและรายงานสรุปสำหรับอาจารย์</h1>
            </div>
          </div>

          <div className={styles.headerActions}>
            <button
              className={styles.pinManageBtn}
              onClick={() => setShowPinManageModal(true)}
              title="จัดการรหัส PIN ของอาจารย์ท่านอื่น และกำหนด Master PIN"
            >
              จัดการรหัส PIN อาจารย์
            </button>
            <button className={styles.refreshBtn} onClick={fetchJobs} title="รีเฟรชข้อมูล">
              ซิงค์ข้อมูลล่าสุด
            </button>
            <Link href="/" className={styles.backBtn}>
              ← กลับสู่หน้าปฏิทินงาน
            </Link>
            <button className={styles.logoutBtn} onClick={handleLogout} title="ออกจากโหมดอาจารย์">
              ออกจากโหมดอาจารย์
            </button>
          </div>
        </header>

        {/* Filter Controls Box */}
        <section className={styles.filterBox}>
          <div className={styles.filterTopRow}>
            {/* View Mode Tabs */}
            <div className={styles.modeTabs}>
              <button
                className={`${styles.modeTab} ${viewMode === 'day' ? styles.modeTabActive : ''}`}
                onClick={() => setViewMode('day')}
              >
                ดูกราฟตามช่วงวัน
              </button>
              <button
                className={`${styles.modeTab} ${viewMode === 'month' ? styles.modeTabActive : ''}`}
                onClick={() => setViewMode('month')}
              >
                ดูกราฟรายเดือน
              </button>
              <button
                className={`${styles.modeTab} ${viewMode === 'year' ? styles.modeTabActive : ''}`}
                onClick={() => setViewMode('year')}
              >
                ดูกราฟรายปี
              </button>
            </div>

            {/* Metric Selector Tabs */}
            <div className={styles.metricTabs}>
              <span className={styles.metricLabel}>ข้อมูลในกราฟ:</span>
              <button
                className={`${styles.metricBtn} ${metric === 'registrations' ? styles.metricBtnActive : ''}`}
                onClick={() => setMetric('registrations')}
              >
                จำนวนคนลงทะเบียน
              </button>
              <button
                className={`${styles.metricBtn} ${metric === 'hours' ? styles.metricBtnActive : ''}`}
                onClick={() => setMetric('hours')}
              >
                ชั่วโมงทุนสะสม
              </button>
              <button
                className={`${styles.metricBtn} ${metric === 'jobs' ? styles.metricBtnActive : ''}`}
                onClick={() => setMetric('jobs')}
              >
                จำนวนงาน
              </button>
            </div>
          </div>

          {/* Sub Filters Row */}
          <div className={styles.filterSubRow}>
            {viewMode === 'day' && (
              <>
                <div className={styles.dateInputsRow}>
                  <label htmlFor="start-date">ตั้งแต่วันที่:</label>
                  <input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <label htmlFor="end-date">ถึงวันที่:</label>
                  <input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>

                <div className={styles.presetPills}>
                  <button className={styles.presetBtn} onClick={() => handlePresetRange('7days')}>
                    7 วันล่าสุด
                  </button>
                  <button className={styles.presetBtn} onClick={() => handlePresetRange('14days')}>
                    14 วันล่าสุด
                  </button>
                  <button className={styles.presetBtn} onClick={() => handlePresetRange('30days')}>
                    30 วันล่าสุด
                  </button>
                  <button className={styles.presetBtn} onClick={() => handlePresetRange('thisMonth')}>
                    เดือนนี้
                  </button>
                </div>
              </>
            )}

            {viewMode === 'month' && (
              <div className={styles.dateInputsRow}>
                <label htmlFor="select-year">เลือกปี พ.ศ.:</label>
                <select
                  id="select-year"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className={styles.filterSelect}
                >
                  <option value={currentYear}>{currentYear + 543} ({currentYear})</option>
                  <option value={currentYear - 1}>{currentYear + 542} ({currentYear - 1})</option>
                  <option value={currentYear + 1}>{currentYear + 544} ({currentYear + 1})</option>
                </select>
              </div>
            )}

            {/* Filter by Major */}
            <div className={styles.dateInputsRow} style={{ marginLeft: 'auto' }}>
              <label htmlFor="major-filter">กรองเฉพาะสาขาวิชา:</label>
              <select
                id="major-filter"
                value={selectedMajor}
                onChange={(e) => setSelectedMajor(e.target.value)}
                className={styles.filterSelect}
              >
                <option value="">ทุกสาขาวิชาในคณะ</option>
                {DIT_MAJORS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* KPI Cards */}
        <section className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>ยอดการลงทะเบียนรับงานรวม</span>
            <strong className={`${styles.kpiValue} ${styles.kpiPrimary}`}>
              {kpis.totalRegs.toLocaleString()} <span style={{ fontSize: '1rem' }}>คน</span>
            </strong>
            <span className={styles.kpiSub}>นักศึกษาไม่ซ้ำคน: {kpis.uniqueStudents} คน</span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>ชั่วโมงทุนสะสมที่ได้รับ</span>
            <strong className={`${styles.kpiValue} ${styles.kpiSuccess}`}>
              {kpis.totalHours.toLocaleString()} <span style={{ fontSize: '1rem' }}>ชม.</span>
            </strong>
            <span className={styles.kpiSub}>
              เฉลี่ย {kpis.totalRegs > 0 ? (kpis.totalHours / kpis.totalRegs).toFixed(1) : 0} ชม./คน
            </span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>จำนวนงานที่จัดในช่วงเวลา</span>
            <strong className={styles.kpiValue}>
              {kpis.totalJobs.toLocaleString()} <span style={{ fontSize: '1rem' }}>งาน</span>
            </strong>
            <span className={styles.kpiSub}>ครอบคลุมทุกกะและกิจกรรม</span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>อัตราการเต็มของที่นั่งงาน</span>
            <strong className={styles.kpiValue}>
              {kpis.occupancyRate}%
            </strong>
            <span className={styles.kpiSub}>สัดส่วนผู้ลงทะเบียนเทียบกับที่รับได้</span>
          </div>
        </section>

        {/* Recharts Modern Line/Area Chart Section */}
        <section>
          <RechartsLineChart
            data={chartDataPoints}
            metricName={metricLabel}
            unit={metricUnit}
            color="#c81e24"
            title={`แนวโน้ม ${metricLabel} (${viewMode === 'day' ? 'รายวัน' : viewMode === 'month' ? 'รายเดือน' : 'รายปี'})`}
            subtitle={
              selectedMajor
                ? `แสดงเฉพาะนักศึกษาสาขา: ${selectedMajor}`
                : 'แสดงข้อมูลนักศึกษาทุกสาขาวิชาในวิทยาลัยนวัตกรรมดิจิทัลเทคโนโลยี'
            }
          />
        </section>

        {/* Breakdown Section: Majors & Scholarships */}
        <section className={styles.breakdownGrid}>
          {/* Major Breakdown */}
          <div className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <h3>สถิติการลงทะเบียนแยกตามสาขาวิชา</h3>
              <span>{filteredData.registrations.length} คนรวม</span>
            </div>

            <div className={styles.majorBarList}>
              {majorBreakdown.map((m) => (
                <div key={m.name} className={styles.majorBarItem}>
                  <div className={styles.majorBarTop}>
                    <span className={styles.majorName}>{m.name}</span>
                    <span className={styles.majorCounts}>
                      <strong>{m.regs} คน</strong> ({m.hours} ชม.) • {m.percentage}%
                    </span>
                  </div>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${m.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Scholarship Breakdown */}
          <div className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <h3>สัดส่วนประเภททุนการศึกษา</h3>
              <span>กยศ. vs ทุนอื่นๆ</span>
            </div>

            <div className={styles.scholarshipList}>
              <div className={styles.scholarshipCardItem}>
                <div>
                  <div className={styles.schName}>นักศึกษาทุน กยศ.</div>
                  <div className={styles.schSub}>กองทุนเงินให้กู้ยืมเพื่อการศึกษา</div>
                </div>
                <div className={styles.schStatNum}>
                  <strong>{scholarshipBreakdown.kysCount} คน</strong>
                  <div className={styles.schSub}>{scholarshipBreakdown.kysHours} ชม.ทุน</div>
                </div>
              </div>

              <div className={styles.scholarshipCardItem}>
                <div>
                  <div className={styles.schName}>นักศึกษาทุนประเภทอื่นๆ</div>
                  <div className={styles.schSub}>ทุน 50%, ทุนเรียนดี, ทุนกิจกรรม ฯลฯ</div>
                </div>
                <div className={styles.schStatNum}>
                  <strong>{scholarshipBreakdown.otherCount} คน</strong>
                  <div className={styles.schSub}>{scholarshipBreakdown.otherHours} ชม.ทุน</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Month Calendar Section synced with Table */}
        <DashboardCalendar
          jobs={jobs}
          selectedDate={calendarSelectedDate}
          onSelectDate={(d) => setCalendarSelectedDate(d)}
          onOpenDayDetail={(d) => setModalDetailDate(d)}
          selectedMajor={selectedMajor}
        />

        {/* Detailed Registrations Table */}
        <section className={styles.tableCard}>
          <div className={styles.tableHeaderRow}>
            <div className={styles.sectionHeader} style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <h3>
                รายชื่อนักศึกษาที่ลงทะเบียนปฏิบัติงาน
                {calendarSelectedDate ? ` ประจำวันที่ ${formatThaiDate(calendarSelectedDate)}` : ' ในช่วงเวลา'}
                ({tableRows.length} รายการ)
              </h3>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {calendarSelectedDate && (
                <button
                  type="button"
                  onClick={() => setCalendarSelectedDate(null)}
                  className={styles.resetDateFilterBtn}
                  title="แสดงข้อมูลนักศึกษาทุกวัน"
                >
                  ✕ แสดงทุกวัน
                </button>
              )}
              <input
                type="text"
                placeholder="ค้นหาชื่อ, รหัส, สาขา, ชื่องาน..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className={styles.filterSelect}
                style={{ minWidth: '240px' }}
              />
            </div>
          </div>

          <div className={styles.tableWrapper}>
            {tableRows.length === 0 ? (
              <div className={styles.emptyTable}>ไม่พบรายการลงทะเบียนในช่วงเวลานี้</div>
            ) : (
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>วันที่จัดงาน</th>
                    <th>ชื่องาน / กิจกรรม</th>
                    <th>กะ / ช่วงเวลา</th>
                    <th>รหัสนักศึกษา</th>
                    <th>ชื่อ - นามสกุล</th>
                    <th>สาขาวิชา</th>
                    <th>ทุนการศึกษา</th>
                    <th>ชม.ทุน</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((r, i) => (
                    <tr key={`${r.regId}-${i}`}>
                      <td>{r.jobDate}</td>
                      <td><strong>{r.jobTitle}</strong></td>
                      <td>{r.shiftLabel} ({r.timeRange})</td>
                      <td><code>{r.studentId}</code></td>
                      <td>
                        <strong>{r.studentName}</strong>
                        {r.phone && (
                          <div style={{ fontSize: '0.78rem', color: '#0369a1', marginTop: '2px' }}>
                            โทร: <a href={`tel:${r.phone}`} style={{ color: '#0284c7', textDecoration: 'none' }}>{r.phone}</a>
                          </div>
                        )}
                      </td>
                      <td>{r.faculty}</td>
                      <td>
                        <span className={`${styles.tableTag} ${isKysScholarship(r.scholarshipName) ? styles.tagKys : styles.tagOther}`}>
                          {r.scholarshipName || 'ไม่ระบุ'}
                        </span>
                      </td>
                      <td><strong>{r.hours}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {/* Teacher PIN Management Modal for Master Admin */}
      <PinManagementModal
        isOpen={showPinManageModal}
        masterPin={teacherPin}
        onMasterPinChanged={(newPin) => {
          setTeacherPin(newPin);
          sessionStorage.setItem('dit_teacher_pin', newPin);
          sessionStorage.setItem('dit_teacher_role', 'admin');
        }}
        onClose={() => setShowPinManageModal(false)}
        showToast={showToast}
      />

      {/* Day Detail Modal for full drill-down directly in Dashboard */}
      {modalDetailDate && (
        <DayDetailModal
          dateStr={modalDetailDate}
          jobs={jobs.filter((j) => j.date === modalDetailDate)}
          isTeacherMode={true}
          teacherPin={teacherPin}
          onClose={() => setModalDetailDate(null)}
          onCreateJobForDate={() => {}}
          onEditJob={() => {}}
          onDeleteJob={() => {}}
          onRefresh={fetchJobs}
        />
      )}
    </div>
  );
}
