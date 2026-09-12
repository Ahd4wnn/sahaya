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
} from "lucide-react";

import { Button, IconButton } from "@/components/kit/Button";
import { ConfirmDialog, Sheet } from "@/components/kit/Dialog";
import { ChipToggle, Field, TextInput } from "@/components/kit/Form";
import { SectionHeading, Skeleton, StatusPill, Surface } from "@/components/kit/Surface";
import {
  useAdminSkills,
  useCreateSkill,
  useReorderSkills,
  useUpdateSkill,
  type AdminSkill,
} from "@/features/admin/queries";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AdminPage } from "./AdminLayout";
import { SLUG_RE, slugify, useOrderDraft } from "./taxonomyList";

/**
 * Skills: the chips on every helper card.
 *
 * The same contract as Categories (DECISIONS.md 022): what changes here reaches
 * the public site with no deploy, because the search filter and a helper's own
 * picker both read GET /taxonomy. Skills are archived rather than deleted --
 * helper_skills rows point at them, so a delete would quietly strip chips off
 * cards that are already listed -- and their slugs never change, because they
 * travel in shared links like /?skills=cooking.
 *
 * Archiving stops a skill being chosen; a helper who already has one keeps the
 * chip on their card. Both halves of that are enforced by the API, not here.
 */

function SkillRow({
  skill,
  first,
  last,
  onMove,
  onEdit,
  onArchive,
  onRestore,
}: {
  skill: AdminSkill;
  first: boolean;
  last: boolean;
  onMove: (by: -1 | 1) => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      as="li"
      value={skill.id}
      dragListener={false}
      dragControls={controls}
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-[15px] bg-oat p-3 sm:flex-nowrap",
        !skill.is_active && "opacity-70",
      )}
    >
      <button
        type="button"
        aria-label={`Drag ${skill.name} to reorder`}
        onPointerDown={(event) => controls.start(event)}
        className="grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-[10px] text-ink-faint transition-colors hover:bg-paper hover:text-ink active:cursor-grabbing sm:size-9"
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink">
          <span className="truncate">{skill.name}</span>
          {!skill.is_active && <StatusPill>Archived</StatusPill>}
        </p>
        <p className="truncate text-[13px] text-ink-muted">
          {skill.name_ml && <span className="ml">{skill.name_ml} · </span>}
          {skill.helper_count} helper{skill.helper_count === 1 ? "" : "s"} ·{" "}
          {skill.listed_count} listed ·{" "}
          <span className="font-mono text-[12px]">{skill.slug}</span>
        </p>
      </div>
      <div className="flex items-center gap-0.5">
        <IconButton label={`Move ${skill.name} up`} disabled={first} onClick={() => onMove(-1)}>
          <ChevronUp className="size-4" aria-hidden />
        </IconButton>
        <IconButton label={`Move ${skill.name} down`} disabled={last} onClick={() => onMove(1)}>
          <ChevronDown className="size-4" aria-hidden />
        </IconButton>
        <IconButton label={`Edit ${skill.name}`} onClick={onEdit}>
          <Pencil className="size-4" aria-hidden />
        </IconButton>
        {skill.is_active ? (
          <IconButton label={`Archive ${skill.name}`} onClick={onArchive}>
            <Archive className="size-4" aria-hidden />
          </IconButton>
        ) : (
          <IconButton label={`Restore ${skill.name}`} onClick={onRestore}>
            <ArchiveRestore className="size-4" aria-hidden />
          </IconButton>
        )}
      </div>
    </Reorder.Item>
  );
}

function SkillEditor({ skill, onClose }: { skill: AdminSkill | null; onClose: () => void }) {
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const [name, setName] = useState(skill?.name ?? "");
  const [nameMl, setNameMl] = useState(skill?.name_ml ?? "");
  const [slugDraft, setSlugDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A new skill's slug follows its name until someone edits it by hand.
  const slug = skill ? skill.slug : (slugDraft ?? slugify(name));
  const busy = create.isPending || update.isPending;

  function save() {
    setError(null);
    if (!name.trim()) {
      setError("Give the skill a name.");
      return;
    }
    const draft = { name: name.trim(), name_ml: nameMl.trim() };
    const handlers = {
      onSuccess: onClose,
      onError: (e: unknown) => setError(errorMessage(e, "That did not save. Try again.")),
    };
    if (skill) {
      update.mutate({ id: skill.id, ...draft }, handlers);
      return;
    }
    if (!SLUG_RE.test(slug)) {
      setError(
        "The link name needs 2 to 40 lowercase letters, digits or underscores, starting with a letter.",
      );
      return;
    }
    create.mutate({ ...draft, slug }, handlers);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={skill ? `Edit ${skill.name}` : "New skill"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy} onClick={save}>
            {skill ? "Save changes" : "Add skill"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field
          label="Name"
          htmlFor="skill-name"
          hint="As it appears on the card chip and in the search filter."
        >
          <TextInput
            id="skill-name"
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field label="Name in Malayalam (optional)" htmlFor="skill-ml">
          <TextInput
            id="skill-ml"
            className="ml"
            maxLength={120}
            value={nameMl}
            onChange={(event) => setNameMl(event.target.value)}
          />
        </Field>

        <Field
          label="Link name"
          htmlFor="skill-slug"
          hint={
            skill
              ? "Fixed once created: it is in links people have already shared."
              : `Used in links, like /?skills=${slug || "cooking"}. It cannot be changed later.`
          }
        >
          <TextInput
            id="skill-slug"
            value={slug}
            readOnly={Boolean(skill)}
            maxLength={40}
            onChange={(event) => setSlugDraft(event.target.value.toLowerCase())}
            className="font-mono text-[14px] read-only:opacity-70"
          />
        </Field>

        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/** The preview chips are inert, so this never runs. */
function noop() {}

export function AdminSkills() {
  const skills = useAdminSkills();
  const reorder = useReorderSkills();
  const update = useUpdateSkill();
  const order = useOrderDraft(skills.data ?? []);
  const [editing, setEditing] = useState<AdminSkill | "new" | null>(null);
  const [archiving, setArchiving] = useState<AdminSkill | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = order.list.filter((skill) => skill.is_active);

  function patch(changes: Parameters<typeof update.mutate>[0]) {
    setError(null);
    update.mutate(changes, {
      onError: (e) => setError(errorMessage(e, "That change did not save.")),
    });
  }

  return (
    <AdminPage
      title="Skills"
      subtitle="The chips on a helper's card. The same list is the search filter, and what a helper ticks on their own profile. Visitors see a change within a few minutes."
      actions={
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" aria-hidden />
          Add skill
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
              Drag to reorder, or use the arrows. This order is the order of the chips.
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

          {skills.isLoading ? (
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
              {order.list.map((skill, index) => (
                <SkillRow
                  key={skill.id}
                  skill={skill}
                  first={index === 0}
                  last={index === order.list.length - 1}
                  onMove={(by) => order.move(skill.id, by)}
                  onEdit={() => setEditing(skill)}
                  onArchive={() => setArchiving(skill)}
                  onRestore={() => patch({ id: skill.id, is_active: true })}
                />
              ))}
            </Reorder.Group>
          )}
        </Surface>

        <div className="space-y-6 xl:sticky xl:top-24">
          <Surface>
            <SectionHeading
              title="The skill filter"
              description={
                order.changed ? "Your unsaved order, previewed." : "What visitors see now."
              }
            />
            {/* The real chip from the kit, in the real order -- this is what the
                filter sheet and the profile picker draw. `inert` keeps the
                preview out of the tab order: selecting one here means nothing. */}
            <div
              aria-hidden
              inert
              className="mt-5 flex flex-wrap gap-2 rounded-[15px] bg-oat p-4"
            >
              {active.length ? (
                active.map((skill) => (
                  <ChipToggle key={skill.id} selected={false} onClick={noop}>
                    {skill.name}
                  </ChipToggle>
                ))
              ) : (
                <span className="text-[14px] text-ink-faint">
                  No skills. The filter section disappears and new helpers have nothing to tick.
                </span>
              )}
            </div>
          </Surface>
        </div>
      </div>

      {editing && (
        <SkillEditor
          key={editing === "new" ? "new" : editing.id}
          skill={editing === "new" ? null : editing}
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
              ? `${archiving.helper_count} helper${archiving.helper_count === 1 ? " has" : "s have"} this skill. They keep it on their card, but it disappears from the search filter and nobody new can choose it. You can restore it later.`
              : "Nobody has this skill yet. It disappears from the filter and the picker, and you can restore it later."
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
                setError(errorMessage(e, "The skill was not archived."));
              },
            },
          );
        }}
      />
    </AdminPage>
  );
}
