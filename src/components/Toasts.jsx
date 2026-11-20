/** Short-lived notifications pinned to the bottom of the card. */
export default function Toasts({ toasts, onDismiss }) {
  const styles = { success: 'bg-emerald-600', error: 'bg-rose-600', info: 'bg-slate-800' };
  return (
    <div className="pointer-events-none fixed inset-x-2 bottom-2 z-50 mx-auto flex max-w-sm flex-col gap-1.5" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`${styles[t.kind] || styles.info} pointer-events-auto flex gap-2 rounded-lg px-3 py-2 text-xs text-white shadow-lg`}>
          <span className="flex-1">{t.message}</span>
          <button className="opacity-70 hover:opacity-100" onClick={() => onDismiss(t.id)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
