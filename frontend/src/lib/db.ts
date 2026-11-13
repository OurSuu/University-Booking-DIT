import { Pool } from 'pg';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  JobAnnouncement,
  JobShift,
  Registration,
  ShiftInput,
  getTodayStr,
  getDaysUntilJob,
  isKysScholarship,
  checkCancelEligibility,
  MASTER_ADMIN_PASSWORD_DEFAULT,
  validatePasswordPolicy,
  normalizeMajorName,
  sanitizeAllowedMajors,
  areTimeRangesOverlappingOrSame,
} from '@/types';

function parseAllowedMajors(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return sanitizeAllowedMajors(raw);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '[]') return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return sanitizeAllowedMajors(parsed);
      }
    } catch {
      return [];
    }
  }
  return [];
}

export function validateAndSanitizeShifts(
  rawShifts: unknown
): { shifts?: ShiftInput[]; error?: string } {
  if (!Array.isArray(rawShifts) || rawShifts.length === 0) {
    return { error: 'กรุณาเพิ่มกะ/ช่วงเวลาทำงานอย่างน้อย 1 ช่วงเวลา' };
  }
  const sanitized: ShiftInput[] = [];
  for (const raw of rawShifts) {
    if (!raw || typeof raw !== 'object') {
      return { error: 'ข้อมูลกะ/ช่วงเวลาไม่ถูกต้อง' };
    }
    const s = raw as Record<string, unknown>;
    const label = typeof s.label === 'string' ? s.label.trim() : '';
    const timeRange = typeof s.time_range === 'string' ? s.time_range.trim() : '';
    if (!label || !timeRange) {
      return { error: 'กรุณาระบุชื่อกะและช่วงเวลาให้ครบทุกกะ' };
    }
    const hours = Number(s.hours);
    const capacity = Number(s.capacity);
    if (!Number.isFinite(hours) || hours <= 0 || !Number.isFinite(capacity) || capacity < 1) {
      return { error: 'จำนวนชั่วโมงทุนและจำนวนคนที่รับต้องมากกว่า 0' };
    }
    sanitized.push({
      id: s.id ? Number(s.id) : undefined,
      label,
      duty_name: typeof s.duty_name === 'string' ? s.duty_name.trim() : '',
      allowed_majors: sanitizeAllowedMajors(Array.isArray(s.allowed_majors) ? s.allowed_majors : []),
      time_range: timeRange,
      hours,
      capacity,
    });
  }
  return { shifts: sanitized };
}

interface ShiftSlotCheckItem {
  id: number;
  label: string;
  duty_name?: string;
  allowed_majors?: string[];
  time_range: string;
  capacity: number;
  registrations: Array<{ student_id: string; student_name: string }>;
}

function assertShiftRegistrationAllowed(
  jobShifts: ShiftSlotCheckItem[],
  targetShiftId: number,
  facultyClean: string,
  studentIdClean: string,
  studentNameClean: string,
  isAtomicRecheck = false
): void {
  const targetShift = jobShifts.find((s) => s.id === targetShiftId);
  if (!targetShift) {
    throw new Error('ไม่พบช่วงเวลา/กะที่เลือก');
  }

  const allowedMajors = sanitizeAllowedMajors(targetShift.allowed_majors);
  if (allowedMajors.length > 0 && !allowedMajors.includes(facultyClean)) {
    const shiftCtx = targetShift.label === 'ตลอดงาน' ? targetShift.time_range : targetShift.label;
    const positionLabel = targetShift.duty_name
      ? `ตำแหน่ง "${targetShift.duty_name}" (${shiftCtx})`
      : shiftCtx;
    throw new Error(`ขออภัย ${positionLabel} รับเฉพาะสาขา: ${allowedMajors.join(', ')}`);
  }

  if (targetShift.registrations.length >= targetShift.capacity) {
    throw new Error(
      isAtomicRecheck
        ? 'ขออภัย มีผู้ลงทะเบียนที่นั่งสุดท้ายตัดหน้าไปเมื่อสักครู่ ตำแหน่ง/ช่วงเวลานี้เต็มแล้ว'
        : 'ตำแหน่ง/ช่วงเวลานี้มีผู้ลงทะเบียนเต็มจำนวนแล้ว'
    );
  }

  const studentIdLower = studentIdClean.toLowerCase();
  const studentNameLower = studentNameClean.toLowerCase();

  for (const s of jobShifts) {
    const isSameOrOverlapping =
      s.id === targetShift.id || areTimeRangesOverlappingOrSame(s.time_range, targetShift.time_range);
    if (!isSameOrOverlapping) continue;

    const sameStudent = s.registrations.some(
      (r) =>
        r.student_id.trim().toLowerCase() === studentIdLower ||
        r.student_name.trim().toLowerCase() === studentNameLower
    );
    if (sameStudent) {
      if (s.id === targetShift.id) {
        throw new Error('รหัสนักศึกษาหรือชื่อนี้ได้ลงทะเบียนในหน้าที่/ช่วงเวลานี้ไปแล้ว');
      }
      const timeCtx = s.label === 'ตลอดงาน' ? s.time_range : `${s.label} • ${s.time_range}`;
      const existingPos = s.duty_name
        ? `หน้าที่ "${s.duty_name}" (${timeCtx})`
        : timeCtx;
      throw new Error(
        `คุณได้ลงทะเบียนในช่วงเวลาเดียวกันนี้ไปแล้ว (${existingPos}) ไม่สามารถลงซ้ำซ้อนในช่วงเวลาเดียวกันได้`
      );
    }
  }
}

export interface TeacherPinRecord {
  id: number;
  pin: string;
  teacher_name: string;
  role: 'admin' | 'teacher';
  created_at: string;
}

function getDbConnectionString(): string {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.NEON_DATABASE_URL ||
    ''
  ).trim();
}

const DB_SCHEMA_VERSION = 3;

const globalForDb = globalThis as unknown as {
  _pgPool?: Pool;
  _dbSchemaVersion?: number;
};

function getPool(): Pool {
  if (!globalForDb._pgPool) {
    const rawUrl = getDbConnectionString();
    globalForDb._pgPool = new Pool({
      connectionString: rawUrl,
      ssl: rawUrl.includes('localhost')
        ? false
        : { rejectUnauthorized: false },
    });
  }
  return globalForDb._pgPool;
}

async function ensurePgTables() {
  if (globalForDb._dbSchemaVersion === DB_SCHEMA_VERSION) return;
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scholarship_jobs (
      id SERIAL PRIMARY KEY,
      date VARCHAR(10) NOT NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT DEFAULT '',
      teacher_name VARCHAR(150) NOT NULL,
      location VARCHAR(200) DEFAULT '',
      require_scholarship_name BOOLEAN DEFAULT TRUE,
      allow_kys BOOLEAN DEFAULT TRUE,
      job_type VARCHAR(50) DEFAULT 'internal',
      shift_mode VARCHAR(20) DEFAULT 'shifts',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scholarship_shifts (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES scholarship_jobs(id) ON DELETE CASCADE,
      label VARCHAR(100) NOT NULL,
      time_range VARCHAR(100) NOT NULL,
      hours NUMERIC(5,2) NOT NULL DEFAULT 3,
      capacity INTEGER NOT NULL DEFAULT 5,
      duty_name VARCHAR(150) DEFAULT '',
      allowed_majors TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS scholarship_registrations (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES scholarship_jobs(id) ON DELETE CASCADE,
      shift_id INTEGER NOT NULL REFERENCES scholarship_shifts(id) ON DELETE CASCADE,
      student_id VARCHAR(50) NOT NULL,
      student_name VARCHAR(150) NOT NULL,
      faculty VARCHAR(150) NOT NULL,
      scholarship_name VARCHAR(150) DEFAULT '',
      phone VARCHAR(50) DEFAULT '',
      registered_date VARCHAR(10) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE scholarship_registrations ADD COLUMN IF NOT EXISTS phone VARCHAR(50) DEFAULT '';
    ALTER TABLE scholarship_jobs ADD COLUMN IF NOT EXISTS job_type VARCHAR(50) DEFAULT 'internal';
    ALTER TABLE scholarship_jobs ADD COLUMN IF NOT EXISTS shift_mode VARCHAR(20) DEFAULT 'shifts';
    ALTER TABLE scholarship_shifts ADD COLUMN IF NOT EXISTS duty_name VARCHAR(150) DEFAULT '';
    ALTER TABLE scholarship_shifts ADD COLUMN IF NOT EXISTS allowed_majors TEXT DEFAULT '[]';

    CREATE TABLE IF NOT EXISTS teacher_pins (
      id SERIAL PRIMARY KEY,
      pin VARCHAR(255) UNIQUE NOT NULL,
      teacher_name VARCHAR(150) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'teacher',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE teacher_pins ALTER COLUMN pin TYPE VARCHAR(255);
  `);

  // ตรวจสอบและสร้าง Default Master Password หากยังไม่มี
  const defaultMasterPin = (
    process.env.MASTER_TEACHER_PASSWORD ||
    process.env.MASTER_TEACHER_PIN ||
    process.env.TEACHER_PASSWORD ||
    process.env.TEACHER_PIN ||
    MASTER_ADMIN_PASSWORD_DEFAULT
  ).trim();

  // อัปเดตรหัสเริ่มต้นของ admin หากยังเป็น 1234
  await pool.query(
    `UPDATE teacher_pins SET pin = $1, updated_at = CURRENT_TIMESTAMP WHERE role = 'admin' AND (pin = '1234' OR pin = '')`,
    [defaultMasterPin]
  );

  await pool.query(
    `INSERT INTO teacher_pins (pin, teacher_name, role)
     SELECT $1, 'อาจารย์ผู้ดูแลระบบ (Master)', 'admin'
     WHERE NOT EXISTS (SELECT 1 FROM teacher_pins WHERE role = 'admin')`,
    [defaultMasterPin]
  );

  globalForDb._dbSchemaVersion = DB_SCHEMA_VERSION;
}

// ==========================================
// Local JSON Store Fallback (when DATABASE_URL is not set)
// ==========================================
interface LocalDbData {
  nextJobId: number;
  nextShiftId: number;
  nextRegId: number;
  nextPinId?: number;
  jobs: Omit<JobAnnouncement, 'shifts'>[];
  shifts: Omit<JobShift, 'registrations'>[];
  registrations: Registration[];
  teacherPins?: TeacherPinRecord[];
}

const isServerless = Boolean(
  process.env.VERCEL || process.cwd().startsWith('/var/task')
);
const LOCAL_DB_DIR = isServerless
  ? os.tmpdir()
  : path.join(process.cwd(), '.data');
const LOCAL_DB_FILE = path.join(LOCAL_DB_DIR, 'scholarship-db.json');

function readLocalDb(): LocalDbData {
  const defaultMasterPin = (
    process.env.MASTER_TEACHER_PASSWORD ||
    process.env.MASTER_TEACHER_PIN ||
    process.env.TEACHER_PASSWORD ||
    process.env.TEACHER_PIN ||
    MASTER_ADMIN_PASSWORD_DEFAULT
  ).trim();

  try {
    if (!fs.existsSync(LOCAL_DB_DIR)) {
      fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
    }
    if (!fs.existsSync(LOCAL_DB_FILE)) {
      const initial: LocalDbData = {
        nextJobId: 1,
        nextShiftId: 1,
        nextRegId: 1,
        nextPinId: 2,
        jobs: [],
        shifts: [],
        registrations: [],
        teacherPins: [
          {
            id: 1,
            pin: defaultMasterPin,
            teacher_name: 'อาจารย์ผู้ดูแลระบบ (Master)',
            role: 'admin',
            created_at: new Date().toISOString(),
          },
        ],
      };
      fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    const raw = fs.readFileSync(LOCAL_DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as LocalDbData;
    if (!parsed.teacherPins || parsed.teacherPins.length === 0) {
      parsed.teacherPins = [
        {
          id: 1,
          pin: defaultMasterPin,
          teacher_name: 'อาจารย์ผู้ดูแลระบบ (Master)',
          role: 'admin',
          created_at: new Date().toISOString(),
        },
      ];
      parsed.nextPinId = 2;
      writeLocalDb(parsed);
    }
    return parsed;
  } catch (err) {
    console.error('Error reading local db:', err);
    return {
      nextJobId: 1,
      nextShiftId: 1,
      nextRegId: 1,
      nextPinId: 2,
      jobs: [],
      shifts: [],
      registrations: [],
      teacherPins: [
        {
          id: 1,
          pin: defaultMasterPin,
          teacher_name: 'อาจารย์ผู้ดูแลระบบ (Master)',
          role: 'admin',
          created_at: new Date().toISOString(),
        },
      ],
    };
  }
}

// ==========================================
// PIN & Authentication Management
// ==========================================
export async function getTeacherByPin(
  pin?: string
): Promise<TeacherPinRecord | null> {
  const cleanPin = (pin || '').trim();
  if (!cleanPin) return null;

  const defaultMasterPin = (
    process.env.MASTER_TEACHER_PASSWORD ||
    process.env.MASTER_TEACHER_PIN ||
    process.env.TEACHER_PASSWORD ||
    process.env.TEACHER_PIN ||
    MASTER_ADMIN_PASSWORD_DEFAULT
  ).trim();

  if (getDbConnectionString().length > 0) {
    await ensurePgTables();
    const pool = getPool();
    const res = await pool.query<TeacherPinRecord>(
      'SELECT id, pin, teacher_name, role, created_at FROM teacher_pins WHERE pin = $1',
      [cleanPin]
    );
    if (res.rows.length > 0) {
      return res.rows[0];
    }

    if (cleanPin === defaultMasterPin) {
      const adminCheck = await pool.query(
        "SELECT 1 FROM teacher_pins WHERE role = 'admin'"
      );
      if (adminCheck.rows.length === 0) {
        const seeded = await pool.query<TeacherPinRecord>(
          "INSERT INTO teacher_pins (pin, teacher_name, role) VALUES ($1, $2, 'admin') RETURNING id, pin, teacher_name, role, created_at",
          [defaultMasterPin, 'อาจารย์ผู้ดูแลระบบ (Master)']
        );
        return seeded.rows[0];
      }
    }
    return null;
  }

  const data = readLocalDb();
  const found = data.teacherPins?.find((p) => p.pin === cleanPin);
  return found || null;
}

export async function verifyTeacherPin(pin?: string): Promise<boolean> {
  const teacher = await getTeacherByPin(pin);
  return Boolean(teacher);
}

export async function verifyAdminPin(pin?: string): Promise<boolean> {
  const teacher = await getTeacherByPin(pin);
  return Boolean(teacher && teacher.role === 'admin');
}

export async function getAllTeacherPins(
  adminPin: string
): Promise<TeacherPinRecord[]> {
  const isAdmin = await verifyAdminPin(adminPin);
  if (!isAdmin) {
    throw new Error('ไม่มีสิทธิ์เข้าถึง: เฉพาะอาจารย์ผู้ดูแลระบบเท่านั้น');
  }

  if (getDbConnectionString().length > 0) {
    await ensurePgTables();
    const pool = getPool();
    const res = await pool.query<TeacherPinRecord>(
      'SELECT id, pin, teacher_name, role, created_at FROM teacher_pins ORDER BY role ASC, id ASC'
    );
    return res.rows;
  }

  const data = readLocalDb();
  return data.teacherPins || [];
}

export async function createTeacherPin(
  adminPin: string,
  payload: { pin: string; teacher_name: string; role?: 'admin' | 'teacher' }
): Promise<TeacherPinRecord> {
  const isAdmin = await verifyAdminPin(adminPin);
  if (!isAdmin) {
    throw new Error('ไม่มีสิทธิ์เข้าถึง: เฉพาะอาจารย์ผู้ดูแลระบบเท่านั้น');
  }

  const cleanPin = (payload.pin || '').trim();
  const cleanName = (payload.teacher_name || '').trim();
  const role = payload.role === 'admin' ? 'admin' : 'teacher';

  const policy = validatePasswordPolicy(cleanPin);
  if (!policy.valid) {
    throw new Error(policy.error || 'รหัสผ่านต้องมีความยาวอย่างน้อย 16 ตัวอักษร และประกอบด้วยตัวอักษรพิมพ์ใหญ่ (A-Z) ตัวพิมพ์เล็ก (a-z) ตัวเลข (0-9) และตัวอักษรพิเศษ (เช่น @, !, _, >, &)');
  }
  if (!cleanName) {
    throw new Error('กรุณาระบุชื่ออาจารย์หรือหน่วยงานผู้ใช้งาน');
  }

  const existing = await getTeacherByPin(cleanPin);
  if (existing) {
    throw new Error('รหัสผ่านนี้ถูกใช้งานในระบบแล้ว กรุณากำหนดรหัสอื่น');
  }

  if (getDbConnectionString().length > 0) {
    await ensurePgTables();
    const pool = getPool();
    const res = await pool.query<TeacherPinRecord>(
      'INSERT INTO teacher_pins (pin, teacher_name, role) VALUES ($1, $2, $3) RETURNING id, pin, teacher_name, role, created_at',
      [cleanPin, cleanName, role]
    );
    return res.rows[0];
  }

  const data = readLocalDb();
  if (!data.teacherPins) data.teacherPins = [];
  const record: TeacherPinRecord = {
    id: data.nextPinId ? data.nextPinId++ : data.teacherPins.length + 1,
    pin: cleanPin,
    teacher_name: cleanName,
    role,
    created_at: new Date().toISOString(),
  };
  data.teacherPins.push(record);
  writeLocalDb(data);
  return record;
}

export async function updateMasterPin(
  currentAdminPin: string,
  newPin: string
): Promise<TeacherPinRecord> {
  const admin = await getTeacherByPin(currentAdminPin);
  if (!admin || admin.role !== 'admin') {
    throw new Error('รหัส Master PIN ปัจจุบันไม่ถูกต้อง');
  }

  const cleanNewPin = (newPin || '').trim();
  const policy = validatePasswordPolicy(cleanNewPin);
  if (!policy.valid) {
    throw new Error(policy.error || 'รหัส Master ใหม่ต้องมีความยาวอย่างน้อย 16 ตัวอักษร และประกอบด้วยตัวอักษรพิมพ์ใหญ่ (A-Z) ตัวพิมพ์เล็ก (a-z) ตัวเลข (0-9) และตัวอักษรพิเศษ (เช่น @, !, _, >, &)');
  }

  if (cleanNewPin !== currentAdminPin) {
    const existing = await getTeacherByPin(cleanNewPin);
    if (existing) {
      throw new Error('รหัสผ่านนี้ถูกใช้งานในระบบแล้ว กรุณาเลือกรหัสอื่น');
    }
  }

  if (getDbConnectionString().length > 0) {
    await ensurePgTables();
    const pool = getPool();
    const res = await pool.query<TeacherPinRecord>(
      "UPDATE teacher_pins SET pin = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND role = 'admin' RETURNING id, pin, teacher_name, role, created_at",
      [cleanNewPin, admin.id]
    );
    return res.rows[0];
  }

  const data = readLocalDb();
  if (!data.teacherPins) data.teacherPins = [];
  const target = data.teacherPins.find((p) => p.id === admin.id);
  if (target) {
    target.pin = cleanNewPin;
    writeLocalDb(data);
  }
  return { ...admin, pin: cleanNewPin };
}

export async function deleteTeacherPin(
  adminPin: string,
  pinIdToDelete: number
): Promise<void> {
  const isAdmin = await verifyAdminPin(adminPin);
  if (!isAdmin) {
    throw new Error('ไม่มีสิทธิ์เข้าถึง: เฉพาะอาจารย์ผู้ดูแลระบบเท่านั้น');
  }

  if (getDbConnectionString().length > 0) {
    await ensurePgTables();
    const pool = getPool();
    const check = await pool.query(
      'SELECT role FROM teacher_pins WHERE id = $1',
      [pinIdToDelete]
    );
    if (check.rows.length === 0) {
      throw new Error('ไม่พบรหัส PIN นี้ในระบบ');
    }
    if (check.rows[0].role === 'admin') {
      throw new Error('ไม่สามารถลบรหัส Master PIN ของผู้ดูแลระบบได้');
    }
    await pool.query('DELETE FROM teacher_pins WHERE id = $1', [pinIdToDelete]);
    return;
  }

  const data = readLocalDb();
  if (!data.teacherPins) return;
  const target = data.teacherPins.find((p) => p.id === pinIdToDelete);
  if (target && target.role === 'admin') {
    throw new Error('ไม่สามารถลบรหัส Master PIN ของผู้ดูแลระบบได้');
  }
  data.teacherPins = data.teacherPins.filter((p) => p.id !== pinIdToDelete);
  writeLocalDb(data);
}

function writeLocalDb(data: LocalDbData): void {
  if (!fs.existsSync(LOCAL_DB_DIR)) {
    fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
  }
  fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function formatDateStr(val: unknown): string {
  if (val instanceof Date) {
    return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
  }
  return String(val || '').slice(0, 10);
}

// ==========================================
// Database Operations
// ==========================================

export async function getAllJobs(): Promise<JobAnnouncement[]> {
  if (getDbConnectionString().length > 0) {
    await ensurePgTables();
    const pool = getPool();
    const jobsRes = await pool.query(
      'SELECT * FROM scholarship_jobs ORDER BY date ASC, id ASC'
    );
    const shiftsRes = await pool.query(
      'SELECT * FROM scholarship_shifts ORDER BY id ASC'
    );
    const regsRes = await pool.query(
      'SELECT * FROM scholarship_registrations ORDER BY id ASC'
    );

    const regsByShift = new Map<number, Registration[]>();
    for (const r of regsRes.rows) {
      const reg: Registration = {
        id: Number(r.id),
        job_id: Number(r.job_id),
        shift_id: Number(r.shift_id),
        student_id: r.student_id,
        student_name: r.student_name,
        faculty: r.faculty,
        scholarship_name: r.scholarship_name || '',
        phone: r.phone ? String(r.phone) : '',
        registered_date: formatDateStr(r.registered_date),
        created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
      };
      const list = regsByShift.get(reg.shift_id) || [];
      list.push(reg);
      regsByShift.set(reg.shift_id, list);
    }

    const shiftsByJob = new Map<number, JobShift[]>();
    for (const s of shiftsRes.rows) {
      const shift: JobShift = {
        id: Number(s.id),
        job_id: Number(s.job_id),
        label: s.label,
        duty_name: s.duty_name ? String(s.duty_name).trim() : '',
        allowed_majors: parseAllowedMajors(s.allowed_majors),
        time_range: s.time_range,
        hours: Number(s.hours),
        capacity: Number(s.capacity),
        registrations: regsByShift.get(Number(s.id)) || [],
      };
      const list = shiftsByJob.get(shift.job_id) || [];
      list.push(shift);
      shiftsByJob.set(shift.job_id, list);
    }

    return jobsRes.rows.map((j) => ({
      id: Number(j.id),
      date: formatDateStr(j.date),
      title: j.title,
      description: j.description || '',
      teacher_name: j.teacher_name,
      location: j.location || '',
      require_scholarship_name: Boolean(j.require_scholarship_name),
      allow_kys: Boolean(j.allow_kys),
      job_type: (j.job_type === 'external' ? 'external' : 'internal') as 'internal' | 'external',
      shift_mode: (j.shift_mode === 'roles' ? 'roles' : 'shifts') as 'shifts' | 'roles',
      created_at: j.created_at ? new Date(j.created_at).toISOString() : '',
      shifts: shiftsByJob.get(Number(j.id)) || [],
    }));
  }

  // Local fallback
  const data = readLocalDb();
  const sortedJobs = [...data.jobs].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id - b.id
  );
  return sortedJobs.map((j) => {
    const jobShifts = data.shifts
      .filter((s) => s.job_id === j.id)
      .sort((a, b) => a.id - b.id)
      .map((s) => ({
        ...s,
        duty_name: s.duty_name ? String(s.duty_name).trim() : '',
        allowed_majors: parseAllowedMajors(s.allowed_majors),
        registrations: data.registrations
          .filter((r) => r.shift_id === s.id)
          .sort((a, b) => a.id - b.id),
      }));
    return {
      ...j,
      shift_mode: (j.shift_mode === 'roles' ? 'roles' : 'shifts') as 'shifts' | 'roles',
      shifts: jobShifts,
    };
  });
}

export async function getJobById(jobId: number): Promise<JobAnnouncement | null> {
  const all = await getAllJobs();
  return all.find((j) => j.id === jobId) || null;
}

export interface CreateJobPayload {
  date: string;
  title: string;
  description: string;
  teacher_name: string;
  location: string;
  require_scholarship_name: boolean;
  allow_kys: boolean;
  job_type?: 'internal' | 'external';
  shift_mode?: 'shifts' | 'roles';
  shifts: ShiftInput[];
}

export async function createJob(payload: CreateJobPayload): Promise<JobAnnouncement> {
  const jobScope = payload.job_type === 'external' ? 'external' : 'internal';
  const shiftMode = payload.shift_mode === 'roles' ? 'roles' : 'shifts';
  if (getDbConnectionString().length > 0) {
    await ensurePgTables();
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const jobRes = await client.query(
        `INSERT INTO scholarship_jobs
          (date, title, description, teacher_name, location, require_scholarship_name, allow_kys, job_type, shift_mode)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          payload.date,
          payload.title.trim(),
          payload.description.trim(),
          payload.teacher_name.trim(),
          payload.location.trim(),
          payload.require_scholarship_name,
          payload.allow_kys,
          jobScope,
          shiftMode,
        ]
      );
      const jobRow = jobRes.rows[0];
      const jobId = Number(jobRow.id);

      for (const s of payload.shifts) {
        const dutyNameClean = (s.duty_name || '').trim();
        const allowedMajorsClean = sanitizeAllowedMajors(s.allowed_majors);
        await client.query(
          `INSERT INTO scholarship_shifts (job_id, label, time_range, hours, capacity, duty_name, allowed_majors)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            jobId,
            s.label.trim(),
            s.time_range.trim(),
            Number(s.hours),
            Number(s.capacity),
            dutyNameClean,
            JSON.stringify(allowedMajorsClean),
          ]
        );
      }

      await client.query('COMMIT');
      const created = await getJobById(jobId);
      if (!created) throw new Error('Failed to load created job');
      return created;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Local fallback
  const data = readLocalDb();
  const jobId = data.nextJobId++;
  const nowIso = new Date().toISOString();

  data.jobs.push({
    id: jobId,
    date: payload.date,
    title: payload.title.trim(),
    description: payload.description.trim(),
    teacher_name: payload.teacher_name.trim(),
    location: payload.location.trim(),
    require_scholarship_name: payload.require_scholarship_name,
    allow_kys: payload.allow_kys,
    job_type: jobScope,
    shift_mode: shiftMode,
    created_at: nowIso,
  });

  for (const s of payload.shifts) {
    data.shifts.push({
      id: data.nextShiftId++,
      job_id: jobId,
      label: s.label.trim(),
      duty_name: (s.duty_name || '').trim(),
      allowed_majors: sanitizeAllowedMajors(s.allowed_majors),
      time_range: s.time_range.trim(),
      hours: Number(s.hours),
      capacity: Number(s.capacity),
    });
  }

  writeLocalDb(data);
  const created = await getJobById(jobId);
  if (!created) throw new Error('Failed to load created job');
  return created;
}

export async function updateJob(
  jobId: number,
  payload: CreateJobPayload
): Promise<JobAnnouncement | null> {
  const existing = await getJobById(jobId);
  if (!existing) return null;

  const jobScope = payload.job_type === 'external' ? 'external' : 'internal';
  const shiftMode = payload.shift_mode === 'roles' ? 'roles' : 'shifts';

  if (getDbConnectionString().length > 0) {
    await ensurePgTables();
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE scholarship_jobs
         SET date = $1, title = $2, description = $3, teacher_name = $4,
             location = $5, require_scholarship_name = $6, allow_kys = $7, job_type = $8, shift_mode = $9
         WHERE id = $10`,
        [
          payload.date,
          payload.title.trim(),
          payload.description.trim(),
          payload.teacher_name.trim(),
          payload.location.trim(),
          payload.require_scholarship_name,
          payload.allow_kys,
          jobScope,
          shiftMode,
          jobId,
        ]
      );

      const incomingShiftIds = payload.shifts
        .map((s) => s.id)
        .filter((id): id is number => typeof id === 'number');

      // Delete shifts that were removed
      for (const oldShift of existing.shifts) {
        if (!incomingShiftIds.includes(oldShift.id)) {
          await client.query('DELETE FROM scholarship_shifts WHERE id = $1 AND job_id = $2', [
            oldShift.id,
            jobId,
          ]);
        }
      }

      // Update or insert shifts
      for (const s of payload.shifts) {
        const dutyNameClean = (s.duty_name || '').trim();
        const allowedMajorsClean = sanitizeAllowedMajors(s.allowed_majors);
        if (s.id && existing.shifts.some((os) => os.id === s.id)) {
          await client.query(
            `UPDATE scholarship_shifts
             SET label = $1, time_range = $2, hours = $3, capacity = $4, duty_name = $5, allowed_majors = $6
             WHERE id = $7 AND job_id = $8`,
            [
              s.label.trim(),
              s.time_range.trim(),
              Number(s.hours),
              Number(s.capacity),
              dutyNameClean,
              JSON.stringify(allowedMajorsClean),
              s.id,
              jobId,
            ]
          );
        } else {
          await client.query(
            `INSERT INTO scholarship_shifts (job_id, label, time_range, hours, capacity, duty_name, allowed_majors)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              jobId,
              s.label.trim(),
              s.time_range.trim(),
              Number(s.hours),
              Number(s.capacity),
              dutyNameClean,
              JSON.stringify(allowedMajorsClean),
            ]
          );
        }
      }

      await client.query('COMMIT');
      return await getJobById(jobId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Local fallback
  const data = readLocalDb();
  const jobIdx = data.jobs.findIndex((j) => j.id === jobId);
  if (jobIdx === -1) return null;

  data.jobs[jobIdx] = {
    ...data.jobs[jobIdx],
    date: payload.date,
    title: payload.title.trim(),
    description: payload.description.trim(),
    teacher_name: payload.teacher_name.trim(),
    location: payload.location.trim(),
    require_scholarship_name: payload.require_scholarship_name,
    allow_kys: payload.allow_kys,
    job_type: jobScope,
    shift_mode: shiftMode,
  };

  const incomingShiftIds = payload.shifts
    .map((s) => s.id)
    .filter((id): id is number => typeof id === 'number');

  // Remove deleted shifts and their registrations
  const removedShiftIds = data.shifts
    .filter((s) => s.job_id === jobId && !incomingShiftIds.includes(s.id))
    .map((s) => s.id);

  data.shifts = data.shifts.filter(
    (s) => !(s.job_id === jobId && removedShiftIds.includes(s.id))
  );
  data.registrations = data.registrations.filter(
    (r) => !removedShiftIds.includes(r.shift_id)
  );

  for (const s of payload.shifts) {
    const dutyNameClean = (s.duty_name || '').trim();
    const allowedMajorsClean = sanitizeAllowedMajors(s.allowed_majors);
    if (s.id) {
      const sIdx = data.shifts.findIndex((os) => os.id === s.id && os.job_id === jobId);
      if (sIdx !== -1) {
        data.shifts[sIdx] = {
          ...data.shifts[sIdx],
          label: s.label.trim(),
          duty_name: dutyNameClean,
          allowed_majors: allowedMajorsClean,
          time_range: s.time_range.trim(),
          hours: Number(s.hours),
          capacity: Number(s.capacity),
        };
        continue;
      }
    }
    data.shifts.push({
      id: data.nextShiftId++,
      job_id: jobId,
      label: s.label.trim(),
      duty_name: dutyNameClean,
      allowed_majors: allowedMajorsClean,
      time_range: s.time_range.trim(),
      hours: Number(s.hours),
      capacity: Number(s.capacity),
    });
  }

  writeLocalDb(data);
  return await getJobById(jobId);
}

export async function deleteJob(jobId: number): Promise<boolean> {
  if (getDbConnectionString().length > 0) {
    await ensurePgTables();
    const pool = getPool();
    const res = await pool.query(
      'DELETE FROM scholarship_jobs WHERE id = $1 RETURNING id',
      [jobId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  const data = readLocalDb();
  const before = data.jobs.length;
  data.jobs = data.jobs.filter((j) => j.id !== jobId);
  if (data.jobs.length === before) return false;
  data.shifts = data.shifts.filter((s) => s.job_id !== jobId);
  data.registrations = data.registrations.filter((r) => r.job_id !== jobId);
  writeLocalDb(data);
  return true;
}

export interface RegisterStudentPayload {
  job_id: number;
  shift_id: number;
  student_id: string;
  student_name: string;
  faculty: string;
  scholarship_name: string;
  phone?: string;
}

export async function registerStudent(
  payload: RegisterStudentPayload
): Promise<{ registration: Registration; job: JobAnnouncement }> {
  const job = await getJobById(payload.job_id);
  if (!job) {
    throw new Error('ไม่พบประกาศงานนี้ในระบบ');
  }

  const shift = job.shifts.find((s) => s.id === payload.shift_id);
  if (!shift) {
    throw new Error('ไม่พบช่วงเวลา/กะที่เลือก');
  }

  const todayStr = getTodayStr();
  if (getDaysUntilJob(job.date, todayStr) < 0) {
    throw new Error('ไม่สามารถลงทะเบียนงานที่ผ่านไปแล้วได้');
  }

  const studentIdClean = payload.student_id.trim();
  const studentNameClean = payload.student_name.trim();
  const facultyClean = normalizeMajorName(payload.faculty.trim());
  const scholarshipClean = (payload.scholarship_name || '').trim();
  const phoneClean = (payload.phone || '').trim();

  if (!studentIdClean || !studentNameClean || !facultyClean) {
    throw new Error('กรุณากรอก รหัสนักศึกษา, ชื่อ-นามสกุล และสาขา ให้ครบถ้วน');
  }

  if (!phoneClean) {
    throw new Error('กรุณากรอกเบอร์โทรศัพท์ติดต่อ');
  }

  if (job.require_scholarship_name && !scholarshipClean) {
    throw new Error('งานนี้กำหนดให้ต้องระบุชื่อทุน กรุณาระบุชื่อทุนของคุณ');
  }

  if (!job.allow_kys && isKysScholarship(scholarshipClean)) {
    throw new Error('ขออภัย งานนี้ไม่รับนักศึกษาทุน กยศ. (กรุณาเลือกงานอื่นที่รองรับทุน กยศ.)');
  }

  assertShiftRegistrationAllowed(
    job.shifts,
    shift.id,
    facultyClean,
    studentIdClean,
    studentNameClean,
    false
  );

  if (getDbConnectionString().length > 0) {
    await ensurePgTables();
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // ล็อกแถวของงานและกะงานทั้งหมดในงานนี้ (Row-level Lock) เพื่อป้องกัน race condition และตรวจเวลาซ้ำซ้อน
      await client.query('SELECT id FROM scholarship_jobs WHERE id = $1 FOR UPDATE', [job.id]);
      const lockedShiftsRes = await client.query(
        'SELECT id, label, time_range, capacity, duty_name, allowed_majors FROM scholarship_shifts WHERE job_id = $1 FOR UPDATE',
        [job.id]
      );
      const jobRegsRes = await client.query(
        'SELECT shift_id, student_id, student_name FROM scholarship_registrations WHERE job_id = $1',
        [job.id]
      );

      const regsByShiftId = new Map<number, Array<{ student_id: string; student_name: string }>>();
      for (const r of jobRegsRes.rows) {
        const sId = Number(r.shift_id);
        const list = regsByShiftId.get(sId) || [];
        list.push({
          student_id: String(r.student_id || ''),
          student_name: String(r.student_name || ''),
        });
        regsByShiftId.set(sId, list);
      }

      const lockedJobShifts: ShiftSlotCheckItem[] = lockedShiftsRes.rows.map((sRow) => ({
        id: Number(sRow.id),
        label: String(sRow.label || ''),
        duty_name: sRow.duty_name ? String(sRow.duty_name).trim() : '',
        allowed_majors: parseAllowedMajors(sRow.allowed_majors),
        time_range: String(sRow.time_range || ''),
        capacity: Number(sRow.capacity),
        registrations: regsByShiftId.get(Number(sRow.id)) || [],
      }));

      assertShiftRegistrationAllowed(
        lockedJobShifts,
        shift.id,
        facultyClean,
        studentIdClean,
        studentNameClean,
        true
      );

      const res = await client.query(
        `INSERT INTO scholarship_registrations
          (job_id, shift_id, student_id, student_name, faculty, scholarship_name, phone, registered_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          job.id,
          shift.id,
          studentIdClean,
          studentNameClean,
          facultyClean,
          scholarshipClean,
          phoneClean,
          todayStr,
        ]
      );

      await client.query('COMMIT');
      const row = res.rows[0];
      const updatedJob = await getJobById(job.id);
      return {
        registration: {
          id: Number(row.id),
          job_id: Number(row.job_id),
          shift_id: Number(row.shift_id),
          student_id: row.student_id,
          student_name: row.student_name,
          faculty: row.faculty,
          scholarship_name: row.scholarship_name || '',
          phone: row.phone ? String(row.phone) : '',
          registered_date: formatDateStr(row.registered_date),
          created_at: row.created_at ? new Date(row.created_at).toISOString() : '',
        },
        job: updatedJob!,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Local fallback
  const data = readLocalDb();
  const reg: Registration = {
    id: data.nextRegId++,
    job_id: job.id,
    shift_id: shift.id,
    student_id: studentIdClean,
    student_name: studentNameClean,
    faculty: facultyClean,
    scholarship_name: scholarshipClean,
    phone: phoneClean,
    registered_date: todayStr,
    created_at: new Date().toISOString(),
  };
  data.registrations.push(reg);
  writeLocalDb(data);

  const updatedJob = await getJobById(job.id);
  return { registration: reg, job: updatedJob! };
}

export async function cancelRegistration(
  registrationId: number,
  options: { studentId?: string; teacherPin?: string }
): Promise<void> {
  const allJobs = await getAllJobs();
  let foundReg: Registration | null = null;
  let foundJob: JobAnnouncement | null = null;

  for (const job of allJobs) {
    for (const shift of job.shifts) {
      const reg = shift.registrations.find((r) => r.id === registrationId);
      if (reg) {
        foundReg = reg;
        foundJob = job;
        break;
      }
    }
    if (foundReg) break;
  }

  if (!foundReg || !foundJob) {
    throw new Error('ไม่พบข้อมูลการลงทะเบียนนี้');
  }

  const isTeacherOverride = await verifyTeacherPin(options.teacherPin);

  if (!isTeacherOverride) {
    throw new Error('นักศึกษาไม่สามารถถอนชื่อเองได้ กรุณาแจ้งอาจารย์ผู้รับผิดชอบงานเพื่อถอนชื่อ');
  }

  if (getDbConnectionString().length > 0) {
    await ensurePgTables();
    const pool = getPool();
    await pool.query('DELETE FROM scholarship_registrations WHERE id = $1', [
      registrationId,
    ]);
    return;
  }

  // Local fallback
  const data = readLocalDb();
  data.registrations = data.registrations.filter((r) => r.id !== registrationId);
  writeLocalDb(data);
}
