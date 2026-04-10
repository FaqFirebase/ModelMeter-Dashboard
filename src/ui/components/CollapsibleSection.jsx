import { useState, useCallback, useRef, useEffect, useId } from 'react';

const DEFAULT_ANIMATION_DURATION = 200;

/**
 * CollapsibleSection - Accessible collapsible container
 *
 * Props:
 *   title        (string)   - Section header text
 *   defaultOpen  (boolean)  - Initial open state (default: false)
 *   isOpen       (boolean|undefined) - Controlled open state
 *   onToggle     (function|undefined) - Controlled toggle callback
 *   className    (string)   - Additional classes for outer wrapper
 *   contentClass (string)   - Additional classes for content area
 *   badge        (ReactNode|undefined) - Optional badge next to title
 *   children     (ReactNode) - Collapsible content
 */
export default function CollapsibleSection({
  title,
  defaultOpen = false,
  isOpen: controlledOpen,
  onToggle,
  className = '',
  contentClass = '',
  badge,
  children,
}) {
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = isControlled ? controlledOpen : internalOpen;

  const contentRef = useRef(null);
  const [height, setHeight] = useState(open ? 'auto' : '0px');
  const id = useId();
  const panelId = `collapsible-panel-${id}`;
  const triggerId = `collapsible-trigger-${id}`;

  const handleToggle = useCallback(() => {
    const next = !open;
    if (!isControlled) setInternalOpen(next);
    if (onToggle) onToggle(next);
  }, [open, isControlled, onToggle]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  }, [handleToggle]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    if (open) {
      const fullHeight = el.scrollHeight;
      setHeight(`${fullHeight}px`);
      const timer = setTimeout(() => setHeight('auto'), DEFAULT_ANIMATION_DURATION);
      return () => clearTimeout(timer);
    } else {
      if (height === 'auto') {
        setHeight(`${el.scrollHeight}px`);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setHeight('0px'));
        });
      } else {
        setHeight('0px');
      }
    }
  }, [open]);

  return (
    <div className={className}>
      <button
        id={triggerId}
        role="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 shrink-0 cursor-pointer select-none hover:text-slate-400 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-violet-500/50 rounded px-1 -ml-1"
      >
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-90' : 'rotate-0'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span>{title}</span>
        {badge}
      </button>

      <div
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        ref={contentRef}
        style={{
          height,
          overflow: 'hidden',
          transition: `height ${DEFAULT_ANIMATION_DURATION}ms ease`,
        }}
      >
        <div className={contentClass}>
          {children}
        </div>
      </div>
    </div>
  );
}
