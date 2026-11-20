/** Stack of short-lived notifications in the bottom-right corner. */
export default function Toasts({ toasts, onDismiss }) {
  const styles = {
    success: 'bg-emerald-600',
    error: 'bg-rose-600',
    info: 'bg-slate-800',
  };
  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`${styles[t.kind] || styles.info} flex gap-2 rounded-lg px-4 py-3 text-sm text-white shadow-lg`}>
          <span className="flex-1">{t.message}</span>
          <button className="opacity-70 hover:opacity-100" onClick={() => onDismiss(t.id)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
