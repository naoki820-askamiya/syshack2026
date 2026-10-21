import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** Native disclosure keeps every detail available to keyboard and screen-reader users. */
export function ReadingDisclosure({ title, children, compact = false }: {
  title: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <details className={`reading-disclosure group rounded-xl border border-[#D9E1EA] ${compact ? 'mt-4 bg-[#F7F9FC]' : 'bg-white shadow-sm'}`}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl p-4 font-semibold text-[#0F4C81] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C81]">
        {title}<ChevronDown aria-hidden="true" className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-[#D9E1EA] p-4">{children}</div>
    </details>
  );
}
