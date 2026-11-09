import { NextRequest, NextResponse } from 'next/server';
import { getTeacherByPin } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const pinOrPassword = (body.password || body.pin || '').trim();

    const teacher = await getTeacherByPin(pinOrPassword);
    if (teacher) {
      return NextResponse.json({
        valid: true,
        role: teacher.role,
        teacher_name: teacher.teacher_name,
      });
    }

    return NextResponse.json(
      { valid: false, error: 'รหัสผ่านสำหรับอาจารย์ไม่ถูกต้อง' },
      { status: 403 }
    );
  } catch {
    return NextResponse.json(
      { valid: false, error: 'เกิดข้อผิดพลาดในการตรวจสอบรหัสผ่าน' },
      { status: 500 }
    );
  }
}
