import { notFound } from "next/navigation";
import { asc } from "drizzle-orm";
import { db } from "@vrt/db";
import type { UserRole } from "@vrt/shared/constants";
import { getAuthMode } from "@/lib/auth/mode";
import { requireAdmin } from "@/lib/auth/user";
import { paginate, parsePage } from "@/lib/pagination";
import {
  SETTINGS_TAB_QUERY_PARAM,
  USER_PAGE_QUERY_PARAM,
  USER_ROLE_QUERY_PARAM,
  USER_SEARCH_QUERY_PARAM,
} from "@/lib/query-params";
import { formatTimeAgo } from "@/lib/time-ago";
import { filterUsers, parseSettingsTab, parseUserRole } from "@/lib/user-filters";
import { getUserStats, type UserStats } from "@/lib/user-stats";
import { formatUserSummary } from "@/lib/user-summary";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Pagination } from "@/components/pagination";
import { RegistrationToggle } from "@/components/settings/registration-toggle";
import { RoleLimitsForm } from "@/components/settings/role-limits-form";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { UserRoleSelect } from "@/components/settings/user-role-select";
import { UsersToolbar } from "@/components/settings/users-toolbar";

const USERS_PAGE_SIZE = 10;

// A user with no projects and no runs gets no aggregate row; the narrow
// layout's summary still needs figures to spell out.
const EMPTY_USER_STATS: UserStats = { projects: 0, runs30d: 0, lastRunAt: null };

// Names whichever filters are actually on, so an empty table says why it is
// empty instead of implying there are no users at all.
function emptyUsersMessage(search: string, role: UserRole | null): string {
  const needle = search.trim();
  if (needle && role) {
    return `No ${role} users match “${needle}”.`;
  }
  if (needle) {
    return `No users match “${needle}”.`;
  }
  if (role) {
    return `No users have the ${role} role.`;
  }
  return "No users yet.";
}

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Admin-only and clerk-mode-only: in none mode there is nothing to
  // administer and the nav never links here.
  if (getAuthMode() !== "clerk") {
    notFound();
  }
  const admin = await requireAdmin();
  const [allUsers, limits, settings, query] = await Promise.all([
    db.query.users.findMany({ orderBy: (user) => asc(user.createdAt) }),
    db.query.roleLimits.findMany(),
    db.query.appSettings.findFirst(),
    searchParams,
  ]);

  const tab = parseSettingsTab(query[SETTINGS_TAB_QUERY_PARAM]);
  const rawSearch = query[USER_SEARCH_QUERY_PARAM];
  const search = typeof rawSearch === "string" ? rawSearch : "";
  const role = parseUserRole(query[USER_ROLE_QUERY_PARAM]);
  const matchedUsers = filterUsers(allUsers, { query: search, role });
  const {
    items: pageUsers,
    page,
    pageCount,
  } = paginate(matchedUsers, parsePage(query[USER_PAGE_QUERY_PARAM]), USERS_PAGE_SIZE);

  // Only the visible page's users: the aggregates are two grouped queries
  // either way, but scoping them keeps the work proportional to what is
  // rendered rather than to the whole table.
  const stats = await getUserStats(pageUsers.map((user) => user.id));
  // Admins have no quota row at all (see the role_limits schema note), so a
  // missing limit means unlimited, not zero.
  const projectLimitByRole = new Map(limits.map((row) => [row.role, row.maxProjects]));

  function hrefForUsersPage(next: number): string {
    const params = new URLSearchParams();
    params.set(SETTINGS_TAB_QUERY_PARAM, "users");
    if (search.trim()) {
      params.set(USER_SEARCH_QUERY_PARAM, search.trim());
    }
    if (role) {
      params.set(USER_ROLE_QUERY_PARAM, role);
    }
    if (next > 1) {
      params.set(USER_PAGE_QUERY_PARAM, String(next));
    }
    return `/settings?${params.toString()}`;
  }

  return (
    <main>
      <Breadcrumbs items={[{ label: "Projects", href: "/projects" }, { label: "Settings" }]} />
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Settings</h1>

      <div className="mt-6">
        <SettingsTabs
          tab={tab}
          users={
            <section>
              <UsersToolbar query={search} role={role} total={matchedUsers.length} />
              {pageUsers.length === 0 ? (
                <p className="py-8 text-center text-sm text-text-muted">{emptyUsersMessage(search, role)}</p>
              ) : (
                <table className="mt-4 w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="text-xs font-bold uppercase tracking-wide text-text-faint">
                      <th className="pb-1 pr-4 font-bold">Email</th>
                      {/* The four figure columns fold away below `sm`: six
                          columns don't fit a phone, and pushed past the panel
                          they gave the whole page a horizontal scrollbar.
                          Their values move into the per-row summary line
                          under the email, so nothing is actually lost - only
                          Email and the role control, the point of the screen,
                          stay in the narrow layout. */}
                      {/* Centered over the quota, whose own halves line up on
                          the slash rather than on either edge. */}
                      <th className="hidden pb-1 pr-4 text-center font-bold sm:table-cell">Projects</th>
                      <th className="hidden pb-1 pr-4 text-right font-bold sm:table-cell">Runs 30d</th>
                      <th className="hidden pb-1 pr-4 text-right font-bold sm:table-cell">Last activity</th>
                      <th className="hidden pb-1 pr-4 text-center font-bold sm:table-cell">Joined</th>
                      <th className="pb-1 text-center font-bold">Role</th>
                    </tr>
                  </thead>
                  <tbody className="align-middle">
                    {pageUsers.map((user) => {
                      const userStats = stats.get(user.id);
                      const projectLimit =
                        user.role === "admin" ? null : (projectLimitByRole.get(user.role) ?? null);
                      return (
                        <tr key={user.id} className="border-t border-border">
                          {/* `break-all`: an address like
                              vrt2+clerk_test@example.com is one unbreakable
                              word, which sets the table's minimum width and
                              re-widens the page on a phone. */}
                          <td className="py-2 pr-4 font-medium">
                            <span className="break-all">{user.email}</span>
                            <span className="mt-0.5 block font-mono text-xs font-normal text-text-faint sm:hidden">
                              {formatUserSummary(userStats ?? EMPTY_USER_STATS, {
                                projectLimit,
                                joinedAt: user.createdAt,
                              })}
                            </span>
                          </td>
                          {/* Three fixed tracks so every row's slash sits in
                              the same column: count right, separator, limit
                              left. An admin fills only the count track, so
                              the numbers still stack. */}
                          <td className="hidden py-2 pr-4 font-mono text-xs text-text-muted sm:table-cell">
                            <span className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-1">
                              <span className="text-right">{userStats?.projects ?? 0}</span>
                              <span className="text-text-faint">{projectLimit === null ? "" : "/"}</span>
                              <span className="text-left">{projectLimit ?? ""}</span>
                            </span>
                          </td>
                          <td className="hidden py-2 pr-4 text-right font-mono text-xs text-text-muted sm:table-cell">
                            {userStats?.runs30d ?? 0}
                          </td>
                          <td className="hidden py-2 pr-4 text-right font-mono text-xs text-text-muted sm:table-cell">
                            {userStats?.lastRunAt ? formatTimeAgo(userStats.lastRunAt) : "—"}
                          </td>
                          <td className="hidden py-2 pr-4 text-center font-mono text-xs text-text-muted sm:table-cell">
                            {user.createdAt.toISOString().slice(0, 10)}
                          </td>
                          <td className="py-2">
                            <UserRoleSelect
                              userId={user.id}
                              email={user.email}
                              role={user.role}
                              isSelf={user.id === admin.id}
                              isLocalDefault={user.clerkId === null}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {pageCount > 1 && (
                <div className="mt-4">
                  <Pagination
                    page={page}
                    pageCount={pageCount}
                    hrefForPage={hrefForUsersPage}
                    label="User pages"
                  />
                </div>
              )}
            </section>
          }
          limits={
            <section>
              <RoleLimitsForm limits={limits.filter((row) => row.role !== "admin")} />
              <p className="text-sm text-text-muted">
                Admins have no limits. Changing a role&apos;s limits applies to every user with that role.
              </p>
            </section>
          }
          auth={
            <section>
              <h2 className="text-lg font-bold">Registration</h2>
              <RegistrationToggle registrationOpen={settings?.registrationOpen ?? true} />
            </section>
          }
        />
      </div>
    </main>
  );
}
