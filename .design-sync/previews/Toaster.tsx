// `toast` comes from 'lol-system' (sonner is merged into the bundle via
// cfg.extraEntries) so it drives the SAME toast store as the shipped <Toaster>.
// duration:Infinity keeps the toast on screen for a static screenshot.
import { Toaster, toast } from 'lol-system';
import { useEffect } from 'react';

export function Default() {
  useEffect(() => {
    toast('Team registered', {
      description: 'Cloud Nine is confirmed for Group A.',
      duration: Infinity,
    });
  }, []);
  return <Toaster position="top-center" richColors />;
}
