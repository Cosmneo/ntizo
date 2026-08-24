import { Skeleton } from "@ntizo/frontend-ui";
import {
  Section,
  SettingsLayout,
  SettingsSaveBar,
  SettingsSnapshot,
} from "./settings-shell";

/**
 * The settings page before its data arrives.
 *
 * Built from the same `SettingsLayout`, `Section` and `SettingsSaveBar` the
 * real page uses, not from a copy of their classes. That is what makes the
 * promise "same dimensions" true rather than merely intended: card padding,
 * icon tile, column widths and the save bar cannot drift between the two
 * states because there is one definition of each.
 *
 * What the shell cannot supply is the *content* height inside each card. Those
 * numbers are not guessed: every one below was measured off the rendered page
 * — label 14, input 44, blurb 23, a document slot 148 — because a skeleton
 * built from plausible-looking sizes still jumps, just less obviously.
 *
 * `aria-busy` and `aria-hidden` together: a screen reader is told the region
 * is loading once, and is not then read a wall of meaningless boxes.
 */
/**
 * Extra document slots below the identity one.
 *
 * An individual proves a tax number; an establishment also proves a licence and
 * a registry entry. Which of the two this is arrives with the data, so the
 * skeleton has to pick — and it picks the smaller. Growing on load nudges the
 * page down; overshooting would collapse it upward, which is the version that
 * moves a control out from under a finger.
 */
const DOCUMENT_SLOTS = 1;

export function SettingsSkeleton() {
  return (
    <div aria-busy="true">
      <SettingsLayout nav={<NavSkeleton />}>
        <div aria-hidden="true">
          <SettingsSnapshot>
            {/* Matches the four-fact strip: caption, then value. */}
            <Skeleton className="h-[17px] w-28" />
            <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i}>
                  <Skeleton className="h-[17px] w-20" />
                  {/* The fourth is a status Badge — taller, and in a grid row
                      the tallest cell sets the height for all of them. */}
                  <Skeleton
                    className={`mt-1.5 w-32 ${i === 3 ? "h-[27px] w-20" : "h-[19px]"}`}
                  />
                </div>
              ))}
            </dl>
          </SettingsSnapshot>

          {/* Brand: the logo square and its buttons, then a portfolio tile. */}
          <SectionSkeleton>
            <div className="grid gap-7">
              <div className="flex flex-wrap items-center gap-5">
                <Skeleton className="h-24 w-24 shrink-0 rounded-[var(--radius-card-sm)]" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-[23px] w-24" />
                  <Skeleton className="mt-0.5 h-[17px] w-full max-w-md" />
                  <Skeleton className="mt-3 h-11 w-40 rounded-[var(--radius-field)]" />
                </div>
              </div>
              <div className="border-t border-[var(--color-border)] pt-6">
                <Skeleton className="h-[23px] w-28" />
                <Skeleton className="mt-0.5 mb-4 h-[17px] w-full max-w-lg" />
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  <Skeleton className="aspect-square rounded-[var(--radius-card-sm)]" />
                </div>
                <Skeleton className="mt-3 h-[17px] w-24" />
              </div>
            </div>
          </SectionSkeleton>

          {/* Identity: name, description (3 rows tall), locked type. */}
          <SectionSkeleton>
            <div className="grid gap-5">
              <Field />
              <div className="grid gap-1.5">
                <Skeleton className="h-[14px] w-24" />
                <Skeleton className="h-[17px] w-64" />
                <Skeleton className="h-[92px] rounded-[var(--radius-field)]" />
              </div>
              <div className="grid gap-1.5">
                <Skeleton className="h-[14px] w-16" />
                <Skeleton className="h-11 rounded-[var(--radius-field)]" />
                <Skeleton className="h-[17px] w-72" />
              </div>
            </div>
          </SectionSkeleton>

          {/* Address: four in two columns, then one full width. */}
          <SectionSkeleton>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field />
              <Field />
              <Field />
              <Field />
              <Field className="sm:col-span-2" />
            </div>
          </SectionSkeleton>

          {/* Verification: the identity slot, then one box per required paper. */}
          <SectionSkeleton>
            <div className="grid gap-4">
              <div className="rounded-[var(--radius-card-sm)] border border-dashed border-[var(--color-border)] p-5">
                <Skeleton className="h-[23px] w-44" />
                <Skeleton className="mt-1.5 h-[17px] w-72" />
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <Skeleton className="h-[47px] rounded-[var(--radius-field)]" />
                  <Skeleton className="h-[47px] rounded-[var(--radius-field)]" />
                  <Skeleton className="h-[47px] rounded-[var(--radius-field)]" />
                </div>
              </div>
              {Array.from({ length: DOCUMENT_SLOTS }, (_, i) => (
                <div
                  key={i}
                  className="rounded-[var(--radius-card-sm)] border border-dashed border-[var(--color-border)] p-5"
                >
                  <Skeleton className="h-[23px] w-32" />
                  <Skeleton className="mt-1.5 h-[17px] w-60" />
                  <Skeleton className="mt-4 h-[47px] rounded-[var(--radius-field)]" />
                </div>
              ))}
              <Skeleton className="h-[17px] w-full max-w-lg" />
            </div>
          </SectionSkeleton>

          {/* Danger zone. Grey, not red: nothing has loaded to be alarmed about. */}
          <SectionSkeleton lines={2}>
            <Skeleton className="h-11 w-44 rounded-[var(--radius-field)]" />
          </SectionSkeleton>
        </div>
      </SettingsLayout>

      {/* The bar is present from the first paint, as on the loaded page — it
          does not appear only once something is dirty, so it must not appear
          only once something has loaded either. */}
      <SettingsSaveBar>
        <div className="min-w-0" aria-hidden="true">
          <Skeleton className="h-[23px] w-36" />
          <Skeleton className="mt-1.5 h-[17px] w-56" />
        </div>
        <div className="flex items-center gap-2.5" aria-hidden="true">
          <Skeleton className="h-11 w-28 rounded-[var(--radius-field)]" />
          <Skeleton className="h-11 w-36 rounded-[var(--radius-field)]" />
        </div>
      </SettingsSaveBar>
    </div>
  );
}

/** A section card with its heading blocked out, in the real `Section`. */
function SectionSkeleton({
  lines = 1,
  children,
}: {
  /** Blurb lines. The danger zone's warning wraps to two; the rest do not. */
  lines?: 1 | 2;
  children: React.ReactNode;
}) {
  return (
    <Section
      icon={<Skeleton className="h-5 w-5" />}
      title={<Skeleton className="h-6 w-40" />}
      blurb={
        <Skeleton
          className={`mt-1 w-full max-w-md ${lines === 2 ? "h-[46px]" : "h-[23px]"}`}
        />
      }
    >
      {children}
    </Section>
  );
}

/** Label plus input — the shape every field on this page has. */
function Field({ className }: { className?: string }) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Skeleton className="h-[14px] w-20" />
      <Skeleton className="h-11 rounded-[var(--radius-field)]" />
    </div>
  );
}

/** The rail, in its real container so the column width cannot drift. */
function NavSkeleton() {
  return (
    <div className="hidden lg:block" aria-hidden="true">
      <div className="sticky top-6 rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--color-border)_60%,transparent)] bg-[color-mix(in_srgb,var(--color-muted)_45%,transparent)] p-3">
        <Skeleton className="mx-3 mt-1 h-[17px] w-20" />
        <div className="mt-3 grid gap-0.5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2">
              <Skeleton className="h-4 w-4 shrink-0" />
              <Skeleton className="h-[23px] flex-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
