import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function AuthCard({
  title,
  description,
  children,
  centered = true,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  centered?: boolean;
}) {
  const card = (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );

  if (!centered) return card;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      {card}
    </div>
  );
}
