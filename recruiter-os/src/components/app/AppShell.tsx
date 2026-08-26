'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '../ui/icons';
import { Avatar, cx } from '../ui';
import { ToastProvider } from '../ui/Toast';
import { CommandMenu } from './CommandMenu';
import { QuickCreate } from './QuickCreate';
import { api } from '@/lib/client/api';

export interface ShellUser {
  name: string;
  email: string;
  orgName: string;
}

const NAV = [
  { href: '/dashboard', label: 'ראשי', icon: Icon.Home },
  { href: '/candidates', label: 'מועמדים', icon: Icon.Users },
  { href: '/jobs', label: 'משרות', icon: Icon.Briefcase },
  { href: '/clients', label: 'לקוחות', icon: Icon.Building },
  { href: '/pipeline', label: 'פייפליין', icon: Icon.Board },
  { href: '/tasks', label: 'משימות', icon: Icon.CheckSquare },
  { href: '/messages', label: 'תקשורת', icon: Icon.Chat },
  { href: '/money', label: 'כספים', icon: Icon.Money },
  { href: '/analytics', label: 'נתונים', icon: Icon.Chart },
  { href: '/assistant', label: 'עוזר AI', icon: Icon.Sparkles },
  { href: '/automations', label: 'אוטומציות', icon: Icon.Bolt },
];

/**
 * Application chrome: a persistent sidebar on desktop, a drawer on mobile, plus the
 * global command menu (⌘K) and quick-create dialogs that keep every action one or
 * two clicks away.
 */
export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [quickCreate, setQuickCreate] = useState<null | 'candidate' | 'job' | 'client' | 'task'>(null);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  async function logout() {
    await api.post('/api/auth/logout');
    router.push('/login');
    router.refresh();
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const sidebar = (
    <div className="flex h-full flex-col gap-1 p-3">
      <Link href="/dashboard" className="mb-3 flex items-center gap-2.5 px-2 py-1">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-brand-ink">
          <Icon.Target size={20} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">Recruiter OS</span>
          <span className="block truncate text-xs text-faint">{user.orgName}</span>
        </span>
      </Link>

      <nav className="flex-1 space-y-0.5">
        {NAV.map((item) => {
          const ItemIcon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition',
                isActive(item.href)
                  ? 'bg-brand-soft text-brand'
                  : 'text-muted hover:bg-line/40 hover:text-ink',
              )}
            >
              <ItemIcon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-0.5 border-t border-line pt-2">
        <Link
          href="/settings"
          className={cx(
            'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition',
            isActive('/settings') ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-line/40 hover:text-ink',
          )}
        >
          <Icon.Settings size={18} />
          הגדרות
        </Link>
        <div className="flex items-center gap-2 rounded-lg px-2.5 py-2">
          <Avatar name={user.name} size={30} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{user.name}</span>
            <span className="block truncate text-xs text-faint">{user.email}</span>
          </span>
          <button
            onClick={logout}
            aria-label="התנתקות"
            className="rounded-md p-1.5 text-muted transition hover:bg-line/50 hover:text-danger"
          >
            <Icon.Logout size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <ToastProvider>
      <div className="min-h-screen bg-bg">
        <aside className="fixed inset-y-0 right-0 hidden w-60 border-l border-line bg-surface lg:block">
          {sidebar}
        </aside>

        {drawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              className="absolute inset-0 bg-black/40"
              onClick={() => setDrawerOpen(false)}
              aria-label="סגירת תפריט"
            />
            <div className="absolute inset-y-0 right-0 w-64 bg-surface shadow-pop">{sidebar}</div>
          </div>
        )}

        <div className="lg:mr-60">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/85 px-3 backdrop-blur sm:px-5">
            <button
              onClick={() => setDrawerOpen(true)}
              className="rounded-lg p-2 text-muted hover:bg-line/50 lg:hidden"
              aria-label="פתיחת תפריט"
            >
              <Icon.Menu />
            </button>

            <button
              onClick={() => setCommandOpen(true)}
              className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-line bg-bg px-3 text-sm text-faint transition hover:border-brand/40 sm:max-w-md"
            >
              <Icon.Search size={16} />
              <span className="flex-1 text-right">חיפוש מועמד, משרה, לקוח…</span>
              <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[10px] text-faint sm:inline">
                ⌘K
              </kbd>
            </button>

            <div className="flex items-center gap-1.5">
              <QuickActionsMenu onPick={setQuickCreate} />
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1400px] px-3 py-4 sm:px-5 sm:py-6">{children}</main>
        </div>

        <CommandMenu open={commandOpen} onClose={() => setCommandOpen(false)} onCreate={setQuickCreate} />
        <QuickCreate kind={quickCreate} onClose={() => setQuickCreate(null)} />
      </div>
    </ToastProvider>
  );
}

function QuickActionsMenu({ onPick }: { onPick: (kind: 'candidate' | 'job' | 'client' | 'task') => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  const items = [
    { key: 'candidate' as const, label: 'מועמד חדש', icon: Icon.Users },
    { key: 'job' as const, label: 'משרה חדשה', icon: Icon.Briefcase },
    { key: 'client' as const, label: 'לקוח חדש', icon: Icon.Building },
    { key: 'task' as const, label: 'משימה חדשה', icon: Icon.CheckSquare },
  ];

  return (
    <div className="relative" onClick={(event) => event.stopPropagation()}>
      <button
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-medium text-brand-ink transition hover:brightness-110"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon.Plus size={16} />
        <span className="hidden sm:inline">חדש</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-11 z-40 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-pop"
        >
          {items.map((item) => {
            const ItemIcon = item.icon;
            return (
              <button
                key={item.key}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onPick(item.key);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-right text-sm text-ink transition hover:bg-brand-soft"
              >
                <ItemIcon size={16} />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
