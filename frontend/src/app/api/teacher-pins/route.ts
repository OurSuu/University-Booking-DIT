import { NextRequest, NextResponse } from 'next/server';
import { getAllTeacherPins, createTeacherPin } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const masterPin =
      request.headers.get('x-master-pin') ||
      request.headers.get('x-teacher-pin') ||
      searchParams.get('masterPin') ||
      '';

    const pins = await getAllTeacherPins(masterPin);
    return NextResponse.json(pins);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'ไม่สามารถดึงข้อมูลรหัส PIN ได้' },
      { status: 403 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { masterPin, newPin, teacher_name, role } = body;

    const created = await createTeacherPin(masterPin, {
      pin: newPin,
      teacher_name,
      role: role || 'teacher',
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'ไม่สามารถสร้างรหัส PIN ได้' },
      { status: 400 }
    );
  }
}
