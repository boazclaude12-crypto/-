/**
 * Shown the instant a navigation starts, until the page's own data arrives.
 *
 * Every page here is rendered per request, so a click costs a round trip to the server
 * before anything can change on screen. Without this file that round trip is silent —
 * the old page just sits there, unchanged, and the honest conclusion for anyone using
 * it is that the click did not register. They click again, and the app feels stuck
 * even though the server answered in forty milliseconds.
 *
 * A skeleton removes the ambiguity: the frame appears immediately and the content fills
 * in. Nothing here is slower than before; it just stops pretending nothing is happening.
 */
export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">טוען…</span>

      <div className="space-y-2">
        <Bar className="h-7 w-52" />
        <Bar className="h-4 w-72" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="rounded-xl border border-line bg-surface p-4">
            <Bar className="h-3.5 w-20" />
            <Bar className="mt-3 h-7 w-16" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-line bg-surface">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div key={index} className="flex items-center gap-3 border-b border-line p-4 last:border-b-0">
            <Bar className="h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Bar className="h-4 w-40 max-w-full" />
              <Bar className="h-3 w-64 max-w-full" />
            </div>
            <Bar className="hidden h-6 w-16 shrink-0 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-line/70 ${className}`} />;
}
