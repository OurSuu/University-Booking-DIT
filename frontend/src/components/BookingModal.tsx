'use client';

import { useState, useEffect } from 'react';
import {
  JobAnnouncement,
  ShiftInput,
  PRESET_SHIFTS,
  DIT_MAJORS,
  getMajorShortCode,
  sanitizeAllowedMajors,
  groupJobShifts,
  getTodayStr,
  getDaysUntilJob,
} from '@/types';
import { useToast } from './Toast';
import styles from './BookingModal.module.css';

interface RoleDraft {
  id?: number;
  duty_name: string;
  capacity: number;
  allowed_majors: string[];
  showMajorPicker?: boolean;
}

interface ShiftGroupDraft {
  label: string;
  time_range: string;
  hours: number;
  roles: RoleDraft[];
}

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
  const [shiftMode, setShiftMode] = useState<'shifts' | 'roles'>('shifts');
  const [shiftGroups, setShiftGroups] = useState<ShiftGroupDraft[]>([
    {
      label: 'กะเช้า',
      time_range: '09:00 - 12:00',
      hours: 3,
      roles: [{ duty_name: '', capacity: 5, allowed_majors: [], showMajorPicker: false }],
    },
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
      setShiftMode(editingJob.shift_mode === 'roles' ? 'roles' : 'shifts');

      const grouped = groupJobShifts(editingJob.shifts);
      if (grouped.length > 0) {
        setShiftGroups(
          grouped.map((g) => ({
            label: g.label,
            time_range: g.time_range,
            hours: g.hours,
            roles: g.roles.map((r) => ({
              id: r.id,
              duty_name: r.duty_name || '',
              capacity: r.capacity,
              allowed_majors: sanitizeAllowedMajors(r.allowed_majors),
              showMajorPicker: false,
            })),
          }))
        );
      }
    } else if (selectedDate) {
      setDate(selectedDate);
    }
  }, [editingJob, selectedDate]);

  const handleSwitchShiftMode = (nextMode: 'shifts' | 'roles') => {
    if (nextMode === shiftMode) return;
    setShiftMode(nextMode);
    setShiftGroups((prev) => {
      if (nextMode === 'roles') {
        const mergedRoles = prev.flatMap((g) => g.roles);
        return [
          {
            label: 'ตลอดงาน',
            time_range: prev[0]?.time_range || '09:00 - 17:00',
            hours: prev[0]?.hours || 8,
            roles:
              mergedRoles.length > 0
                ? mergedRoles
                : [{ duty_name: '', capacity: 5, allowed_majors: [], showMajorPicker: false }],
          },
        ];
      }
      return prev.map((g, idx) => ({
        ...g,
        label:
          g.label === 'ตลอดงาน'
            ? Number(g.hours) >= 7
              ? 'เต็มวัน'
              : `กะที่ ${idx + 1}`
            : g.label,
      }));
    });
  };

  const handleAddPresetShiftGroup = (preset: Omit<ShiftInput, 'id'>) => {
    setShiftGroups((prev) => [
      ...prev,
      {
        label: preset.label,
        time_range: preset.time_range,
        hours: preset.hours,
        roles: [
          {
            duty_name: preset.duty_name || '',
            capacity: preset.capacity,
            allowed_majors: [],
            showMajorPicker: false,
          },
        ],
      },
    ]);
  };

  const handleAddCustomShiftGroup = () => {
    setShiftGroups((prev) => [
      ...prev,
      {
        label: `ช่วงที่ ${prev.length + 1}`,
        time_range: '09:00 - 12:00',
        hours: 3,
        roles: [{ duty_name: '', capacity: 5, allowed_majors: [], showMajorPicker: false }],
      },
    ]);
  };

  const handleApplySingleTimePreset = (preset: Omit<ShiftInput, 'id'>) => {
    setShiftGroups((prev) =>
      prev.map((g, idx) =>
        idx === 0 ? { ...g, time_range: preset.time_range, hours: preset.hours } : g
      )
    );
  };

  const handleShiftGroupChange = (
    groupIdx: number,
    field: 'label' | 'time_range' | 'hours',
    value: string | number
  ) => {
    setShiftGroups((prev) =>
      prev.map((g, idx) => (idx === groupIdx ? { ...g, [field]: value } : g))
    );
  };

  const handleRemoveShiftGroup = (groupIdx: number) => {
    if (shiftGroups.length <= 1) return;
    setShiftGroups((prev) => prev.filter((_, idx) => idx !== groupIdx));
  };

  const handleAddRole = (groupIdx: number) => {
    setShiftGroups((prev) =>
      prev.map((g, idx) =>
        idx === groupIdx
          ? {
              ...g,
              roles: [
                ...g.roles,
                { duty_name: '', capacity: 2, allowed_majors: [], showMajorPicker: false },
              ],
            }
          : g
      )
    );
  };

  const handleRoleChange = (
    groupIdx: number,
    roleIdx: number,
    field: 'duty_name' | 'capacity',
    value: string | number
  ) => {
    setShiftGroups((prev) =>
      prev.map((g, gI) => {
        if (gI !== groupIdx) return g;
        return {
          ...g,
          roles: g.roles.map((r, rI) =>
            rI === roleIdx ? { ...r, [field]: value } : r
          ),
        };
      })
    );
  };

  const handleToggleRoleMajorPicker = (groupIdx: number, roleIdx: number) => {
    setShiftGroups((prev) =>
      prev.map((g, gI) => {
        if (gI !== groupIdx) return g;
        return {
          ...g,
          roles: g.roles.map((r, rI) =>
            rI === roleIdx ? { ...r, showMajorPicker: !r.showMajorPicker } : r
          ),
        };
      })
    );
  };

  const handleToggleRoleAllowedMajor = (groupIdx: number, roleIdx: number, major: string) => {
    setShiftGroups((prev) =>
      prev.map((g, gI) => {
        if (gI !== groupIdx) return g;
        return {
          ...g,
          roles: g.roles.map((r, rI) => {
            if (rI !== roleIdx) return r;
            if (major === 'ALL') {
              return { ...r, allowed_majors: [] };
            }
            const current = sanitizeAllowedMajors(r.allowed_majors);
            const next = current.includes(major)
              ? current.filter((m) => m !== major)
              : [...current, major];
            return {
              ...r,
              allowed_majors: next.length === DIT_MAJORS.length ? [] : sanitizeAllowedMajors(next),
            };
          }),
        };
      })
    );
  };

  const handleRemoveRole = (groupIdx: number, roleIdx: number) => {
    setShiftGroups((prev) =>
      prev.map((g, gI) => {
        if (gI !== groupIdx || g.roles.length <= 1) return g;
        return { ...g, roles: g.roles.filter((_, rI) => rI !== roleIdx) };
      })
    );
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

    if (shiftGroups.length === 0) {
      setError('กรุณากำหนดช่วงเวลาและตำแหน่งรับสมัครอย่างน้อย 1 รายการ');
      return;
    }

    const flattenedShifts: ShiftInput[] = [];
    for (const group of shiftGroups) {
      const labelClean = shiftMode === 'roles' ? 'ตลอดงาน' : group.label.trim();
      const timeRangeClean = group.time_range.trim();
      const hoursNum = Number(group.hours);
      if (!labelClean || !timeRangeClean || !Number.isFinite(hoursNum) || hoursNum <= 0) {
        setError('กรุณากรอกชื่อกะ ช่วงเวลา และชั่วโมงทุนให้ครบถ้วน (ชั่วโมงทุนต้องมากกว่า 0)');
        return;
      }
      for (const role of group.roles) {
        const dutyClean = role.duty_name.trim();
        const capNum = Number(role.capacity);
        if (group.roles.length > 1 && !dutyClean) {
          setError('เมื่อแบ่งหลายหน้าที่ กรุณาระบุชื่อหน้าที่/ตำแหน่งให้ครบทุกแถว');
          return;
        }
        if (!Number.isFinite(capNum) || capNum < 1) {
          setError('จำนวนที่รับของแต่ละตำแหน่งต้องมากกว่า 0 คน');
          return;
        }
        flattenedShifts.push({
          id: role.id,
          label: labelClean,
          duty_name: dutyClean,
          allowed_majors: sanitizeAllowedMajors(role.allowed_majors),
          time_range: timeRangeClean,
          hours: hoursNum,
          capacity: capNum,
        });
      }
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
          shift_mode: shiftMode,
          shifts: flattenedShifts,
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

  const renderRolesSection = (group: ShiftGroupDraft, gIdx: number) => {
    const groupCap = group.roles.reduce((sum, r) => sum + (Number(r.capacity) || 0), 0);
    const sectionLabel =
      shiftMode === 'roles'
        ? `รายการตำแหน่ง / หน้าที่ที่เปิดรับ (${group.roles.length} ตำแหน่ง • รวม ${groupCap} คน)`
        : `หน้าที่ / ตำแหน่งในกะนี้ (${group.roles.length} ตำแหน่ง • รวม ${groupCap} คน)`;

    return (
      <div className={styles.rolesSection}>
        <div className={styles.rolesSectionHeader}>
          <span className={styles.rolesSectionTitle}>{sectionLabel}</span>
          <button
            type="button"
            className={styles.addRoleBtn}
            onClick={() => handleAddRole(gIdx)}
          >
            + เพิ่มหน้าที่ / ตำแหน่ง{shiftMode === 'shifts' ? 'ในกะนี้' : ''}
          </button>
        </div>

        <div className={styles.rolesList}>
          {group.roles.map((role, rIdx) => {
            const allowedMajors = sanitizeAllowedMajors(role.allowed_majors);
            const isAllMajors = allowedMajors.length === 0;
            const requireDutyName = group.roles.length > 1;

            return (
              <div key={rIdx} className={styles.roleRowCard}>
                <div className={styles.roleMainRow}>
                  <span className={styles.roleIndexTag}>#{rIdx + 1}</span>
                  <input
                    type="text"
                    value={role.duty_name}
                    onChange={(e) => handleRoleChange(gIdx, rIdx, 'duty_name', e.target.value)}
                    placeholder={
                      requireDutyName
                        ? 'ระบุชื่อหน้าที่ เช่น ถ่ายภาพ, ต้อนรับ *'
                        : shiftMode === 'roles'
                        ? 'ระบุชื่อหน้าที่ เช่น ถ่ายภาพ, ประสานงาน (ไม่บังคับ)'
                        : 'หน้าที่ / ตำแหน่ง (เว้นว่างได้ถ้ารับรวมทั้งกะ)'
                    }
                    required={requireDutyName}
                  />
                  <div className={styles.roleCapWrap}>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={role.capacity}
                      onChange={(e) => handleRoleChange(gIdx, rIdx, 'capacity', e.target.value)}
                      required
                    />
                    <span className={styles.roleCapUnit}>คน</span>
                  </div>

                  <div className={styles.majorTriggerWrap}>
                    {isAllMajors ? (
                      <span className={styles.majorSummaryBadgeAll}>ทุกสาขาใน DIT</span>
                    ) : (
                      <span
                        className={styles.majorSummaryBadgeRestricted}
                        title={`รับเฉพาะ: ${allowedMajors.join(', ')}`}
                      >
                        เฉพาะ: {allowedMajors.map((m) => getMajorShortCode(m)).join(', ')}
                      </span>
                    )}
                    <button
                      type="button"
                      className={styles.majorToggleBtn}
                      onClick={() => handleToggleRoleMajorPicker(gIdx, rIdx)}
                    >
                      {role.showMajorPicker ? 'ซ่อนสาขา' : 'เลือกสาขา'}
                    </button>
                  </div>

                  <button
                    type="button"
                    className={styles.removeSmallBtn}
                    onClick={() => handleRemoveRole(gIdx, rIdx)}
                    disabled={group.roles.length <= 1}
                    title="ลบตำแหน่งนี้"
                  >
                    ✕
                  </button>
                </div>

                {role.showMajorPicker && (
                  <div className={styles.majorPickerBox}>
                    <span className={styles.majorPickerLabel}>
                      เจาะจงสาขาที่เปิดรับสำหรับตำแหน่งนี้:
                    </span>
                    <div className={styles.majorPickerPills}>
                      <button
                        type="button"
                        className={`${styles.majorPillBtn} ${
                          isAllMajors ? styles.majorPillActiveAll : ''
                        }`}
                        onClick={() => handleToggleRoleAllowedMajor(gIdx, rIdx, 'ALL')}
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
                            onClick={() => handleToggleRoleAllowedMajor(gIdx, rIdx, major)}
                          >
                            {major}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
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

          {/* โหมดการจัดตาราง: แบ่งตามกะ/ช่วงเวลา vs ไม่แบ่งกะ (เลือกตามหน้าที่) */}
          <div className={styles.sectionBox}>
            <div className={styles.shiftsHeader}>
              <div>
                <div className={styles.sectionTitle}>กำหนดรูปแบบงาน กะ / ช่วงเวลา และหน้าที่</div>
                <p className={styles.sectionSub}>
                  เลือกรูปแบบที่เหมาะกับงาน: 1 กะเพิ่มได้หลายหน้าที่ หรือกำหนดเวลาเดียวทั้งงานแล้วเลือกตามหน้าที่โดยตรง
                </p>
              </div>
            </div>

            <div className={styles.modeSwitchRow}>
              <button
                type="button"
                className={`${styles.kysOption} ${shiftMode === 'shifts' ? styles.kysOptionActiveScope : ''}`}
                onClick={() => handleSwitchShiftMode('shifts')}
              >
                <div className={styles.kysOptionTitle}>แบ่งตามกะ / ช่วงเวลา</div>
                <div className={styles.kysOptionSub}>
                  แบ่งเป็น กะเช้า, กะบ่าย ฯลฯ และใน 1 กะเพิ่มได้หลายหน้าที่ย่อย
                </div>
              </button>

              <button
                type="button"
                className={`${styles.kysOption} ${shiftMode === 'roles' ? styles.kysOptionActiveScope : ''}`}
                onClick={() => handleSwitchShiftMode('roles')}
              >
                <div className={styles.kysOptionTitle}>ไม่แบ่งกะ (เวลาเดียวทั้งงาน)</div>
                <div className={styles.kysOptionSub}>
                  ตั้งเวลาและ ชม.ทุนครั้งเดียว แล้วให้นักศึกษาเลือกตามตำแหน่ง/หน้าที่โดยตรง
                </div>
              </button>
            </div>

            {shiftMode === 'roles' && shiftGroups[0] && (
              <div className={styles.singleScheduleBox}>
                <div className={styles.presetRow}>
                  <span className={styles.presetLabel}>ตั้งค่าเวลาด่วน:</span>
                  {PRESET_SHIFTS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      className={styles.presetBtn}
                      onClick={() => handleApplySingleTimePreset(preset)}
                    >
                      {preset.label} ({preset.hours} ชม.)
                    </button>
                  ))}
                </div>

                <div className={styles.singleScheduleFields}>
                  <div className={styles.shiftColTime}>
                    <label>เวลาปฏิบัติงานทั้งงาน *</label>
                    <input
                      type="text"
                      value={shiftGroups[0].time_range}
                      onChange={(e) => handleShiftGroupChange(0, 'time_range', e.target.value)}
                      placeholder="เช่น 09:00 - 17:00"
                      required
                    />
                  </div>
                  <div className={styles.shiftColNum}>
                    <label>ชม. ทุนที่ได้ *</label>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={shiftGroups[0].hours}
                      onChange={(e) => handleShiftGroupChange(0, 'hours', e.target.value)}
                      required
                    />
                  </div>
                  <div className={styles.singleScheduleTotal}>
                    รับรวม{' '}
                    {shiftGroups[0].roles.reduce((sum, r) => sum + (Number(r.capacity) || 0), 0)} คน
                  </div>
                </div>

                {renderRolesSection(shiftGroups[0], 0)}
              </div>
            )}

            {shiftMode === 'shifts' && (
              <>
                <div className={styles.presetRow}>
                  <span className={styles.presetLabel}>เพิ่มกะ/ช่วงด่วน:</span>
                  {PRESET_SHIFTS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      className={styles.presetBtn}
                      onClick={() => handleAddPresetShiftGroup(preset)}
                    >
                      + {preset.label} ({preset.hours} ชม.)
                    </button>
                  ))}
                  <button
                    type="button"
                    className={styles.presetBtnCustom}
                    onClick={handleAddCustomShiftGroup}
                  >
                    + เพิ่มกะ/ช่วงเวลาเอง
                  </button>
                </div>

                <div className={styles.shiftsList}>
                  {shiftGroups.map((group, gIdx) => (
                    <div key={gIdx} className={styles.shiftGroupCard}>
                      <div className={styles.shiftMainRow}>
                        <span className={styles.shiftGroupBadge}>กะที่ {gIdx + 1}</span>
                        <div className={styles.shiftColLabel}>
                          <label>ชื่อกะ/ช่วง *</label>
                          <input
                            type="text"
                            value={group.label}
                            onChange={(e) => handleShiftGroupChange(gIdx, 'label', e.target.value)}
                            placeholder="เช่น กะเช้า"
                            required
                          />
                        </div>
                        <div className={styles.shiftColTime}>
                          <label>เวลาเริ่ม - จบ *</label>
                          <input
                            type="text"
                            value={group.time_range}
                            onChange={(e) => handleShiftGroupChange(gIdx, 'time_range', e.target.value)}
                            placeholder="เช่น 09:00 - 12:00"
                            required
                          />
                        </div>
                        <div className={styles.shiftColNum}>
                          <label>ชม. ทุนที่ได้ *</label>
                          <input
                            type="number"
                            min="0.5"
                            step="0.5"
                            value={group.hours}
                            onChange={(e) => handleShiftGroupChange(gIdx, 'hours', e.target.value)}
                            required
                          />
                        </div>
                        <div className={styles.shiftColAction}>
                          <button
                            type="button"
                            className={styles.removeSmallBtn}
                            onClick={() => handleRemoveShiftGroup(gIdx)}
                            disabled={shiftGroups.length <= 1}
                            title="ลบกะ/ช่วงเวลานี้"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {renderRolesSection(group, gIdx)}
                    </div>
                  ))}
                </div>
              </>
            )}
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
