import { NextRequest, NextResponse } from 'next/server';
import { updateJob, deleteJob, verifyTeacherPin, validateAndSanitizeShifts } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const jobId = parseInt(idStr, 10);

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
      shift_mode,
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

    if (!title || !title.trim() || !teacher_name || !teacher_name.trim()) {
      return NextResponse.json(
        { error: 'กรุณาระบุชื่องานและชื่ออาจารย์ผู้ประกาศให้ครบถ้วน' },
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

    const updated = await updateJob(jobId, {
      date,
      title,
      description: description || '',
      teacher_name,
      location: location || '',
      require_scholarship_name: Boolean(require_scholarship_name),
      allow_kys: Boolean(allow_kys),
      job_type: job_type === 'external' ? 'external' : 'internal',
      shift_mode: shift_mode === 'roles' ? 'roles' : 'shifts',
      shifts: shiftCheck.shifts,
    });

    if (!updated) {
      return NextResponse.json({ error: 'ไม่พบประกาศงานนี้' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('PUT /api/jobs/[id] error:', error);
    return NextResponse.json(
      { error: error?.message || 'ไม่สามารถแก้ไขประกาศงานได้' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const jobId = parseInt(idStr, 10);

    const body = await request.json().catch(() => ({}));
    const teacherPin = body.teacherPin || request.headers.get('x-teacher-pin') || '';

    if (!(await verifyTeacherPin(teacherPin))) {
      return NextResponse.json(
        { error: 'รหัส PIN สำหรับอาจารย์ไม่ถูกต้อง' },
        { status: 403 }
      );
    }

    const deleted = await deleteJob(jobId);
    if (!deleted) {
      return NextResponse.json({ error: 'ไม่พบประกาศงานนี้' }, { status: 404 });
    }

    return NextResponse.json({ message: 'ลบประกาศงานเรียบร้อยแล้ว', id: jobId });
  } catch (error: any) {
    console.error('DELETE /api/jobs/[id] error:', error);
    return NextResponse.json(
      { error: error?.message || 'ไม่สามารถลบประกาศงานได้' },
      { status: 500 }
    );
  }
}
