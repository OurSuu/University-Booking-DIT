import { NextRequest, NextResponse } from 'next/server';
import { updateMasterPin } from '@/lib/db';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const currentMaster = (body.currentMasterPassword || body.currentMasterPin || '').trim();
    const newMaster = (body.newMasterPassword || body.newMasterPin || '').trim();

    if (!currentMaster || !newMaster) {
      return NextResponse.json(
        { error: 'กรุณาระบุรหัสผ่าน Master ปัจจุบันและรหัสผ่านใหม่' },
        { status: 400 }
      );
    }

    const updated = await updateMasterPin(currentMaster, newMaster);
    return NextResponse.json({
      success: true,
      pin: updated.pin,
      teacher_name: updated.teacher_name,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'ไม่สามารถเปลี่ยนรหัส Master Password ได้' },
      { status: 400 }
    );
  }
}
