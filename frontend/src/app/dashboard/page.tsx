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
import RechartsLineChart, { ChartDataPoint, MetricConfig } from '@/components/RechartsLineChart';
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
type MetricType = 'announcedHours' | 'registrations' | 'jobs';
type ScopeFilter = 'all' | 'internal' | 'external';

const DASHBOARD_METRICS: MetricConfig[] = [
  {
    key: 'announcedHours',
    label: 'ชั่วโมงทุนที่อาจารย์ประกาศ',
    unit: 'ชม.',
    color: '#c81e24', // Crimson Red
  },
  {
    key: 'registrations',
    label: 'จำนวนเด็กที่เข้าร่วม',
    unit: 'คน',
    color: '#2563eb', // Royal Blue
  },
  {
    key: 'jobs',
    label: 'จำนวนงานที่ประกาศ',
    unit: 'งาน',
    color: '#059669', // Emerald Green
  },
];

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
  const [selectedMetrics, setSelectedMetrics] = useState<MetricType[]>([
    'announcedHours',
    'registrations',
    'jobs',
  ]);
  const [selectedScope, setSelectedScope] = useState<ScopeFilter>('all');
  const [selectedMajor, setSelectedMajor] = useState<string>('');
  const [selectedTeacher, setSelectedTeacher] = useState<string>('');
  const [activeDetailTab, setActiveDetailTab] = useState<'jobs' | 'students'>('jobs');

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
        setPinError(data.error || 'รหัสผ่านอาจารย์ไม่ถูกต้อง');
        setPinLoading(false);
        return;
      }

      if (data.role !== 'admin') {
        setPinError(
          'สิทธิ์ไม่เพียงพอ: หน้านี้สงวนไว้สำหรับอาจารย์ผู้ดูแลระบบที่มี Master Password เท่านั้น รหัสผ่านอาจารย์ทั่วไปสามารถใช้สร้างประกาศงานและถอนชื่อนักศึกษาได้ที่หน้าปฏิทินหลัก'
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

  // Extract unique teacher names
  const allTeacherNames = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs) {
      if (j.teacher_name?.trim()) set.add(j.teacher_name.trim());
    }
    return Array.from(set).sort();
  }, [jobs]);

  // Extract non-DIT faculties from registrations
  const nonDitFaculties = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs) {
      for (const s of j.shifts) {
        for (const r of s.registrations) {
          const norm = normalizeMajorName(r.faculty);
          if (!DIT_MAJORS.includes(norm as any) && norm) {
            set.add(norm);
          }
        }
      }
    }
    return Array.from(set).sort();
  }, [jobs]);

  // Filtered registrations and jobs in the active time frame & filters
  const filteredData = useMemo(() => {
    const filteredJobs = jobs.filter((j) => {
      if (viewMode === 'day') {
        if (j.date < startDate || j.date > endDate) return false;
      } else if (viewMode === 'month') {
        if (!j.date.startsWith(String(selectedYear))) return false;
      }

      // Filter by Scope (Internal vs External)
      const jScope = j.job_type === 'external' ? 'external' : 'internal';
      if (selectedScope !== 'all' && jScope !== selectedScope) return false;

      // Filter by Teacher
      if (selectedTeacher && j.teacher_name.trim() !== selectedTeacher) return false;

      return true;
    });

    const registrationsList: {
      regId: number;
      jobId: number;
      jobTitle: string;
      jobDate: string;
      jobScope: 'internal' | 'external';
      teacherName: string;
      location: string;
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
      const jScope = job.job_type === 'external' ? 'external' : 'internal';
      for (const shift of job.shifts) {
        for (const reg of shift.registrations) {
          const normFaculty = normalizeMajorName(reg.faculty);
          if (!selectedMajor || normFaculty === selectedMajor) {
            registrationsList.push({
              regId: reg.id,
              jobId: job.id,
              jobTitle: job.title,
              jobDate: job.date,
              jobScope: jScope,
              teacherName: job.teacher_name,
              location: job.location,
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
  }, [jobs, viewMode, startDate, endDate, selectedYear, selectedScope, selectedTeacher, selectedMajor]);

  // Overall KPI metrics
  const kpis = useMemo(() => {
    let totalAnnouncedHours = 0;
    let internalAnnouncedHours = 0;
    let externalAnnouncedHours = 0;

    let totalCapacity = 0;
    let totalFilled = 0;

    let internalJobsCount = 0;
    let externalJobsCount = 0;

    for (const j of filteredData.jobs) {
      const isExt = j.job_type === 'external';
      if (isExt) externalJobsCount++;
      else internalJobsCount++;

      for (const s of j.shifts) {
        totalAnnouncedHours += s.hours;
        if (isExt) externalAnnouncedHours += s.hours;
        else internalAnnouncedHours += s.hours;

        totalCapacity += s.capacity;
        totalFilled += s.registrations.length;
      }
    }

    const totalRegs = filteredData.registrations.length;
    const uniqueStudents = new Set(filteredData.registrations.map((r) => r.studentId)).size;
    const totalStudentHours = filteredData.registrations.reduce((sum, r) => sum + r.hours, 0);
    const totalJobs = filteredData.jobs.length;
    const occupancyRate =
      totalCapacity > 0 ? Math.round((totalFilled / totalCapacity) * 100) : 0;

    return {
      totalAnnouncedHours,
      internalAnnouncedHours,
      externalAnnouncedHours,
      totalJobs,
      internalJobsCount,
      externalJobsCount,
      totalRegs,
      uniqueStudents,
      totalStudentHours,
      totalCapacity,
      totalFilled,
      occupancyRate,
    };
  }, [filteredData]);

  // Generate Line Chart Data Points based on View Mode (Includes all 3 metrics)
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

        const dayJobs = filteredData.jobs.filter((j) => j.date === dateStr);
        const dayRegs = filteredData.registrations.filter((r) => r.jobDate === dateStr);

        const dayAnnouncedHours = dayJobs.reduce(
          (acc, j) => acc + j.shifts.reduce((sAcc, s) => sAcc + s.hours, 0),
          0
        );

        const dayNum = cur.getDate();
        const monthShort = THAI_MONTH_SHORT[cur.getMonth()];

        points.push({
          label: `${dayNum} ${monthShort}`,
          fullDate: `วันที่ ${dayNum} ${THAI_MONTH_FULL[cur.getMonth()]} ${y + 543}`,
          announcedHours: dayAnnouncedHours,
          registrations: dayRegs.length,
          jobs: dayJobs.length,
          value: dayAnnouncedHours,
        });

        cur.setDate(cur.getDate() + 1);
      }
      return points;
    }

    if (viewMode === 'month') {
      const points: ChartDataPoint[] = [];
      for (let m = 0; m < 12; m++) {
        const monthStr = `${selectedYear}-${String(m + 1).padStart(2, '0')}`;
        const monthJobs = filteredData.jobs.filter((j) => j.date.startsWith(monthStr));
        const monthRegs = filteredData.registrations.filter((r) => r.jobDate.startsWith(monthStr));

        const monthAnnouncedHours = monthJobs.reduce(
          (acc, j) => acc + j.shifts.reduce((sAcc, s) => sAcc + s.hours, 0),
          0
        );

        points.push({
          label: THAI_MONTH_SHORT[m],
          fullDate: `เดือน${THAI_MONTH_FULL[m]} ${selectedYear + 543}`,
          announcedHours: monthAnnouncedHours,
          registrations: monthRegs.length,
          jobs: monthJobs.length,
          value: monthAnnouncedHours,
        });
      }
      return points;
    }

    if (viewMode === 'year') {
      const yearMap = new Map<number, { jobs: number; announcedHours: number; regs: number }>();
      const currentBE = currentYear;
      for (let y = currentBE - 2; y <= currentBE + 1; y++) {
        yearMap.set(y, { jobs: 0, announcedHours: 0, regs: 0 });
      }

      for (const j of filteredData.jobs) {
        const y = Number(j.date.slice(0, 4));
        if (!yearMap.has(y)) {
          yearMap.set(y, { jobs: 0, announcedHours: 0, regs: 0 });
        }
        const item = yearMap.get(y)!;
        item.jobs++;
        for (const s of j.shifts) {
          item.announcedHours += s.hours;
          item.regs += s.registrations.length;
        }
      }

      const sortedYears = Array.from(yearMap.keys()).sort((a, b) => a - b);
      return sortedYears.map((y) => {
        const item = yearMap.get(y)!;
        return {
          label: `ปี ${y + 543}`,
          fullDate: `ปี พ.ศ. ${y + 543} (${y})`,
          announcedHours: item.announcedHours,
          registrations: item.regs,
          jobs: item.jobs,
          value: item.announcedHours,
        };
      });
    }

    return [];
  }, [viewMode, startDate, endDate, selectedYear, filteredData, currentYear]);

  // Scope breakdown (งานภายในคณะ vs งานภายนอกคณะ)
  const scopeBreakdown = useMemo(() => {
    let internalRegs = 0;
    let externalRegs = 0;
    let internalCap = 0;
    let externalCap = 0;

    for (const j of filteredData.jobs) {
      const isExt = j.job_type === 'external';
      for (const s of j.shifts) {
        if (isExt) {
          externalCap += s.capacity;
          externalRegs += s.registrations.length;
        } else {
          internalCap += s.capacity;
          internalRegs += s.registrations.length;
        }
      }
    }

    return {
      internalJobs: kpis.internalJobsCount,
      externalJobs: kpis.externalJobsCount,
      internalHours: kpis.internalAnnouncedHours,
      externalHours: kpis.externalAnnouncedHours,
      internalRegs,
      externalRegs,
      internalCap,
      externalCap,
    };
  }, [filteredData, kpis]);

  // Major distribution breakdown
  const majorBreakdown = useMemo(() => {
    const counts: Record<string, { regs: number; hours: number }> = {};
    for (const m of DIT_MAJORS) {
      counts[m] = { regs: 0, hours: 0 };
    }

    for (const r of filteredData.registrations) {
      const major = normalizeMajorName(r.faculty);
      if (!counts[major]) {
        counts[major] = { regs: 0, hours: 0 };
      }
      counts[major].regs++;
      counts[major].hours += r.hours;
    }

    const total = filteredData.registrations.length || 1;
    return Object.keys(counts)
      .map((m) => {
        const stat = counts[m] || { regs: 0, hours: 0 };
        const pct = Math.round((stat.regs / total) * 100);
        return {
          name: m,
          regs: stat.regs,
          hours: stat.hours,
          percentage: pct,
        };
      })
      .sort((a, b) => b.regs - a.regs);
  }, [filteredData]);

  // Location Breakdown (Top Places)
  const locationBreakdown = useMemo(() => {
    const map = new Map<string, { jobs: number; hours: number; regs: number }>();
    for (const j of filteredData.jobs) {
      const loc = j.location?.trim() || 'ไม่ระบุสถานที่';
      const item = map.get(loc) || { jobs: 0, hours: 0, regs: 0 };
      item.jobs++;
      for (const s of j.shifts) {
        item.hours += s.hours;
        item.regs += s.registrations.length;
      }
      map.set(loc, item);
    }
    return Array.from(map.entries())
      .map(([location, stat]) => ({ location, ...stat }))
      .sort((a, b) => b.jobs - a.jobs)
      .slice(0, 5);
  }, [filteredData]);

  // Filtered Jobs rows for Detailed Table/Cards
  const jobRows = useMemo(() => {
    let list = filteredData.jobs;
    if (calendarSelectedDate) {
      list = list.filter((j) => j.date === calendarSelectedDate);
    }
    const q = tableSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.teacher_name.toLowerCase().includes(q) ||
        j.location.toLowerCase().includes(q) ||
        (j.job_type === 'external' ? 'ภายนอก' : 'ภายใน').includes(q)
    );
  }, [filteredData.jobs, tableSearch, calendarSelectedDate]);

  // Filtered Student Registrations rows
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
              กรุณากรอกรหัสผ่าน Master Password สำหรับอาจารย์ (ความยาว 16 ตัวอักษร) เพื่อเข้าสู่ระบบรายงานสถิติและกราฟวิเคราะห์ข้อมูล
            </p>
          </div>

          <form onSubmit={handlePinSubmit} className={styles.pinForm}>
            <input
              type="password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="กรอกรหัสผ่าน Master Password 16 ตัวอักษร"
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

  const isAllMetricsSelected = selectedMetrics.length === DASHBOARD_METRICS.length;

  const activeMetricConfigs = useMemo(() => {
    return DASHBOARD_METRICS.filter((m) => selectedMetrics.includes(m.key as MetricType));
  }, [selectedMetrics]);

  const viewModeText = viewMode === 'day' ? 'รายวัน' : viewMode === 'month' ? 'รายเดือน' : 'รายปี';

  const chartTitle = useMemo(() => {
    if (selectedMetrics.length === 3) {
      return `แนวโน้มข้อมูลภาพรวม 3 ด้านพร้อมกัน (${viewModeText})`;
    }
    if (selectedMetrics.length === 2) {
      const names = activeMetricConfigs.map((m) => m.label).join(' และ ');
      return `เปรียบเทียบ ${names} (${viewModeText})`;
    }
    if (selectedMetrics.length === 1) {
      return `แนวโน้ม ${activeMetricConfigs[0]?.label || ''} (${viewModeText})`;
    }
    return `แนวโน้มข้อมูล (${viewModeText})`;
  }, [selectedMetrics, activeMetricConfigs, viewModeText]);

  const handleSelectAllMetrics = () => {
    setSelectedMetrics(['announcedHours', 'registrations', 'jobs']);
  };

  const handleSelectSingleMetric = (key: MetricType) => {
    setSelectedMetrics([key]);
  };

  const handleToggleMetric = (key: string) => {
    const metricKey = key as MetricType;
    if (selectedMetrics.includes(metricKey)) {
      if (selectedMetrics.length > 1) {
        setSelectedMetrics(selectedMetrics.filter((k) => k !== metricKey));
      }
    } else {
      setSelectedMetrics([...selectedMetrics, metricKey]);
    }
  };

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
              title="จัดการรหัสผ่านของอาจารย์ท่านอื่น และกำหนด Master Password"
            >
              จัดการรหัสผ่านอาจารย์
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
              <div className={styles.metricBtnGroup}>
                <button
                  type="button"
                  className={`${styles.metricBtn} ${isAllMetricsSelected ? styles.metricBtnAllActive : ''}`}
                  onClick={handleSelectAllMetrics}
                >
                  <span className={styles.metricBtnDots}>
                    <span style={{ backgroundColor: '#c81e24' }} />
                    <span style={{ backgroundColor: '#2563eb' }} />
                    <span style={{ backgroundColor: '#059669' }} />
                  </span>
                  ดูทุกข้อมูลพร้อมกัน
                </button>

                <button
                  type="button"
                  className={`${styles.metricBtn} ${
                    !isAllMetricsSelected && selectedMetrics.length === 1 && selectedMetrics[0] === 'announcedHours'
                      ? styles.metricBtnHoursActive
                      : ''
                  }`}
                  onClick={() => handleSelectSingleMetric('announcedHours')}
                >
                  <span className={styles.metricDotRed} />
                  ชั่วโมงทุนที่อาจารย์ประกาศ
                </button>

                <button
                  type="button"
                  className={`${styles.metricBtn} ${
                    !isAllMetricsSelected && selectedMetrics.length === 1 && selectedMetrics[0] === 'registrations'
                      ? styles.metricBtnRegsActive
                      : ''
                  }`}
                  onClick={() => handleSelectSingleMetric('registrations')}
                >
                  <span className={styles.metricDotBlue} />
                  จำนวนเด็กที่เข้าร่วม
                </button>

                <button
                  type="button"
                  className={`${styles.metricBtn} ${
                    !isAllMetricsSelected && selectedMetrics.length === 1 && selectedMetrics[0] === 'jobs'
                      ? styles.metricBtnJobsActive
                      : ''
                  }`}
                  onClick={() => handleSelectSingleMetric('jobs')}
                >
                  <span className={styles.metricDotGreen} />
                  จำนวนงานที่ประกาศ
                </button>
              </div>
            </div>
          </div>

          {/* Sub Filters Row */}
          <div className={styles.filterSubRow}>
            {viewMode === 'day' && (
              <>
                <div className={styles.dateInputsRow}>
                  <div className={styles.dateInputsFlex}>
                    <div className={styles.dateInputItem}>
                      <label htmlFor="start-date">ตั้งแต่วันที่:</label>
                      <input
                        id="start-date"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                      />
                    </div>
                    <div className={styles.dateInputItem}>
                      <label htmlFor="end-date">ถึงวันที่:</label>
                      <input
                        id="end-date"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                    </div>
                  </div>
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

            {/* Filter by Scope (Internal vs External) */}
            <div className={styles.majorFilterGroup}>
              <label htmlFor="scope-filter">ขอบเขตงาน:</label>
              <select
                id="scope-filter"
                value={selectedScope}
                onChange={(e) => setSelectedScope(e.target.value as ScopeFilter)}
                className={styles.filterSelect}
              >
                <option value="all">ทุกประเภทงาน (ทั้งหมด)</option>
                <option value="internal">เฉพาะงานภายในคณะ (DIT)</option>
                <option value="external">เฉพาะงานภายนอกคณะ</option>
              </select>
            </div>

            {/* Filter by Major */}
            <div className={styles.majorFilterGroup}>
              <label htmlFor="major-filter">กรองคณะ/สาขาวิชา:</label>
              <select
                id="major-filter"
                value={selectedMajor}
                onChange={(e) => setSelectedMajor(e.target.value)}
                className={styles.filterSelect}
              >
                <option value="">ทุกสาขาวิชา/คณะ</option>
                <optgroup label="สาขาวิชาในวิทยาลัยนวัตกรรมดิจิทัล (DIT)">
                  {DIT_MAJORS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </optgroup>
                {nonDitFaculties.length > 0 && (
                  <optgroup label="คณะอื่นๆ ที่นักศึกษาเข้าร่วม">
                    {nonDitFaculties.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Filter by Teacher */}
            {allTeacherNames.length > 0 && (
              <div className={styles.majorFilterGroup}>
                <label htmlFor="teacher-filter">อาจารย์ผู้ประกาศ:</label>
                <select
                  id="teacher-filter"
                  value={selectedTeacher}
                  onChange={(e) => setSelectedTeacher(e.target.value)}
                  className={styles.filterSelect}
                >
                  <option value="">อาจารย์ทุกคน</option>
                  {allTeacherNames.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </section>

        {/* KPI Cards */}
        <section className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>ชั่วโมงทุนที่อาจารย์ประกาศเปิดรับ</span>
            <strong className={`${styles.kpiValue} ${styles.kpiSuccess}`}>
              {kpis.totalAnnouncedHours.toLocaleString()} <span style={{ fontSize: '1rem' }}>ชม.</span>
            </strong>
            <span className={styles.kpiSub}>
              ภายในคณะ: {kpis.internalAnnouncedHours} ชม. • ภายนอก: {kpis.externalAnnouncedHours} ชม.
            </span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>จำนวนงานที่ประกาศทั้งหมด</span>
            <strong className={`${styles.kpiValue} ${styles.kpiPrimary}`}>
              {kpis.totalJobs.toLocaleString()} <span style={{ fontSize: '1rem' }}>งาน</span>
            </strong>
            <span className={styles.kpiSub}>
              ภายในคณะ: {kpis.internalJobsCount} งาน • ภายนอก: {kpis.externalJobsCount} งาน
            </span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>จำนวนนักศึกษาที่เข้าร่วม</span>
            <strong className={styles.kpiValue}>
              {kpis.totalRegs.toLocaleString()} <span style={{ fontSize: '1rem' }}>คน</span>
            </strong>
            <span className={styles.kpiSub}>
              ไม่ซ้ำคน: {kpis.uniqueStudents} คน (รวมทำไป {kpis.totalStudentHours} ชม.)
            </span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>จำนวนที่นั่งรับและอัตราการเต็ม</span>
            <strong className={styles.kpiValue}>
              {kpis.occupancyRate}%
            </strong>
            <span className={styles.kpiSub}>
              รับได้ {kpis.totalCapacity} ที่ (ลงแล้ว {kpis.totalFilled}, ว่าง {Math.max(0, kpis.totalCapacity - kpis.totalFilled)} ที่)
            </span>
          </div>
        </section>

        {/* Recharts Modern Line/Area Chart Section */}
        <section>
          <RechartsLineChart
            data={chartDataPoints}
            activeMetrics={activeMetricConfigs}
            allMetrics={DASHBOARD_METRICS}
            onToggleMetric={handleToggleMetric}
            title={chartTitle}
            subtitle={
              selectedMajor
                ? `แสดงเฉพาะคณะ/สาขาวิชา: ${selectedMajor}`
                : selectedScope === 'internal'
                ? 'แสดงเฉพาะงานภายในคณะ (DIT)'
                : selectedScope === 'external'
                ? 'แสดงเฉพาะงานภายนอกคณะ'
                : 'แสดงข้อมูลงานและนักศึกษาทุกประเภทในระบบ'
            }
          />
        </section>

        {/* Breakdown Section: Scope (Internal vs External) & Top Places & Major breakdown */}
        <section className={styles.breakdownGrid}>
          {/* Internal vs External Jobs Breakdown */}
          <div className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <h3>สถิติขอบเขตงาน: งานภายในคณะ vs งานภายนอกคณะ</h3>
              <span>{filteredData.jobs.length} งานรวม</span>
            </div>

            <div className={styles.scopeCardGrid}>
              <div className={styles.scopeCard}>
                <div className={styles.scopeCardTop}>
                  <div className={styles.scopeCardTitle}>
                    <span>งานภายในคณะ (DIT)</span>
                    <span className={styles.badgeScopeInternal}>ภายในวิทยาลัย</span>
                  </div>
                </div>
                <div className={styles.scopeMetricsRow}>
                  <div className={styles.scopeMetricCol}>
                    <span className={styles.scopeMetricColLabel}>งานที่ประกาศ</span>
                    <strong className={styles.scopeMetricColVal}>{scopeBreakdown.internalJobs} งาน</strong>
                  </div>
                  <div className={styles.scopeMetricCol}>
                    <span className={styles.scopeMetricColLabel}>ชม.ทุนประกาศ</span>
                    <strong className={`${styles.scopeMetricColVal} ${styles.kpiSuccess}`}>
                      {scopeBreakdown.internalHours} ชม.
                    </strong>
                  </div>
                  <div className={styles.scopeMetricCol}>
                    <span className={styles.scopeMetricColLabel}>เด็กเข้าร่วม</span>
                    <strong className={`${styles.scopeMetricColVal} ${styles.kpiPrimary}`}>
                      {scopeBreakdown.internalRegs} คน
                    </strong>
                  </div>
                </div>
              </div>

              <div className={styles.scopeCard}>
                <div className={styles.scopeCardTop}>
                  <div className={styles.scopeCardTitle}>
                    <span>งานภายนอกคณะ</span>
                    <span className={styles.badgeScopeExternal}>ภายนอกวิทยาลัย</span>
                  </div>
                </div>
                <div className={styles.scopeMetricsRow}>
                  <div className={styles.scopeMetricCol}>
                    <span className={styles.scopeMetricColLabel}>งานที่ประกาศ</span>
                    <strong className={styles.scopeMetricColVal}>{scopeBreakdown.externalJobs} งาน</strong>
                  </div>
                  <div className={styles.scopeMetricCol}>
                    <span className={styles.scopeMetricColLabel}>ชม.ทุนประกาศ</span>
                    <strong className={`${styles.scopeMetricColVal} ${styles.kpiSuccess}`}>
                      {scopeBreakdown.externalHours} ชม.
                    </strong>
                  </div>
                  <div className={styles.scopeMetricCol}>
                    <span className={styles.scopeMetricColLabel}>เด็กเข้าร่วม</span>
                    <strong className={`${styles.scopeMetricColVal} ${styles.kpiPrimary}`}>
                      {scopeBreakdown.externalRegs} คน
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Top Places / Sources */}
          <div className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <h3>แหล่งที่มาของงาน (มาจากที่ไหนบ้าง)</h3>
              <span>5 อันดับสถานที่จัดงาน</span>
            </div>

            <div className={styles.locationList}>
              {locationBreakdown.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                  ยังไม่มีข้อมูลสถานที่จัดงาน
                </div>
              ) : (
                locationBreakdown.map((loc) => (
                  <div key={loc.location} className={styles.locationItem}>
                    <span className={styles.locationName}>{loc.location}</span>
                    <span className={styles.locationStat}>
                      <strong>{loc.jobs} งาน</strong> ({loc.hours} ชม.ทุน • {loc.regs} คน)
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Major & Faculty Breakdown Section */}
        <section className={styles.cardSection}>
          <div className={styles.sectionHeader}>
            <h3>สถิตินักศึกษาที่เข้าร่วมแยกตาม คณะ / สาขาวิชา</h3>
            <span>{filteredData.registrations.length} คน-ครั้ง</span>
          </div>

          <div className={styles.majorBarList}>
            {majorBreakdown.map((m) => (
              <div key={m.name} className={styles.majorBarItem}>
                <div className={styles.majorBarTop}>
                  <span className={styles.majorName}>{m.name}</span>
                  <span className={styles.majorCounts}>
                    <strong>{m.regs} คน</strong> • {m.percentage}%
                  </span>
                </div>
                <div className={styles.barTrack}>
                  <div className={styles.barFill} style={{ width: `${m.percentage}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Interactive Month Calendar Section synced with Table */}
        <DashboardCalendar
          jobs={filteredData.jobs}
          selectedDate={calendarSelectedDate}
          onSelectDate={(d) => setCalendarSelectedDate(d)}
          onOpenDayDetail={(d) => setModalDetailDate(d)}
          selectedMajor={selectedMajor}
        />

        {/* Detailed Section: Toggle between Jobs List and Registrations List */}
        <section className={styles.tableCard}>
          <div className={styles.tableHeaderRow}>
            <div className={styles.viewSwitchBar}>
              <button
                type="button"
                className={`${styles.viewSwitchBtn} ${activeDetailTab === 'jobs' ? styles.viewSwitchBtnActive : ''}`}
                onClick={() => setActiveDetailTab('jobs')}
              >
                รายการงานที่ประกาศ ({jobRows.length} งาน)
              </button>
              <button
                type="button"
                className={`${styles.viewSwitchBtn} ${activeDetailTab === 'students' ? styles.viewSwitchBtnActive : ''}`}
                onClick={() => setActiveDetailTab('students')}
              >
                รายชื่อนักศึกษาที่ลงทะเบียน ({tableRows.length} คน)
              </button>
            </div>

            <div className={styles.tableHeaderActions}>
              {calendarSelectedDate && (
                <button
                  type="button"
                  onClick={() => setCalendarSelectedDate(null)}
                  className={styles.resetDateFilterBtn}
                  title="แสดงข้อมูลทุกวัน"
                >
                  ✕ แสดงทุกวัน
                </button>
              )}
              <input
                type="text"
                placeholder={
                  activeDetailTab === 'jobs'
                    ? 'ค้นหาชื่องาน, อาจารย์, สถานที่...'
                    : 'ค้นหาชื่อ, รหัส, สาขา, ชื่องาน...'
                }
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className={`${styles.filterSelect} ${styles.tableSearchInput}`}
              />
            </div>
          </div>

          {/* TAB 1: JOBS TABLE & MOBILE CARDS */}
          {activeDetailTab === 'jobs' && (
            <>
              {/* Desktop/Tablet Table View for Jobs */}
              <div className={styles.tableWrapper}>
                {jobRows.length === 0 ? (
                  <div className={styles.emptyTable}>ไม่พบประกาศงานในช่วงเวลาหรือตัวกรองนี้</div>
                ) : (
                  <table className={styles.dataTable}>
                    <thead>
                      <tr>
                        <th>วันที่จัดงาน</th>
                        <th>ชื่องาน / กิจกรรม</th>
                        <th>ประเภทงาน</th>
                        <th>อาจารย์ผู้ประกาศ</th>
                        <th>สถานที่นัดหมาย</th>
                        <th>กะ / ชั่วโมงทุน</th>
                        <th>ที่นั่งรับ (ลงแล้ว / รับได้)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobRows.map((job) => {
                        const totalCap = job.shifts.reduce((s, sh) => s + sh.capacity, 0);
                        const totalReg = job.shifts.reduce((s, sh) => s + sh.registrations.length, 0);
                        const totalJobHours = job.shifts.reduce((s, sh) => s + sh.hours, 0);
                        const isExt = job.job_type === 'external';

                        return (
                          <tr key={job.id}>
                            <td>{job.date}</td>
                            <td>
                              <strong>{job.title}</strong>
                            </td>
                            <td>
                              <span className={isExt ? styles.badgeScopeExternal : styles.badgeScopeInternal}>
                                {isExt ? 'งานภายนอกคณะ' : 'งานภายในคณะ'}
                              </span>
                            </td>
                            <td>{job.teacher_name}</td>
                            <td>{job.location || 'ไม่ระบุ'}</td>
                            <td>
                              <strong>{job.shifts.length} กะ</strong> (รวม {totalJobHours} ชม.)
                            </td>
                            <td>
                              <strong>{totalReg}/{totalCap} ที่</strong>{' '}
                              <span style={{ fontSize: '0.78rem', color: totalReg >= totalCap ? '#dc2626' : '#16a34a' }}>
                                ({totalReg >= totalCap ? 'เต็ม' : `ว่าง ${totalCap - totalReg}`})
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Mobile Card List View for Jobs */}
              <div className={styles.mobileCardList}>
                {jobRows.length === 0 ? (
                  <div className={styles.emptyTable}>ไม่พบประกาศงานในช่วงเวลาหรือตัวกรองนี้</div>
                ) : (
                  jobRows.map((job) => {
                    const totalCap = job.shifts.reduce((s, sh) => s + sh.capacity, 0);
                    const totalReg = job.shifts.reduce((s, sh) => s + sh.registrations.length, 0);
                    const totalJobHours = job.shifts.reduce((s, sh) => s + sh.hours, 0);
                    const isExt = job.job_type === 'external';

                    return (
                      <div key={`mj-${job.id}`} className={styles.mobileRegCard}>
                        <div className={styles.mobileCardTopRow}>
                          <span className={styles.mobileCardDateBadge}>{formatThaiDate(job.date)}</span>
                          <div className={styles.mobileCardBadges}>
                            <span className={isExt ? styles.badgeScopeExternal : styles.badgeScopeInternal}>
                              {isExt ? 'งานภายนอกคณะ' : 'งานภายในคณะ'}
                            </span>
                            <span className={styles.mobileHoursBadge}>{totalJobHours} ชม.</span>
                          </div>
                        </div>

                        <div className={styles.mobileCardJob}>
                          <strong className={styles.mobileCardJobTitle}>{job.title}</strong>
                          <span className={styles.mobileCardJobShift}>
                            อาจารย์: {job.teacher_name} • สถานที่: {job.location || 'ไม่ระบุ'}
                          </span>
                        </div>

                        <div className={styles.mobileCardStudent}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                            <span>
                              จำนวนกะ: <strong>{job.shifts.length} ช่วงเวลา</strong>
                            </span>
                            <span>
                              ผู้ลงทะเบียน:{' '}
                              <strong style={{ color: totalReg >= totalCap ? '#dc2626' : '#16a34a' }}>
                                {totalReg}/{totalCap} คน
                              </strong>
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {/* TAB 2: STUDENTS REGISTRATIONS TABLE & MOBILE CARDS */}
          {activeDetailTab === 'students' && (
            <>
              {/* Desktop/Tablet Table View */}
              <div className={styles.tableWrapper}>
                {tableRows.length === 0 ? (
                  <div className={styles.emptyTable}>ไม่พบรายการลงทะเบียนในช่วงเวลานี้</div>
                ) : (
                  <table className={styles.dataTable}>
                    <thead>
                      <tr>
                        <th>วันที่จัดงาน</th>
                        <th>ชื่องาน / กิจกรรม</th>
                        <th>ขอบเขต</th>
                        <th>กะ / ช่วงเวลา</th>
                        <th>รหัสนักศึกษา</th>
                        <th>ชื่อ - นามสกุล</th>
                        <th>คณะ / สาขาวิชา</th>
                        <th>ทุนการศึกษา</th>
                        <th>ชม.ทุน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((r, i) => (
                        <tr key={`${r.regId}-${i}`}>
                          <td>{r.jobDate}</td>
                          <td>
                            <strong>{r.jobTitle}</strong>
                          </td>
                          <td>
                            <span className={r.jobScope === 'external' ? styles.badgeScopeExternal : styles.badgeScopeInternal}>
                              {r.jobScope === 'external' ? 'ภายนอก' : 'ภายใน'}
                            </span>
                          </td>
                          <td>
                            {r.shiftLabel} ({r.timeRange})
                          </td>
                          <td>
                            <code>{r.studentId}</code>
                          </td>
                          <td>
                            <strong>{r.studentName}</strong>
                            {r.phone && (
                              <div style={{ fontSize: '0.78rem', color: '#0369a1', marginTop: '2px' }}>
                                โทร:{' '}
                                <a href={`tel:${r.phone}`} style={{ color: '#0284c7', textDecoration: 'none' }}>
                                  {r.phone}
                                </a>
                              </div>
                            )}
                          </td>
                          <td>{r.faculty}</td>
                          <td>
                            <span
                              className={`${styles.tableTag} ${
                                isKysScholarship(r.scholarshipName) ? styles.tagKys : styles.tagOther
                              }`}
                            >
                              {r.scholarshipName || 'ไม่ระบุ'}
                            </span>
                          </td>
                          <td>
                            <strong>{r.hours}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Mobile Card List View */}
              <div className={styles.mobileCardList}>
                {tableRows.length === 0 ? (
                  <div className={styles.emptyTable}>ไม่พบรายการลงทะเบียนในช่วงเวลานี้</div>
                ) : (
                  tableRows.map((r, i) => (
                    <div key={`m-${r.regId}-${i}`} className={styles.mobileRegCard}>
                      <div className={styles.mobileCardTopRow}>
                        <span className={styles.mobileCardDateBadge}>{formatThaiDate(r.jobDate)}</span>
                        <div className={styles.mobileCardBadges}>
                          <span className={r.jobScope === 'external' ? styles.badgeScopeExternal : styles.badgeScopeInternal}>
                            {r.jobScope === 'external' ? 'ภายนอก' : 'ภายใน'}
                          </span>
                          <span className={styles.mobileHoursBadge}>{r.hours} ชม.ทุน</span>
                          <span
                            className={`${styles.tableTag} ${
                              isKysScholarship(r.scholarshipName) ? styles.tagKys : styles.tagOther
                            }`}
                          >
                            {r.scholarshipName || 'ไม่ระบุ'}
                          </span>
                        </div>
                      </div>

                      <div className={styles.mobileCardJob}>
                        <strong className={styles.mobileCardJobTitle}>{r.jobTitle}</strong>
                        <span className={styles.mobileCardJobShift}>
                          {r.shiftLabel} ({r.timeRange})
                        </span>
                      </div>

                      <div className={styles.mobileCardStudent}>
                        <div className={styles.mobileStudentName}>{r.studentName}</div>
                        <div className={styles.mobileStudentMeta}>
                          <span className={styles.mobileStudentId}>รหัส: {r.studentId}</span>
                          <span className={styles.mobileStudentMajor}>• {r.faculty}</span>
                        </div>
                      </div>

                      {r.phone && (
                        <div className={styles.mobileCardActionRow}>
                          <a href={`tel:${r.phone}`} className={styles.mobileCallBtn}>
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                            </svg>
                            โทร {r.phone}
                          </a>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
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
