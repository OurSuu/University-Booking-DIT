import { NextRequest, NextResponse } from 'next/server';
import { registerStudent } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      job_id,
      shift_id,
      student_id,
      student_name,
      faculty,
      scholarship_name,
    } = body;

    if (!job_id || !shift_id) {
      return NextResponse.json(
        { error: 'กรุณาเลือกงานและช่วงเวลาที่ต้องการลงทะเบียน' },
        { status: 400 }
      );
    }

    const result = await registerStudent({
      job_id: Number(job_id),
      shift_id: Number(shift_id),
      student_id: String(student_id || ''),
      student_name: String(student_name || ''),
      faculty: String(faculty || ''),
      scholarship_name: String(scholarship_name || ''),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'ไม่สามารถลงทะเบียนได้' },
      { status: 400 }
    );
  }
}
