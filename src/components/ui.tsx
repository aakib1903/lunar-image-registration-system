"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function LogoMark({ size = 36 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 42 42" fill="none" aria-hidden="true"><path d="M28.4 5.8A16.4 16.4 0 1 0 36 25.9 14.1 14.1 0 0 1 28.4 5.8Z" fill="currentColor"/><path d="M6 31.3C-3 33.8 4.8 18.8 19 10.9 31.6 3.8 43 3.9 36.8 12.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="36.4" cy="12.9" r="2" fill="currentColor"/></svg>;
}

export function Modal({ title, eyebrow, children, onClose, className = "", busy = false }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void; className?: string; busy?: boolean }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => { closeRef.current = onClose; busyRef.current = busy; }, [onClose, busy]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      const target = ref.current?.querySelector<HTMLElement>("[data-autofocus], input, textarea, button");
      target?.focus();
    });
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyRef.current) closeRef.current();
      if (event.key === "Tab" && ref.current) {
        const elements = Array.from(ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')).filter((element) => element.offsetParent !== null);
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && (document.activeElement === first || !ref.current.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", handleKey); document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><div ref={ref} className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <div className="modal-header"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2 id={titleId}>{title}</h2></div><button className="icon-button modal-close" onClick={onClose} disabled={busy} aria-label="Close dialog"><X size={19}/></button></div>
    {children}
  </div></div>;
}

export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
