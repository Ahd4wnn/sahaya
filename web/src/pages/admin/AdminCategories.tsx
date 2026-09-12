import { useState } from "react";
import { Reorder, useDragControls } from "motion/react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Pencil,
  Plus,
  Sparkles,
} from "lucide-react";

import { ServiceTabs } from "@/components/ServiceTabs";
import { Button, IconButton } from "@/components/kit/Button";
import { ConfirmDialog, Sheet } from "@/components/kit/Dialog";
import { Field, Switch, TextInput } from "@/components/kit/Form";
import { SectionHeading, Skeleton, StatusPill, Surface } from "@/components/kit/Surface";
import {
  useAdminServices,
  useCreateService,
  useReorderServices,
  useUpdateService,
  type AdminService,
} from "@/features/admin/queries";
import { errorMessage } from "@/lib/api";
import { SERVICE_ICONS, SERVICE_ICON_NAMES, serviceIcon } from "@/lib/serviceIcons";
import { cn } from "@/lib/utils";
import { AdminPage } from "./AdminLayout";
import { SLUG_RE, slugify, useOrderDraft } from "./taxonomyList";

/**
 * Categories: the services on the front page.
 *
 * What changes here reaches the public site with no deploy -- the tab row,
 * the search bar's picker and the header nav all read GET /taxonomy
 * (DECISIONS.md 018). Services are archived, never deleted, and their slugs
 * never change, because both are load-bearing for helpers and shared links.
 *
 * The order is edited locally (drag, or the arrow buttons for anyone not
 * using a pointer) and saved as one request, with the real ServiceTabs
 * previewing the unsaved order beside the list. Admin -> Skills is the same
 * screen for the card chips, and shares the list parts in ./taxonomyList.
 */

function ServiceRow({
  service,
  first,
  last,
  onMove,
  onEdit,
  onToggleNav,
  onArchive,
  onRestore,
}: {
  service: AdminService;
  first: boolean;
  last: boolean;
  onMove: (by: -1 | 1) => void;
  onEdit: () => void;
  onToggleNav: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const controls = useDragControls();
  // A lookup rather than a call, so React sees the same component type
  // every render.
  const Icon = SERVICE_ICONS[service.icon] ?? Sparkles;

  return (
    <Reorder.Item
      as="li"
      value={service.id}
      dragListener={false}
      dragControls={controls}
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-[15px] bg-oat p-3 sm:flex-nowrap",
        !service.is_active && "opacity-70",
      )}
    >
      <button
        type="button"
        aria-label={`Drag ${service.name} to reorder`}
        onPointerDown={(event) => controls.start(event)}
        className="grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-[10px] text-ink-faint transition-colors hover:bg-paper hover:text-ink active:cursor-grabbing sm:size-9"
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-paper text-moss">
        <Icon className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink">
          <span className="truncate">{service.name}</span>
          {!service.is_active && <StatusPill>Archived</StatusPill>}
        </p>
        <p className="truncate text-[13px] text-ink-muted">
          {service.name_ml && <span className="ml">{service.name_ml} · </span>}
          {service.helper_count} helper{service.helper_count === 1 ? "" : "s"} ·{" "}
          {service.listed_count} listed · <span className="font-mono text-[12px]">{service.slug}</span>
        </p>
      </div>
      <div className="flex items-center gap-0.5">
        {service.is_active && (
          <button
            type="button"
            aria-pressed={service.show_in_nav}
            onClick={onToggleNav}
            className={cn(
              "mr-1 h-11 whitespace-nowrap rounded-[7px] px-2.5 text-[12px] font-semibold transition-colors duration-150 sm:h-8",
              service.show_in_nav ? "bg-moss text-on-moss" : "bg-paper text-ink-muted hover:text-ink",
            )}
          >
            In header
          </button>
        )}
        <IconButton label={`Move ${service.name} up`} disabled={first} onClick={() => onMove(-1)}>
          <ChevronUp className="size-4" aria-hidden />
        </IconButton>
        <IconButton label={`Move ${service.name} down`} disabled={last} onClick={() => onMove(1)}>
          <ChevronDown className="size-4" aria-hidden />
        </IconButton>
        <IconButton label={`Edit ${service.name}`} onClick={onEdit}>
          <Pencil className="size-4" aria-hidden />
        </IconButton>
        {service.is_active ? (
          <IconButton label={`Archive ${service.name}`} onClick={onArchive}>
            <Archive className="size-4" aria-hidden />
          </IconButton>
        ) : (
          <IconButton label={`Restore ${service.name}`} onClick={onRestore}>
            <ArchiveRestore className="size-4" aria-hidden />
          </IconButton>
        )}
      </div>
    </Reorder.Item>
  );
}

function ServiceEditor({ service, onClose }: { service: AdminService | null; onClose: () => void }) {
  const create = useCreateService();
  const update = useUpdateService();
  const [name, setName] = useState(service?.name ?? "");
  const [nameMl, setNameMl] = useState(service?.name_ml ?? "");
  const [icon, setIcon] = useState(
    service?.icon ?? (SERVICE_ICON_NAMES.includes("sparkles") ? "sparkles" : SERVICE_ICON_NAMES[0]!),
  );
  const [showInNav, setShowInNav] = useState(service?.show_in_nav ?? false);
  const [navLabel, setNavLabel] = useState(service?.nav_label ?? "");
  const [slugDraft, setSlugDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A new category's slug follows its name until someone edits it by hand.
  const slug = service ? service.slug : (slugDraft ?? slugify(name));
  const busy = create.isPending || update.isPending;

  function save() {
    setError(null);
    if (!name.trim()) {
      setError("Give the category a name.");
      return;
    }
    const draft = {
      name: name.trim(),
      name_ml: nameMl.trim(),
      icon,
      show_in_nav: showInNav,
      nav_label: navLabel.trim(),
    };
    const handlers = {
      onSuccess: onClose,
      onError: (e: unknown) => setError(errorMessage(e, "That did not save. Try again.")),
    };
    if (service) {
      update.mutate({ id: service.id, ...draft }, handlers);
      return;
    }
    if (!SLUG_RE.test(slug)) {
      setError("The link name needs 2 to 40 lowercase letters, digits or underscores, starting with a letter.");
      return;
    }
    create.mutate({ ...draft, slug }, handlers);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={service ? `Edit ${service.name}` : "New category"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy} onClick={save}>
            {service ? "Save changes" : "Add category"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Name" htmlFor="svc-name" hint="As it appears on the tab and in the search picker.">
          <TextInput
            id="svc-name"
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field label="Name in Malayalam (optional)" htmlFor="svc-ml">
          <TextInput
            id="svc-ml"
            className="ml"
            maxLength={120}
            value={nameMl}
            onChange={(event) => setNameMl(event.target.value)}
          />
        </Field>

        <Field
          label="Link name"
          htmlFor="svc-slug"
          hint={
            service
              ? "Fixed once created: it is in links people have already shared."
              : `Used in links, like /?service=${slug || "home_nurse"}. It cannot be changed later.`
          }
        >
          <TextInput
            id="svc-slug"
            value={slug}
            readOnly={Boolean(service)}
            maxLength={40}
            onChange={(event) => setSlugDraft(event.target.value.toLowerCase())}
            className="font-mono text-[14px] read-only:opacity-70"
          />
        </Field>

        <fieldset>
          <legend className="text-[13px] font-semibold text-ink">Icon</legend>
          <div role="radiogroup" aria-label="Icon" className="mt-2 grid grid-cols-6 gap-1.5 sm:grid-cols-8">
            {SERVICE_ICON_NAMES.map((iconName) => {
              const Glyph = serviceIcon(iconName);
              const selected = iconName === icon;
              return (
                <button
                  key={iconName}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={iconName.replace(/-/g, " ")}
                  title={iconName}
                  onClick={() => setIcon(iconName)}
                  className={cn(
                    "grid aspect-square place-items-center rounded-[10px] transition-colors duration-150",
                    selected ? "bg-moss text-on-moss" : "bg-oat text-ink-muted hover:text-ink",
                  )}
                >
                  <Glyph className="size-5" strokeWidth={1.75} aria-hidden />
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="rounded-[15px] bg-oat px-4">
          <Switch
            checked={showInNav}
            onChange={setShowInNav}
            label="Show in the site header"
            description="The header has room for about four links."
          />
        </div>

        {showInNav && (
          <Field
            label="Header wording (optional)"
            htmlFor="svc-nav"
            hint="Defaults to the name. The header can use shorter words, like “Care Taker”."
          >
            <TextInput
              id="svc-nav"
              maxLength={40}
              value={navLabel}
              placeholder={name}
              onChange={(event) => setNavLabel(event.target.value)}
            />
          </Field>
        )}

        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

export function AdminCategories() {
  const services = useAdminServices();
  const reorder = useReorderServices();
  const update = useUpdateService();
  const order = useOrderDraft(services.data ?? []);
  const [editing, setEditing] = useState<AdminService | "new" | null>(null);
  const [archiving, setArchiving] = useState<AdminService | null>(null);
  const [previewTab, setPreviewTab] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const active = order.list.filter((service) => service.is_active);
  const nav = active.filter((service) => service.show_in_nav);

  function patch(changes: Parameters<typeof update.mutate>[0]) {
    setError(null);
    update.mutate(changes, {
      onError: (e) => setError(errorMessage(e, "That change did not save.")),
    });
  }

  return (
    <AdminPage
      title="Categories"
      subtitle="The services on the front page: its tabs, the search bar's picker and the header links. Visitors see a change within a few minutes."
      actions={
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" aria-hidden />
          Add category
        </Button>
      }
    >
      {/* grid-cols-1 and min-w-0 on the children are both load-bearing: a grid
          with no explicit columns has one implicit `auto` track floored at
          min-content, and a `truncate` line inside it (the counts and slug)
          reports its full un-wrapped width -- which stretched this panel to
          424px on a 375px phone. See docs/design-lessons.md section 10. */}
      <div className="grid grid-cols-1 gap-6 [&>*]:min-w-0 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
        <Surface>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[14px] text-ink-muted">
              Drag to reorder, or use the arrows. This order is the order of the tabs.
            </p>
            {order.changed && (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="hover:bg-oat" onClick={order.reset}>
                  Undo
                </Button>
                <Button
                  size="sm"
                  busy={reorder.isPending}
                  onClick={() =>
                    reorder.mutate(order.ids, {
                      onSuccess: order.reset,
                      onError: (e) => setError(errorMessage(e, "The new order did not save.")),
                    })
                  }
                >
                  Save order
                </Button>
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="mt-3 text-[13px] text-danger">
              {error}
            </p>
          )}

          {services.isLoading ? (
            <div className="mt-4 space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : (
            <Reorder.Group
              axis="y"
              values={order.ids}
              onReorder={order.setOrderIds}
              className="mt-4 space-y-2"
            >
              {order.list.map((service, index) => (
                <ServiceRow
                  key={service.id}
                  service={service}
                  first={index === 0}
                  last={index === order.list.length - 1}
                  onMove={(by) => order.move(service.id, by)}
                  onEdit={() => setEditing(service)}
                  onToggleNav={() => patch({ id: service.id, show_in_nav: !service.show_in_nav })}
                  onArchive={() => setArchiving(service)}
                  onRestore={() => patch({ id: service.id, is_active: true })}
                />
              ))}
            </Reorder.Group>
          )}
        </Surface>

        <div className="space-y-6 xl:sticky xl:top-24">
          <Surface>
            <SectionHeading
              title="Front page tabs"
              description={
                order.changed ? "Your unsaved order, previewed." : "What visitors see now."
              }
            />
            {/* The tabs sit on the oat page and flow into a paper panel, exactly
                as on the front page -- this is the real component, not a copy. */}
            <div className="mt-5 overflow-hidden rounded-[15px] bg-oat px-2 pt-2">
              <ServiceTabs
                value={previewTab}
                onChange={setPreviewTab}
                services={active}
                layoutId="admin-preview-tab"
              />
              <div className="h-6 bg-paper" />
            </div>
          </Surface>

          <Surface>
            <SectionHeading
              title="Header links"
              description="Categories marked “In header”, in this order."
            />
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[15px] bg-oat px-4 py-3">
              {nav.length ? (
                nav.map((service) => (
                  <span key={service.id} className="text-[15px] font-medium text-ink">
                    {service.nav_label || service.name}
                  </span>
                ))
              ) : (
                <span className="text-[14px] text-ink-faint">
                  No header links. The header shows the wordmark and menus only.
                </span>
              )}
            </div>
            {nav.length > 4 && (
              <p className="mt-3 text-[13px] leading-relaxed text-[#8a5a14]">
                The header has room for about four links. More will crowd it on smaller laptops.
              </p>
            )}
          </Surface>
        </div>
      </div>

      {editing && (
        <ServiceEditor
          key={editing === "new" ? "new" : editing.id}
          service={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(archiving)}
        onClose={() => setArchiving(null)}
        danger
        busy={update.isPending}
        title={archiving ? `Archive ${archiving.name}?` : ""}
        description={
          archiving
            ? archiving.helper_count
              ? `${archiving.helper_count} helper${archiving.helper_count === 1 ? " is" : "s are"} in this category. They stay listed and still appear under All Services, but its tab, search option and header link disappear, and nobody new can choose it. You can restore it later.`
              : "Nobody is in this category yet. It disappears from the front page, and you can restore it later."
            : undefined
        }
        confirmLabel="Archive"
        onConfirm={() => {
          if (!archiving) return;
          update.mutate(
            { id: archiving.id, is_active: false },
            {
              onSuccess: () => setArchiving(null),
              onError: (e) => {
                setArchiving(null);
                setError(errorMessage(e, "The category was not archived."));
              },
            },
          );
        }}
      />
    </AdminPage>
  );
}
