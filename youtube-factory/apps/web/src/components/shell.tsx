'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  BarChart3, CalendarDays, Coins, Factory, FileText, FlaskConical, Home, Lightbulb,
  LogOut, Menu, Plug, PlaySquare, Radio, Settings, Shield, Sparkles, Video, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppState } from './app-state';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const NAV = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/channels', label: 'Channels', icon: Radio },
  { href: '/ideas', label: 'Ideas', icon: Lightbulb },
  { href: '/production', label: 'Production', icon: Factory },
  { href: '/videos', label: 'Videos', icon: Video },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/costs', label: 'Costs', icon: Coins },
  { href: '/templates', label: 'Templates', icon: FileText },
  { href: '/prompts', label: 'Prompts', icon: FlaskConical },
  { href: '/providers', label: 'Providers', icon: Plug },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, channels, channelId, setChannelId, logout } = useAppState();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r bg-card transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <PlaySquare className="h-5 w-5 text-primary" aria-hidden />
            <span className="text-sm">Content Factory</span>
          </Link>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {channels.length > 0 ? (
          <div className="border-b p-3">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="channel-picker">
              Channel
            </label>
            <Select
              id="channel-picker"
              value={channelId ?? ''}
              onChange={(event) => setChannelId(event.target.value)}
            >
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                  {channel.enabled ? '' : ' (paused)'}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2 scrollbar-thin">
          {NAV.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                  active ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
          {user?.role === 'ADMIN' ? (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                pathname.startsWith('/admin')
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Shield className="h-4 w-4" aria-hidden />
              Admin
            </Link>
          ) : null}
        </nav>

        <div className="border-t p-3">
          <div className="mb-2 min-w-0">
            <p className="truncate text-sm font-medium">{user?.name ?? user?.email}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={() => void logout()}>
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Sign out
          </Button>
        </div>
      </aside>

      {open ? (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b bg-card px-4 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold">Content Factory</span>
        </header>
        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  badge,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {badge}
        </div>
        {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function NoChannel() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
      <Sparkles className="h-7 w-7 text-muted-foreground" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-medium">No channel selected</p>
        <p className="text-sm text-muted-foreground">Create a channel to start producing videos.</p>
      </div>
      <Button asChild size="sm">
        <Link href="/channels">Go to channels</Link>
      </Button>
    </div>
  );
}

export function BudgetChip({ level, utilisation }: { level: string; utilisation: number }) {
  const variant = level === 'exceeded' ? 'destructive' : level === 'critical' || level === 'warning' ? 'warning' : 'success';
  return <Badge variant={variant}>{Math.round(utilisation * 100)}% of budget</Badge>;
}
