import Image from 'next/image';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm px-4">
        <div className="mb-8 flex justify-center">
          <Image
            src="/Klira-logo.svg"
            alt="Klira"
            width={86}
            height={40}
            priority
            className="dark:invert"
          />
        </div>
        {children}
      </div>
    </div>
  );
}
