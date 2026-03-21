"use client";

import { ReactNode, useState } from "react";

export default function FoldSection({
  title,
  subtitle,
  children,
  defaultOpen = true,
  className = ""
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`panel fold-panel ${open ? "open" : "closed"} ${className}`.trim()}>
      <header className="panel-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="fold-toggle" onClick={() => setOpen((prev) => !prev)}>
          {open ? "הסתר" : "הצג"}
        </button>
      </header>
      <div className="panel-body" aria-hidden={!open}>
        {children}
      </div>
    </section>
  );
}
