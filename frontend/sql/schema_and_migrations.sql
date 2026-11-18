-- ============================================================================
-- PostgreSQL Schema & Idempotent Migrations (Neon / Supabase / Postgres SQL Editor)
-- System: ระบบปฏิทินประกาศงานและลงทะเบียนชั่วโมงทุน (DIT RSU)
-- หมายเหตุ: สามารถนำไปรันใน SQL Editor ได้ทันทีโดยไม่ลบหรือทำลายข้อมูลเดิมที่มีอยู่
-- ============================================================================

-- 1. ตารางประกาศงานชั่วโมงทุน
CREATE TABLE IF NOT EXISTS scholarship_jobs (
  id SERIAL PRIMARY KEY,
  date VARCHAR(10) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT DEFAULT '',
  teacher_name VARCHAR(150) NOT NULL,
  teacher_contact VARCHAR(255) DEFAULT '',
  location VARCHAR(200) DEFAULT '',
  require_scholarship_name BOOLEAN DEFAULT TRUE,
  allow_kys BOOLEAN DEFAULT TRUE,
  scholarship_policy VARCHAR(20) DEFAULT '',
  job_type VARCHAR(50) DEFAULT 'internal',
  shift_mode VARCHAR(20) DEFAULT 'shifts',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. ตารางกะ / ช่วงเวลา / หน้าที่รับสมัครในแต่ละงาน
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

-- 3. ตารางบันทึกการลงทะเบียนของนักศึกษา
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

-- 4. ตารางเก็บรหัสผ่านอาจารย์และ Master Password
CREATE TABLE IF NOT EXISTS teacher_pins (
  id SERIAL PRIMARY KEY,
  pin VARCHAR(255) UNIQUE NOT NULL,
  teacher_name VARCHAR(150) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'teacher',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. ตารางเก็บรายชื่ออาจารย์ที่ซ่อนจากตัวกรอง Dashboard (สำหรับปุ่มลบชื่อ / Backup)
CREATE TABLE IF NOT EXISTS dashboard_hidden_teachers (
  teacher_name VARCHAR(200) PRIMARY KEY,
  hidden_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 6. อัปเกรดคอลัมน์เพิ่มเติมสำหรับฐานข้อมูลเดิม (Safe Idempotent ALTER TABLE)
-- ============================================================================
ALTER TABLE scholarship_registrations ADD COLUMN IF NOT EXISTS phone VARCHAR(50) DEFAULT '';
ALTER TABLE scholarship_jobs ADD COLUMN IF NOT EXISTS job_type VARCHAR(50) DEFAULT 'internal';
ALTER TABLE scholarship_jobs ADD COLUMN IF NOT EXISTS shift_mode VARCHAR(20) DEFAULT 'shifts';
ALTER TABLE scholarship_jobs ADD COLUMN IF NOT EXISTS teacher_contact VARCHAR(255) DEFAULT '';
ALTER TABLE scholarship_jobs ADD COLUMN IF NOT EXISTS scholarship_policy VARCHAR(20) DEFAULT '';
ALTER TABLE scholarship_shifts ADD COLUMN IF NOT EXISTS duty_name VARCHAR(150) DEFAULT '';
ALTER TABLE scholarship_shifts ADD COLUMN IF NOT EXISTS allowed_majors TEXT DEFAULT '[]';
ALTER TABLE teacher_pins ALTER COLUMN pin TYPE VARCHAR(255);

-- 7. อัปเดตค่าเริ่มต้น scholarship_policy ให้ข้อมูลงานเดิม (เฉพาะแถวที่ยังว่างอยู่)
UPDATE scholarship_jobs
SET scholarship_policy = CASE
  WHEN allow_kys = FALSE THEN 'non_kys'
  ELSE 'all'
END
WHERE COALESCE(scholarship_policy, '') = '';

-- ============================================================================
-- 8. ตรวจสอบผลลัพธ์หลังรัน SQL เสร็จสิ้น
-- ============================================================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'scholarship_jobs',
    'scholarship_shifts',
    'scholarship_registrations',
    'teacher_pins',
    'dashboard_hidden_teachers'
  )
ORDER BY table_name;
