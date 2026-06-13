import Link from 'next/link';
import { ArrowRight, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  buildHomeEntries,
  getSeasonStatusText,
  type PublicHomeContext,
} from '@/lib/home/public-home';

type Props = {
  context: PublicHomeContext;
};

export function PublicHomePage({ context }: Props) {
  const entries = buildHomeEntries(context);
  const status = getSeasonStatusText(context);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">LoL 选人系统</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-foreground">
              {status.headline}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{status.description}</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/login">
              <LogIn className="mr-2 h-4 w-4" />
              登录
            </Link>
          </Button>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="公开入口">
          {entries.map((item) => {
            const isPrimary = item.emphasis === 'primary';
            return (
              <Link
                key={item.id}
                href={item.href}
                className={[
                  'group flex min-h-36 flex-col justify-between rounded-lg border p-4 transition-colors',
                  isPrimary
                    ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-card hover:bg-muted/50',
                  item.emphasis === 'muted' ? 'opacity-80' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span>
                  <span className="text-base font-semibold">{item.title}</span>
                  <span
                    className={[
                      'mt-2 block text-sm leading-6',
                      isPrimary ? 'text-primary-foreground/85' : 'text-muted-foreground',
                    ].join(' ')}
                  >
                    {item.description}
                  </span>
                </span>
                <span className="mt-4 inline-flex items-center text-sm font-medium">
                  进入
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}
