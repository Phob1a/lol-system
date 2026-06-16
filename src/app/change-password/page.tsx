import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm';
import { AuthCard } from '@/components/auth/AuthCard';

export const dynamic = 'force-dynamic';

export default async function ChangePasswordPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <AuthCard title="修改密码" description="首次登录需修改初始密码">
      <ChangePasswordForm />
    </AuthCard>
  );
}
