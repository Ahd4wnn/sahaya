import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router";
import {
  BadgeCheck,
  BadgeIndianRupee,
  IdCard,
  ImageOff,
  LayoutDashboard,
  ScrollText,
  Shapes,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";

import { useAdminStats, type AdminStats } from "@/features/admin/queries";
import { cn } from "@/lib/utils";

/**
 * The admin panel's frame: a sidebar on desktop, a scrolling row of pills on
 * smaller screens. The two queues carry live counts, so an admin can see at a
 * glance whether anything is waiting on them.
 *
 * Reached only through RequireAuth role="admin", and every endpoint behind it
 * is require_admin -- the client guard is a courtesy, the server one the rule.
 */

const NAV: {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  count?: keyof Pick<AdminStats, "documents_pending" | "cutouts_failed">;
}[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/verification", label: "Verification", icon: BadgeCheck, count: "documents_pending" },
  { to: "/admin/photos", label: "Photos", icon: ImageOff, count: "cutouts_failed" },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/listings", label: "Listings", icon: IdCard },
  { to: "/admin/memberships", label: "Memberships", icon: BadgeIndianRupee },
  { to: "/admin/categories", label: "Categories", icon: Shapes },
  { to: "/admin/skills", label: "Skills", icon: Tags },
  { to: "/admin/log", label: "Audit log", icon: ScrollText },
];

export function AdminLayout() {
  const { data: stats } = useAdminStats();

  return (
    <div className="mx-auto w-full max-w-[1432px] px-4 pb-10 pt-6 sm:px-6 lg:grid lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-8 xl:px-10">
      <nav aria-label="Admin" className="lg:sticky lg:top-24 lg:self-start">
        <p className="hidden px-3 font-display text-[12px] font-semibold uppercase tracking-wide text-ink-faint lg:block">
          Admin
        </p>
        <ul className="scroll-x -mx-4 flex gap-1 px-4 pb-4 lg:mx-0 lg:mt-2 lg:flex-col lg:px-0 lg:pb-0">
          {NAV.map((item) => {
            const Icon = item.icon;
            const count = item.count ? (stats?.[item.count] ?? 0) : 0;
            return (
              <li key={item.to} className="shrink-0">
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      "flex h-10 items-center gap-2.5 whitespace-nowrap rounded-full px-3 text-[14px] transition-colors duration-150 lg:rounded-[12px]",
                      isActive
                        ? "bg-paper font-semibold text-ink"
                        : "text-ink-muted hover:bg-paper/60 hover:text-ink",
                    )
                  }
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {count > 0 && (
                    <span
                      data-numeric
                      className="grid h-5 min-w-5 place-items-center rounded-full bg-moss px-1.5 text-[11px] font-semibold text-on-moss"
                    >
                      {count}
                      <span className="sr-only"> waiting</span>
                    </span>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

export function AdminPage({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] font-bold tracking-[-0.02em] text-ink">{title}</h1>
          {subtitle && (
            <p className="mt-1 max-w-[66ch] text-[14px] leading-relaxed text-ink-muted">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </header>
      <div className="mt-6">{children}</div>
    </div>
  );
}
