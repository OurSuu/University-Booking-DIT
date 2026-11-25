'use client';

import { useState } from 'react';
import {
  JobAnnouncement,
  JobShift,
  Registration,
  DIT_MAJORS,
  DIT_FACULTY_LABEL,
  isDitMajor,
  sanitizeAllowedMajors,
  areTimeRangesOverlappingOrSame,
  groupJobShifts,
  getTodayStr,
  getDaysUntilJob,
  isKysScholarship,
  getJobScholarshipPolicy,
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
  const [facultyGroup, setFacultyGroup] = useState<'DIT' | 'OTHER' | ''>('');
  const [faculty, setFaculty] = useState('');
  const [customFaculty, setCustomFaculty] = useState('');
  const [customMajor, setCustomMajor] = useState('');
  const [phone, setPhone] = useState('');
  const [scholarshipName, setScholarshipName] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [regError, setRegError] = useState<string | null>(null);
  const [regLoading, setRegLoading] = useState(false);
  const [showRegConfirmPopup, setShowRegConfirmPopup] = useState(false);

  // State สำหรับการถอนชื่อ (เฉพาะอาจารย์)
  const [cancellingReg, setCancellingReg] = useState<{
    reg: Registration;
    job: JobAnnouncement;
    shift: JobShift;
  } | null>(null);
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
    setFacultyGroup(job.allow_other_faculty ? '' : 'DIT');
    setFaculty('');
    setCustomFaculty('');
    setCustomMajor('');
    setPhone('');
    setTransferNote('');
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
    lines.push(`รายชื่อผู้ลงทะเบียนกิจกรรม ${job.title}`);
    lines.push(`วันที่ ${formatThaiDate(job.date)}`);
    lines.push(`อาจารย์ผู้รับผิดชอบ ${job.teacher_name}`);
    if (job.teacher_contact) lines.push(`ช่องทางติดต่ออาจารย์ ${job.teacher_contact}`);
    if (job.location) lines.push(`สถานที่ ${job.location}`);
    lines.push('----------------------------------------');

    const isRolesOnly = job.shift_mode === 'roles';
    const groups = groupJobShifts(job.shifts);

    for (const group of groups) {
      if (isRolesOnly || group.label === 'ตลอดงาน') {
        lines.push(`\nช่วงเวลากิจกรรม ${group.time_range} | ${group.hours} ชม.`);
      } else {
        lines.push(`\n${group.label} (${group.time_range}) | ${group.hours} ชม.`);
      }

      for (const s of group.roles) {
        const allowed = sanitizeAllowedMajors(s.allowed_majors);
        const majorPart = allowed.length > 0 ? ` [เฉพาะสาขา ${allowed.join(', ')}]` : '';
        const roleHeading = s.duty_name
          ? `  - หน้าที่ ${s.duty_name} (${s.registrations.length}/${s.capacity} คน)${majorPart}`
          : `  - ลงทะเบียน ${s.registrations.length}/${s.capacity} คน${majorPart}`;
        lines.push(roleHeading);

        if (s.registrations.length === 0) {
          lines.push('     (ยังไม่มีผู้ลงทะเบียน)');
        } else {
          s.registrations.forEach((r, i) => {
            const facultyLabel = isDitMajor(r.faculty) ? `สาขา ${r.faculty}` : r.faculty;
            const transferPart = r.transfer_note ? ` [โอนชั่วโมง ${r.transfer_note}]` : '';
            lines.push(
              `     ${i + 1}. ${r.student_id} - ${r.student_name} (${facultyLabel}${
                r.phone ? ` • โทร ${r.phone}` : ''
              })${r.scholarship_name ? ` [ทุน ${r.scholarship_name}]` : ''}${transferPart}`
            );
          });
        }
      }
    }

    navigator.clipboard.writeText(lines.join('\n'));
    showToast('คัดลอกรายชื่อผู้เข้าร่วมทั้งหมดลงคลิปบอร์ดแล้ว', 'success');
  };

  const liveShiftAllowedMajors = sanitizeAllowedMajors(liveShift?.allowed_majors);
  const allowsOtherFacultyInForm = Boolean(liveJob?.allow_other_faculty);
  const effectiveFacultyGroup = allowsOtherFacultyInForm ? facultyGroup : 'DIT';
  const resolvedFaculty =
    effectiveFacultyGroup === 'OTHER'
      ? customFaculty.trim() && customMajor.trim()
        ? `${customFaculty.trim()} / ${customMajor.trim()}`
        : ''
      : effectiveFacultyGroup === 'DIT'
      ? faculty.trim()
      : '';

  const isMajorBlockedInForm = Boolean(
    activeShiftInfo &&
      liveShiftAllowedMajors.length > 0 &&
      ((allowsOtherFacultyInForm && effectiveFacultyGroup === 'OTHER') ||
        (resolvedFaculty && !liveShiftAllowedMajors.includes(resolvedFaculty)))
  );

  const studentIdLowerForm = studentId.trim().toLowerCase();
  const studentNameLowerForm = studentName.trim().toLowerCase();
  const overlappingRegShift =
    activeShiftInfo && liveJob && liveShift && (studentIdLowerForm || studentNameLowerForm)
      ? liveJob.shifts.find((s) => {
          const sameOrOverlappingPeriod =
            s.id === liveShift.id || areTimeRangesOverlappingOrSame(s.time_range, liveShift.time_range);
          if (!sameOrOverlappingPeriod) return false;
          return s.registrations.some(
            (r) =>
              (studentIdLowerForm && r.student_id.trim().toLowerCase() === studentIdLowerForm) ||
              (studentNameLowerForm && r.student_name.trim().toLowerCase() === studentNameLowerForm)
          );
        })
      : undefined;

  const activeJobPolicy = activeShiftInfo
    ? getJobScholarshipPolicy(activeShiftInfo.job)
    : 'all';

  const isKysBlockedInForm =
    activeShiftInfo &&
    activeJobPolicy === 'non_kys' &&
    isKysScholarship(scholarshipName);

  const isNonKysBlockedForKysOnlyInForm =
    activeShiftInfo &&
    activeJobPolicy === 'kys_only' &&
    scholarshipName.trim().length > 0 &&
    !isKysScholarship(scholarshipName);

  const handlePreRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShiftInfo) return;
    setRegError(null);

    if (isLiveShiftFull) {
      setRegError('ขณะนี้มีนักศึกษาท่านอื่นลงทะเบียนในตำแหน่ง/ช่วงเวลานี้ครบจำนวนแล้ว');
      return;
    }

    if (activeJobPolicy === 'kys_only' && !isKysScholarship(scholarshipName)) {
      setRegError('ขออภัย กิจกรรมนี้รับเฉพาะนักศึกษาทุน กยศ. เท่านั้น กรุณาระบุชื่อทุนเป็น กยศ.');
      return;
    }

    if (isMajorBlockedInForm) {
      setRegError(
        `ขออภัย ตำแหน่งนี้รับเฉพาะสาขา ${liveShiftAllowedMajors.join(', ')}`
      );
      return;
    }

    if (overlappingRegShift) {
      const conflictText = overlappingRegShift.duty_name
        ? `หน้าที่ "${overlappingRegShift.duty_name}" (${overlappingRegShift.label} • ${overlappingRegShift.time_range})`
        : `${overlappingRegShift.label} (${overlappingRegShift.time_range})`;
      setRegError(
        overlappingRegShift.id === liveShift?.id
          ? 'รหัสนักศึกษาหรือชื่อนี้ได้ลงทะเบียนในหน้าที่/ช่วงเวลานี้ไปแล้ว'
          : `คุณได้ลงทะเบียนในช่วงเวลาเดียวกันนี้ไปแล้ว (${conflictText}) ไม่สามารถลงซ้ำซ้อนในช่วงเวลาเดียวกันได้`
      );
      return;
    }

    if (isKysBlockedInForm) {
      setRegError('กิจกรรมนี้ไม่รับนักศึกษาทุน กยศ. กรุณาเลือกกิจกรรมอื่นที่เปิดรับ กยศ.');
      return;
    }

    if (!studentId.trim() || !studentName.trim()) {
      setRegError('กรุณากรอกรหัสนักศึกษา และชื่อ-นามสกุล ให้ครบถ้วน');
      return;
    }

    if (allowsOtherFacultyInForm && !effectiveFacultyGroup) {
      setRegError('กรุณาเลือกคณะที่สังกัด');
      return;
    }

    if (effectiveFacultyGroup === 'OTHER') {
      if (!customFaculty.trim()) {
        setRegError('กรุณาระบุชื่อคณะที่คุณสังกัด');
        return;
      }
      if (!customMajor.trim()) {
        setRegError('กรุณาระบุสาขาวิชาของคุณ');
        return;
      }
      if (`${customFaculty.trim()} / ${customMajor.trim()}`.length > 150) {
        setRegError('ชื่อคณะและสาขาวิชารวมกันต้องไม่เกิน 150 ตัวอักษร');
        return;
      }
    }

    if (effectiveFacultyGroup === 'DIT' && !faculty.trim()) {
      setRegError('กรุณาเลือกสาขาวิชาให้ครบถ้วน');
      return;
    }

    if (!resolvedFaculty) {
      setRegError('กรุณาเลือกคณะหรือสาขาวิชาให้ครบถ้วน');
      return;
    }

    const cleanPhone = phone.trim().replace(/[\s-]/g, '');
    if (!cleanPhone) {
      setRegError('กรุณากรอกเบอร์โทรศัพท์ติดต่อ');
      return;
    }
    if (!/^0[0-9]{8,9}$/.test(cleanPhone)) {
      setRegError('กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง (เช่น 0812345678 หรือ 02xxxxxxx)');
      return;
    }

    if (activeShiftInfo.job.require_scholarship_name && !scholarshipName.trim()) {
      setRegError('กิจกรรมนี้กำหนดให้ต้องระบุชื่อทุน กรุณาระบุชื่อทุนของคุณ');
      return;
    }

    // เปิด Pop up ยืนยันก่อนลงทะเบียนจริง
    setShowRegConfirmPopup(true);
  };

  const handleExecuteRegister = async () => {
    if (!activeShiftInfo) return;
    setShowRegConfirmPopup(false);
    setRegLoading(true);
    setRegError(null);

    try {
      const cleanPhone = phone.trim().replace(/[\s-]/g, '');
      const res = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: activeShiftInfo.job.id,
          shift_id: activeShiftInfo.shift.id,
          student_id: studentId.trim(),
          student_name: studentName.trim(),
          faculty: resolvedFaculty,
          scholarship_name: scholarshipName.trim(),
          transfer_note: transferNote.trim(),
          phone: cleanPhone,
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

      showToast('ลงทะเบียนร่วมกิจกรรมสำเร็จแล้ว!', 'success');
      setActiveShiftInfo(null);
      setStudentId('');
      setStudentName('');
      setFacultyGroup('');
      setFaculty('');
      setCustomFaculty('');
      setCustomMajor('');
      setPhone('');
      setScholarshipName('');
      setTransferNote('');
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
          teacherPin,
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
      setCancelLoading(false);
      onRefresh();
    } catch {
      setCancelError('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
      setCancelLoading(false);
    }
  };

  const renderParticipantsList = (
    job: JobAnnouncement,
    shift: JobShift,
    regBtnLabel: string,
    emptyEntityLabel: string
  ) => {
    if (shift.registrations.length === 0) {
      return (
        <div className={styles.noParticipants}>
          ยังไม่มีผู้ลงทะเบียน{emptyEntityLabel} — กดปุ่ม &ldquo;{regBtnLabel}&rdquo; เพื่อรับงานคนแรกได้เลย
        </div>
      );
    }

    return (
      <div className={styles.participantsList}>
        {shift.registrations.map((reg, index) => (
          <div key={reg.id} className={styles.participantRow}>
            {isTeacherMode ? (
              <div className={styles.participantInfo}>
                <span className={styles.participantIndex}>#{index + 1}</span>
                <span className={styles.participantName}>{reg.student_name}</span>
                <span className={styles.participantCode}>รหัส {reg.student_id}</span>
                <span className={styles.participantFaculty}>
                  {isDitMajor(reg.faculty) ? `สาขา ${reg.faculty}` : reg.faculty}
                </span>
                {reg.phone && (
                  <a
                    href={`tel:${reg.phone}`}
                    className={styles.participantPhone}
                    title="โทรติดต่อนักศึกษา"
                  >
                    โทร {reg.phone}
                  </a>
                )}
                {reg.scholarship_name && (
                  <span className={styles.participantScholarship}>
                    ทุน {reg.scholarship_name}
                  </span>
                )}
                {reg.transfer_note && (
                  <span className={styles.participantTransferNote}>
                    โอนชั่วโมง {reg.transfer_note}
                  </span>
                )}
              </div>
            ) : (
              <div className={styles.participantInfo}>
                <span className={styles.participantIndex}>#{index + 1}</span>
                <span className={styles.participantCode}>
                  รหัสนักศึกษา <strong>{reg.student_id}</strong>
                </span>
                <span
                  className={styles.pdpaProtectedBadge}
                  title="สงวนข้อมูลชื่อ สาขา และเบอร์โทรศัพท์ ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)"
                >
                  สงวนข้อมูลส่วนตัว (PDPA)
                </span>
              </div>
            )}

            <div className={styles.participantActions}>
              {isTeacherMode && (
                <button
                  type="button"
                  className={styles.withdrawBtn}
                  onClick={() => {
                    setCancellingReg({ reg, job, shift });
                    setActiveShiftInfo(null);
                    setCancelError(null);
                  }}
                  title="ถอนชื่อนักศึกษาคนนี้ (สำหรับอาจารย์)"
                >
                  ถอนชื่อ (อาจารย์)
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
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
                {jobs.length} กิจกรรมที่ประกาศในวันนี้
              </span>
            </div>
            <h2 className={styles.title}>{formatThaiDate(dateStr)}</h2>
          </div>

          <div className={styles.headerActions}>
            {daysUntil >= 0 && jobs.length > 0 && !activeShiftInfo && !cancellingReg && (
              <button
                className={styles.createJobBtn}
                onClick={() => onCreateJobForDate(dateStr)}
              >
                + ประกาศกิจกรรมวันนี้ {isTeacherMode ? '' : '(อาจารย์)'}
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
                  <span className={styles.regStepBadge}>ลงทะเบียนร่วมกิจกรรมชั่วโมงทุน</span>
                  <h3>{activeShiftInfo.job.title}</h3>
                  <p className={styles.regSubInfo}>
                    {activeShiftInfo.job.shift_mode === 'roles' ||
                    activeShiftInfo.shift.label === 'ตลอดงาน' ? (
                      <>
                        เวลา <strong>{activeShiftInfo.shift.time_range}</strong>
                      </>
                    ) : (
                      <>
                        ช่วงเวลา{' '}
                        <strong>
                          {activeShiftInfo.shift.label} ({activeShiftInfo.shift.time_range})
                        </strong>
                      </>
                    )}
                    {activeShiftInfo.shift.duty_name && (
                      <>
                        {' '}• หน้าที่ <strong>{activeShiftInfo.shift.duty_name}</strong>
                      </>
                    )}
                    {' '}• ได้รับ{' '}
                    <strong>{activeShiftInfo.shift.hours} ชม.</strong>
                    {liveShift && (
                      <>
                        {' '}• สถานะล่าสุด{' '}
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
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M19 12H5" />
                    <path d="m12 19-7-7 7-7" />
                  </svg>
                  <span>ย้อนกลับ</span>
                </button>
              </div>

              {activeJobPolicy === 'non_kys' && (
                <div className={styles.kysWarningBanner}>
                  <strong>ข้อกำหนดสำคัญ</strong> กิจกรรมนี้ <u>ไม่รับนักศึกษาทุน กยศ.</u> (เฉพาะทุนประเภทอื่นเท่านั้น)
                </div>
              )}

              {activeJobPolicy === 'kys_only' && (
                <div className={styles.kysOnlyWarningBanner}>
                  <strong>ข้อกำหนดสำคัญ</strong> กิจกรรมนี้ <u>รับเฉพาะนักศึกษาทุน กยศ.</u> เท่านั้น
                </div>
              )}

              {allowsOtherFacultyInForm && liveShiftAllowedMajors.length === 0 && (
                <div className={styles.otherFacultyBanner}>
                  <strong>เปิดรับคณะอื่นด้วย</strong> กิจกรรมนี้เปิดรับนักศึกษาคณะ {DIT_FACULTY_LABEL} และนักศึกษาจากคณะอื่น (กรุณาเลือกคณะของคุณด้านล่าง)
                </div>
              )}

              {liveShiftAllowedMajors.length > 0 && (
                <div className={styles.majorWarningBanner}>
                  <strong>จำกัดสาขาวิชา</strong>{' '}
                  {activeShiftInfo.shift.duty_name
                    ? activeShiftInfo.job.shift_mode === 'roles' ||
                      activeShiftInfo.shift.label === 'ตลอดงาน'
                      ? `หน้าที่ "${activeShiftInfo.shift.duty_name}"`
                      : `หน้าที่ "${activeShiftInfo.shift.duty_name}" (${activeShiftInfo.shift.label})`
                    : activeShiftInfo.job.shift_mode === 'roles' ||
                      activeShiftInfo.shift.label === 'ตลอดงาน'
                    ? 'กิจกรรมนี้'
                    : `ช่วงเวลา "${activeShiftInfo.shift.label}"`}{' '}
                  เปิดรับเฉพาะสาขา <strong>{liveShiftAllowedMajors.join(', ')}</strong> เท่านั้น
                </div>
              )}

              <form onSubmit={handlePreRegister} className={styles.regForm}>
                <div className={styles.formGrid2}>
                  <div className={styles.field}>
                    <label>รหัสนักศึกษา *</label>
                    <input
                      type="text"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      placeholder="กรอกรหัสนักศึกษา เช่น 6901234"
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

                {allowsOtherFacultyInForm ? (
                  <>
                    <div className={facultyGroup === 'OTHER' ? styles.field : styles.formGrid2}>
                      <div className={styles.field}>
                        <label htmlFor="student-faculty-group">คณะ *</label>
                        <select
                          id="student-faculty-group"
                          value={facultyGroup}
                          onChange={(e) => {
                            const nextVal = e.target.value as 'DIT' | 'OTHER' | '';
                            setFacultyGroup(nextVal);
                            if (nextVal !== 'DIT') setFaculty('');
                            if (nextVal !== 'OTHER') {
                              setCustomFaculty('');
                              setCustomMajor('');
                            }
                          }}
                          required
                          className={styles.selectInput}
                        >
                          <option value="">-- กรุณาเลือกคณะ --</option>
                          <option value="DIT">{DIT_FACULTY_LABEL}</option>
                          <option value="OTHER" disabled={liveShiftAllowedMajors.length > 0}>
                            คณะอื่น
                            {liveShiftAllowedMajors.length > 0
                              ? ' (ตำแหน่งนี้รับเฉพาะสาขาใน DIT)'
                              : ''}
                          </option>
                        </select>
                      </div>

                      {facultyGroup === 'DIT' && (
                        <div className={styles.field}>
                          <label htmlFor="student-faculty">สาขาวิชา *</label>
                          <select
                            id="student-faculty"
                            value={faculty}
                            onChange={(e) => setFaculty(e.target.value)}
                            required
                            className={styles.selectInput}
                          >
                            <option value="">-- กรุณาเลือกสาขาวิชา --</option>
                            {DIT_MAJORS.map((m) => {
                              const notEligible =
                                liveShiftAllowedMajors.length > 0 &&
                                !liveShiftAllowedMajors.includes(m);
                              return (
                                <option key={m} value={m} disabled={notEligible}>
                                  {m}
                                  {notEligible ? ' (ไม่เปิดรับในตำแหน่งนี้)' : ''}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      )}

                      {facultyGroup === '' && (
                        <div className={styles.field}>
                          <label htmlFor="student-faculty-placeholder">สาขาวิชา / ระบุคณะ *</label>
                          <input
                            id="student-faculty-placeholder"
                            type="text"
                            value=""
                            disabled
                            placeholder="กรุณาเลือกคณะทางซ้ายก่อน"
                          />
                        </div>
                      )}
                    </div>

                    {facultyGroup === 'OTHER' && (
                      <div className={styles.otherFacultyFieldsBox}>
                        <div className={styles.formGrid2}>
                          <div className={styles.field}>
                            <label htmlFor="student-custom-faculty">ระบุชื่อคณะ *</label>
                            <input
                              id="student-custom-faculty"
                              type="text"
                              value={customFaculty}
                              onChange={(e) => setCustomFaculty(e.target.value)}
                              placeholder="เช่น คณะนิเทศศาสตร์, คณะวิศวกรรมศาสตร์"
                              required
                              autoFocus
                            />
                          </div>

                          <div className={styles.field}>
                            <label htmlFor="student-custom-major">ระบุสาขาวิชา *</label>
                            <input
                              id="student-custom-major"
                              type="text"
                              value={customMajor}
                              onChange={(e) => setCustomMajor(e.target.value)}
                              placeholder="เช่น การประชาสัมพันธ์, วิศวกรรมโยธา"
                              required
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className={styles.formGrid2}>
                    <div className={styles.field}>
                      <label htmlFor="student-faculty">สาขาวิชา *</label>
                      <select
                        id="student-faculty"
                        value={faculty}
                        onChange={(e) => setFaculty(e.target.value)}
                        required
                        className={styles.selectInput}
                      >
                        <option value="">-- กรุณาเลือกสาขาวิชา --</option>
                        {DIT_MAJORS.map((m) => {
                          const notEligible =
                            liveShiftAllowedMajors.length > 0 &&
                            !liveShiftAllowedMajors.includes(m);
                          return (
                            <option key={m} value={m} disabled={notEligible}>
                              {m}
                              {notEligible ? ' (ไม่เปิดรับในตำแหน่งนี้)' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div className={styles.field}>
                      <label htmlFor="student-phone">เบอร์โทรศัพท์ติดต่อ *</label>
                      <input
                        id="student-phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="เช่น 0812345678"
                        required
                      />
                    </div>
                  </div>
                )}

                <div className={allowsOtherFacultyInForm ? styles.formGrid2 : undefined}>
                  {allowsOtherFacultyInForm && (
                    <div className={styles.field}>
                      <label htmlFor="student-phone">เบอร์โทรศัพท์ติดต่อ *</label>
                      <input
                        id="student-phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="เช่น 0812345678"
                        required
                      />
                    </div>
                  )}

                  <div className={styles.field}>
                    <label htmlFor="student-scholarship">
                      ชื่อทุนการศึกษา{' '}
                      {activeShiftInfo.job.require_scholarship_name ||
                      activeJobPolicy === 'kys_only'
                        ? '*'
                        : '(ถ้ามี)'}
                    </label>
                    <input
                      id="student-scholarship"
                      type="text"
                      value={scholarshipName}
                      onChange={(e) => setScholarshipName(e.target.value)}
                      placeholder={
                        activeJobPolicy === 'kys_only'
                          ? 'กิจกรรมนี้รับเฉพาะ กยศ. กรุณาระบุ กยศ.'
                          : activeShiftInfo.job.require_scholarship_name
                          ? 'ระบุชื่อทุนของคุณ เช่น ทุน ดร.อรรถวิท 50%, กยศ., ฯลฯ...'
                          : 'ระบุชื่อทุนของคุณ (ถ้ามี)...'
                      }
                      required={
                        activeShiftInfo.job.require_scholarship_name ||
                        activeJobPolicy === 'kys_only'
                      }
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <label htmlFor="student-transfer-note">
                    เฉพาะทุนเรียนดี หากต้องการโอนชั่วโมงไปเทอมถัดไปกรุณาระบุเพิ่มเติม
                  </label>
                  <textarea
                    id="student-transfer-note"
                    rows={2}
                    value={transferNote}
                    onChange={(e) => setTransferNote(e.target.value)}
                    placeholder="กรุณาระบุว่าต้องการโอนกี่ชั่วโมง เช่น ใช้เทอมนี้ 1 ชั่วโมง โอนไปเทอม 2/69 2ชั่วโมง หรือ โอนทั้งหมดไปเทอม 2/69 เป็นต้น"
                  />
                </div>

                {isLiveShiftFull && (
                  <div className={styles.errorBox}>
                    ขณะนี้มีนักศึกษาท่านอื่นลงทะเบียนในตำแหน่ง/ช่วงเวลานี้ครบจำนวนแล้ว กรุณากดย้อนกลับเพื่อเลือกตำแหน่งอื่น
                  </div>
                )}

                {isMajorBlockedInForm && (
                  <div className={styles.errorBox}>
                    ขออภัย ตำแหน่งนี้รับเฉพาะสาขา {liveShiftAllowedMajors.join(', ')}
                  </div>
                )}

                {overlappingRegShift && (
                  <div className={styles.errorBox}>
                    {overlappingRegShift.id === liveShift?.id
                      ? 'รหัสนักศึกษาหรือชื่อนี้ได้ลงทะเบียนในหน้าที่/ช่วงเวลานี้ไปแล้ว'
                      : `คุณได้ลงทะเบียนในช่วงเวลาเดียวกันนี้ไปแล้ว (${
                          overlappingRegShift.duty_name
                            ? `หน้าที่ "${overlappingRegShift.duty_name}"`
                            : overlappingRegShift.label
                        } • ${overlappingRegShift.time_range}) ไม่สามารถลงซ้ำซ้อนในช่วงเวลาเดียวกันได้`}
                  </div>
                )}

                {isKysBlockedInForm && (
                  <div className={styles.errorBox}>
                    ขออภัย กิจกรรมนี้ไม่รับนักศึกษาทุน กยศ. กรุณาเลือกกิจกรรมอื่นที่เปิดรับทุน กยศ.
                  </div>
                )}

                {isNonKysBlockedForKysOnlyInForm && (
                  <div className={styles.errorBox}>
                    ขออภัย กิจกรรมนี้รับเฉพาะนักศึกษาทุน กยศ. เท่านั้น
                  </div>
                )}

                {regError && !isKysBlockedInForm && !isNonKysBlockedForKysOnlyInForm && !isMajorBlockedInForm && !overlappingRegShift && (
                  <div className={styles.errorBox}>{regError}</div>
                )}

                <div className={styles.policyNote}>
                  <strong>ข้อกำหนดสำคัญ</strong> เมื่อลงทะเบียนแล้ว <u>นักศึกษาจะไม่สามารถถอนชื่อได้ด้วยตนเอง</u> หากมีเหตุจำเป็นต้องถอนชื่อ โปรดแจ้งอาจารย์ผู้รับผิดชอบกิจกรรมเพื่อถอนชื่อ
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
                    type="button"
                    onClick={handlePreRegister}
                    className={styles.primaryBtn}
                    disabled={
                      regLoading ||
                      Boolean(isKysBlockedInForm) ||
                      Boolean(isNonKysBlockedForKysOnlyInForm) ||
                      Boolean(isMajorBlockedInForm) ||
                      Boolean(overlappingRegShift) ||
                      isLiveShiftFull
                    }
                  >
                    {regLoading && <span className={styles.btnSpinner} />}
                    {regLoading
                      ? 'กำลังบันทึก...'
                      : isLiveShiftFull
                      ? 'ตำแหน่งนี้เต็มแล้ว'
                      : 'ลงทะเบียนร่วมกิจกรรม'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Pop up ยืนยันการลงทะเบียนกิจกรรม */}
          {showRegConfirmPopup && activeShiftInfo && (
            <div
              className={styles.confirmBackdrop}
              onClick={() => setShowRegConfirmPopup(false)}
            >
              <div
                className={styles.confirmModalBox}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={styles.confirmIconWrap}>
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <h3 className={styles.confirmTitle}>ยืนยันการลงทะเบียนร่วมกิจกรรม</h3>

                <div className={styles.confirmNoticeBox}>
                  หากลงทะเบียนเเล้ว ไม่สามารถถอนได้ โปรดเเจ้งอาจารย์ที่รับผิดชอบเพื่อถอนชื่อ
                  {activeShiftInfo.job.teacher_contact && (
                    <div style={{ marginTop: '0.35rem', fontWeight: 700 }}>
                      ช่องทางติดต่อ ({activeShiftInfo.job.teacher_name}){' '}
                      {activeShiftInfo.job.teacher_contact}
                    </div>
                  )}
                </div>

                <div className={styles.confirmSummary}>
                  <p>
                    <strong>ชื่อกิจกรรม</strong> {activeShiftInfo.job.title}
                  </p>
                  {activeShiftInfo.shift.duty_name && (
                    <p>
                      <strong>หน้าที่ / ตำแหน่ง</strong> {activeShiftInfo.shift.duty_name}
                    </p>
                  )}
                  <p>
                    <strong>ช่วงเวลา</strong>{' '}
                    {activeShiftInfo.job.shift_mode === 'roles' ||
                    activeShiftInfo.shift.label === 'ตลอดงาน'
                      ? `${activeShiftInfo.shift.time_range} (ทั้งกิจกรรม)`
                      : `${activeShiftInfo.shift.label} (${activeShiftInfo.shift.time_range})`}{' '}
                    • {activeShiftInfo.shift.hours} ชม.
                  </p>
                  <p>
                    <strong>ผู้ลงทะเบียน</strong> {studentName} (รหัส {studentId})
                  </p>
                  <p>
                    <strong>{isDitMajor(resolvedFaculty) ? 'สาขาวิชา' : 'คณะ / สาขาวิชา'}</strong> {resolvedFaculty}
                  </p>
                  <p>
                    <strong>เบอร์โทรศัพท์</strong> {phone}
                  </p>
                  {scholarshipName && (
                    <p>
                      <strong>ทุนการศึกษา</strong> {scholarshipName}
                    </p>
                  )}
                  {transferNote.trim() && (
                    <p>
                      <strong>โอนชั่วโมงเทอมถัดไป</strong> {transferNote.trim()}
                    </p>
                  )}
                </div>

                <div className={styles.confirmActions}>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => setShowRegConfirmPopup(false)}
                    disabled={regLoading}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={handleExecuteRegister}
                    disabled={regLoading}
                  >
                    {regLoading ? 'กำลังบันทึก...' : 'เข้าใจและยืนยันการลงทะเบียน'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* กล่องยืนยันการถอนชื่อ (เฉพาะอาจารย์) */}
          {cancellingReg && isTeacherMode && (
            <div className={styles.cancelCard}>
              <div className={styles.cancelHeader}>
                <h3>ยืนยันการถอนชื่อนักศึกษา (สิทธิ์อาจารย์)</h3>
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
                  <strong>กิจกรรม</strong> {cancellingReg.job.title} (
                  {cancellingReg.job.shift_mode === 'roles' ||
                  cancellingReg.shift.label === 'ตลอดงาน'
                    ? cancellingReg.shift.time_range
                    : cancellingReg.shift.label}
                  {cancellingReg.shift.duty_name ? ` — หน้าที่ ${cancellingReg.shift.duty_name}` : ''}
                  {cancellingReg.job.shift_mode === 'roles' ||
                  cancellingReg.shift.label === 'ตลอดงาน'
                    ? ''
                    : ` ${cancellingReg.shift.time_range}`}
                  )
                </p>
                <p>
                  <strong>นักศึกษา</strong> {cancellingReg.reg.student_name} (รหัส{' '}
                  {cancellingReg.reg.student_id})
                </p>
                <p>
                  <strong>สาขาวิชา</strong> {cancellingReg.reg.faculty}
                </p>
              </div>

              <div className={styles.teacherOverrideNotice}>
                คุณกำลังดำเนินการถอนชื่อนักศึกษาท่านนี้ออกจากระบบด้วยสิทธิ์อาจารย์
              </div>

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
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className={styles.dangerBtn}
                  onClick={handleCancelRegistrationSubmit}
                  disabled={cancelLoading}
                >
                  {cancelLoading && <span className={styles.btnSpinner} />}
                  {cancelLoading ? 'กำลังถอนชื่อ...' : 'ยืนยันการถอนชื่อ'}
                </button>
              </div>
            </div>
          )}

          {/* รายการงานทั้งหมดในวันนี้ (ซ่อนเมื่อกำลังเปิดฟอร์มลงทะเบียนหรือฟอร์มถอนชื่อ) */}
          {!activeShiftInfo && !cancellingReg && (
            jobs.length === 0 ? (
              <div className={styles.emptyState}>
                <h3>ยังไม่มีประกาศกิจกรรมในวันนี้</h3>
                {daysUntil >= 0 ? (
                  <>
                    <p>หากคุณเป็นอาจารย์ สามารถกดปุ่มด้านล่างเพื่อสร้างประกาศรับนักศึกษาช่วยงานได้ทันที</p>
                    <button
                      className={styles.emptyCreateBtn}
                      onClick={() => onCreateJobForDate(dateStr)}
                    >
                      + สร้างประกาศกิจกรรมในวันนี้
                    </button>
                  </>
                ) : (
                  <p>วันที่ผ่านมาแล้ว ไม่สามารถสร้างประกาศกิจกรรมย้อนหลังได้</p>
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
                              job.job_type === 'external'
                                ? styles.badgeScopeExternal
                                : styles.badgeScopeInternal
                            }
                          >
                            {job.job_type === 'external' ? 'กิจกรรมภายนอกคณะ' : 'กิจกรรมภายในคณะ'}
                          </span>
                          {job.allow_other_faculty && (
                            <span className={styles.badgeOtherFaculty}>
                              เปิดรับคณะอื่นด้วย
                            </span>
                          )}
                          {(() => {
                            const policy = getJobScholarshipPolicy(job);
                            return (
                              <span
                                className={
                                  policy === 'non_kys'
                                    ? styles.badgeKysNo
                                    : policy === 'kys_only'
                                    ? styles.badgeKysOnly
                                    : styles.badgeKysOk
                                }
                              >
                                {policy === 'non_kys'
                                  ? 'ไม่รับทุน กยศ.'
                                  : policy === 'kys_only'
                                  ? 'รับเฉพาะทุน กยศ.'
                                  : 'รับทุกทุน (กยศ. ทำได้)'}
                              </span>
                            );
                          })()}
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

                      {isTeacherMode && (
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
                            title="แก้ไขประกาศกิจกรรม (สำหรับอาจารย์)"
                          >
                            แก้ไข
                          </button>
                          <button
                            type="button"
                            className={styles.deleteJobBtn}
                            onClick={() => onDeleteJob(job)}
                            title="ลบประกาศกิจกรรม (สำหรับอาจารย์)"
                          >
                            ลบ
                          </button>
                        </div>
                      )}
                    </div>

                    <div className={styles.jobMeta}>
                      <span className={styles.teacherBadgeMeta}>
                        <strong>อาจารย์ผู้ประกาศ</strong> {job.teacher_name}
                      </span>
                      {job.teacher_contact && (
                        <span className={styles.contactBadgeMeta}>
                          <strong>ช่องทางติดต่ออาจารย์</strong> {job.teacher_contact}
                        </span>
                      )}
                      {job.location && (
                        <span className={styles.locationBadgeMeta}>
                          <strong>สถานที่</strong> {job.location}
                        </span>
                      )}
                      {job.shift_mode === 'roles' && job.shifts[0] && (
                        <span className={styles.jobScheduleBadge}>
                          เวลา {job.shifts[0].time_range} • {job.shifts[0].hours} ชม.
                        </span>
                      )}
                    </div>

                    {job.description && (
                      <p className={styles.jobDesc}>{job.description}</p>
                    )}

                    {/* รายการกะ / ช่วงเวลา หรือ ตำแหน่งหน้าที่ */}
                    <div className={styles.shiftsContainer}>
                      {groupJobShifts(job.shifts).map((group) => {
                        const isRolesMode =
                          job.shift_mode === 'roles' || group.label === 'ตลอดงาน';
                        const isClassicSingleShift =
                          !isRolesMode &&
                          group.roles.length === 1 &&
                          !group.roles[0].duty_name;

                        if (isClassicSingleShift) {
                          const shift = group.roles[0];
                          const regCount = shift.registrations.length;
                          const remaining = Math.max(0, shift.capacity - regCount);
                          const shiftFull = regCount >= shift.capacity;
                          const shiftAllowedMajors = sanitizeAllowedMajors(
                            shift.allowed_majors
                          );
                          const regBtnLabel = 'ลงทะเบียนช่วงนี้';

                          return (
                            <div key={group.key} className={styles.shiftBox}>
                              <div className={styles.shiftBoxHeader}>
                                <div className={styles.shiftInfoLeft}>
                                  <span className={styles.shiftName}>{group.label}</span>
                                  <span className={styles.shiftTime}>{group.time_range}</span>
                                  <span className={styles.shiftHours}>
                                    {group.hours} ชม.
                                  </span>
                                  {shiftAllowedMajors.length > 0 ? (
                                    <span
                                      className={styles.shiftMajorBadge}
                                      title={`รับเฉพาะสาขา ${shiftAllowedMajors.join(', ')}`}
                                    >
                                      เฉพาะ {shiftAllowedMajors.join(', ')}
                                    </span>
                                  ) : (
                                    <span className={styles.shiftMajorAllBadge}>
                                      {job.allow_other_faculty
                                        ? 'เปิดรับทุกสาขา DIT และคณะอื่น'
                                        : 'เปิดรับทุกสาขาใน DIT'}
                                    </span>
                                  )}
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
                                      {regBtnLabel}
                                    </button>
                                  ) : shiftFull ? (
                                    <span className={styles.fullPill}>เต็มแล้ว</span>
                                  ) : (
                                    <span className={styles.pastPill}>ปิดรับสมัคร</span>
                                  )}
                                </div>
                              </div>

                              <div className={styles.participantsSection}>
                                {renderParticipantsList(
                                  job,
                                  shift,
                                  regBtnLabel,
                                  'ในช่วงเวลานี้'
                                )}
                              </div>
                            </div>
                          );
                        }

                        const totalGroupCapacity = group.roles.reduce(
                          (sum, r) => sum + r.capacity,
                          0
                        );
                        const totalGroupFilled = group.roles.reduce(
                          (sum, r) => sum + r.registrations.length,
                          0
                        );
                        const totalGroupRemaining = Math.max(
                          0,
                          totalGroupCapacity - totalGroupFilled
                        );

                        return (
                          <div key={group.key} className={styles.shiftBox}>
                            <div className={styles.shiftBoxHeader}>
                              <div className={styles.shiftInfoLeft}>
                                <span className={styles.shiftName}>
                                  {isRolesMode
                                    ? 'ตำแหน่ง / หน้าที่ที่เปิดรับ'
                                    : group.label}
                                </span>
                                <span className={styles.shiftTime}>{group.time_range}</span>
                                <span className={styles.shiftHours}>
                                  {group.hours} ชม.
                                </span>
                                <span className={styles.roleCountMeta}>
                                  {group.roles.length} หน้าที่
                                </span>
                                <span
                                  className={
                                    totalGroupFilled >= totalGroupCapacity
                                      ? styles.shiftCapFull
                                      : styles.shiftCapOk
                                  }
                                >
                                  รวม {totalGroupFilled}/{totalGroupCapacity} คน{' '}
                                  {totalGroupFilled >= totalGroupCapacity
                                    ? '(เต็มทุกหน้าที่)'
                                    : `(ว่าง ${totalGroupRemaining})`}
                                </span>
                              </div>
                            </div>

                            <div className={styles.rolesGroupContainer}>
                              {group.roles.map((shift, roleIdx) => {
                                const regCount = shift.registrations.length;
                                const remaining = Math.max(0, shift.capacity - regCount);
                                const shiftFull = regCount >= shift.capacity;
                                const shiftAllowedMajors = sanitizeAllowedMajors(
                                  shift.allowed_majors
                                );
                                const regBtnLabel = shift.duty_name
                                  ? 'ลงทะเบียนรับหน้าที่นี้'
                                  : 'ลงทะเบียนตำแหน่งนี้';

                                return (
                                  <div key={shift.id} className={styles.roleSubCard}>
                                    <div className={styles.roleSubHeader}>
                                      <div className={styles.roleSubLeft}>
                                        <span className={styles.roleIndexPill}>
                                          หน้าที่ {roleIdx + 1}
                                        </span>
                                        <span className={styles.shiftDutyBadge}>
                                          {shift.duty_name || 'ร่วมกิจกรรมทั่วไป'}
                                        </span>
                                        {shiftAllowedMajors.length > 0 ? (
                                          <span
                                            className={styles.shiftMajorBadge}
                                            title={`รับเฉพาะสาขา ${shiftAllowedMajors.join(', ')}`}
                                          >
                                            เฉพาะ {shiftAllowedMajors.join(', ')}
                                          </span>
                                        ) : (
                                          <span className={styles.shiftMajorAllBadge}>
                                            {job.allow_other_faculty
                                              ? 'เปิดรับทุกสาขา DIT และคณะอื่น'
                                              : 'เปิดรับทุกสาขาใน DIT'}
                                          </span>
                                        )}
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
                                            {regBtnLabel}
                                          </button>
                                        ) : shiftFull ? (
                                          <span className={styles.fullPill}>เต็มแล้ว</span>
                                        ) : (
                                          <span className={styles.pastPill}>
                                            ปิดรับสมัคร
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <div className={styles.roleSubParticipants}>
                                      {renderParticipantsList(
                                        job,
                                        shift,
                                        regBtnLabel,
                                        'ในหน้าที่นี้'
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
