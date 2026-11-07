import { NextRequest, NextResponse } from 'next/server';
import { cancelRegistration } from '@/lib/db';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const regId = parseInt(idStr, 10);

    const body = await request.json().catch(() => ({}));
    const { studentId, teacherPin } = body;

    await cancelRegistration(regId, { studentId, teacherPin });

    return NextResponse.json({
      message: 'ถอนชื่อจากการลงทะเบียนเรียบร้อยแล้ว',
      id: regId,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'ไม่สามารถยกเลิกการลงทะเบียนได้' },
      { status: 400 }
    );
  }
}
