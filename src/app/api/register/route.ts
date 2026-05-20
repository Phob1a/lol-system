import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { RegistrationError } from '@/lib/registration/errors';
import { PublicRegistrationInput } from '@/lib/registration/registration-schema';
import { submitPublicRegistration } from '@/lib/registration/registration-service';

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = PublicRegistrationInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? '请求参数错误' },
      { status: 400 },
    );
  }

  try {
    const registration = await submitPublicRegistration(prisma, parsed.data);
    return NextResponse.json({ registration }, { status: 201 });
  } catch (e) {
    if (e instanceof RegistrationError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }
    console.error('POST /api/register failed', e);
    return NextResponse.json({ error: '报名失败' }, { status: 500 });
  }
}
