import type { ReactNode } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/kit/Button";
import { TextInput } from "@/components/kit/Form";
import { cn } from "@/lib/utils";

/**
 * Admin tables. Deliberately plainer than the public pages: this is a tool
 * for scanning many rows, so it is dense, and it scrolls sideways inside its
 * own box on a narrow screen rather than squeezing columns into nonsense.
 */

export function Table({ children, minWidth = 760 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto rounded-[15px] ring-1 ring-line-soft">
      <table style={{ minWidth }} className="w-full border-collapse text-left text-[14px]">
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap bg-oat px-4 py-2.5 font-display text-[12px] font-semibold text-ink-muted",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <td className={cn("border-t border-line-soft px-4 py-3 align-middle text-ink", className)}>
      {children}
    </td>
  );
}

export function SearchBox({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
}) {
  return (
    <label className="relative block w-full sm:w-72">
      <span className="sr-only">{label}</span>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
      />
      <TextInput
        type="search"
        value={value}
        placeholder={label}
        onChange={(event) => onChange(event.target.value)}
        className="pl-9"
      />
    </label>
  );
}

export function Pager({
  offset,
  total,
  pageSize = 50,
  onChange,
}: {
  offset: number;
  total: number;
  pageSize?: number;
  onChange: (offset: number) => void;
}) {
  if (total <= pageSize) return null;
  const to = Math.min(offset + pageSize, total);
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-[13px] text-ink-muted">
      <span data-numeric>
        {offset + 1}–{to} of {total}
      </span>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - pageSize))}
        >
          Previous
        </Button>
        <Button size="sm" variant="secondary" disabled={to >= total} onClick={() => onChange(to)}>
          Next
        </Button>
      </div>
    </div>
  );
}
