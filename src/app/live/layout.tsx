export default function LiveLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-7xl p-4">
      <h1 className="mb-4 text-xl font-bold">选秀直播</h1>
      {children}
    </main>
  );
}
