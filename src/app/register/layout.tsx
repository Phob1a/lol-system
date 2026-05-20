export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-6 text-2xl font-bold">赛事报名</h1>
      {children}
    </main>
  );
}
