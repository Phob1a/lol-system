import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getSession } from '@/lib/auth';
import { LoginForm } from '@/components/auth/LoginForm.tactical';

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect('/');
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
