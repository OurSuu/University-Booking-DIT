import { NextRequest, NextResponse } from 'next/server';
import { deleteTeacherPin } from '@/lib/db';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const pinId = parseInt(idStr, 10);

    const body = await request.json().catch(() => ({}));
    const masterPin =
      body.masterPin ||
      request.headers.get('x-master-pin') ||
      request.headers.get('x-teacher-pin') ||
      '';

    await deleteTeacherPin(masterPin, pinId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'ไม่สามารถลบรหัส PIN ได้' },
      { status: 400 }
    );
  }
}
