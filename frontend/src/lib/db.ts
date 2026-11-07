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

export function verifyTeacherPin(pin?: string): boolean {
  const expectedPin = process.env.TEACHER_PIN || '1234';
  return Boolean(pin && pin.trim() === expectedPin.trim());
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
      registered_date VARCHAR(10) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  globalForDb._dbInitialized = true;
}

// ==========================================
// Local JSON Store Fallback (when DATABASE_URL is not set)
// ==========================================
interface LocalDbData {
  nextJobId: number;
  nextShiftId: number;
  nextRegId: number;
  jobs: Omit<JobAnnouncement, 'shifts'>[];
  shifts: Omit<JobShift, 'registrations'>[];
  registrations: Registration[];
}

const isServerless = Boolean(
  process.env.VERCEL || process.cwd().startsWith('/var/task')
);
const LOCAL_DB_DIR = isServerless
  ? os.tmpdir()
  : path.join(process.cwd(), '.data');
const LOCAL_DB_FILE = path.join(LOCAL_DB_DIR, 'scholarship-db.json');

function readLocalDb(): LocalDbData {
  try {
    if (!fs.existsSync(LOCAL_DB_DIR)) {
      fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
    }
    if (!fs.existsSync(LOCAL_DB_FILE)) {
      const initial: LocalDbData = {
        nextJobId: 1,
        nextShiftId: 1,
        nextRegId: 1,
        jobs: [],
        shifts: [],
        registrations: [],
      };
      fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    const raw = fs.readFileSync(LOCAL_DB_FILE, 'utf8');
    return JSON.parse(raw) as LocalDbData;
  } catch (err) {
    console.error('Error reading local db:', err);
    return {
      nextJobId: 1,
      nextShiftId: 1,
      nextRegId: 1,
      jobs: [],
      shifts: [],
      registrations: [],
    };
  }
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
  shifts: ShiftInput[];
}

export async function createJob(payload: CreateJobPayload): Promise<JobAnnouncement> {
  if (getDbConnectionString().length > 0) {
    await ensurePgTables();
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const jobRes = await client.query(
        `INSERT INTO scholarship_jobs
          (date, title, description, teacher_name, location, require_scholarship_name, allow_kys)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          payload.date,
          payload.title.trim(),
          payload.description.trim(),
          payload.teacher_name.trim(),
          payload.location.trim(),
          payload.require_scholarship_name,
          payload.allow_kys,
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

  if (getDbConnectionString().length > 0) {
    await ensurePgTables();
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE scholarship_jobs
         SET date = $1, title = $2, description = $3, teacher_name = $4,
             location = $5, require_scholarship_name = $6, allow_kys = $7
         WHERE id = $8`,
        [
          payload.date,
          payload.title.trim(),
          payload.description.trim(),
          payload.teacher_name.trim(),
          payload.location.trim(),
          payload.require_scholarship_name,
          payload.allow_kys,
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

  if (!studentIdClean || !studentNameClean || !facultyClean) {
    throw new Error('กรุณากรอก รหัสนักศึกษา, ชื่อ-นามสกุล และสาขา ให้ครบถ้วน');
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
          (job_id, shift_id, student_id, student_name, faculty, scholarship_name, registered_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          job.id,
          shift.id,
          studentIdClean,
          studentNameClean,
          facultyClean,
          scholarshipClean,
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

  const isTeacherOverride = verifyTeacherPin(options.teacherPin);

  if (!isTeacherOverride) {
    // ตรวจสอบรหัสนักศึกษาเพื่อยืนยันว่าเป็นเจ้าของชื่อจริง
    const inputStudentId = (options.studentId || '').trim().toLowerCase();
    if (!inputStudentId || inputStudentId !== foundReg.student_id.trim().toLowerCase()) {
      throw new Error('รหัสนักศึกษาไม่ตรงกับผู้ที่ลงทะเบียนไว้ กรุณากรอกรหัสนักศึกษาให้ถูกต้อง');
    }

    // ตรวจสอบกฎการยกเลิกงาน (ก่อนวันงานอย่างน้อย 2 วัน หรือเพิ่งลงทะเบียนในวันนี้)
    const eligibility = checkCancelEligibility(
      foundJob.date,
      foundReg.registered_date,
      getTodayStr()
    );
    if (!eligibility.canCancel) {
      throw new Error(eligibility.reason);
    }
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
