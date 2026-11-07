'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { JobAnnouncement, getTodayStr, getDaysUntilJob } from '@/types';
import { useToast } from './Toast';
import BookingModal from './BookingModal';
import ConfirmModal from './ConfirmModal';
import DayDetailModal, { formatThaiDate } from './DayDetailModal';
import styles from './Calendar.module.css';

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

type FilterMode = 'all' | 'available' | 'kys_only';

export default function Calendar() {
  const today = new Date();
  const { showToast } = useToast();

  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [jobs, setJobs] = useState<JobAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Student lookup
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [studentSearch, setStudentSearch] = useState('');

  // Teacher mode state
  const [teacherPin, setTeacherPin] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinVerifying, setPinVerifying] = useState(false);
  const [pendingActionAfterPin, setPendingActionAfterPin] = useState<
    (() => void) | null
  >(null);

  // Modals
  const [dayDetailDate, setDayDetailDate] = useState<string | null>(null);
  const [showJobFormModal, setShowJobFormModal] = useState(false);
  const [editingJob, setEditingJob] = useState<JobAnnouncement | null>(null);
  const [selectedDateForCreate, setSelectedDateForCreate] = useState<
    string | null
  >(null);
  const [deletingJob, setDeletingJob] = useState<JobAnnouncement | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const isTeacherMode = Boolean(teacherPin);
  const todayStr = getTodayStr();

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs');
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setJobs(data);
      setError(null);
    } catch {
      setError('ไม่สามารถดึงข้อมูลปฏิทินงานจากเซิร์ฟเวอร์ได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const requireTeacherAuth = (action: () => void) => {
    if (isTeacherMode) {
      action();
    } else {
      setPendingActionAfterPin(() => action);
      setPinError(null);
      setShowPinModal(true);
    }
  };

  const handleVerifyPin = async (inputPin?: string) => {
    if (!inputPin) return;
    setPinVerifying(true);
    setPinError(null);
    try {
      const res = await fetch('/api/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: inputPin }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setPinError(data.error || 'รหัส PIN อาจารย์ไม่ถูกต้อง');
        setPinVerifying(false);
        return;
      }

      setTeacherPin(inputPin);
      setShowPinModal(false);
      setPinVerifying(false);
      showToast('เปิดใช้งานโหมดอาจารย์เรียบร้อยแล้ว', 'success');

      if (pendingActionAfterPin) {
        const fn = pendingActionAfterPin;
        setPendingActionAfterPin(null);
        fn();
      }
    } catch {
      setPinError('ไม่สามารถตรวจสอบรหัส PIN ได้');
      setPinVerifying(false);
    }
  };

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

  // Filtered jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const totalCap = job.shifts.reduce((sum, s) => sum + s.capacity, 0);
      const totalReg = job.shifts.reduce(
        (sum, s) => sum + s.registrations.length,
        0
      );
      const hasAvailable = totalReg < totalCap;

      if (filterMode === 'available' && !hasAvailable) return false;
      if (filterMode === 'kys_only' && !job.allow_kys) return false;
      return true;
    });
  }, [jobs, filterMode]);

  // Student search matches
  const myRegistrations = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return [];
    const results: {
      job: JobAnnouncement;
      shiftLabel: string;
      timeRange: string;
      hours: number;
      studentName: string;
      studentId: string;
      scholarshipName: string;
    }[] = [];

    for (const job of jobs) {
      for (const shift of job.shifts) {
        for (const reg of shift.registrations) {
          if (
            reg.student_id.toLowerCase().includes(q) ||
            reg.student_name.toLowerCase().includes(q)
          ) {
            results.push({
              job,
              shiftLabel: shift.label,
              timeRange: shift.time_range,
              hours: shift.hours,
              studentName: reg.student_name,
              studentId: reg.student_id,
              scholarshipName: reg.scholarship_name,
            });
          }
        }
      }
    }
    return results;
  }, [jobs, studentSearch]);

  // Monthly statistics
  const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
  const monthStats = useMemo(() => {
    const monthJobs = jobs.filter((j) => j.date.startsWith(monthPrefix));
    let totalSeats = 0;
    let totalRegistered = 0;
    let kysEligibleCount = 0;

    for (const j of monthJobs) {
      if (j.allow_kys) kysEligibleCount++;
      for (const s of j.shifts) {
        totalSeats += s.capacity;
        totalRegistered += s.registrations.length;
      }
    }

    return {
      totalJobs: monthJobs.length,
      availableSeats: Math.max(0, totalSeats - totalRegistered),
      totalRegistered,
      kysEligibleCount,
    };
  }, [jobs, monthPrefix]);

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
    filteredJobs.filter((j) => j.date === dateStr);

  const getAllJobsForDate = (dateStr: string): JobAnnouncement[] =>
    jobs.filter((j) => j.date === dateStr);

  const handleOpenCreateJob = (dateStr?: string) => {
    const targetDate =
      dateStr && getDaysUntilJob(dateStr, todayStr) >= 0 ? dateStr : todayStr;
    requireTeacherAuth(() => {
      setDayDetailDate(null);
      setEditingJob(null);
      setSelectedDateForCreate(targetDate);
      setShowJobFormModal(true);
    });
  };

  const handleEditJob = (job: JobAnnouncement) => {
    requireTeacherAuth(() => {
      setDayDetailDate(null);
      setEditingJob(job);
      setSelectedDateForCreate(job.date);
      setShowJobFormModal(true);
    });
  };

  const handleDeleteJobRequest = (job: JobAnnouncement) => {
    requireTeacherAuth(() => {
      setDayDetailDate(null);
      setDeletingJob(job);
    });
  };

  const handleDeleteJobConfirm = async () => {
    if (!deletingJob) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/jobs/${deletingJob.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherPin }),
      });
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || 'ไม่สามารถลบประกาศงานได้', 'error');
      } else {
        showToast('ลบประกาศงานเรียบร้อยแล้ว', 'success');
        fetchJobs();
      }
    } catch {
      showToast('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้', 'error');
    }
    setDeleteLoading(false);
    setDeletingJob(null);
  };

  const handleJobFormSuccess = (action: 'created' | 'updated') => {
    setShowJobFormModal(false);
    setEditingJob(null);
    setSelectedDateForCreate(null);
    fetchJobs();
    showToast(
      action === 'created'
        ? 'สร้างประกาศงานใหม่ขึ้นปฏิทินเรียบร้อยแล้ว!'
        : 'อัปเดตข้อมูลประกาศงานเรียบร้อยแล้ว!',
      'success'
    );
  };

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.container}>
        {/* Top Navbar / Hero Banner */}
        <header className={styles.topBar}>
          <div className={styles.brandSection}>
            <div className={styles.brandBadge}>🎓 SCHOLARSHIP WORK CALENDAR</div>
            <h1 className={styles.mainTitle}>ระบบปฏิทินประกาศงานและลงทะเบียนชั่วโมงทุน</h1>
            <p className={styles.subTitle}>
              นักศึกษาสามารถเลือกดูงาน ชั่วโมงทุน และลงทะเบียนได้ทันที • ยกเลิกล่วงหน้าอย่างน้อย 2 วัน (หรือถอนชื่อภายในวันที่เพิ่งลงทะเบียน)
            </p>
          </div>

          <div className={styles.teacherToolbar}>
            {isTeacherMode ? (
              <div className={styles.teacherActiveGroup}>
                <span className={styles.teacherActivePill}>
                  👨‍🏫 โหมดอาจารย์เปิดอยู่
                </span>
                <button
                  className={styles.primaryActionBtn}
                  onClick={() => handleOpenCreateJob(todayStr)}
                >
                  + ประกาศงานใหม่
                </button>
                <button
                  className={styles.lockBtn}
                  onClick={() => {
                    setTeacherPin('');
                    showToast('ออกจากโหมดอาจารย์แล้ว', 'info');
                  }}
                >
                  สลับเป็นโหมดนักศึกษา
                </button>
              </div>
            ) : (
              <div className={styles.teacherActiveGroup}>
                <button
                  className={styles.teacherModeBtn}
                  onClick={() => {
                    setPendingActionAfterPin(null);
                    setPinError(null);
                    setShowPinModal(true);
                  }}
                >
                  🔐 สำหรับอาจารย์ (ใส่ PIN)
                </button>
                <button
                  className={styles.primaryActionBtn}
                  onClick={() => handleOpenCreateJob(todayStr)}
                >
                  + สร้างประกาศงาน
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Monthly Stats Cards */}
        <section className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>งานที่ประกาศในเดือนนี้</span>
            <strong className={styles.statValue}>{monthStats.totalJobs} งาน</strong>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>จำนวนที่นั่งว่างคงเหลือ</span>
            <strong className={`${styles.statValue} ${styles.statSuccess}`}>
              {monthStats.availableSeats} ที่นั่ง
            </strong>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>นักศึกษาลงทะเบียนแล้ว</span>
            <strong className={styles.statValue}>{monthStats.totalRegistered} คน</strong>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>งานที่รองรับทุน กยศ.</span>
            <strong className={`${styles.statValue} ${styles.statPrimary}`}>
              {monthStats.kysEligibleCount} งาน
            </strong>
          </div>
        </section>

        {/* Controls: Month Navigation + Filters + Student Search */}
        <section className={styles.controlBar}>
          <div className={styles.monthNavGroup}>
            <button
              className={styles.navIconBtn}
              onClick={goToPrevMonth}
              aria-label="เดือนก่อนหน้า"
            >
              ◀
            </button>
            <h2 className={styles.monthTitle}>
              {THAI_MONTH_NAMES[currentMonth]} {currentYear + 543}{' '}
              <span className={styles.christianYear}>({currentYear})</span>
            </h2>
            <button
              className={styles.navIconBtn}
              onClick={goToNextMonth}
              aria-label="เดือนถัดไป"
            >
              ▶
            </button>
            <button className={styles.todayBtn} onClick={goToCurrentMonth}>
              วันนี้
            </button>
          </div>

          <div className={styles.filterAndSearchGroup}>
            <div className={styles.filterTabs}>
              <button
                className={`${styles.filterTab} ${
                  filterMode === 'all' ? styles.filterTabActive : ''
                }`}
                onClick={() => setFilterMode('all')}
              >
                ทั้งหมด
              </button>
              <button
                className={`${styles.filterTab} ${
                  filterMode === 'available' ? styles.filterTabActive : ''
                }`}
                onClick={() => setFilterMode('available')}
              >
                เฉพาะที่ยังว่าง
              </button>
              <button
                className={`${styles.filterTab} ${
                  filterMode === 'kys_only' ? styles.filterTabActive : ''
                }`}
                onClick={() => setFilterMode('kys_only')}
              >
                กยศ. ทำได้
              </button>
            </div>

            <div className={styles.searchBox}>
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="🔍 ค้นหางานที่ฉันลงไว้ (พิมพ์รหัส/ชื่อนักศึกษา)..."
                className={styles.searchInput}
              />
              {studentSearch && (
                <button
                  className={styles.clearSearchBtn}
                  onClick={() => setStudentSearch('')}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Student Search Results Drawer */}
        {studentSearch.trim() && (
          <section className={styles.searchResultBox}>
            <div className={styles.searchResultHeader}>
              <strong>
                🔎 ผลการค้นหาการลงทะเบียนสำหรับ &ldquo;{studentSearch.trim()}&rdquo; (
                {myRegistrations.length} รายการ)
              </strong>
            </div>
            {myRegistrations.length === 0 ? (
              <p className={styles.noSearchMatch}>
                ไม่พบประวัติการลงทะเบียนที่ตรงกับรหัสหรือชื่อนักศึกษานี้
              </p>
            ) : (
              <div className={styles.searchResultList}>
                {myRegistrations.map((item, idx) => (
                  <div key={idx} className={styles.searchResultItem}>
                    <div>
                      <span className={styles.searchDateBadge}>
                        {formatThaiDate(item.job.date)}
                      </span>
                      <strong>{item.job.title}</strong> — {item.shiftLabel} (
                      {item.timeRange}) • 🎓 {item.hours} ชม.ทุน • ผู้ลง:{' '}
                      {item.studentName} ({item.studentId})
                    </div>
                    <button
                      className={styles.openDayBtn}
                      onClick={() => setDayDetailDate(item.job.date)}
                    >
                      ดูรายละเอียด / ถอนชื่อ
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {error && (
          <div className={styles.errorBanner}>
            <span>⚠️ {error}</span>
            <button onClick={fetchJobs}>ลองใหม่</button>
          </div>
        )}

        {/* Calendar Grid */}
        {loading ? (
          <div className={styles.loadingBox}>กำลังโหลดข้อมูลปฏิทินงานชั่วโมงทุน...</div>
        ) : (
          <div className={styles.calendarCard}>
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
                const daysUntil = getDaysUntilJob(cell.dateStr, todayStr);
                const isPast = daysUntil < 0;

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

                // Highlight if student search matches any registration on this date
                const hasMyReg =
                  studentSearch.trim().length > 0 &&
                  myRegistrations.some((r) => r.job.date === cell.dateStr);

                let cellClass = styles.dayCell;
                if (!cell.inMonth) cellClass += ` ${styles.otherMonth}`;
                if (isToday) cellClass += ` ${styles.todayCell}`;
                if (isPast) cellClass += ` ${styles.pastDay}`;
                if (hasMyReg) cellClass += ` ${styles.highlightMyReg}`;

                return (
                  <div
                    key={idx}
                    className={cellClass}
                    onClick={() => {
                      if (isPast && dayJobs.length === 0) return;
                      setDayDetailDate(cell.dateStr);
                    }}
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
                            cellFull ? styles.cellBadgeFull : styles.cellBadgeAvail
                          }
                        >
                          {cellFull ? 'เต็มแล้ว' : `ว่าง ${cellRemaining} ที่`}
                        </span>
                      )}
                    </div>

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
                            <div className={styles.jobChipTitle}>{job.title}</div>
                            <div className={styles.jobChipMeta}>
                              <span className={styles.chipHours}>🎓 {hoursLabel}</span>
                              <span
                                className={
                                  jobFull ? styles.chipCapFull : styles.chipCapOk
                                }
                              >
                                {jobFull
                                  ? `เต็ม (${jobReg}/${jobCap})`
                                  : `ว่าง ${jobCap - jobReg}/${jobCap}`}
                              </span>
                            </div>
                            {!job.allow_kys && (
                              <div className={styles.chipNoKys}>🚫 ไม่รับ กยศ.</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Legend / Quick Help */}
        <footer className={styles.footerLegend}>
          <div className={styles.legendItem}>
            <span className={styles.dotAvail} /> งานที่ยังมีที่นั่งว่าง (คลิกที่วันเพื่อดูรายละเอียดและลงทะเบียน)
          </div>
          <div className={styles.legendItem}>
            <span className={styles.dotFull} /> งานที่ลงทะเบียนครบจำนวนแล้ว
          </div>
          <div className={styles.legendItem}>
            <span className={styles.dotNoKys} /> 🚫 งานที่ระบุว่าไม่รับนักศึกษาทุน กยศ.
          </div>
        </footer>
      </div>

      {/* Day Detail Modal */}
      {dayDetailDate && (
        <DayDetailModal
          dateStr={dayDetailDate}
          jobs={getAllJobsForDate(dayDetailDate)}
          isTeacherMode={isTeacherMode}
          teacherPin={teacherPin}
          onClose={() => setDayDetailDate(null)}
          onCreateJobForDate={(d) => handleOpenCreateJob(d)}
          onEditJob={handleEditJob}
          onDeleteJob={handleDeleteJobRequest}
          onRefresh={fetchJobs}
        />
      )}

      {/* Teacher Job Form Modal */}
      {showJobFormModal && (
        <BookingModal
          editingJob={editingJob}
          selectedDate={selectedDateForCreate}
          teacherPin={teacherPin}
          onPinVerified={(pin) => setTeacherPin(pin)}
          onClose={() => {
            setShowJobFormModal(false);
            setEditingJob(null);
            setSelectedDateForCreate(null);
          }}
          onSuccess={handleJobFormSuccess}
        />
      )}

      {/* Teacher PIN Modal */}
      {showPinModal && (
        <ConfirmModal
          mode="pin"
          title="เข้าสู่โหมดอาจารย์ผู้สร้างงาน"
          message="กรุณากรอกรหัส PIN สำหรับอาจารย์ เพื่อสร้าง แก้ไข หรือลบประกาศงานชั่วโมงทุน"
          confirmText="ยืนยันรหัส PIN"
          onConfirm={handleVerifyPin}
          onCancel={() => {
            setShowPinModal(false);
            setPendingActionAfterPin(null);
            setPinError(null);
          }}
          loading={pinVerifying}
          errorText={pinError}
        />
      )}

      {/* Delete Job Confirmation Modal */}
      {deletingJob && (
        <ConfirmModal
          mode="confirm"
          title="ยืนยันการลบประกาศงาน"
          message={`คุณต้องการลบประกาศงาน "${deletingJob.title}" (${formatThaiDate(
            deletingJob.date
          )}) ใช่หรือไม่?\nข้อมูลรายชื่อนักศึกษาที่ลงทะเบียนในงานนี้จะถูกลบทั้งหมด`}
          confirmText="ลบประกาศงาน"
          onConfirm={handleDeleteJobConfirm}
          onCancel={() => setDeletingJob(null)}
          loading={deleteLoading}
        />
      )}
    </div>
  );
}
