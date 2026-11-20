import { useEffect, useMemo, useRef, useState } from 'react';

const KEY_RE = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;

/**
 * Searchable dropdown of assigned tickets.
 * Type to filter by key or summary; ↑/↓ + Enter to pick; Esc to close.
 * Typing a full key (e.g. "OPS-42") that is not in the list offers a lookup,
 * so you can also log time on tickets you are not assigned to.
 */
export default function TicketPicker({ tickets, value, onChange, onLookup, onRefresh, loading, disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [lookupBusy, setLookupBusy] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tickets;
    const terms = q.split(/\s+/);
    return tickets.filter((t) => {
      const hay = `${t.key} ${t.summary} ${t.status}`.toLowerCase();
      return terms.every((term) => hay.includes(term));
    });
  }, [tickets, query]);

  const canLookup = KEY_RE.test(query.trim()) && !tickets.some((t) => t.key.toLowerCase() === query.trim().toLowerCase());
  const optionCount = filtered.length + (canLookup ? 1 : 0);

  useEffect(() => setActive(0), [query]);

  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function choose(ticket) {
    onChange(ticket);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  }

  async function lookup() {
    setLookupBusy(true);
    try {
      const t = await onLookup(query.trim().toUpperCase());
      if (t) choose(t);
    } finally {
      setLookupBusy(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(optionCount - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active < filtered.length) filtered[active] && choose(filtered[active]);
      else if (canLookup) lookup();
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const display = open ? query : value ? `${value.key} — ${value.summary}` : '';

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          className="input"
          placeholder={loading ? 'Loading tickets…' : 'Search tickets by key or summary…'}
          value={display}
          disabled={disabled}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls="ticket-listbox"
        />
        <button className="btn-ghost shrink-0" onClick={onRefresh} disabled={loading} title="Reload assigned tickets">
          <span className={loading ? 'animate-spin' : ''}>↻</span>
        </button>
      </div>

      {disabled && (
        <p className="mt-1 text-xs text-slate-500">Log or discard the tracked time to switch tickets.</p>
      )}

      {open && !disabled && (
        <ul
          id="ticket-listbox"
          ref={listRef}
          role="listbox"
          // preventDefault keeps focus in the input so onBlur doesn't close the list before the click lands
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {filtered.map((t, i) => (
            <li
              key={t.id}
              data-index={i}
              role="option"
              aria-selected={value?.id === t.id}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(t)}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === active ? 'bg-sky-50 dark:bg-sky-950' : ''
              } ${value?.id === t.id ? 'font-semibold' : ''}`}
            >
              <div className="flex items-baseline gap-2">
                <span className="shrink-0 font-mono text-sky-700 dark:text-sky-400">{t.key}</span>
                <span className="truncate">{t.summary}</span>
                {t.status && (
                  <span className="ml-auto shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500 dark:bg-slate-800">
                    {t.status}
                  </span>
                )}
              </div>
            </li>
          ))}
          {canLookup && (
            <li
              data-index={filtered.length}
              role="option"
              aria-selected={false}
              onMouseEnter={() => setActive(filtered.length)}
              onClick={lookup}
              className={`cursor-pointer px-3 py-2 text-sm text-sky-700 dark:text-sky-400 ${
                active === filtered.length ? 'bg-sky-50 dark:bg-sky-950' : ''
              }`}
            >
              {lookupBusy ? 'Looking up…' : `Look up ${query.trim().toUpperCase()} in Jira`}
            </li>
          )}
          {optionCount === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">
              {tickets.length ? 'No matching tickets. Type a full key (e.g. ABC-123) to look one up.' : 'No assigned open tickets.'}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
