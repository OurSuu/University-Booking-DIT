'use client';

import { useState, useEffect } from 'react';
import {
  JobAnnouncement,
  ShiftInput,
  PRESET_SHIFTS,
  DIT_MAJORS,
  sanitizeAllowedMajors,
  getTodayStr,
  getDaysUntilJob,
} from '@/types';
import { useToast } from './Toast';
import styles from './BookingModal.module.css';

interface Props {
  editingJob: JobAnnouncement | null;
  selectedDate: string | null;
  teacherPin: string;
  onPinVerified: (pin: string) => void;
  onClose: () => void;
  onSuccess: (action: 'created' | 'updated', savedJob?: JobAnnouncement) => void;
}

export default function BookingModal({
  editingJob,
  selectedDate,
  teacherPin,
  onPinVerified,
  onClose,
  onSuccess,
}: Props) {
  const { showToast } = useToast();
  const isEditMode = Boolean(editingJob);

  const [date, setDate] = useState(selectedDate || getTodayStr());
  const [title, setTitle] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [requireScholarshipName, setRequireScholarshipName] = useState(true);
  const [allowKys, setAllowKys] = useState(true);
  const [jobType, setJobType] = useState<'internal' | 'external'>('internal');
  const [shifts, setShifts] = useState<ShiftInput[]>([
    { label: 'กะเช้า', duty_name: '', allowed_majors: [], time_range: '09:00 - 12:00', hours: 3, capacity: 5 },
  ]);
  const [pinInput, setPinInput] = useState(teacherPin || '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editingJob) {
      setDate(editingJob.date);
      setTitle(editingJob.title);
      setTeacherName(editingJob.teacher_name);
      setLocation(editingJob.location);
      setDescription(editingJob.description);
      setRequireScholarshipName(editingJob.require_scholarship_name);
      setAllowKys(editingJob.allow_kys);
      setJobType(editingJob.job_type === 'external' ? 'external' : 'internal');
      setShifts(
        editingJob.shifts.map((s) => ({
          id: s.id,
          label: s.label,
          duty_name: s.duty_name || '',
          allowed_majors: sanitizeAllowedMajors(s.allowed_majors),
          time_range: s.time_range,
          hours: s.hours,
          capacity: s.capacity,
        }))
      );
    } else if (selectedDate) {
      setDate(selectedDate);
    }
  }, [editingJob, selectedDate]);

  const handleAddPresetShift = (preset: Omit<ShiftInput, 'id'>) => {
    setShifts((prev) => [
      ...prev,
      { ...preset, duty_name: preset.duty_name || '', allowed_majors: [] },
    ]);
  };

  const handleAddCustomShift = () => {
    setShifts((prev) => [
      ...prev,
      {
        label: `ช่วงที่ ${prev.length + 1}`,
        duty_name: '',
        allowed_majors: [],
        time_range: '09:00 - 12:00',
        hours: 3,
        capacity: 5,
      },
    ]);
  };

  const handleDuplicateRoleInSlot = (index: number) => {
    setShifts((prev) => {
      const source = prev[index];
      if (!source) return prev;
      const clonedRole: ShiftInput = {
        label: source.label,
        duty_name: '',
        allowed_majors: [],
        time_range: source.time_range,
        hours: source.hours,
        capacity: source.capacity,
      };
      return [...prev.slice(0, index + 1), clonedRole, ...prev.slice(index + 1)];
    });
  };

  const handleShiftChange = (
    index: number,
    field: keyof ShiftInput,
    value: string | number | string[]
  ) => {
    setShifts((prev) =>
      prev.map((s, idx) => (idx === index ? { ...s, [field]: value } : s))
    );
  };

  const handleToggleAllowedMajor = (index: number, major: string) => {
    setShifts((prev) =>
      prev.map((s, idx) => {
        if (idx !== index) return s;
        if (major === 'ALL') {
          return { ...s, allowed_majors: [] };
        }
        const current = sanitizeAllowedMajors(s.allowed_majors);
        const next = current.includes(major)
          ? current.filter((m) => m !== major)
          : [...current, major];
        return {
          ...s,
          allowed_majors: next.length === DIT_MAJORS.length ? [] : sanitizeAllowedMajors(next),
        };
      })
    );
  };

  const handleRemoveShift = (index: number) => {
    if (shifts.length <= 1) return;
    setShifts((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const activePin = (teacherPin || pinInput).trim();
    if (!activePin) {
      setError('กรุณากรอกรหัสผ่านสำหรับอาจารย์');
      return;
    }

    if (!title.trim() || !teacherName.trim() || !date) {
      setError('กรุณากรอกวันที่ ชื่องาน และชื่ออาจารย์ผู้ประกาศให้ครบถ้วน');
      return;
    }

    if (!isEditMode && getDaysUntilJob(date) < 0) {
      setError('ไม่สามารถสร้างประกาศงานในวันที่ผ่านมาแล้วได้');
      return;
    }

    if (shifts.length === 0) {
      setError('กรุณาเพิ่มกะหรือช่วงเวลาทำงานอย่างน้อย 1 ช่วงเวลา');
      return;
    }

    setLoading(true);
    try {
      const url = isEditMode ? `/api/jobs/${editingJob!.id}` : '/api/jobs';
      const method = isEditMode ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherPin: activePin,
          date,
          title: title.trim(),
          teacher_name: teacherName.trim(),
          location: location.trim(),
          description: description.trim(),
          require_scholarship_name: requireScholarshipName,
          allow_kys: allowKys,
          job_type: jobType,
          shifts: shifts.map((s) => ({
            id: s.id,
            label: s.label.trim(),
            duty_name: (s.duty_name || '').trim(),
            allowed_majors: sanitizeAllowedMajors(s.allowed_majors),
            time_range: s.time_range.trim(),
            hours: Number(s.hours),
            capacity: Number(s.capacity),
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'ไม่สามารถบันทึกประกาศงานได้');
        showToast(data.error || 'เกิดข้อผิดพลาด', 'error');
        setLoading(false);
        return;
      }

      if (!teacherPin && activePin) {
        onPinVerified(activePin);
      }

      onSuccess(isEditMode ? 'updated' : 'created', data);
    } catch {
      setError('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
      showToast('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้', 'error');
      setLoading(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !loading) onClose();
  };

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.modal}>
        {loading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinnerLarge} />
            <p className={styles.loadingTitle}>
              {isEditMode ? 'กำลังบันทึกการแก้ไขประกาศงาน...' : 'กำลังสร้างประกาศงานขึ้นปฏิทิน...'}
            </p>
            <span className={styles.loadingSub}>กรุณารอสักครู่ ระบบกำลังอัปเดตข้อมูล</span>
          </div>
        )}

        <div className={styles.modalHeader}>
          <div>
            <span className={styles.badgeRole}>สำหรับอาจารย์ผู้สร้างงาน</span>
            <h2>{isEditMode ? 'แก้ไขประกาศงานชั่วโมงทุน' : 'สร้างประกาศงานชั่วโมงทุนใหม่'}</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="ปิดหน้าต่าง">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.row2Col}>
            <div className={styles.field}>
              <label htmlFor="job-date">วันที่จัดงาน *</label>
              <input
                id="job-date"
                type="date"
                min={getTodayStr()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="teacher-name">ชื่ออาจารย์ผู้ประกาศ / ผู้รับผิดชอบ *</label>
              <input
                id="teacher-name"
                type="text"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                placeholder="เช่น อ.ดร.สมชาย ใจดี"
                required
              />
            </div>
          </div>

          <div className={styles.row2Col}>
            <div className={styles.field}>
              <label htmlFor="job-title">ชื่องาน / กิจกรรม *</label>
              <input
                id="job-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="เช่น ช่วยจัดเตรียมเอกสารภาควิชา / ดูแลบูธกิจกรรม"
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="job-location">สถานที่นัดหมาย / ปฏิบัติงาน</label>
              <input
                id="job-location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="เช่น ห้องธุรการ ชั้น 4 อาคาร 1"
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="job-desc">รายละเอียดงานเพิ่มเติม</label>
            <textarea
              id="job-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ระบุลักษณะงาน การแต่งกาย หรือสิ่งที่นักศึกษาต้องเตรียมตัว..."
            />
          </div>

          {/* ขอบเขตประเภทงาน: ภายในคณะ vs ภายนอกคณะ */}
          <div className={styles.sectionBox}>
            <div className={styles.sectionTitle}>ขอบเขตและประเภทงาน *</div>
            <div className={styles.kysToggleRow}>
              <button
                type="button"
                className={`${styles.kysOption} ${jobType === 'internal' ? styles.kysOptionActiveOk : ''}`}
                onClick={() => setJobType('internal')}
              >
                <div className={styles.kysOptionTitle}>งานภายในคณะ (DIT)</div>
                <div className={styles.kysOptionSub}>งานกิจกรรม ช่วยงานอาจารย์ หรือธุรการภายในวิทยาลัย</div>
              </button>

              <button
                type="button"
                className={`${styles.kysOption} ${jobType === 'external' ? styles.kysOptionActiveScope : ''}`}
                onClick={() => setJobType('external')}
              >
                <div className={styles.kysOptionTitle}>งานภายนอกคณะ</div>
                <div className={styles.kysOptionSub}>งานกิจกรรมมหาวิทยาลัย คณะอื่น หรือหน่วยงานภายนอก</div>
              </button>
            </div>
          </div>

          {/* เงื่อนไขทุน */}
          <div className={styles.sectionBox}>
            <div className={styles.sectionTitle}>เงื่อนไขประเภททุนที่รับสมัคร</div>
            <div className={styles.kysToggleRow}>
              <button
                type="button"
                className={`${styles.kysOption} ${allowKys ? styles.kysOptionActiveOk : ''}`}
                onClick={() => setAllowKys(true)}
              >
                <div className={styles.kysOptionTitle}>รับทุกทุน (รวม กยศ.)</div>
                <div className={styles.kysOptionSub}>นักศึกษาทุน กยศ. และทุนอื่นๆ ลงทะเบียนได้ทั้งหมด</div>
              </button>

              <button
                type="button"
                className={`${styles.kysOption} ${!allowKys ? styles.kysOptionActiveNo : ''}`}
                onClick={() => setAllowKys(false)}
              >
                <div className={styles.kysOptionTitle}>ไม่รับทุน กยศ.</div>
                <div className={styles.kysOptionSub}>บล็อกการลงทะเบียนหากนักศึกษาเลือกทุน กยศ.</div>
              </button>
            </div>

            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={requireScholarshipName}
                onChange={(e) => setRequireScholarshipName(e.target.checked)}
              />
              <span>กำหนดให้นักศึกษาต้องระบุชื่อทุนตอนลงทะเบียน</span>
            </label>
          </div>

          {/* ตั้งค่ากะ / ช่วงเวลา / หน้าที่ และสาขา */}
          <div className={styles.sectionBox}>
            <div className={styles.shiftsHeader}>
              <div>
                <div className={styles.sectionTitle}>กำหนดกะ / หน้าที่รับผิดชอบ และจำนวนที่รับ</div>
                <p className={styles.sectionSub}>
                  ตั้งค่าช่วงเวลา หน้าที่ (ถ้ามี) เจาะจงสาขาที่เปิดรับ ชั่วโมงทุน และจำนวนนักศึกษา
                </p>
              </div>
            </div>

            <div className={styles.presetRow}>
              <span className={styles.presetLabel}>เพิ่มด่วน:</span>
              {PRESET_SHIFTS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={styles.presetBtn}
                  onClick={() => handleAddPresetShift(preset)}
                >
                  + {preset.label} ({preset.hours} ชม.)
                </button>
              ))}
              <button
                type="button"
                className={styles.presetBtnCustom}
                onClick={handleAddCustomShift}
              >
                + กำหนดช่วงเวลาเอง
              </button>
            </div>

            <div className={styles.shiftsList}>
              {shifts.map((shift, idx) => {
                const allowedMajors = sanitizeAllowedMajors(shift.allowed_majors);
                const isAllMajors = allowedMajors.length === 0;
                return (
                  <div key={idx} className={styles.shiftItem}>
                    <div className={styles.shiftMainRow}>
                      <div className={styles.shiftColLabel}>
                        <label>ชื่อกะ/ช่วง</label>
                        <input
                          type="text"
                          value={shift.label}
                          onChange={(e) => handleShiftChange(idx, 'label', e.target.value)}
                          placeholder="เช่น กะเช้า"
                          required
                        />
                      </div>
                      <div className={styles.shiftColDuty}>
                        <label>หน้าที่ / ตำแหน่ง (ถ้ามี)</label>
                        <input
                          type="text"
                          value={shift.duty_name || ''}
                          onChange={(e) => handleShiftChange(idx, 'duty_name', e.target.value)}
                          placeholder="เช่น ถ่ายภาพ, ต้อนรับ (ไม่บังคับ)"
                        />
                      </div>
                      <div className={styles.shiftColTime}>
                        <label>เวลาเริ่ม - จบ</label>
                        <input
                          type="text"
                          value={shift.time_range}
                          onChange={(e) => handleShiftChange(idx, 'time_range', e.target.value)}
                          placeholder="เช่น 09:00 - 12:00"
                          required
                        />
                      </div>
                      <div className={styles.shiftColNum}>
                        <label>ชม. ทุนที่ได้</label>
                        <input
                          type="number"
                          min="0.5"
                          step="0.5"
                          value={shift.hours}
                          onChange={(e) => handleShiftChange(idx, 'hours', e.target.value)}
                          required
                        />
                      </div>
                      <div className={styles.shiftColNum}>
                        <label>รับจำนวน (คน)</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={shift.capacity}
                          onChange={(e) => handleShiftChange(idx, 'capacity', e.target.value)}
                          required
                        />
                      </div>
                      <div className={styles.shiftColAction}>
                        <button
                          type="button"
                          className={styles.removeShiftBtn}
                          onClick={() => handleRemoveShift(idx)}
                          disabled={shifts.length <= 1}
                          title="ลบช่วงเวลานี้"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    <div className={styles.shiftExtraRow}>
                      <div className={styles.majorPickerGroup}>
                        <span className={styles.majorPickerLabel}>
                          สาขาที่เปิดรับสำหรับตำแหน่ง/ช่วงเวลานี้:
                        </span>
                        <div className={styles.majorPickerPills}>
                          <button
                            type="button"
                            className={`${styles.majorPillBtn} ${
                              isAllMajors ? styles.majorPillActiveAll : ''
                            }`}
                            onClick={() => handleToggleAllowedMajor(idx, 'ALL')}
                          >
                            ทุกสาขาใน DIT
                          </button>
                          {DIT_MAJORS.map((major) => {
                            const selected = allowedMajors.includes(major);
                            return (
                              <button
                                key={major}
                                type="button"
                                className={`${styles.majorPillBtn} ${
                                  selected ? styles.majorPillActiveRestricted : ''
                                }`}
                                onClick={() => handleToggleAllowedMajor(idx, major)}
                              >
                                {major}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={styles.duplicateRoleBtn}
                        onClick={() => handleDuplicateRoleInSlot(idx)}
                        title="สร้างหน้าที่อื่นที่ใช้เวลาเดียวกับช่วงเวลานี้"
                      >
                        + เพิ่มหน้าที่อื่นในช่วงเวลานี้
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {!teacherPin && (
            <div className={styles.field}>
              <label htmlFor="teacher-pin">รหัสผ่านอาจารย์ (เพื่อยืนยันการประกาศงาน 16 ตัวอักษร) *</label>
              <input
                id="teacher-pin"
                type="password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="กรอกรหัสผ่านอาจารย์ 16 ตัวอักษร"
                required
              />
            </div>
          )}

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={loading}>
              ยกเลิก
            </button>
            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading && <span className={styles.btnSpinner} />}
              {loading
                ? 'กำลังบันทึก...'
                : isEditMode
                ? 'บันทึกการแก้ไขงาน'
                : 'ประกาศงานขึ้นปฏิทิน'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
