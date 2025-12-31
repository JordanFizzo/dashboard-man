import { NextResponse } from 'next/server';
import { saveUpload, getLatestUpload } from '../../../../lib/db';

export async function GET() {
  try {
    const data = await getLatestUpload();
    if (!data) return NextResponse.json({ rows: [] });
    return NextResponse.json({ rows: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'DB not configured' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) return NextResponse.json({ message: 'No rows provided' }, { status: 400 });
    const res = await saveUpload(rows);
    return NextResponse.json({ ok: true, id: res.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'DB not configured' }, { status: 500 });
  }
}
