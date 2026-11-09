export interface Registration {
  id: number;
  job_id: number;
  shift_id: number;
  student_id: string;
  student_name: string;
  faculty: string;
  scholarship_name: string;
  phone?: string;
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
  job_type?: 'internal' | 'external'; // 'internal' = ภายในคณะ, 'external' = ภายนอกคณะ
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

export const DIT_MAJORS = [
  'วิทยาการคอมพิวเตอร์',
  'นวัตกรรมดิจิทัลและปัญญาประดิษฐ์',
  'คอมพิวเตอร์เกมและอีสปอร์ต',
  'เทคโนโลยีสร้างสรรค์และสื่อสังคมออนไลน์',
  'การวางแผนการเงินด้วยเทคโนโลยีปัญญาประดิษฐ์',
] as const;

export type DitMajor = (typeof DIT_MAJORS)[number];

export const MAJOR_ALIAS_MAP: Record<string, string> = {
  cs: 'วิทยาการคอมพิวเตอร์',
  cge: 'คอมพิวเตอร์เกมและอีสปอร์ต',
  dai: 'นวัตกรรมดิจิทัลและปัญญาประดิษฐ์',
  smg: 'เทคโนโลยีสร้างสรรค์และสื่อสังคมออนไลน์',
  fin: 'การวางแผนการเงินด้วยเทคโนโลยีปัญญาประดิษฐ์',
};

export function normalizeMajorName(majorOrAlias: string): string {
  const clean = (majorOrAlias || '').trim();
  const lower = clean.toLowerCase();
  if (MAJOR_ALIAS_MAP[lower]) {
    return MAJOR_ALIAS_MAP[lower];
  }
  return clean;
}

export const POPULAR_SCHOLARSHIPS = [
  'กยศ.',
  'ทุน 50%',
] as const;

export const POPULAR_FACULTIES = DIT_MAJORS;

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

/**
 * Master Admin Key / รหัสผ่าน Master เริ่มต้น
 */
export const MASTER_ADMIN_PASSWORD_DEFAULT = 'xLD44eWe58&X2vPe';

/**
 * ตรวจสอบความถูกต้องของรหัสผ่านตามนโยบายความมั่นคงปลอดภัย:
 * - ความยาวอย่างน้อย 16 ตัวอักษร
 * - ประกอบด้วย:
 *   1. ตัวอักษรพิมพ์ใหญ่ (A-Z) อย่างน้อย 1 ตัว
 *   2. ตัวอักษรพิมพ์เล็ก (a-z) อย่างน้อย 1 ตัว
 *   3. ตัวเลข (0-9) อย่างน้อย 1 ตัว
 *   4. ตัวอักษรพิเศษ (เช่น @, !, _, >, &, %, #) อย่างน้อย 1 ตัว
 */
export function validatePasswordPolicy(password: string): { valid: boolean; error?: string } {
  const clean = (password || '').trim();
  if (clean.length < 16) {
    return { valid: false, error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 16 ตัวอักษร' };
  }
  if (!/[A-Z]/.test(clean)) {
    return { valid: false, error: 'รหัสผ่านต้องประกอบด้วยตัวอักษรพิมพ์ใหญ่ (A-Z) อย่างน้อย 1 ตัว' };
  }
  if (!/[a-z]/.test(clean)) {
    return { valid: false, error: 'รหัสผ่านต้องประกอบด้วยตัวอักษรพิมพ์เล็ก (a-z) อย่างน้อย 1 ตัว' };
  }
  if (!/[0-9]/.test(clean)) {
    return { valid: false, error: 'รหัสผ่านต้องประกอบด้วยตัวเลข (0-9) อย่างน้อย 1 ตัว' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(clean)) {
    return { valid: false, error: 'รหัสผ่านต้องประกอบด้วยตัวอักษรพิเศษอย่างน้อย 1 ตัว เช่น @, !, _, >, &' };
  }
  return { valid: true };
}

/**
 * สุ่มสร้างรหัสผ่านที่มีความปลอดภัยสูง 16 ตัวอักษรตามนโยบาย
 */
export function generateSecurePassword(length = 16): string {
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowers = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const specials = '@!_>&%#=';
  const all = uppers + lowers + digits + specials;

  const passArr = [
    uppers[Math.floor(Math.random() * uppers.length)],
    uppers[Math.floor(Math.random() * uppers.length)],
    lowers[Math.floor(Math.random() * lowers.length)],
    lowers[Math.floor(Math.random() * lowers.length)],
    digits[Math.floor(Math.random() * digits.length)],
    digits[Math.floor(Math.random() * digits.length)],
    specials[Math.floor(Math.random() * specials.length)],
    specials[Math.floor(Math.random() * specials.length)],
  ];
  while (passArr.length < length) {
    passArr.push(all[Math.floor(Math.random() * all.length)]);
  }
  for (let i = passArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [passArr[i], passArr[j]] = [passArr[j], passArr[i]];
  }
  return passArr.join('');
}
