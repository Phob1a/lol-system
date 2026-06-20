import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getSession } from '@/lib/auth';
import { LoginForm } from '@/components/auth/LoginForm';
import { AuthCard } from '@/components/auth/AuthCard';
import { getPostAuthRedirect } from '@/lib/auth-landing';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect(
      getPostAuthRedirect({
        role: session.user.role,
        mustChangePwd: session.user.mustChangePwd,
      }),
    );
  }

  return (
    <Suspense>
      <AuthCard title="控制台登录" description="进入管理员或队长工作台。">
        <LoginForm />
      </AuthCard>
    </Suspense>
  );
}
