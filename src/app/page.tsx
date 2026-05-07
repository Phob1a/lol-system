// Routing is handled by middleware which redirects '/' based on role.
// This component is rarely reached; it exists as a safety net.
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/login');
}
