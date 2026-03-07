
import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';
import Link from 'next/link';

const jetBrainsMono = JetBrains_Mono({
  weight: ['400', '700', '800'],
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'WHISPER // E2EE TERMINAL',
  description: 'Burn after reading.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${jetBrainsMono.variable} font-mono antialiased min-h-screen flex flex-col items-center p-4 sm:p-8 bg-[var(--background)] text-[var(--foreground)]`}
      >
        <div className="w-full max-w-5xl flex flex-col border border-[var(--border)] min-h-[calc(100vh-4rem)] relative z-10 bg-[var(--background)]/90 shadow-2xl shadow-black/50 animate-fade-in-up">
          <header className="w-full border-b border-[var(--border)] p-4 sm:p-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--background)]">
            <Link href="/" className="hover:bg-[var(--foreground)] hover:text-[#050505] transition-colors px-3 py-2 -ml-3 select-none group">
              <h1 className="text-xl sm:text-2xl font-bold tracking-widest uppercase">
                WHISPER_CORE_V1<span className="animate-blink inline-block translate-y-1 ml-2 w-3 h-6 bg-[var(--foreground)] group-hover:bg-[#050505]"></span>
              </h1>
            </Link>
            <div className="text-sm font-bold tracking-widest text-(--muted-fg) uppercase">
              // NO LOGS. NO TRACE.
            </div>
          </header>

          <main className="w-full flex-1 flex flex-col p-4 sm:p-10 overflow-y-auto animate-fade-in-up delay-100">
            {children}
          </main>

          <footer className="w-full border-t border-[var(--muted)] p-4 sm:p-6 text-center sm:text-left flex flex-col sm:flex-row justify-between items-center text-[var(--muted-fg)] bg-[var(--background)] animate-fade-in-up delay-200">
            <p className="text-xs uppercase tracking-widest">STATUS: <span className="text-[var(--foreground)]">ONLINE ⚡️</span></p>
            <p className="text-xs mt-2 sm:mt-0 tracking-widest uppercase">BURN AFTER READING</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
