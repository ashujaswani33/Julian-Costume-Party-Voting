import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, createAdminSession, passwordMatches } from '../../../../lib/adminAuth';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const { password } = await request.json();
    if (!passwordMatches(password)) {
      return NextResponse.json({ error: 'Incorrect admin password.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }

    const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(ADMIN_COOKIE, createAdminSession(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 12 * 60 * 60
    });
    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Could not sign in.' }, { status: 500 });
  }
}
