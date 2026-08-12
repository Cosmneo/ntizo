import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "@tanstack/react-form";
import { UserPlus } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
} from "@ntizo/frontend-ui";
import { usePageAction, usePageHeader } from "@/shared/lib/page-header";
import { providerErrorMessage } from "../viewmodel/error-message";
import { useActiveProvider } from "../viewmodel/use-active-provider";
import { useProviderDetail } from "../viewmodel/use-providers";
import {
  useInviteMember,
  useRemoveMember,
  useRevokeInvite,
  useUpdateMemberRole,
} from "../viewmodel/use-member-mutations";
import {
  EMPTY_FILTERS,
  filterPeople,
  toPeopleRows,
  type PeopleFilters,
  type PersonRow,
} from "../domain/people";
import { PeopleFilterSheet, filterCount } from "./people-filters";
import { PeopleTable } from "./people-table";
import type { ProviderRole, UnpublishedService } from "../domain/types";

/** The two roles an invitation can carry. Owner is not one of them. */
const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "staff", label: "Staff" },
];

/**
 * Who is on this workspace.
 *
 * One table, not two. Members and pending invitations were separate lists, and
 * the split described how the data is stored rather than the question being
 * asked — an invitation sent yesterday is part of the answer to "who is on my
 * team", just with "waiting" attached. It also let one person appear twice the
 * moment an invitation was accepted, and made the counts at the top ambiguous
 * because there were two of them.
 *
 * The five stat cards that used to sit above went with it. Four of them
 * restated the table's own contents, one restated the workspace name that is
 * already the page header, and together they pushed the actual list below the
 * fold.
 */
export function MembersPage() {
  const { t } = useTranslation("provider");
  const { activeProvider } = useActiveProvider();
  const {
    data: detail,
    isLoading,
    error,
  } = useProviderDetail(activeProvider?.id);
  const removeMut = useRemoveMember(activeProvider?.id ?? "");
  const roleMut = useUpdateMemberRole(activeProvider?.id ?? "");
  const inviteMut = useInviteMember(activeProvider?.id ?? "");
  const revokeMut = useRevokeInvite(activeProvider?.id ?? "");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<PeopleFilters>(EMPTY_FILTERS);
  const [actionError, setActionError] = useState<string | null>(null);
  // Services a removal just unpublished because nobody was left to perform
  // them — named back by `providerMembersRemove` and held here until the
  // owner dismisses it, deliberately not a toast: a toast vanishes on its
  // own, and this is exactly the kind of change a provider must not miss.
  const [unpublishedNotice, setUnpublishedNotice] = useState<
    UnpublishedService[] | null
  >(null);

  usePageHeader(t("members"), activeProvider?.name);
  usePageAction(
    <Button size="sm" onClick={() => setInviteOpen(true)}>
      <UserPlus className="mr-2 h-4 w-4" />
      {t("sendInvite")}
    </Button>,
  );

  const rows = useMemo(
    () => toPeopleRows(detail?.members ?? [], detail?.invites ?? []),
    [detail?.members, detail?.invites],
  );
  const visible = useMemo(() => filterPeople(rows, filters), [rows, filters]);

  const inviteForm = useForm({
    defaultValues: { email: "", role: "staff" as ProviderRole },
    validators: {
      onSubmitAsync: async ({ value }) => {
        try {
          await inviteMut.mutateAsync({ email: value.email, role: value.role });
          inviteForm.reset();
          setInviteOpen(false);
          return null;
        } catch (e) {
          return { form: providerErrorMessage(t, e) };
        }
      },
    },
  });

  if (!activeProvider) return null;
  if (error) {
    return (
      <p className="type-body text-[var(--color-destructive)]">
        {providerErrorMessage(t, error)}
      </p>
    );
  }

  /** Every mutation reports the same way, so the page has one error line. */
  async function run(work: Promise<unknown>) {
    setActionError(null);
    try {
      await work;
    } catch (e) {
      setActionError(providerErrorMessage(t, e));
    }
  }

  /**
   * Removal is the one action whose response carries more than pass/fail:
   * when the person removed was a service's last performer, the catalogue
   * unpublished it and named it back. Surfaced here rather than folded into
   * `run` because nothing else this page calls returns anything worth
   * showing on success.
   */
  async function handleRemove(row: PersonRow) {
    setActionError(null);
    setUnpublishedNotice(null);
    try {
      const result = await removeMut.mutateAsync(row.key);
      if (result.unpublishedServices.length > 0) {
        setUnpublishedNotice(result.unpublishedServices);
      }
    } catch (e) {
      setActionError(providerErrorMessage(t, e));
    }
  }

  // Owners and admins manage the team; staff can look. Checked again on the
  // server — this only decides whether to offer the control.
  const canManage =
    activeProvider.role === "owner" || activeProvider.role === "admin";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      {actionError && (
        <p className="type-body text-[var(--color-destructive)]">
          {actionError}
        </p>
      )}

      {unpublishedNotice && unpublishedNotice.length > 0 && (
        <div className="flex flex-col gap-3 rounded-[var(--radius-card-sm)] border border-[var(--color-warning)] bg-[var(--color-card)] p-4">
          <div className="flex items-start justify-between gap-4">
            <p className="type-body font-medium">
              {t("membersUnpublishedTitle")}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setUnpublishedNotice(null)}
            >
              {t("close")}
            </Button>
          </div>
          <ul className="list-disc pl-5">
            {unpublishedNotice.map((service) => (
              <li key={service.serviceId} className="type-body">
                {service.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      <PeopleTable
        rows={visible}
        total={rows.length}
        loading={isLoading}
        filters={filters}
        onFiltersChange={setFilters}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={filterCount(filters)}
        canManage={canManage}
        onChangeRole={(row: PersonRow, role: ProviderRole) =>
          void run(roleMut.mutateAsync({ userId: row.key, role }))
        }
        onRemove={(row: PersonRow) => void handleRemove(row)}
        onRevoke={(row: PersonRow) => void run(revokeMut.mutateAsync(row.key))}
      />

      <PeopleFilterSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={filters}
        onChange={setFilters}
      />

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("sendInvite")}</DialogTitle>
            <DialogDescription>
              Send an email invitation to join {activeProvider.name}.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void inviteForm.handleSubmit();
            }}
          >
            <inviteForm.Field name="email">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={field.name}>Email</Label>
                  <Input
                    id={field.name}
                    type="email"
                    required
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </inviteForm.Field>
            <inviteForm.Field name="role">
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label>{t("role")}</Label>
                  <Select
                    value={field.state.value}
                    onChange={(role) =>
                      field.handleChange(role as ProviderRole)
                    }
                    options={ROLE_OPTIONS}
                  />
                </div>
              )}
            </inviteForm.Field>
            <inviteForm.Subscribe selector={(s) => s.errorMap.onSubmit}>
              {(err) =>
                err ? (
                  <div className="text-sm text-destructive">{err.form}</div>
                ) : null
              }
            </inviteForm.Subscribe>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setInviteOpen(false)}
              >
                Cancel
              </Button>
              <inviteForm.Subscribe selector={(s) => s.isSubmitting}>
                {(isSubmitting) => (
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? t("sending") : t("sendInvite")}
                  </Button>
                )}
              </inviteForm.Subscribe>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
