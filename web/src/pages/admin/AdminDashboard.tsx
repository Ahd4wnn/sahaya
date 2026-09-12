import { Link } from "react-router";
import { ArrowRight, BadgeCheck, ImageOff, type LucideIcon } from "lucide-react";

import {
  SectionHeading,
  Skeleton,
  StatusPill,
  Surface,
  type PillTone,
} from "@/components/kit/Surface";
import { useAdminStats, useAuditLog } from "@/features/admin/queries";
import { rupees } from "@/lib/format";
import { ago } from "@/lib/time";
import { cn } from "@/lib/utils";
import { AdminPage } from "./AdminLayout";
import { actionLabel } from "./labels";

const HIRES: Record<string, { label: string; tone: PillTone }> = {
  pending: { label: "Waiting", tone: "warn" },
  accepted: { label: "Accepted", tone: "good" },
  completed: { label: "Completed", tone: "moss" },
  declined: { label: "Declined", tone: "neutral" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-[var(--radius-panel)] bg-paper p-5">
      <p className="text-[13px] font-medium text-ink-muted">{label}</p>
      <p
        data-numeric
        className="mt-1 font-display text-[30px] font-bold leading-tight tracking-[-0.02em] text-ink"
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[12px] text-ink-faint">{sub}</p>}
    </div>
  );
}

function Queue({
  to,
  icon: Icon,
  label,
  count,
  empty,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  count: number;
  empty: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-4 rounded-[var(--radius-panel)] bg-paper p-5 ring-1 ring-transparent transition-shadow duration-200 hover:ring-line"
    >
      <span
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-full",
          count ? "bg-moss text-on-moss" : "bg-oat text-ink-faint",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[16px] font-semibold text-ink">{label}</p>
        <p className="text-[13px] text-ink-muted">{count ? `${count} waiting` : empty}</p>
      </div>
      <ArrowRight
        className="size-4 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}

export function AdminDashboard() {
  const { data: stats } = useAdminStats();
  const log = useAuditLog(8);

  return (
    <AdminPage title="Dashboard" subtitle="How Sahaya is doing today, and what is waiting on you.">
      {!stats ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-[var(--radius-panel)]" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile
              label="Paying members"
              value={stats.paying_members}
              sub={stats.comped_members ? `plus ${stats.comped_members} complimentary` : undefined}
            />
            <Tile
              label="Monthly revenue"
              value={`₹${rupees(stats.monthly_revenue_paise)}`}
              sub="from active paid memberships"
            />
            <Tile
              label="Helpers listed"
              value={stats.helpers_listed}
              sub={stats.helpers_hidden ? `${stats.helpers_hidden} hidden by admins` : "none hidden"}
            />
            <Tile label="New sign-ups" value={stats.signups_7d} sub="in the last 7 days" />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Queue
              to="/admin/verification"
              icon={BadgeCheck}
              label="Documents to check"
              count={stats.documents_pending}
              empty="Nothing waiting"
            />
            <Queue
              to="/admin/photos"
              icon={ImageOff}
              label="Photos to fix"
              count={stats.cutouts_failed}
              empty="Every cutout worked"
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Surface>
              <SectionHeading title="People" />
              <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(
                  [
                    ["Families", stats.users_by_role.hirer ?? 0],
                    ["Helpers", stats.users_by_role.helper ?? 0],
                    ["Messages, 7 days", stats.messages_7d],
                  ] as [string, number][]
                ).map(([label, value]) => (
                  <div key={label} className="rounded-[15px] bg-oat p-3">
                    <dt className="text-[12px] text-ink-muted">{label}</dt>
                    <dd data-numeric className="mt-0.5 font-display text-[22px] font-bold text-ink">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </Surface>

            <Surface>
              <SectionHeading title="Hire requests" description="All time, by where they stand." />
              <div className="mt-4 flex flex-wrap gap-2">
                {Object.entries(stats.hires_by_status).map(([status, count]) => (
                  <StatusPill key={status} tone={HIRES[status]?.tone ?? "neutral"}>
                    {HIRES[status]?.label ?? status} · {count}
                  </StatusPill>
                ))}
                {!Object.keys(stats.hires_by_status).length && (
                  <p className="text-[14px] text-ink-muted">None yet.</p>
                )}
              </div>
            </Surface>
          </div>
        </>
      )}

      <Surface className="mt-4">
        <SectionHeading
          title="Recent admin activity"
          action={
            <Link to="/admin/log" className="text-[14px] font-semibold text-moss hover:underline">
              Full log
            </Link>
          }
        />
        {log.isLoading ? (
          <Skeleton className="mt-4 h-32" />
        ) : !log.data?.length ? (
          <p className="mt-4 text-[14px] text-ink-muted">Nothing yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line-soft">
            {log.data.map((entry) => (
              <li key={entry.id} className="flex items-baseline gap-3 py-2.5 text-[14px]">
                <span className="min-w-0 flex-1 truncate text-ink">
                  <span className="font-semibold">{entry.admin_name}</span>{" "}
                  <span className="text-ink-muted">{actionLabel(entry.action).toLowerCase()}</span>
                  {entry.note && <span className="text-ink-faint"> · {entry.note}</span>}
                </span>
                <span className="shrink-0 text-[12px] text-ink-faint">{ago(entry.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </AdminPage>
  );
}
