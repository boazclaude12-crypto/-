'use client';

import { useEffect } from 'react';

/**
 * Catches a failure while rendering a page, so it costs a retry rather than the session.
 *
 * The default is a bare error screen with no way back, which for someone mid-task is
 * indistinguishable from the app breaking for good. Most failures here are transient —
 * a query that lost its connection, a moment of contention on the database — and simply
 * trying again works. The message says what to do; the details stay in the console,
 * because a stack trace on screen tells the reader nothing and looks like a crash.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[recruiter-os] שגיאה בטעינת הדף:', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-lg font-semibold text-ink">הדף הזה לא נטען</h1>
      <p className="mt-2 text-sm text-muted">
        לרוב זו תקלה רגעית וניסיון נוסף פותר אותה. הנתונים שלך לא נפגעו.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          onClick={reset}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-ink transition hover:opacity-90"
        >
          נסה שוב
        </button>
        <a
          href="/status"
          className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted transition hover:text-ink"
        >
          בדוק את מצב המערכת
        </a>
      </div>
      {error.digest ? <p className="mt-6 text-xs text-faint">מזהה תקלה: {error.digest}</p> : null}
    </div>
  );
}
