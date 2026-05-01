import React, { useEffect, useRef, useState } from 'react';

/**
 * Click-to-edit text primitive used for worksheet topic titles and keyword
 * terms. Single source of truth for the inline-edit UX:
 *
 *   - Idle:     renders `children` (the read-only rendering of `value`).
 *   - Editing:  swaps to a controlled <input> seeded from the latest server
 *               value, autofocuses, selects all on entry.
 *   - Commit:   Enter or blur → fires onCommit(next). The parent decides
 *               whether to fire the network call. Empty values are
 *               rejected by default.
 *   - Cancel:   Escape reverts to the last server value.
 *
 * The component is purely presentational — it never owns the persisted
 * value. Parent passes `value` (server state); local input state lives
 * here only while editing.
 */
export interface InlineEditableProps {
  /** Current persisted value, fed in from props. */
  value: string;
  /** Fired with the trimmed new value when the user commits. The parent
   *  should suppress the call if `next === value`. */
  onCommit: (next: string) => void | Promise<void>;
  /** Optional placeholder shown when value is empty AND not editing. */
  placeholder?: string;
  /** Disabled state freezes the field; clicks do nothing. */
  disabled?: boolean;
  /** Render shape — `text` (default) or `multiline` for textarea-style. */
  variant?: 'text' | 'multiline';
  /** Non-empty values only by default. Set to true to allow blanks. */
  allowEmpty?: boolean;
  /** Tailwind classes for the read-only render. */
  className?: string;
  /** Tailwind classes for the editing input. */
  inputClassName?: string;
  /** Optional rendering override for the read-only state.
   *  Useful when the read-only display has bespoke chrome (e.g. chips). */
  children?: (display: string) => React.ReactNode;
}

export default function InlineEditable({
  value,
  onCommit,
  placeholder = 'Click to edit',
  disabled = false,
  variant = 'text',
  allowEmpty = false,
  className,
  inputClassName,
  children,
}: InlineEditableProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const committingRef = useRef(false);

  // Re-sync draft whenever the persisted value changes from outside (e.g.
  // server returned an updated topic structure). We ignore re-syncs while
  // the user is mid-edit — a server snapshot shouldn't clobber typing.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    if (inputRef.current && 'select' in inputRef.current) {
      try {
        inputRef.current.select();
      } catch {
        /* select() unsupported on some textareas — no-op */
      }
    }
  }, [editing]);

  const enter = () => {
    if (disabled) return;
    setDraft(value);
    setEditing(true);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const commit = async () => {
    if (committingRef.current) return;
    const next = draft.trim();
    if (!allowEmpty && !next) {
      cancel();
      return;
    }
    if (next === value) {
      setEditing(false);
      return;
    }
    committingRef.current = true;
    try {
      await onCommit(next);
    } finally {
      committingRef.current = false;
      setEditing(false);
    }
  };

  if (editing) {
    const sharedProps = {
      ref: inputRef as any,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft(e.target.value),
      onBlur: () => {
        // Allow microtask for any imperative cancel() to resolve.
        void commit();
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
        if (e.key === 'Enter' && variant === 'text') {
          e.preventDefault();
          void commit();
        }
        if (e.key === 'Enter' && variant === 'multiline' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void commit();
        }
      },
      placeholder,
      className: inputClassName,
    };
    return variant === 'multiline' ? (
      <textarea rows={2} {...sharedProps} />
    ) : (
      <input type="text" {...sharedProps} />
    );
  }

  const display = value || '';
  const content = children
    ? children(display || placeholder)
    : display || <span className="italic text-gray-400">{placeholder}</span>;

  return (
    <span
      role={disabled ? undefined : 'button'}
      tabIndex={disabled ? undefined : 0}
      onClick={disabled ? undefined : enter}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          enter();
        }
      }}
      className={className}
    >
      {content}
    </span>
  );
}
