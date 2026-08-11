import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, MoreHorizontal, Plus } from "lucide-react";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ntizo/frontend-ui";
import { CollectionCard } from "@/shared/components/collection-card";
import { initialsFrom } from "@/shared/lib/initials";
import { usePageAction, usePageHeader } from "@/shared/lib/page-header";
import { CategoryFormSheet } from "./category-form";
import { adminCategoryQueries } from "../data/admin-category.repository";
import {
  useAdminCategories,
  useReorderCategories,
  useSaveCategory,
} from "../viewmodel/use-admin-categories";
import {
  adminName,
  moved,
  translatedCount,
  TOTAL_LOCALES,
  type AdminCategory,
} from "../domain/types";

/**
 * The kinds of work the platform organises, and the one screen that says how
 * far each of them has been translated.
 *
 * The same card as the other two admin lists. What it adds is the translation
 * count, which is the whole reason this screen is not just a list of names: a
 * category reads as finished from whichever language you happen to be in, and
 * "3/8" is the only thing that says otherwise.
 */
export function AdminCategoriesPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const listInput = search.trim() ? { search: search.trim() } : {};
  const query = useAdminCategories(listInput);
  const save = useSaveCategory();
  const reorder = useReorderCategories(
    adminCategoryQueries.all(listInput).queryKey,
  );

  usePageHeader(t("categoriesTitle"), t("categoriesSubtitle"));
  usePageAction(
    <Button
      size="sm"
      onClick={() => {
        setEditing(null);
        setFormOpen(true);
      }}
    >
      <Plus className="h-4 w-4" />
      <span className="hidden sm:inline">{t("categoryNew")}</span>
    </Button>,
  );

  const rows = useMemo(() => query.data ?? [], [query.data]);
  // Dragging within a search result would be rearranging a subset, which says
  // nothing about where those rows sit among the ones not shown. The handles
  // stay, disabled, with the reason as their tooltip — vanishing controls are
  // worse than refused ones.
  const searching = search.trim() !== "";

  function applyOrder(next: readonly AdminCategory[]) {
    reorder.mutate(next.map((c) => c.id));
  }

  function openEdit(category: AdminCategory) {
    setEditing(category);
    setFormOpen(true);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      {query.error && (
        <p className="type-body text-[var(--color-destructive)]">
          {t("categoriesError")}
        </p>
      )}

      <CollectionCard
        title={t("categoriesTitle")}
        shown={rows.length}
        total={rows.length}
        loading={query.isLoading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("categoriesSearchPlaceholder")}
        columns={[
          { key: "category", label: t("categoriesCategory"), className: "pl-5" },
          { key: "code", label: t("categoryCode"), skeletonWidth: "w-28" },
          {
            key: "languages",
            label: t("categoryLanguages"),
            skeletonWidth: "w-16",
            skeletonShape: "badge",
          },
          {
            key: "state",
            label: t("categoriesStatus"),
            skeletonWidth: "w-20",
            skeletonShape: "badge",
          },
          {
            key: "order",
            label: t("categoryOrder"),
            align: "right",
            skeletonWidth: "w-8",
          },
          {
            key: "actions",
            label: t("categoriesActions"),
            align: "right",
            className: "pr-5",
          },
        ]}
        emptyText={t("categoriesEmpty")}
        noMatchesText={t("categoriesNoMatches")}
        filtered={searching}
        reorder={{
          handleLabel: t("categoryReorder"),
          onReorder: (keys) => {
            const byId = new Map(rows.map((c) => [c.id, c]));
            applyOrder(keys.flatMap((k) => (byId.has(k) ? [byId.get(k)!] : [])));
          },
          ...(searching ? { disabledReason: t("categoryReorderSearching") } : {}),
        }}
        rows={rows.map((category) => {
          const translated = translatedCount(category);
          return {
            key: category.id,
            primary: <CategoryCell category={category} locale={locale} />,
            cells: {
              code: (
                <code className="type-caption rounded bg-[var(--color-muted)] px-1.5 py-0.5">
                  {category.code}
                </code>
              ),
              languages: (
                // Amber until every language is filled in. A number alone reads
                // as a fact about the category rather than as work outstanding.
                <Badge tone={translated === TOTAL_LOCALES ? "success" : "warning"}>
                  {translated}/{TOTAL_LOCALES}
                </Badge>
              ),
              state: (
                <Badge tone={category.isActive ? "success" : "info"}>
                  {t(category.isActive ? "categoryActiveLabel" : "categoryHidden")}
                </Badge>
              ),
              order: (
                <span className="tabular-nums text-[var(--color-muted-foreground)]">
                  {category.sortOrder}
                </span>
              ),
            },
            actions: (
              <RowActions
                category={category}
                isFirst={rows[0]?.id === category.id}
                isLast={rows[rows.length - 1]?.id === category.id}
                onMove={(delta) => applyOrder(moved(rows, category.id, delta))}
                onEdit={() => openEdit(category)}
                onToggle={() =>
                  save.mutate({
                    categoryId: category.id,
                    isActive: !category.isActive,
                    translations: category.translations.map((tr) => ({
                      locale: tr.locale,
                      name: tr.name,
                      description: tr.description,
                    })),
                  })
                }
              />
            ),
          };
        })}
      />

      <CategoryFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
      />
    </div>
  );
}

/** The image if there is one, the monogram if not, and the name beside it. */
function CategoryCell({
  category,
  locale,
}: {
  category: AdminCategory;
  locale: string;
}) {
  const name = adminName(category, locale);
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-9 w-12 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-card-sm)] bg-[var(--color-muted)]">
        {category.imageUrl ? (
          <img src={category.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="type-caption font-semibold text-[var(--color-muted-foreground)]">
            {initialsFrom(name)}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="type-body-medium truncate font-semibold">{name}</p>
        {/* Which language that name came from. Without it, an administrator
            working in French cannot tell a translated category from one
            falling back to Portuguese. */}
        <p className="type-caption truncate text-[var(--color-muted-foreground)]">
          {category.translations.find((tr) => tr.locale === locale)
            ? locale
            : (category.translations[0]?.locale ?? "—")}
        </p>
      </div>
    </div>
  );
}

function RowActions({
  category,
  isFirst,
  isLast,
  onMove,
  onEdit,
  onToggle,
}: {
  category: AdminCategory;
  isFirst: boolean;
  isLast: boolean;
  onMove: (delta: number) => void;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const { t } = useTranslation("admin");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <button
          type="button"
          aria-label={t("categoriesActions")}
          // `ml-auto`, because `grid` makes this block-level and a block-level
          // box ignores the cell's `text-align`.
          className="ml-auto grid h-8 w-8 place-items-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>{t("categoryEdit")}</DropdownMenuItem>
        {/* The same reordering, reachable without a mouse. HTML5 drag events
            do not fire for touch and cannot be driven from a keyboard, so a
            list whose only way to reorder is dragging cannot be reordered by
            most of the ways people use one. Disabled at the ends rather than
            hidden, so the menu does not change shape row by row. */}
        <DropdownMenuItem disabled={isFirst} onSelect={() => onMove(-1)}>
          <ArrowUp className="h-4 w-4" />
          {t("categoryMoveUp")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={isLast} onSelect={() => onMove(1)}>
          <ArrowDown className="h-4 w-4" />
          {t("categoryMoveDown")}
        </DropdownMenuItem>
        {/* Hidden, never deleted: services and bookings point at a category and
            their history has to keep meaning what it meant. */}
        <DropdownMenuItem onSelect={onToggle}>
          {t(category.isActive ? "categoryHide" : "categoryShow")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
