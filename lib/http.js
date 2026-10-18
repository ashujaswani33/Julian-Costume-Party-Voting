import { NextResponse } from 'next/server';

export function json(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });
}

export function safeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 50);
}
