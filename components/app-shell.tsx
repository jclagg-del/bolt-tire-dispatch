import Link from 'next/link';
import { CalendarDays, ClipboardList, DollarSign, Route, Users } from 'lucide-react';
import { ReactNode } from 'react';

const nav = [
  { href: '/', label: 'Dashboard', icon: ClipboardList },
  { href: '/jobs', label: 'Jobs', icon: ClipboardList },
  { href: '/schedule', label: 'Schedule', icon: CalendarDays },
  { href: '/route', label: 'Route', icon: Route },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/billing', label: 'Billing', icon: DollarSign },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-4 py-6 md:grid-cols-[240px_1fr]">
      <aside className="card h-fit p-4">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Bolt Tire</p>
          <h1 className="mt-2 text-2xl font-semibold">Dispatch</h1>
        </div>
        <nav className="space-y-2">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-sm text-slate-200 hover:border-line hover:bg-slate-900/60"
              >
                <Icon className="h-4 w-4 text-accent" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="space-y-6">{children}</main>
    </div>
  );
}
