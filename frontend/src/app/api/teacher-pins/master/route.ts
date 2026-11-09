import { NextRequest, NextResponse } from 'next/server';
import { updateMasterPin } from '@/lib/db';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { currentMasterPin, newMasterPin } = body;

    if (!currentMasterPin || !newMasterPin) {
      return NextResponse.json(
        { error: 'กรุณาระบุรหัส PIN ปัจจุบันและรหัสใหม่' },
        { status: 400 }
      );
    }

    const updated = await updateMasterPin(currentMasterPin, newMasterPin);
    return NextResponse.json({
      success: true,
      pin: updated.pin,
      teacher_name: updated.teacher_name,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'ไม่สามารถเปลี่ยนรหัส Master PIN ได้' },
      { status: 400 }
    );
  }
}
