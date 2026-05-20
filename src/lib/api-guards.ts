import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function requireAdmin() {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: '未登录' }, { status: 401 }) };
  }
  if (session.user.role !== 'ADMIN') {
    return { error: NextResponse.json({ error: '需要管理员权限' }, { status: 403 }) };
  }
  return { session };
}

export async function requireCaptain() {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: '未登录' }, { status: 401 }) };
  }
  if (session.user.role !== 'CAPTAIN' || !session.user.teamId) {
    return { error: NextResponse.json({ error: '需要队长账号' }, { status: 403 }) };
  }
  return { session };
}
