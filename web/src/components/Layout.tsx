import { Link, Outlet, useLocation } from "react-router";

import { NotificationMenu } from "@/components/NotificationMenu";
import { GetPremium, PriceNote } from "@/components/PriceNote";
import { ProfileMenu } from "@/components/ProfileMenu";
import { ScrollToTop } from "@/components/ScrollToTop";
import { useShowBecomeHelper } from "@/features/auth/AuthContext";
import { useNavServices } from "@/features/helpers/queries";
import { useRealtimeSync } from "@/features/realtime/useRealtime";

/**
 * The shell.
 *
 * The front page owns its own header, because the header and the hero are one
 * animated unit there -- the search bar rises out of the page and becomes the
 * chrome. Every other page gets the plain sticky bar below instead.
 */

// The header nav is admin-managed: Admin -> Categories decides which
// services appear here, in what order, and with what wording.

function Wordmark() {
  return (
    <Link
      to="/"
      aria-label="Sahaya, home"
      className="font-display text-[22px] font-extrabold leading-none tracking-[-0.03em] text-sage"
    >
      sahaya.
    </Link>
  );
}

function PageHeader() {
  const nav = useNavServices();
  const showBecomeHelper = useShowBecomeHelper();
  return (
    <header className="sticky top-0 z-40 bg-oat/90 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1432px] items-center gap-6 px-4 py-4 sm:px-6 xl:px-10">
        <Wordmark />

        <nav
          aria-label="Services"
          className="hidden flex-1 items-center justify-center gap-8 lg:flex"
        >
          {nav.map((item) => (
            <Link
              key={item.slug}
              to={`/?service=${item.slug}`}
              className="text-[15px] font-medium tracking-[-0.005em] text-ink transition-colors duration-200 hover:text-moss"
            >
              {item.nav_label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
          {showBecomeHelper && (
            <Link
              to="/join?as=helper"
              className="hidden h-10 items-center rounded-full bg-paper px-4 text-[14px] font-medium text-ink transition-colors duration-200 hover:bg-paper/70 sm:inline-flex"
            >
              Become a Helper
            </Link>
          )}
          <GetPremium />
          <ProfileMenu />
          <NotificationMenu />
        </div>
      </div>
    </header>
  );
}

export function Layout() {
  // One socket for the whole app, open while signed in.
  useRealtimeSync();
  const showBecomeHelper = useShowBecomeHelper();
  const location = useLocation();
  const isFrontPage = location.pathname === "/";
  // Chat fills the window under the header, like any messaging app; a footer
  // below it would put the page's own scrollbar next to the thread's.
  const isChat = location.pathname.startsWith("/messages");

  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollToTop />
      {!isFrontPage && <PageHeader />}

      <main className="flex-1">
        <Outlet />
      </main>

      <footer hidden={isChat} className="mt-20">
        <div className="mx-auto w-full max-w-[1432px] px-4 pb-12 sm:px-6 xl:px-10">
          <div className="rounded-[var(--radius-panel)] bg-paper px-5 py-8 sm:px-10 sm:py-10">
            <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-sm">
                <Wordmark />
                {/* The price gets its own row below, in the strip's exact
                    words, so this line says what Sahaya is and nothing more. */}
                <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
                  Hire trusted help across Kerala, and deal with them directly.
                </p>
              </div>

              <div className="flex flex-wrap gap-x-12 gap-y-8">
                <div>
                  <h2 className="text-[12px] uppercase tracking-wide text-ink-faint">
                    Product
                  </h2>
                  <ul className="mt-2 text-[14px] sm:mt-3 sm:space-y-1">
                    <li>
                      <Link to="/" className="inline-flex min-h-11 items-center text-ink-muted hover:text-ink">
                        Find help
                      </Link>
                    </li>
                    {showBecomeHelper && (
                      <li>
                        <Link
                          to="/join?as=helper"
                          className="inline-flex min-h-11 items-center text-ink-muted hover:text-ink"
                        >
                          Find work
                        </Link>
                      </li>
                    )}
                    <li>
                      <Link to="/pricing" className="inline-flex min-h-11 items-center text-ink-muted hover:text-ink">
                        Pricing
                      </Link>
                    </li>
                  </ul>
                </div>

                <div>
                  <h2 className="text-[12px] uppercase tracking-wide text-ink-faint">
                    Kerala
                  </h2>
                  <ul className="mt-2 text-[14px] sm:mt-3 sm:space-y-1">
                    <li>
                      <Link
                        to="/?district=ernakulam"
                        className="inline-flex min-h-11 items-center text-ink-muted hover:text-ink"
                      >
                        Ernakulam
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/?district=thiruvananthapuram"
                        className="inline-flex min-h-11 items-center text-ink-muted hover:text-ink"
                      >
                        Thiruvananthapuram
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/?district=kozhikode"
                        className="inline-flex min-h-11 items-center text-ink-muted hover:text-ink"
                      >
                        Kozhikode
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <PriceNote className="mt-10 border-t border-line-soft pt-6" />

            <p className="mt-4 text-[13px] text-ink-faint">
              © {new Date().getFullYear()} Sahaya · Kerala, India
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
