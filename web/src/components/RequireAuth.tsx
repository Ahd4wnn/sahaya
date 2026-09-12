import { Navigate, Outlet, useLocation } from "react-router";

import { Skeleton } from "@/components/kit/Surface";
import { useAuth, type Role } from "@/features/auth/AuthContext";

/**
 * Pages that need an account.
 *
 * A courtesy, not the rule: every page behind this reads endpoints that
 * enforce the same thing server-side (CurrentUser, require_admin). This only
 * spares someone a screen of errors, and brings them back to where they were
 * going once they have signed in.
 */
export function RequireAuth({ role }: { role?: Role }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div aria-hidden className="mx-auto w-full max-w-[1100px] px-4 pt-10 sm:px-6 xl:px-10">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-7 h-64" />
      </div>
    );
  }

  if (!user) {
    const next = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/signin?next=${encodeURIComponent(next)}`} replace />;
  }

  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <Outlet />;
}
