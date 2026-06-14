import { redirect } from 'next/navigation';

// Merged into /admin/tournament — redirect for backwards compat.
export default function AdminSeasonPage() {
  redirect('/admin/tournament');
}
