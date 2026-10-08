import {
  listAssignees,
  listCategories,
  listGroupOptions,
  listPriorities,
  listSavedViews,
  listStatuses,
  listTags,
  getTicketBoard,
  listTickets,
  STATUS_TYPES,
  SORTS,
  ValidationError,
} from "@petey/core";
import Link from "next/link";
import { buttonClass, Button, cn, Input, PageHeader, Select } from "@/components/ui";
import { requireArea } from "@/lib/session";
import { getMessages } from "@/messages";
import { deleteViewAction } from "./tickets/actions";
import { SaveViewForm } from "./tickets/save-view-form";
import { CollapsibleFilters } from "./tickets/collapsible-filters";
import { TicketBoard } from "./tickets/ticket-board";
import { TicketTable } from "./tickets/ticket-table";

type Params = Record<string, string | string[] | undefined>;

const UNRESOLVED = "open,on_hold";

/** The built-in views. With no parameters at all, the list shows unresolved tickets. */
function builtInViews(t: ReturnType<typeof getMessages>["tickets"]) {
  return [
    { key: "unresolved", label: t.unresolved, query: { statusType: UNRESOLVED } },
    {
      key: "mine",
      label: `${t.assignee}: ${t.me}`,
      query: { assignee: "me", statusType: UNRESOLVED },
    },
    {
      key: "unassigned",
      label: t.unassigned,
      query: { assignee: "unassigned", statusType: UNRESOLVED },
    },
    { key: "all", label: t.allTickets, query: { all: "1" } },
  ];
}

function toSearch(query: Record<string, string | string[] | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === "") continue;
    sp.set(k, Array.isArray(v) ? v.join(",") : v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function single(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v.join(",") : (v ?? "");
}

export default async function TicketListPage({ searchParams }: { searchParams: Promise<Params> }) {
  const actor = await requireArea("agent");
  const t = getMessages().tickets;
  const params = await searchParams;

  const views = await listSavedViews(actor);
  const activeView = params.view ? views.find((v) => v.id === params.view) : undefined;
  const builtIns = builtInViews(t);

  // A saved view supplies the query; otherwise the URL does, defaulting to unresolved.
  const { view: _view, ...urlQuery } = params;
  const query: Params = activeView
    ? { ...activeView.query, page: single(params.page) }
    : Object.keys(urlQuery).length > 0
      ? urlQuery
      : { statusType: UNRESOLVED };

  // The board shows one column per status; the URL or the saved view picks the layout.
  const layout = (single(params.layout) || single(query.layout)) === "board" ? "board" : "list";
  const emptyList = { items: [], total: 0, page: 1, pageSize: 50 };

  // A hand-edited URL with a bad value shows an empty list rather than an error page.
  const tolerate =
    <T,>(fallback: T) =>
    (err: unknown) => {
      if (err instanceof ValidationError) return fallback;
      throw err;
    };

  const [result, board, statuses, priorities, categories, assignees, groups, tags] =
    await Promise.all([
      layout === "list" ? listTickets(actor, query).catch(tolerate(emptyList)) : emptyList,
      layout === "board" ? getTicketBoard(actor, query).catch(tolerate([])) : [],
      listStatuses(),
      listPriorities(),
      listCategories(),
      listAssignees(actor),
      listGroupOptions(actor),
      listTags(),
    ]);

  const current = (key: string) => single(query[key]);
  // Filters set in the hidden panel; search, sort and layout don't count.
  const activeFilters = [
    "statusType",
    "status",
    "priority",
    "assignee",
    "group",
    "tag",
    "category",
    "type",
  ].filter((key) => current(key) !== "").length;
  const viewQuery = Object.fromEntries(
    Object.entries(query).filter(
      ([k, v]) => k !== "page" && k !== "all" && v !== undefined && v !== "",
    ),
  ) as Record<string, string | string[]>;
  // Built-in views are matched ignoring the layout, so they stay highlighted on the board.
  const { layout: _layout, ...urlFilters } = urlQuery;
  const activeBuiltIn = activeView
    ? undefined
    : builtIns.find(
        (b) =>
          toSearch(b.query) ===
          toSearch(Object.keys(urlFilters).length ? urlFilters : { statusType: UNRESOLVED }),
      );
  const withLayout = (q: Params): Params => (layout === "board" ? { ...q, layout } : q);
  const layoutHref = (target: "list" | "board") => {
    const l = target === "board" ? "board" : "list";
    return activeView
      ? `/agent?view=${activeView.id}&layout=${l}`
      : `/agent${toSearch({ ...(Object.keys(urlFilters).length ? urlFilters : { statusType: UNRESOLVED }), layout: l })}`;
  };
  const { status: _status, statusType: _statusType, layout: _l, page: _p, ...nonStatus } = query;
  const listHref = Object.fromEntries(
    statuses.map((s) => [s.id, `/agent${toSearch({ ...nonStatus, status: s.id })}`]),
  );

  const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const to = Math.min(result.page * result.pageSize, result.total);
  const pageLink = (page: number) =>
    activeView
      ? `/agent?view=${activeView.id}&page=${page}`
      : `/agent${toSearch({ ...query, page: String(page) })}`;

  const linkClass = (active: boolean) =>
    cn(
      "block rounded-md px-2 py-1 text-sm",
      active
        ? "bg-zinc-200 font-medium dark:bg-zinc-800"
        : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
    );

  return (
    <>
      <PageHeader
        title={activeView?.name ?? activeBuiltIn?.label ?? getMessages().agent.title}
        actions={
          <div className="flex items-center gap-2">
            <div
              role="group"
              aria-label={t.layout}
              className="inline-flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700"
            >
              {(["list", "board"] as const).map((l) => (
                <Link
                  key={l}
                  href={layoutHref(l)}
                  aria-current={layout === l ? "page" : undefined}
                  className={cn(
                    "rounded px-3 py-1.5 text-sm",
                    layout === l
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
                  )}
                >
                  {l === "list" ? t.layoutList : t.layoutBoard}
                </Link>
              ))}
            </div>
            <Link href="/agent/tickets/new" className={buttonClass()}>
              {t.new}
            </Link>
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[13rem_1fr]">
        <nav aria-label={t.views} className="space-y-4">
          <ul className="space-y-0.5">
            {builtIns.map((b) => (
              <li key={b.key}>
                <Link
                  href={`/agent${toSearch(withLayout(b.query))}`}
                  className={linkClass(activeBuiltIn?.key === b.key)}
                >
                  {b.label}
                </Link>
              </li>
            ))}
          </ul>
          {views.length > 0 && (
            <ul className="space-y-0.5">
              {views.map((v) => (
                <li key={v.id} className="group flex items-center gap-1">
                  <Link
                    href={`/agent?view=${v.id}`}
                    className={cn(linkClass(activeView?.id === v.id), "flex-1")}
                  >
                    {v.name}
                    {v.visibility === "shared" && (
                      <span className="ml-1 text-xs text-zinc-500">· {t.sharedViews}</span>
                    )}
                  </Link>
                  {(v.ownerId === actor.id || actor.role === "admin") &&
                    activeView?.id === v.id && (
                      <form action={deleteViewAction.bind(null, v.id)}>
                        <button
                          type="submit"
                          className="px-1 text-xs text-zinc-500 hover:text-red-600"
                          title={t.deleteView}
                          aria-label={t.deleteView}
                        >
                          ✕
                        </button>
                      </form>
                    )}
                </li>
              ))}
            </ul>
          )}
          {!activeView && <SaveViewForm query={viewQuery} />}
        </nav>

        <div className="min-w-0 space-y-4">
          <form method="get" action="/agent" aria-label={t.filters}>
            {layout === "board" && <input type="hidden" name="layout" value="board" />}
            <CollapsibleFilters
              activeCount={activeFilters}
              toolbar={
                <>
                  <Input
                    name="q"
                    defaultValue={current("q")}
                    placeholder={t.searchPlaceholder}
                    aria-label={getMessages().common.search}
                    className="w-full sm:w-72"
                  />
                  <Button type="submit" variant="secondary">
                    {t.applyFilters}
                  </Button>
                  <Link
                    href={`/agent${toSearch(withLayout({ all: "1" }))}`}
                    className={buttonClass("ghost")}
                  >
                    {t.clearFilters}
                  </Link>
                </>
              }
            >
              <Select
                name="statusType"
                defaultValue={current("statusType")}
                aria-label={t.status}
                className="w-auto"
              >
                <option value="">{t.anyStatus}</option>
                <option value={UNRESOLVED}>{t.unresolved}</option>
                {STATUS_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {t.statusTypes[s]}
                  </option>
                ))}
              </Select>
              <Select
                name="status"
                defaultValue={current("status")}
                aria-label={t.exactStatus}
                className="w-auto"
              >
                <option value="">—</option>
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Select
                name="priority"
                defaultValue={current("priority")}
                aria-label={t.priority}
                className="w-auto"
              >
                <option value="">{t.anyPriority}</option>
                {priorities.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <Select
                name="assignee"
                defaultValue={current("assignee")}
                aria-label={t.assignee}
                className="w-auto"
              >
                <option value="">{t.anyAssignee}</option>
                <option value="me">{t.me}</option>
                <option value="unassigned">{t.unassigned}</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
              <Select
                name="group"
                defaultValue={current("group")}
                aria-label={t.group}
                className="w-auto"
              >
                <option value="">{t.anyGroup}</option>
                <option value="none">{t.noGroup}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
              {tags.length > 0 && (
                <Select
                  name="tag"
                  defaultValue={current("tag")}
                  aria-label={getMessages().productivity.tags}
                  className="w-auto"
                >
                  <option value="">{getMessages().productivity.anyTag}</option>
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
                </Select>
              )}
              <Select
                name="category"
                defaultValue={current("category")}
                aria-label={t.category}
                className="w-auto"
              >
                <option value="">{t.anyCategory}</option>
                {categories.map((c) => (
                  <optgroup key={c.id} label={c.name}>
                    <option value={c.id}>{c.name}</option>
                    {c.children.map((s) => (
                      <option key={s.id} value={s.id}>
                        {c.name} › {s.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
              <Select
                name="type"
                defaultValue={current("type")}
                aria-label={t.type}
                className="w-auto"
              >
                <option value="">{t.anyType}</option>
                <option value="incident">{t.types.incident}</option>
                <option value="request">{t.types.request}</option>
              </Select>
              <Select
                name="sort"
                defaultValue={current("sort") || "updated"}
                aria-label={t.sort}
                className="w-auto"
              >
                {SORTS.map((s) => (
                  <option key={s} value={s}>
                    {t.sorts[s]}
                  </option>
                ))}
              </Select>
              <Select
                name="dir"
                defaultValue={current("dir") || "desc"}
                aria-label={t.sortDirection}
                className="w-auto"
              >
                <option value="desc">{t.newestFirst}</option>
                <option value="asc">{t.oldestFirst}</option>
              </Select>
            </CollapsibleFilters>
          </form>

          {layout === "board" ? (
            <TicketBoard columns={board} statuses={statuses} listHref={listHref} />
          ) : (
            <TicketTable items={result.items} assignees={assignees} groups={groups} />
          )}

          <div
            className={cn(
              "flex items-center justify-between text-sm text-zinc-500",
              layout === "board" && "hidden",
            )}
          >
            <span data-testid="result-count">{t.showing(from, to, result.total)}</span>
            <div className="flex gap-2">
              {result.page > 1 && (
                <Link href={pageLink(result.page - 1)} className={buttonClass("secondary")}>
                  {t.previous}
                </Link>
              )}
              {to < result.total && (
                <Link href={pageLink(result.page + 1)} className={buttonClass("secondary")}>
                  {t.next}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
