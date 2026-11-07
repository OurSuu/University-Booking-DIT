export interface Registration {
  id: number;
  job_id: number;
  shift_id: number;
  student_id: string;
  student_name: string;
  faculty: string;
  scholarship_name: string;
  registered_date: string; // YYYY-MM-DD (วันที่กดลงทะเบียน สำหรับเช็คถอนชื่อภายในวันเดียวกัน)
  created_at: string;
}

export interface JobShift {
  id: number;
  job_id: number;
  label: string;       // เช่น "กะเช้า", "กะบ่าย", "ช่วงที่ 1"
  time_range: string;  // เช่น "09:00 - 12:00"
  hours: number;       // จำนวนชั่วโมงทุนที่ได้ เช่น 3
  capacity: number;    // จำนวนรับสูงสุด เช่น 5
  registrations: Registration[];
}

export interface JobAnnouncement {
  id: number;
  date: string;                     // YYYY-MM-DD
  title: string;                    // ชื่องาน
  description: string;              // รายละเอียดงาน
  teacher_name: string;             // ชื่ออาจารย์ผู้ประกาศ
  location: string;                 // สถานที่นัดหมาย/ทำงาน
  require_scholarship_name: boolean;// บังคับระบุชื่อทุนหรือไม่
  allow_kys: boolean;               // อนุญาตทุน กยศ. หรือไม่ (false = กยศ. ทำไม่ได้)
  created_at: string;
  shifts: JobShift[];
}

export interface ShiftInput {
  id?: number;
  label: string;
  time_range: string;
  hours: number;
  capacity: number;
}

export const PRESET_SHIFTS: Omit<ShiftInput, 'id'>[] = [
  { label: 'กะเช้า', time_range: '09:00 - 12:00', hours: 3, capacity: 5 },
  { label: 'กะบ่าย', time_range: '13:00 - 16:00', hours: 3, capacity: 5 },
  { label: 'กะเย็น', time_range: '16:30 - 19:30', hours: 3, capacity: 5 },
  { label: 'เต็มวัน', time_range: '09:00 - 16:00', hours: 6, capacity: 5 },
];

export const POPULAR_SCHOLARSHIPS = [
  'กยศ.',
  'ทุน 50%',
] as const;

export const POPULAR_FACULTIES = [
  'CS',
  'CGE',
  'DAI',
  'SMG',
  'FIN',
] as const;

export function getTodayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function parseDateUTC(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

/**
 * คำนวณจำนวนวันก่อนถึงวันงานจริง
 * เช่น วันนี้ 2026-11-07, งานวันที่ 2026-11-09 -> คืนค่า 2 (ล่วงหน้า 2 วัน)
 */
export function getDaysUntilJob(jobDateStr: string, todayStr: string = getTodayStr()): number {
  const jobUtc = parseDateUTC(jobDateStr);
  const todayUtc = parseDateUTC(todayStr);
  return Math.round((jobUtc - todayUtc) / (1000 * 60 * 60 * 24));
}

/**
 * ตรวจสอบว่าชื่อทุนที่กรอกเป็นทุน กยศ. หรือไม่
 */
export function isKysScholarship(scholarshipName: string): boolean {
  const normalized = scholarshipName.trim().toLowerCase().replace(/\s+/g, '');
  return (
    normalized.includes('กยศ') ||
    normalized.includes('กองทุนเงินให้กู้ยืม') ||
    normalized === 'kys'
  );
}

/**
 * ตรวจสอบสิทธิ์การยกเลิกงานของนักศึกษา:
 * - ยกเลิกได้ก่อนวันงานจริงอย่างน้อย 2 วัน (daysUntil >= 2)
 * - หากเหลือน้อยกว่า 2 วัน (เช่น เหลือ 1 วัน หรือวันงาน) จะยกเลิกไม่ได้
 *   ยกเว้นเพิ่งมากรอกชื่อในวันนั้น (registered_date === todayStr) สามารถถอนชื่อได้ภายในวันนั้นเลย
 */
export function checkCancelEligibility(
  jobDateStr: string,
  registeredDateStr: string,
  todayStr: string = getTodayStr()
): { canCancel: boolean; reason: string; isSameDayGrace: boolean } {
  const daysUntil = getDaysUntilJob(jobDateStr, todayStr);

  if (daysUntil < 0) {
    return {
      canCancel: false,
      reason: 'งานนี้ผ่านวันจัดกิจกรรมไปแล้ว ไม่สามารถยกเลิกได้',
      isSameDayGrace: false,
    };
  }

  if (daysUntil >= 2) {
    return {
      canCancel: true,
      reason: `สามารถยกเลิกได้ (เหลือเวลาอีก ${daysUntil} วันก่อนวันงาน)`,
      isSameDayGrace: false,
    };
  }

  // กรณีเหลือน้อยกว่า 2 วัน (เหลือ 1 วัน หรือวันงานจริง)
  const regDate = (registeredDateStr || '').slice(0, 10);
  if (regDate === todayStr) {
    return {
      canCancel: true,
      reason: 'คุณเพิ่งลงทะเบียนในวันนี้ สามารถถอนชื่อได้ภายในวันนี้เท่านั้น (ก่อนเที่ยงคืน)',
      isSameDayGrace: true,
    };
  }

  return {
    canCancel: false,
    reason: 'ไม่สามารถยกเลิกได้ (ต้องยกเลิกล่วงหน้าอย่างน้อย 2 วันก่อนวันงาน ยกเว้นเพิ่งลงทะเบียนในวันนี้)',
    isSameDayGrace: false,
  };
}
