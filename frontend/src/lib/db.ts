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
} from '@/types';

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

const globalForDb = globalThis as unknown as {
  _pgPool?: Pool;
  _dbInitialized?: boolean;
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
  if (globalForDb._dbInitialized) return;
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scholarship_shifts (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES scholarship_jobs(id) ON DELETE CASCADE,
      label VARCHAR(100) NOT NULL,
      time_range VARCHAR(100) NOT NULL,
      hours NUMERIC(5,2) NOT NULL DEFAULT 3,
      capacity INTEGER NOT NULL DEFAULT 5
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

    CREATE TABLE IF NOT EXISTS teacher_pins (
      id SERIAL PRIMARY KEY,
      pin VARCHAR(50) UNIQUE NOT NULL,
      teacher_name VARCHAR(150) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'teacher',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ตรวจสอบและสร้าง Default Master PIN หากยังไม่มี
  const defaultMasterPin = (
    process.env.MASTER_TEACHER_PIN ||
    process.env.TEACHER_PIN ||
    '1234'
  ).trim();

  await pool.query(
    `INSERT INTO teacher_pins (pin, teacher_name, role)
     SELECT $1, 'อาจารย์ผู้ดูแลระบบ (Master)', 'admin'
     WHERE NOT EXISTS (SELECT 1 FROM teacher_pins WHERE role = 'admin')`,
    [defaultMasterPin]
  );

  globalForDb._dbInitialized = true;
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
    process.env.MASTER_TEACHER_PIN ||
    process.env.TEACHER_PIN ||
    '1234'
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
    process.env.MASTER_TEACHER_PIN ||
    process.env.TEACHER_PIN ||
    '1234'
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

  if (!cleanPin || cleanPin.length < 4 || cleanPin.length > 20) {
    throw new Error('รหัส PIN ต้องมีความยาวอย่างน้อย 4 ตัวอักษร');
  }
  if (!cleanName) {
    throw new Error('กรุณาระบุชื่ออาจารย์หรือหน่วยงานผู้ใช้งาน');
  }

  const existing = await getTeacherByPin(cleanPin);
  if (existing) {
    throw new Error('รหัส PIN นี้ถูกใช้งานในระบบแล้ว กรุณากำหนดรหัสอื่น');
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
  if (!cleanNewPin || cleanNewPin.length < 4 || cleanNewPin.length > 20) {
    throw new Error('รหัส Master PIN ใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร');
  }

  if (cleanNewPin !== currentAdminPin) {
    const existing = await getTeacherByPin(cleanNewPin);
    if (existing) {
      throw new Error('รหัส PIN นี้ถูกใช้งานในระบบแล้ว กรุณาเลือกรหัสอื่น');
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
        registrations: data.registrations
          .filter((r) => r.shift_id === s.id)
          .sort((a, b) => a.id - b.id),
      }));
    return {
      ...j,
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
  shifts: ShiftInput[];
}

export async function createJob(payload: CreateJobPayload): Promise<JobAnnouncement> {
  const jobScope = payload.job_type === 'external' ? 'external' : 'internal';
  if (getDbConnectionString().length > 0) {
    await ensurePgTables();
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const jobRes = await client.query(
        `INSERT INTO scholarship_jobs
          (date, title, description, teacher_name, location, require_scholarship_name, allow_kys, job_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
        ]
      );
      const jobRow = jobRes.rows[0];
      const jobId = Number(jobRow.id);

      for (const s of payload.shifts) {
        await client.query(
          `INSERT INTO scholarship_shifts (job_id, label, time_range, hours, capacity)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            jobId,
            s.label.trim(),
            s.time_range.trim(),
            Number(s.hours),
            Number(s.capacity),
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
    created_at: nowIso,
  });

  for (const s of payload.shifts) {
    data.shifts.push({
      id: data.nextShiftId++,
      job_id: jobId,
      label: s.label.trim(),
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

  if (getDbConnectionString().length > 0) {
    await ensurePgTables();
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE scholarship_jobs
         SET date = $1, title = $2, description = $3, teacher_name = $4,
             location = $5, require_scholarship_name = $6, allow_kys = $7, job_type = $8
         WHERE id = $9`,
        [
          payload.date,
          payload.title.trim(),
          payload.description.trim(),
          payload.teacher_name.trim(),
          payload.location.trim(),
          payload.require_scholarship_name,
          payload.allow_kys,
          jobScope,
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
        if (s.id && existing.shifts.some((os) => os.id === s.id)) {
          await client.query(
            `UPDATE scholarship_shifts
             SET label = $1, time_range = $2, hours = $3, capacity = $4
             WHERE id = $5 AND job_id = $6`,
            [
              s.label.trim(),
              s.time_range.trim(),
              Number(s.hours),
              Number(s.capacity),
              s.id,
              jobId,
            ]
          );
        } else {
          await client.query(
            `INSERT INTO scholarship_shifts (job_id, label, time_range, hours, capacity)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              jobId,
              s.label.trim(),
              s.time_range.trim(),
              Number(s.hours),
              Number(s.capacity),
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
    if (s.id) {
      const sIdx = data.shifts.findIndex((os) => os.id === s.id && os.job_id === jobId);
      if (sIdx !== -1) {
        data.shifts[sIdx] = {
          ...data.shifts[sIdx],
          label: s.label.trim(),
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
  const facultyClean = payload.faculty.trim();
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

  if (shift.registrations.length >= shift.capacity) {
    throw new Error('ช่วงเวลานี้มีผู้ลงทะเบียนเต็มจำนวนแล้ว');
  }

  const isDuplicate = shift.registrations.some(
    (r) =>
      r.student_id.trim().toLowerCase() === studentIdClean.toLowerCase() ||
      r.student_name.trim().toLowerCase() === studentNameClean.toLowerCase()
  );
  if (isDuplicate) {
    throw new Error('รหัสนักศึกษาหรือชื่อนี้ได้ลงทะเบียนในช่วงเวลานี้ไปแล้ว');
  }

  if (getDbConnectionString().length > 0) {
    await ensurePgTables();
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // ล็อกแถวของกะงานนี้ (Row-level Lock) เพื่อป้องกันกรณีคนกดลงทะเบียนพร้อมกันในเสี้ยววินาทีเดียวกัน
      const lockedShiftRes = await client.query(
        'SELECT id, capacity FROM scholarship_shifts WHERE id = $1 AND job_id = $2 FOR UPDATE',
        [shift.id, job.id]
      );
      if (lockedShiftRes.rowCount === 0) {
        throw new Error('ไม่พบช่วงเวลา/กะที่เลือก');
      }
      const latestCapacity = Number(lockedShiftRes.rows[0].capacity);

      const currentRegsRes = await client.query(
        'SELECT student_id, student_name FROM scholarship_registrations WHERE shift_id = $1',
        [shift.id]
      );

      if (currentRegsRes.rows.length >= latestCapacity) {
        throw new Error('ขออภัย มีผู้ลงทะเบียนที่นั่งสุดท้ายตัดหน้าไปเมื่อสักครู่ ช่วงเวลานี้เต็มแล้ว');
      }

      const dupInTx = currentRegsRes.rows.some(
        (r) =>
          String(r.student_id || '').trim().toLowerCase() === studentIdClean.toLowerCase() ||
          String(r.student_name || '').trim().toLowerCase() === studentNameClean.toLowerCase()
      );
      if (dupInTx) {
        throw new Error('รหัสนักศึกษาหรือชื่อนี้ได้ลงทะเบียนในช่วงเวลานี้ไปแล้ว');
      }

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
