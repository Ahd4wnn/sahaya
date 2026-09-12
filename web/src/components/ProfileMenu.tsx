import {
  BadgeIndianRupee,
  BriefcaseBusiness,
  CircleHelp,
  HandHeart,
  Heart,
  LifeBuoy,
  LogOut,
  Mail,
  MessagesSquare,
  Phone,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";

import { Monogram } from "@/components/Monogram";
import { MenuItem, Popover } from "@/components/Popover";
import { useAuth } from "@/features/auth/AuthContext";
import { cn } from "@/lib/utils";

/**
 * The first of the two circles in the header.
 *
 * Signed in it is the account menu, and it changes with the account: helpers
 * see their hire requests, families their hires and liked profiles, admins
 * the admin panel. Signed out it is the sign-in entry point -- not a dead
 * avatar, and not a second "Get started" button competing with the one
 * already in the header. Google, phone and email are what the backend
 * supports on web; Apple is iOS only.
 */

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z"
      />
    </svg>
  );
}

export function ProfileMenu({ compact = false }: { compact?: boolean }) {
  const { user, loading, isSubscribed, assistantEnabled, signOut } = useAuth();

  // Bigger where fingers are, not smaller: 44px on phones, the
  // designed 40px from md up. Compact is the morphed desktop bar only.
  const size = compact ? "size-10" : "size-11 md:size-10";

  if (loading) {
    return <div aria-hidden className={cn("animate-pulse rounded-full bg-paper", size)} />;
  }

  const isAdmin = user?.role === "admin";
  const isHelper = user?.role === "helper";

  return (
    <Popover
      panelClassName="w-[264px]"
      trigger={({ toggle, ...aria }) => (
        <button
          type="button"
          onClick={toggle}
          {...aria}
          aria-label={user ? `Account menu for ${user.full_name}` : "Sign in"}
          className={cn(
            "grid shrink-0 place-items-center overflow-hidden rounded-full bg-paper text-ink transition-colors duration-200 hover:bg-paper/70",
            size,
          )}
        >
          {user ? (
            <Monogram name={user.full_name} size={40} className="size-full" />
          ) : (
            <UserRound className="size-[18px]" aria-hidden strokeWidth={1.75} />
          )}
        </button>
      )}
    >
      {({ close }) =>
        user ? (
          <div>
            <div className="px-3 pb-2 pt-2">
              <p className="truncate font-display text-[15px] font-semibold text-ink">
                {user.full_name || "Your account"}
              </p>
              <p className="truncate text-[13px] text-ink-muted">
                {user.phone ?? user.email ?? ""}
              </p>
              <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-oat px-2 py-0.5 text-[12px] text-ink-muted">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    isAdmin || isSubscribed ? "bg-verified" : "bg-ink-faint",
                  )}
                  aria-hidden
                />
                {isAdmin ? "Admin" : isSubscribed ? "Membership active" : "No membership"}
              </p>
            </div>

            <div className="my-1 h-px bg-line-soft" />

            {isAdmin ? (
              <MenuItem icon={ShieldCheck} to="/admin" onClick={close}>
                Admin
              </MenuItem>
            ) : (
              <MenuItem icon={UserRound} to="/account" onClick={close}>
                My profile
              </MenuItem>
            )}
            <MenuItem icon={MessagesSquare} to="/messages" onClick={close}>
              Messages
            </MenuItem>
            {/* The assistant lives in the chat page rather than in a floating
                widget, so this is a link to a thread, not a launcher. */}
            {assistantEnabled && (
              <MenuItem icon={Sparkles} to="/messages/assistant" onClick={close}>
                Ask Sahaya
              </MenuItem>
            )}
            {!isAdmin && (
              <MenuItem icon={HandHeart} to="/hires" onClick={close}>
                {isHelper ? "Hire requests" : "My hires"}
              </MenuItem>
            )}
            {!isHelper && (
              <MenuItem icon={Heart} to="/saved" onClick={close}>
                Liked profiles
              </MenuItem>
            )}
            {!isAdmin && (
              <MenuItem
                icon={BadgeIndianRupee}
                to={isSubscribed ? "/settings#membership" : "/pricing"}
                onClick={close}
              >
                {isSubscribed ? "Membership" : "Get a membership"}
              </MenuItem>
            )}
            <MenuItem icon={Settings} to="/settings" onClick={close}>
              Settings
            </MenuItem>
            <MenuItem icon={LifeBuoy} to="/help" onClick={close}>
              Help &amp; safety
            </MenuItem>

            <div className="my-1 h-px bg-line-soft" />

            <MenuItem
              icon={LogOut}
              danger
              onClick={() => {
                close();
                void signOut();
              }}
            >
              Sign out
            </MenuItem>
          </div>
        ) : (
          <div>
            <p className="px-3 pb-1 pt-2 font-display text-[15px] font-semibold text-ink">
              Sign in to Sahaya
            </p>
            <p className="px-3 pb-2 text-[13px] leading-snug text-ink-muted">
              Browsing is free. Sign in to save helpers and send a hire request.
            </p>

            <MenuItem icon={GoogleGlyph} to="/signin?with=google" onClick={close}>
              Continue with Google
            </MenuItem>
            <MenuItem icon={Phone} to="/signin?with=phone" onClick={close}>
              Continue with phone
            </MenuItem>
            <MenuItem icon={Mail} to="/signin?with=email" onClick={close}>
              Continue with email
            </MenuItem>

            <div className="my-1 h-px bg-line-soft" />

            {/* The header's "Become a Helper" pill is hidden below 640px, so
                without this a phone user has no route to listing themselves. */}
            <MenuItem icon={BriefcaseBusiness} to="/join?as=helper" onClick={close}>
              Become a Helper
            </MenuItem>
            <MenuItem icon={CircleHelp} to="/help" onClick={close}>
              How Sahaya works
            </MenuItem>
          </div>
        )
      }
    </Popover>
  );
}
