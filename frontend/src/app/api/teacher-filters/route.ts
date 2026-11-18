import { NextRequest, NextResponse } from 'next/server';
import {
  getHiddenTeacherFilters,
  updateHiddenTeacherFilter,
  verifyAdminPin,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const adminPin = request.headers.get('x-teacher-pin') || '';
    if (!(await verifyAdminPin(adminPin))) {
      return NextResponse.json(
        { error: 'ไม่มีสิทธิ์เข้าถึงข้อมูล (เฉพาะอาจารย์ผู้ดูแลระบบเท่านั้น)' },
        { status: 403 }
      );
    }

    const hiddenTeachers = await getHiddenTeacherFilters();
    return NextResponse.json({ hiddenTeachers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'ไม่สามารถดึงข้อมูลรายชื่ออาจารย์ที่ซ่อนได้';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      teacherPin?: string;
      action?: string;
      teacherName?: string;
    };
    const teacherPin = body.teacherPin || '';
    const action = body.action;
    if (action !== 'hide' && action !== 'restore' && action !== 'restore_all') {
      return NextResponse.json({ error: 'คำสั่งไม่ถูกต้อง' }, { status: 400 });
    }

    if (!(await verifyAdminPin(teacherPin))) {
      return NextResponse.json(
        { error: 'ไม่มีสิทธิ์เข้าถึง (เฉพาะอาจารย์ผู้ดูแลระบบเท่านั้น)' },
        { status: 403 }
      );
    }

    const hiddenTeachers = await updateHiddenTeacherFilter(
      teacherPin,
      action,
      body.teacherName
    );
    return NextResponse.json({ hiddenTeachers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'ไม่สามารถอัปเดตรายชื่อตัวกรองอาจารย์ได้';
    const status = message.includes('กรุณาระบุ') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
