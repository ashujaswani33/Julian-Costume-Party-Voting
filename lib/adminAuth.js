import 'server-only';
import crypto from 'crypto';
import { cookies } from 'next/headers';

export const ADMIN_COOKIE = 'costume_party_admin';
const SESSION_MS = 12 * 60 * 60 * 1000;

function secret() {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (!value) throw new Error('Missing ADMIN_SESSION_SECRET.');
  return value;
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('hex');
}

export function createAdminSession() {
  const expires = String(Date.now() + SESSION_MS);
  return `${expires}.${sign(expires)}`;
}

export function verifyAdminSession(token) {
  if (!token || typeof token !== 'string') return false;
  const [expires, signature] = token.split('.');
  if (!expires || !signature || !/^\d+$/.test(expires)) return false;
  if (Number(expires) < Date.now()) return false;

  const expected = sign(expires);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function isAdminRequest() {
  const store = await cookies();
  return verifyAdminSession(store.get(ADMIN_COOKIE)?.value);
}

export function passwordMatches(value) {
  const expected = process.env.ADMIN_PASSWORD || '';
  const supplied = typeof value === 'string' ? value : '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (!expected || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
