import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>页面不存在</CardTitle>
          <CardDescription>请检查链接是否正确。</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/">回到首页</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
