import { NextResponse } from 'next/server';
import { ADMIN_COOKIE } from '../../../../lib/adminAuth';

export const runtime = 'nodejs';

export async function POST() {
  const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}
