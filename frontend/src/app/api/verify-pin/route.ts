import { NextRequest, NextResponse } from 'next/server';
import { verifyTeacherPin } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pin } = body;

    if (verifyTeacherPin(pin)) {
      return NextResponse.json({ valid: true });
    }

    return NextResponse.json(
      { valid: false, error: 'รหัส PIN อาจารย์ไม่ถูกต้อง' },
      { status: 403 }
    );
  } catch {
    return NextResponse.json(
      { valid: false, error: 'เกิดข้อผิดพลาดในการตรวจสอบ PIN' },
      { status: 500 }
    );
  }
}
