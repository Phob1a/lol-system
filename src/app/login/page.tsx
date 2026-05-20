import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getSession } from '@/lib/auth';
import { LoginForm } from '@/components/auth/LoginForm';
import { AuthCard } from '@/components/auth/AuthCard';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect('/');

  return (
    <Suspense>
      <AuthCard title="登录">
        <LoginForm />
      </AuthCard>
    </Suspense>
  );
}
