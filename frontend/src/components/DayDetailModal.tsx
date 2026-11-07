'use client';

import { useState } from 'react';
import {
  JobAnnouncement,
  JobShift,
  Registration,
  POPULAR_FACULTIES,
  POPULAR_SCHOLARSHIPS,
  getTodayStr,
  getDaysUntilJob,
  isKysScholarship,
  checkCancelEligibility,
} from '@/types';
import { useToast } from './Toast';
import styles from './DayDetailModal.module.css';

interface Props {
  dateStr: string;
  jobs: JobAnnouncement[];
  isTeacherMode: boolean;
  teacherPin: string;
  onClose: () => void;
  onCreateJobForDate: (dateStr: string) => void;
  onEditJob: (job: JobAnnouncement) => void;
  onDeleteJob: (job: JobAnnouncement) => void;
  onRefresh: () => void;
}

const THAI_MONTHS = [
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

const THAI_DAYS = [
  'วันอาทิตย์',
  'วันจันทร์',
  'วันอังคาร',
  'วันพุธ',
  'วันพฤหัสบดี',
  'วันศุกร์',
  'วันเสาร์',
];

export function formatThaiDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const dayName = THAI_DAYS[d.getDay()];
  const day = d.getDate();
  const month = THAI_MONTHS[d.getMonth()];
  const buddhistYear = d.getFullYear() + 543;
  return `${dayName}ที่ ${day} ${month} ${buddhistYear}`;
}

export default function DayDetailModal({
  dateStr,
  jobs,
  isTeacherMode,
  teacherPin,
  onClose,
  onCreateJobForDate,
  onEditJob,
  onDeleteJob,
  onRefresh,
}: Props) {
  const { showToast } = useToast();
  const todayStr = getTodayStr();
  const daysUntil = getDaysUntilJob(dateStr, todayStr);

  // State สำหรับฟอร์มลงทะเบียนของนักศึกษา
  const [activeShiftInfo, setActiveShiftInfo] = useState<{
    job: JobAnnouncement;
    shift: JobShift;
  } | null>(null);
  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [faculty, setFaculty] = useState('');
  const [scholarshipName, setScholarshipName] = useState('');
  const [regError, setRegError] = useState<string | null>(null);
  const [regLoading, setRegLoading] = useState(false);

  // State สำหรับการถอนชื่อ / ยกเลิกงาน
  const [cancellingReg, setCancellingReg] = useState<{
    reg: Registration;
    job: JobAnnouncement;
    shift: JobShift;
  } | null>(null);
  const [confirmStudentId, setConfirmStudentId] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  const isActionLoading = regLoading || cancelLoading;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isActionLoading) onClose();
  };

  const openRegistrationForm = (job: JobAnnouncement, shift: JobShift) => {
    setActiveShiftInfo({ job, shift });
    setCancellingReg(null);
    setRegError(null);
    onRefresh();
  };

  const liveJob = activeShiftInfo
    ? jobs.find((j) => j.id === activeShiftInfo.job.id) || activeShiftInfo.job
    : null;
  const liveShift = liveJob && activeShiftInfo
    ? liveJob.shifts.find((s) => s.id === activeShiftInfo.shift.id) || activeShiftInfo.shift
    : null;
  const isLiveShiftFull = Boolean(
    liveShift && liveShift.registrations.length >= liveShift.capacity
  );

  const handleCopyParticipants = (job: JobAnnouncement) => {
    const lines: string[] = [];
    lines.push(`รายชื่อผู้ลงทะเบียนงาน: ${job.title}`);
    lines.push(`วันที่: ${formatThaiDate(job.date)}`);
    lines.push(`อาจารย์ผู้รับผิดชอบ: ${job.teacher_name}`);
    if (job.location) lines.push(`สถานที่: ${job.location}`);
    lines.push('----------------------------------------');

    for (const s of job.shifts) {
      lines.push(
        `\n${s.label} (${s.time_range}) | ${s.hours} ชม.ทุน | ลงทะเบียน ${s.registrations.length}/${s.capacity} คน`
      );
      if (s.registrations.length === 0) {
        lines.push('   (ยังไม่มีผู้ลงทะเบียน)');
      } else {
        s.registrations.forEach((r, i) => {
          lines.push(
            `   ${i + 1}. ${r.student_id} - ${r.student_name} (สาขา: ${r.faculty})${
              r.scholarship_name ? ` [ทุน: ${r.scholarship_name}]` : ''
            }`
          );
        });
      }
    }

    navigator.clipboard.writeText(lines.join('\n'));
    showToast('คัดลอกรายชื่อผู้เข้าร่วมทั้งหมดลงคลิปบอร์ดแล้ว', 'success');
  };

  const isKysBlockedInForm =
    activeShiftInfo &&
    !activeShiftInfo.job.allow_kys &&
    isKysScholarship(scholarshipName);

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShiftInfo) return;
    setRegError(null);

    if (isKysBlockedInForm) {
      setRegError('งานนี้ไม่รับนักศึกษาทุน กยศ. กรุณาเลือกงานอื่นที่เปิดรับ กยศ.');
      return;
    }

    setRegLoading(true);
    try {
      const res = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: activeShiftInfo.job.id,
          shift_id: activeShiftInfo.shift.id,
          student_id: studentId.trim(),
          student_name: studentName.trim(),
          faculty: faculty.trim(),
          scholarship_name: scholarshipName.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setRegError(data.error || 'ไม่สามารถลงทะเบียนได้');
        showToast(data.error || 'ลงทะเบียนไม่สำเร็จ', 'error');
        setRegLoading(false);
        onRefresh();
        return;
      }

      showToast('ลงทะเบียนรับงานสำเร็จแล้ว!', 'success');
      setActiveShiftInfo(null);
      setStudentId('');
      setStudentName('');
      setFaculty('');
      setScholarshipName('');
      setRegLoading(false);
      onRefresh();
    } catch {
      setRegError('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
      setRegLoading(false);
    }
  };

  const handleCancelRegistrationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingReg) return;
    setCancelError(null);
    setCancelLoading(true);

    try {
      const res = await fetch(`/api/registrations/${cancellingReg.reg.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: confirmStudentId.trim(),
          teacherPin: isTeacherMode ? teacherPin : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCancelError(data.error || 'ไม่สามารถถอนชื่อได้');
        showToast(data.error || 'ไม่สามารถถอนชื่อได้', 'error');
        setCancelLoading(false);
        onRefresh();
        return;
      }

      showToast('ถอนชื่อจากการลงทะเบียนเรียบร้อยแล้ว', 'success');
      setCancellingReg(null);
      setConfirmStudentId('');
      setCancelLoading(false);
      onRefresh();
    } catch {
      setCancelError('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
      setCancelLoading(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.modal}>
        {isActionLoading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinnerLarge} />
            <p className={styles.loadingTitle}>
              {regLoading
                ? 'กำลังบันทึกข้อมูลการลงทะเบียน...'
                : 'กำลังถอนชื่อออกจากระบบ...'}
            </p>
            <span className={styles.loadingSub}>กรุณารอสักครู่ ระบบกำลังอัปเดตข้อมูลล่าสุด</span>
          </div>
        )}

        {/* Header */}
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.headerBadges}>
              <span
                className={
                  daysUntil < 0
                    ? styles.dayStatusPast
                    : daysUntil === 0
                    ? styles.dayStatusToday
                    : styles.dayStatusFuture
                }
              >
                {daysUntil < 0
                  ? 'ผ่านไปแล้ว'
                  : daysUntil === 0
                  ? 'วันนี้'
                  : daysUntil === 1
                  ? 'พรุ่งนี้ (เหลือ 1 วัน)'
                  : `อีก ${daysUntil} วัน`}
              </span>
              <span className={styles.jobCountBadge}>
                {jobs.length} งานที่ประกาศในวันนี้
              </span>
            </div>
            <h2 className={styles.title}>{formatThaiDate(dateStr)}</h2>
          </div>

          <div className={styles.headerActions}>
            {daysUntil >= 0 && !activeShiftInfo && !cancellingReg && (
              <button
                className={styles.createJobBtn}
                onClick={() => onCreateJobForDate(dateStr)}
              >
                + ประกาศงานวันนี้ {isTeacherMode ? '' : '(อาจารย์)'}
              </button>
            )}
            <button className={styles.closeBtn} onClick={onClose} aria-label="ปิด">
              ✕
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className={styles.content}>
          {/* ฟอร์มลงทะเบียนของนักศึกษา (แสดงเมื่อกดเลือกกะ) */}
          {activeShiftInfo && (
            <div className={styles.regFormCard}>
              <div className={styles.regFormHeader}>
                <div>
                  <span className={styles.regStepBadge}>ลงทะเบียนรับงานชั่วโมงทุน</span>
                  <h3>{activeShiftInfo.job.title}</h3>
                  <p className={styles.regSubInfo}>
                    ช่วงเวลา: <strong>{activeShiftInfo.shift.label} ({activeShiftInfo.shift.time_range})</strong> • ได้รับ{' '}
                    <strong>{activeShiftInfo.shift.hours} ชั่วโมงทุน</strong>
                    {liveShift && (
                      <>
                        {' '}• สถานะล่าสุด:{' '}
                        <strong>
                          {isLiveShiftFull
                            ? `เต็มแล้ว (${liveShift.registrations.length}/${liveShift.capacity} คน)`
                            : `ว่าง ${Math.max(0, liveShift.capacity - liveShift.registrations.length)} ที่ (ลงแล้ว ${liveShift.registrations.length}/${liveShift.capacity} คน)`}
                        </strong>
                      </>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={() => setActiveShiftInfo(null)}
                >
                  ย้อนกลับ
                </button>
              </div>

              {!activeShiftInfo.job.allow_kys && (
                <div className={styles.kysWarningBanner}>
                  <strong>ข้อกำหนดสำคัญ:</strong> งานนี้ <u>ไม่รับนักศึกษาทุน กยศ.</u> (เฉพาะทุนประเภทอื่นเท่านั้น)
                </div>
              )}

              <form onSubmit={handleRegisterSubmit} className={styles.regForm}>
                <div className={styles.formGrid2}>
                  <div className={styles.field}>
                    <label>รหัสนักศึกษา *</label>
                    <input
                      type="text"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      placeholder="กรอกรหัสนักศึกษา เช่น 66010001"
                      required
                      autoFocus
                    />
                  </div>
                  <div className={styles.field}>
                    <label>ชื่อ - นามสกุล *</label>
                    <input
                      type="text"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      placeholder="เช่น นายสมหวัง ตั้งใจเรียน"
                      required
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <label>สาขา *</label>
                  <input
                    type="text"
                    value={faculty}
                    onChange={(e) => setFaculty(e.target.value)}
                    placeholder="เลือกจากปุ่มด้านล่าง หรือพิมพ์ชื่อสาขา..."
                    required
                  />
                  <div className={styles.quickPills}>
                    {POPULAR_FACULTIES.map((fac) => (
                      <button
                        key={fac}
                        type="button"
                        className={`${styles.pillBtn} ${faculty === fac ? styles.pillBtnActive : ''}`}
                        onClick={() => setFaculty(fac)}
                      >
                        {fac}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.field}>
                  <label>
                    ชื่อทุนการศึกษา {activeShiftInfo.job.require_scholarship_name ? '*' : '(ถ้ามี)'}
                  </label>
                  <input
                    type="text"
                    value={scholarshipName}
                    onChange={(e) => setScholarshipName(e.target.value)}
                    placeholder="เลือกประเภททุนด้านล่าง หรือพิมพ์ชื่อทุนของคุณ..."
                    required={activeShiftInfo.job.require_scholarship_name}
                  />
                  <div className={styles.quickPills}>
                    {POPULAR_SCHOLARSHIPS.map((sch) => {
                      const disabledKys = !activeShiftInfo.job.allow_kys && sch === 'กยศ.';
                      return (
                        <button
                          key={sch}
                          type="button"
                          className={`${styles.pillBtn} ${
                            scholarshipName === sch ? styles.pillBtnActive : ''
                          } ${disabledKys ? styles.pillBtnDisabled : ''}`}
                          onClick={() => setScholarshipName(sch)}
                        >
                          {disabledKys ? 'กยศ. (งานนี้ไม่รับ)' : sch}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {isLiveShiftFull && (
                  <div className={styles.errorBox}>
                    ขณะนี้มีนักศึกษาท่านอื่นลงทะเบียนในช่วงเวลานี้ครบจำนวนแล้ว กรุณากดย้อนกลับเพื่อเลือกช่วงเวลาอื่น
                  </div>
                )}

                {isKysBlockedInForm && (
                  <div className={styles.errorBox}>
                    ขออภัย งานนี้ไม่รับนักศึกษาทุน กยศ. กรุณาเลือกงานอื่นที่เปิดรับทุน กยศ.
                  </div>
                )}

                {regError && !isKysBlockedInForm && (
                  <div className={styles.errorBox}>{regError}</div>
                )}

                <div className={styles.policyNote}>
                  <strong>เงื่อนไขการถอนชื่อ/ยกเลิกงาน:</strong> สามารถยกเลิกได้ล่วงหน้าอย่างน้อย{' '}
                  <strong>2 วัน</strong> ก่อนวันงานจริง (หากเหลือเพียง 1 วันแล้วเพิ่งมากรอกชื่อในวันนี้
                  สามารถถอนชื่อได้ภายในวันนี้เท่านั้น)
                </div>

                <div className={styles.regFormActions}>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => setActiveShiftInfo(null)}
                    disabled={regLoading}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className={styles.primaryBtn}
                    disabled={regLoading || Boolean(isKysBlockedInForm) || isLiveShiftFull}
                  >
                    {regLoading && <span className={styles.btnSpinner} />}
                    {regLoading
                      ? 'กำลังบันทึก...'
                      : isLiveShiftFull
                      ? 'ช่วงเวลานี้เต็มแล้ว'
                      : 'ยืนยันการลงทะเบียน'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* กล่องยืนยันการถอนชื่อ / ยกเลิกการลงทะเบียน */}
          {cancellingReg && (
            <div className={styles.cancelCard}>
              <div className={styles.cancelHeader}>
                <h3>ยืนยันการถอนชื่อจากงานชั่วโมงทุน</h3>
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={() => {
                    setCancellingReg(null);
                    setCancelError(null);
                  }}
                >
                  ปิด
                </button>
              </div>

              <div className={styles.cancelDetails}>
                <p>
                  <strong>งาน:</strong> {cancellingReg.job.title} ({cancellingReg.shift.label}{' '}
                  {cancellingReg.shift.time_range})
                </p>
                <p>
                  <strong>ผู้ลงทะเบียน:</strong> {cancellingReg.reg.student_name} (รหัส:{' '}
                  {cancellingReg.reg.student_id})
                </p>
              </div>

              {(() => {
                const eligibility = checkCancelEligibility(
                  cancellingReg.job.date,
                  cancellingReg.reg.registered_date,
                  todayStr
                );
                return (
                  <div
                    className={
                      eligibility.isSameDayGrace
                        ? styles.graceNotice
                        : styles.okNotice
                    }
                  >
                    {eligibility.reason}
                  </div>
                );
              })()}

              <form onSubmit={handleCancelRegistrationSubmit} className={styles.cancelForm}>
                {!isTeacherMode ? (
                  <div className={styles.field}>
                    <label>กรอกรหัสนักศึกษาของคุณเพื่อยืนยันการถอนชื่อ *</label>
                    <input
                      type="text"
                      value={confirmStudentId}
                      onChange={(e) => setConfirmStudentId(e.target.value)}
                      placeholder={`กรอกรหัสนักศึกษา (${cancellingReg.reg.student_id})`}
                      required
                      autoFocus
                    />
                  </div>
                ) : (
                  <div className={styles.teacherOverrideNotice}>
                    คุณกำลังลบรายชื่อด้วยสิทธิ์อาจารย์ (ไม่ต้องใช้รหัสนักศึกษา)
                  </div>
                )}

                {cancelError && <div className={styles.errorBox}>{cancelError}</div>}

                <div className={styles.regFormActions}>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => {
                      setCancellingReg(null);
                      setCancelError(null);
                    }}
                    disabled={cancelLoading}
                  >
                    ย้อนกลับ
                  </button>
                  <button
                    type="submit"
                    className={styles.dangerBtn}
                    disabled={cancelLoading}
                  >
                    {cancelLoading && <span className={styles.btnSpinner} />}
                    {cancelLoading ? 'กำลังถอนชื่อ...' : 'ยืนยันการถอนชื่อ'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* รายการงานทั้งหมดในวันนี้ (ซ่อนเมื่อกำลังเปิดฟอร์มลงทะเบียนหรือฟอร์มถอนชื่อ) */}
          {!activeShiftInfo && !cancellingReg && (
            jobs.length === 0 ? (
              <div className={styles.emptyState}>
                <h3>ยังไม่มีประกาศงานในวันนี้</h3>
                {daysUntil >= 0 ? (
                  <>
                    <p>หากคุณเป็นอาจารย์ สามารถกดปุ่มด้านล่างเพื่อสร้างประกาศรับนักศึกษาช่วยงานได้ทันที</p>
                    <button
                      className={styles.emptyCreateBtn}
                      onClick={() => onCreateJobForDate(dateStr)}
                    >
                      + สร้างประกาศงานในวันนี้
                    </button>
                  </>
                ) : (
                  <p>วันที่ผ่านมาแล้ว ไม่สามารถสร้างประกาศงานย้อนหลังได้</p>
                )}
              </div>
            ) : (
              <div className={styles.jobsList}>
              {jobs.map((job) => {
                const totalCap = job.shifts.reduce((sum, s) => sum + s.capacity, 0);
                const totalReg = job.shifts.reduce(
                  (sum, s) => sum + s.registrations.length,
                  0
                );
                const isJobFull = totalReg >= totalCap;

                return (
                  <div key={job.id} className={styles.jobCard}>
                    <div className={styles.jobCardTop}>
                      <div className={styles.jobTitleWrap}>
                        <div className={styles.jobBadgesRow}>
                          <span
                            className={
                              job.allow_kys ? styles.badgeKysOk : styles.badgeKysNo
                            }
                          >
                            {job.allow_kys ? 'รับทุกทุน (กยศ. ทำได้)' : 'ไม่รับทุน กยศ.'}
                          </span>
                          <span
                            className={
                              isJobFull ? styles.badgeFull : styles.badgeAvailable
                            }
                          >
                            {isJobFull
                              ? `เต็มแล้ว (${totalReg}/${totalCap} คน)`
                              : `ว่าง ${totalCap - totalReg} ที่ (ลงแล้ว ${totalReg}/${totalCap} คน)`}
                          </span>
                        </div>
                        <h3 className={styles.jobTitle}>{job.title}</h3>
                      </div>

                      <div className={styles.jobTeacherActions}>
                        <button
                          type="button"
                          className={styles.copyBtn}
                          onClick={() => handleCopyParticipants(job)}
                          title="คัดลอกรายชื่อผู้เข้าร่วมทั้งหมด"
                        >
                          คัดลอกรายชื่อ
                        </button>
                        <button
                          type="button"
                          className={styles.editJobBtn}
                          onClick={() => onEditJob(job)}
                          title="แก้ไขประกาศงาน (สำหรับอาจารย์)"
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          className={styles.deleteJobBtn}
                          onClick={() => onDeleteJob(job)}
                          title="ลบประกาศงาน (สำหรับอาจารย์)"
                        >
                          ลบ
                        </button>
                      </div>
                    </div>

                    <div className={styles.jobMeta}>
                      <span><strong>อาจารย์ผู้ประกาศ:</strong> {job.teacher_name}</span>
                      {job.location && (
                        <span><strong>สถานที่:</strong> {job.location}</span>
                      )}
                    </div>

                    {job.description && (
                      <p className={styles.jobDesc}>{job.description}</p>
                    )}

                    {/* รายการกะ / ช่วงเวลา */}
                    <div className={styles.shiftsContainer}>
                      {job.shifts.map((shift) => {
                        const regCount = shift.registrations.length;
                        const remaining = Math.max(0, shift.capacity - regCount);
                        const shiftFull = regCount >= shift.capacity;

                        return (
                          <div key={shift.id} className={styles.shiftBox}>
                            <div className={styles.shiftBoxHeader}>
                              <div className={styles.shiftInfoLeft}>
                                <span className={styles.shiftName}>{shift.label}</span>
                                <span className={styles.shiftTime}>{shift.time_range}</span>
                                <span className={styles.shiftHours}>
                                  {shift.hours} ชม.ทุน
                                </span>
                                <span
                                  className={
                                    shiftFull
                                      ? styles.shiftCapFull
                                      : styles.shiftCapOk
                                  }
                                >
                                  ลงแล้ว {regCount}/{shift.capacity} คน{' '}
                                  {shiftFull ? '(เต็ม)' : `(ว่าง ${remaining})`}
                                </span>
                              </div>

                              <div className={styles.shiftActionRight}>
                                {daysUntil >= 0 && !shiftFull ? (
                                  <button
                                    type="button"
                                    className={styles.registerBtn}
                                    onClick={() => openRegistrationForm(job, shift)}
                                  >
                                    ลงทะเบียนช่วงนี้
                                  </button>
                                ) : shiftFull ? (
                                  <span className={styles.fullPill}>เต็มแล้ว</span>
                                ) : (
                                  <span className={styles.pastPill}>ปิดรับสมัคร</span>
                                )}
                              </div>
                            </div>

                            {/* รายชื่อนักศึกษาที่ลงทะเบียนในกะนี้ */}
                            <div className={styles.participantsSection}>
                              {shift.registrations.length === 0 ? (
                                <div className={styles.noParticipants}>
                                  ยังไม่มีผู้ลงทะเบียนในช่วงเวลานี้ — กดปุ่ม &ldquo;ลงทะเบียนช่วงนี้&rdquo; เพื่อรับงานคนแรกได้เลย
                                </div>
                              ) : (
                                <div className={styles.participantsList}>
                                  {shift.registrations.map((reg, index) => {
                                    const cancelCheck = checkCancelEligibility(
                                      job.date,
                                      reg.registered_date,
                                      todayStr
                                    );
                                    const canRemove =
                                      cancelCheck.canCancel || isTeacherMode;

                                    return (
                                      <div
                                        key={reg.id}
                                        className={styles.participantRow}
                                      >
                                        <div className={styles.participantInfo}>
                                          <span className={styles.participantIndex}>
                                            #{index + 1}
                                          </span>
                                          <span className={styles.participantName}>
                                            {reg.student_name}
                                          </span>
                                          <span className={styles.participantCode}>
                                            รหัส: {reg.student_id}
                                          </span>
                                          <span className={styles.participantFaculty}>
                                            สาขา: {reg.faculty}
                                          </span>
                                          {reg.scholarship_name && (
                                            <span className={styles.participantScholarship}>
                                              ทุน: {reg.scholarship_name}
                                            </span>
                                          )}
                                          {cancelCheck.isSameDayGrace && (
                                            <span className={styles.sameDayBadge}>
                                              เพิ่งลงวันนี้ (ถอนชื่อได้วันนี้)
                                            </span>
                                          )}
                                        </div>

                                        <div className={styles.participantActions}>
                                          {canRemove ? (
                                            <button
                                              type="button"
                                              className={styles.withdrawBtn}
                                              onClick={() => {
                                                setCancellingReg({ reg, job, shift });
                                                setActiveShiftInfo(null);
                                                setCancelError(null);
                                              }}
                                              title={cancelCheck.reason}
                                            >
                                              ถอนชื่อ
                                            </button>
                                          ) : (
                                            <span
                                              className={styles.lockedCancelBadge}
                                              title={cancelCheck.reason}
                                            >
                                              งดยกเลิก (&lt; 2 วัน)
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
