/** Presentation helpers shared by server and client components (no Node APIs). */

export function formatMoney(value: number | null | undefined, currency = '₪'): string {
  if (value == null) return '—';
  return `${currency}${Math.round(value).toLocaleString('he-IL')}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('he-IL');
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

/** "לפני 3 שעות" / "מחר" — the phrasing a person actually reads. */
export function relativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  const past = diffMs < 0;

  if (minutes < 1) return 'עכשיו';
  if (minutes < 60) return past ? `לפני ${minutes} דק׳` : `בעוד ${minutes} דק׳`;
  if (hours < 24) return past ? `לפני ${hours} שע׳` : `בעוד ${hours} שע׳`;
  if (days === 1) return past ? 'אתמול' : 'מחר';
  if (days < 30) return past ? `לפני ${days} ימים` : `בעוד ${days} ימים`;
  return formatDate(value);
}

export function salaryRange(
  min: number | null | undefined,
  max: number | null | undefined,
  period = 'month',
): string {
  const unit = period === 'hour' ? '/שעה' : period === 'year' ? '/שנה' : '/חודש';
  if (min && max && min !== max) return `${formatMoney(min)}–${formatMoney(max)}${unit}`;
  if (max || min) return `${formatMoney(max ?? min)}${unit}`;
  return '—';
}

/** Turns a stored E.164 number back into the local form Israelis expect to see. */
export function displayPhone(value: string | null | undefined): string {
  if (!value) return '—';
  if (value.startsWith('+972')) {
    const local = `0${value.slice(4)}`;
    return local.replace(/^(\d{2,3})(\d{3})(\d{4})$/, '$1-$2-$3');
  }
  return value;
}

export function whatsappHref(phone: string | null | undefined, text?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.length < 9) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('') || '?';
}
