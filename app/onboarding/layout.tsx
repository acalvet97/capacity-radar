export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center px-8 py-5 border-b border-border">
        <span className="text-base font-semibold tracking-tight">Klira</span>
      </header>
      <main className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-2xl">{children}</div>
      </main>
    </div>
  );
}
