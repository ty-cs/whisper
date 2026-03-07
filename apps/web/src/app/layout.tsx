import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';
import Link from 'next/link';
import { Providers } from '@/components/providers';
import { ServerStatus } from '@/components/server-status';

const jetBrainsMono = JetBrains_Mono({
  weight: ['400', '700', '800'],
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'WHISPER // E2EE TERMINAL',
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
        className={`${jetBrainsMono.variable} font-mono antialiased min-h-screen flex flex-col items-center p-4 sm:p-8 bg-[var(--background)] text-[var(--foreground)]`}>
        <Providers>
          <div className="w-full max-w-5xl my-4 sm:my-8 flex flex-col border border-[var(--border)] min-h-[calc(100vh-4rem)] relative z-10 bg-[var(--background)]/90 shadow-2xl shadow-black/50 animate-fade-in-up rounded-none">
            <header className="w-full border-b border-[var(--border)] p-4 sm:p-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--background)]">
              <Link
                href="/"
                className="hover:bg-[var(--foreground)] hover:text-[#050505] transition-colors px-3 py-2 -ml-3 select-none group">
                <h1 className="text-xl sm:text-2xl font-bold tracking-widest uppercase">
                  whisper
                  <span className="animate-blink inline-block translate-y-1 ml-2 w-3 h-6 bg-[var(--foreground)] group-hover:bg-[#050505]"></span>
                </h1>
              </Link>

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
        </Providers>
      </body>
    </html>
  );
}
