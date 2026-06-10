"use client";

import { useState } from "react";

export default function AccordionSection({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="bg-white border border-slate-200 shadow-sm rounded-3xl mb-8 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-6 p-8 text-left hover:bg-slate-50 transition"
      >
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>

          {description && (
            <p className="text-slate-500 mt-2 leading-7">{description}</p>
          )}
        </div>

        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl font-bold text-slate-600">
          {open ? "−" : "+"}
        </div>
      </button>

      {open && <div className="px-8 pb-8">{children}</div>}
    </section>
  );
}