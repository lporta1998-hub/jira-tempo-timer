import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshIcon } from './Icons.jsx';

const KEY_RE = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;

/**
 * Searchable ticket picker. Type to filter by key or summary; ↑/↓ + Enter to pick; Esc to close.
 * Typing a full key (e.g. "OPS-42") that isn't in the list offers a lookup, so you can also log
 * time on tickets you aren't assigned to. The list is in the page flow (not a floating overlay),
 * so the menu bar popover grows to fit it.
 */
export default function TicketPicker({ tickets, value, onChange, onLookup, onRefresh, loading, disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [lookupBusy, setLookupBusy] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return tickets;
    return tickets.filter((t) => {
      const hay = `${t.key} ${t.summary} ${t.status}`.toLowerCase();
      return terms.every((term) => hay.includes(term));
    });
  }, [tickets, query]);

  const q = query.trim();
  const canLookup = KEY_RE.test(q) && !tickets.some((t) => t.key.toLowerCase() === q.toLowerCase());
  const optionCount = filtered.length + (canLookup ? 1 : 0);

  useEffect(() => setActive(0), [query]);
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
      const t = await onLookup(q.toUpperCase());
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
    } else if (e.key === 'Escape' && open) {
      e.preventDefault(); // keeps the popover itself from closing
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const display = open ? query : value ? `${value.key}  ${value.summary}` : '';

  return (
    <div className="min-w-0 flex-1">
      <input
        ref={inputRef}
        className="input truncate font-medium"
        placeholder={loading && !tickets.length ? 'Loading tickets…' : 'Pick a ticket…'}
        value={display}
        disabled={disabled}
        title={disabled ? 'Log or discard the tracked time to switch tickets' : value ? `${value.key}  ${value.summary}` : ''}
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

      {open && !disabled && (
        // preventDefault keeps focus in the input, so onBlur doesn't close the list before a click lands
        <div
          onMouseDown={(e) => e.preventDefault()}
          className="mt-1 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700"
        >
          <ul id="ticket-listbox" ref={listRef} role="listbox" className="max-h-56 overflow-auto py-1">
            {filtered.map((t, i) => (
              <li
                key={t.id}
                data-index={i}
                role="option"
                aria-selected={value?.id === t.id}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(t)}
                className={`flex cursor-pointer items-baseline gap-2 px-2.5 py-1.5 text-sm ${
                  i === active ? 'bg-sky-50 dark:bg-sky-950' : ''
                }`}
              >
                <span className="shrink-0 font-mono text-xs text-sky-700 dark:text-sky-400">{t.key}</span>
                <span className={`truncate ${value?.id === t.id ? 'font-semibold' : ''}`}>{t.summary}</span>
              </li>
            ))}
            {canLookup && (
              <li
                data-index={filtered.length}
                role="option"
                aria-selected={false}
                onMouseEnter={() => setActive(filtered.length)}
                onClick={lookup}
                className={`cursor-pointer px-2.5 py-1.5 text-sm text-sky-700 dark:text-sky-400 ${
                  active === filtered.length ? 'bg-sky-50 dark:bg-sky-950' : ''
                }`}
              >
                {lookupBusy ? 'Looking up…' : `Look up ${q.toUpperCase()}`}
              </li>
            )}
            {optionCount === 0 && (
              <li className="px-2.5 py-1.5 text-xs text-slate-500">
                {tickets.length ? 'No match. Type a full key (ABC-123) to look it up.' : 'No open tickets assigned to you.'}
              </li>
            )}
          </ul>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="flex w-full items-center gap-1.5 border-t border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <RefreshIcon spinning={loading} width={12} height={12} />
            {loading ? 'Refreshing…' : `${tickets.length} assigned · refresh`}
          </button>
        </div>
      )}
    </div>
  );
}
