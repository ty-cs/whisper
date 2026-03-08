import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import Link from 'next/link';
import { Toaster } from 'sonner';
import { Providers } from '@/components/providers';
import { ServerStatus } from '@/components/server-status';

const jetBrainsMono = JetBrains_Mono({
  weight: ['400', '700', '800'],
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'WHISPER | Anonymous E2EE secret sharing',
  description: 'End-to-End Encrypted Secrets.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${jetBrainsMono.variable} font-mono antialiased flex flex-col items-center p-4 sm:p-8 bg-[var(--background)] text-[var(--foreground)]`}>
        <Providers>
          <div className="w-full max-w-5xl my-4 sm:my-8 flex flex-col border border-[var(--border)] min-h-[calc(100vh-4rem)] relative z-10 bg-[var(--background)]/90 shadow-2xl shadow-black/50 animate-fade-in-up rounded-none">
            <header className="w-full border-b border-[var(--border)] p-4 sm:p-8 flex flex-col sm:flex-row justify-between items-center text-center sm:text-left gap-1 sm:gap-4 bg-[var(--background)]">
              <Link
                href="/"
                className="hover:bg-(--foreground) hover:text-[#050505] transition-colors px-3 py-2 sm:-ml-3 select-none group">
                <h1 className="text-xl sm:text-2xl font-bold tracking-widest uppercase">
                  whisper
                  <span className="animate-blink inline-block translate-y-1 ml-2 w-3 h-6 bg-[var(--foreground)] group-hover:bg-[#050505]"></span>
                </h1>
              </Link>
              <div className="flex items-center cursor-default">
                <p className="tracking-[0.25em] text-[var(--muted-fg)] uppercase text-[10px] sm:text-xs font-medium opacity-60 select-none">
                  ANONYMOUS &amp; SECURE
                </p>
              </div>
            </header>

            <main className="w-full flex-1 flex flex-col p-4 sm:p-8 overflow-y-auto animate-fade-in-up delay-100">
              {children}
            </main>

            <footer className="w-full border-t border-[var(--muted)] p-4 sm:p-8 text-center sm:text-left flex flex-col sm:flex-row justify-between items-center text-[var(--muted-fg)] bg-[var(--background)] animate-fade-in-up delay-200">
              <ServerStatus />
              <p className="text-xs mt-2 sm:mt-0 tracking-widest uppercase">
                E2EE · ZERO KNOWLEDGE
              </p>
            </footer>
          </div>
          <Toaster
            position="bottom-right"
            toastOptions={{
              unstyled: true,
              classNames: {
                toast:
                  'flex items-center gap-3 w-full bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-mono text-xs sm:text-sm tracking-widest uppercase p-4 sm:p-5 rounded-none shadow-2xl shadow-black/50 border-l-4 border-l-[var(--foreground)] md:w-[350px]',
                title: 'font-bold flex-1',
                description: 'text-[var(--muted-fg)] text-[10px]',
                icon: 'mr-2',
                success: '!border-l-green-500',
                error: '!border-l-red-500 text-red-500',
                warning: '!border-l-yellow-500',
                info: '!border-l-blue-500',
              },
            }}
          />
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
