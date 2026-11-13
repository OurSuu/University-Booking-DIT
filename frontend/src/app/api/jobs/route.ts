import { NextRequest, NextResponse } from 'next/server';
import { getAllJobs, createJob, verifyTeacherPin, validateAndSanitizeShifts } from '@/lib/db';
import { getDaysUntilJob } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET() {
  try {
    const jobs = await getAllJobs();
    return NextResponse.json(jobs, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error) {
    console.error('GET /api/jobs error:', error);
    return NextResponse.json(
      { error: 'ไม่สามารถดึงข้อมูลประกาศงานได้' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      teacherPin,
      date,
      title,
      description,
      teacher_name,
      location,
      require_scholarship_name,
      allow_kys,
      job_type,
      shifts,
    } = body;

    if (!(await verifyTeacherPin(teacherPin))) {
      return NextResponse.json(
        { error: 'รหัส PIN สำหรับอาจารย์ไม่ถูกต้อง' },
        { status: 403 }
      );
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'กรุณาระบุวันที่จัดงานให้ถูกต้อง (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    if (getDaysUntilJob(date) < 0) {
      return NextResponse.json(
        { error: 'ไม่สามารถสร้างประกาศงานในวันที่ผ่านมาแล้วได้' },
        { status: 400 }
      );
    }

    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: 'กรุณาระบุชื่องาน/กิจกรรม' },
        { status: 400 }
      );
    }

    if (!teacher_name || !teacher_name.trim()) {
      return NextResponse.json(
        { error: 'กรุณาระบุชื่ออาจารย์ผู้ประกาศงาน' },
        { status: 400 }
      );
    }

    const shiftCheck = validateAndSanitizeShifts(shifts);
    if (shiftCheck.error || !shiftCheck.shifts) {
      return NextResponse.json(
        { error: shiftCheck.error || 'ข้อมูลกะ/ช่วงเวลาไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    const created = await createJob({
      date,
      title,
      description: description || '',
      teacher_name,
      location: location || '',
      require_scholarship_name: Boolean(require_scholarship_name),
      allow_kys: Boolean(allow_kys),
      job_type: job_type === 'external' ? 'external' : 'internal',
      shifts: shiftCheck.shifts,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/jobs error:', error);
    return NextResponse.json(
      { error: error?.message || 'ไม่สามารถสร้างประกาศงานได้' },
      { status: 500 }
    );
  }
}
