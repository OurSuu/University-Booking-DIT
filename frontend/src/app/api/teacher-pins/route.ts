import { NextRequest, NextResponse } from 'next/server';
import { getAllTeacherPins, createTeacherPin } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const masterPin =
      request.headers.get('x-master-password') ||
      request.headers.get('x-master-pin') ||
      request.headers.get('x-teacher-pin') ||
      searchParams.get('masterPassword') ||
      searchParams.get('masterPin') ||
      '';

    const pins = await getAllTeacherPins(masterPin);
    return NextResponse.json(pins);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'ไม่สามารถดึงข้อมูลรหัสผ่านอาจารย์ได้' },
      { status: 403 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const masterPin = (body.masterPassword || body.masterPin || '').trim();
    const newPin = (body.newPassword || body.newPin || '').trim();
    const { teacher_name, role } = body;

    const created = await createTeacherPin(masterPin, {
      pin: newPin,
      teacher_name,
      role: role || 'teacher',
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'ไม่สามารถสร้างรหัสผ่านอาจารย์ได้' },
      { status: 400 }
    );
  }
}
