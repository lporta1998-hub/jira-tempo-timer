import { useEffect, useState } from 'react';

/**
 * Click once to arm ("Sure?"), click again within 3 s to confirm.
 * Used instead of window.confirm(), whose dialog would steal focus and
 * close the menu bar popover.
 */
export default function ConfirmButton({ onConfirm, children, armedLabel = 'Sure?', className = '', ...props }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="button"
      {...props}
      className={`${className} ${armed ? '!w-auto px-2 text-xs font-semibold !text-rose-600' : ''}`}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? armedLabel : children}
    </button>
  );
}
