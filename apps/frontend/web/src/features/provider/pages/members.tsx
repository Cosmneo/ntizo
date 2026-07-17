import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "@tanstack/react-form";
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  Mail,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Skeleton,
} from "@ntizo/frontend-ui";
import { usePageAction, usePageHeader } from "@/shared/lib/page-header";
import { useActiveProvider } from "../hooks/use-active-provider";
import { useProviderDetail } from "../hooks/use-providers";
import {
  useInviteMember,
  useRemoveMember,
  useRevokeInvite,
  useUpdateMemberRole,
} from "../hooks/use-member-mutations";
import type { ProviderRole } from "../types";

const ROLE_STYLES: Record<
  ProviderRole,
  { label: string; pill: string; dot: string }
> = {
  owner: {
    label: "Owner",
    pill: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  admin: {
    label: "Admin",
    pill: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  staff: {
    label: "Staff",
    pill: "bg-violet-500/15 text-violet-400 border-violet-500/30",
    dot: "bg-violet-400",
  },
};

export function MembersPage() {
  const { t } = useTranslation("provider");
  const { activeProvider } = useActiveProvider();
  const { data: detail, isLoading } = useProviderDetail(activeProvider?.id);
  const removeMut = useRemoveMember(activeProvider?.id ?? "");
  const roleMut = useUpdateMemberRole(activeProvider?.id ?? "");
  const inviteMut = useInviteMember(activeProvider?.id ?? "");
  const revokeMut = useRevokeInvite(activeProvider?.id ?? "");

  const [inviteOpen, setInviteOpen] = useState(false);

  usePageHeader(t("members"), activeProvider?.name);
  usePageAction(
    <Button size="sm" onClick={() => setInviteOpen(true)}>
      <UserPlus className="mr-2 h-4 w-4" />
      Invite member
    </Button>,
  );

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
          return { form: e instanceof Error ? e.message : "Failed" };
        }
      },
    },
  });

  if (!activeProvider) return null;
  const members = detail?.members ?? [];
  const invites = detail?.invites ?? [];
  const myRole =
    members.find((m) => m.email && activeProvider.role)?.role ??
    activeProvider.role ??
    "—";

  return (
    <div className="flex flex-col gap-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Organization"
          icon={<Building2 className="h-4 w-4" />}
          value={activeProvider.name}
          hint={activeProvider.type}
        />
        <StatCard
          label="Team Members"
          icon={<Users className="h-4 w-4" />}
          value={isLoading ? "…" : String(members.length)}
          hint="active members"
        />
        <StatCard
          label="Your Role"
          icon={<Shield className="h-4 w-4" />}
          value={
            ROLE_STYLES[myRole as ProviderRole]?.label ?? String(myRole)
          }
          hint="in this organization"
        />
        <StatCard
          label="Pending Invites"
          icon={<Mail className="h-4 w-4" />}
          value={isLoading ? "…" : String(invites.length)}
          hint={invites.length === 0 ? "no pending invites" : "awaiting"}
        />
        <StatCard
          label="Status"
          icon={<CheckCircle2 className="h-4 w-4" />}
          value="Active"
          hint="organization operational"
          hintClassName="text-emerald-400"
        />
      </div>

      {/* Members + invites table */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Active members
          </span>
        </div>
        <div className="flex items-end justify-between border-b border-border px-5 py-3">
          <span className="text-sm text-muted-foreground">Member</span>
          <span className="text-sm text-muted-foreground">Role</span>
        </div>

        {isLoading ? (
          <MemberSkeletons />
        ) : members.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {t("noMembers")}
          </div>
        ) : (
          <ul className="divide-y divide-border px-5">
            {members.map((m) => {
              const initials = (m.name ?? m.email ?? "?")
                .split(" ")
                .map((p) => p[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();
              const style = ROLE_STYLES[m.role];
              return (
                <li
                  key={m.userId}
                  className="flex items-center gap-3 py-3"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {m.name ?? m.email}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {m.email}
                    </div>
                  </div>
                  <div className="relative">
                    <select
                      value={m.role}
                      onChange={(e) =>
                        roleMut.mutate({
                          userId: m.userId,
                          role: e.target.value as ProviderRole,
                        })
                      }
                      className={`appearance-none rounded-full border px-3 py-1 pr-7 text-xs font-medium ${style.pill} cursor-pointer focus:outline-none`}
                    >
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="staff">Staff</option>
                    </select>
                    <ChevronDown
                      className={`pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 ${style.dot.replace("bg-", "text-")}`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(t("removeConfirm")))
                        removeMut.mutate(m.userId);
                    }}
                    className="ml-2 rounded p-1 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}


        {/* Pending invitations — same card */}
        <div className="border-y border-border bg-card/60 px-5 py-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pending invitations
          </span>
        </div>
        {isLoading ? (
          <div className="space-y-3 px-5 py-6">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-40" />
          </div>
        ) : invites.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No pending invitations
          </div>
        ) : (
          <ul className="divide-y divide-border px-5">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center gap-3 py-3"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                  {inv.email.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{inv.email}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {inv.status ?? "pending"}
                  </div>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${ROLE_STYLES[inv.role as ProviderRole]?.pill ?? ""}`}
                >
                  {ROLE_STYLES[inv.role as ProviderRole]?.label ?? inv.role}
                </span>
                <button
                  type="button"
                  onClick={() => revokeMut.mutate(inv.id)}
                  className="ml-2 rounded p-1 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Roles & permissions */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Roles & permissions
          </span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 text-left font-medium">Role</th>
              <th className="px-5 py-3 text-center font-medium">Bookings</th>
              <th className="px-5 py-3 text-center font-medium">Members</th>
              <th className="px-5 py-3 text-center font-medium">Billing</th>
              <th className="px-5 py-3 text-center font-medium">Settings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <PermissionRow
              role="Owner"
              dot="bg-emerald-400"
              cells={["Full", "Full", "Full", "Full"]}
            />
            <PermissionRow
              role="Admin"
              dot="bg-emerald-400"
              cells={["Full", "Full", "View", "Full"]}
            />
            <PermissionRow
              role="Staff"
              dot="bg-violet-400"
              cells={["Assigned", "—", "—", "—"]}
            />
          </tbody>
        </table>
      </div>

      <div className="text-xs text-muted-foreground">
        {members.length} member{members.length === 1 ? "" : "s"} ·{" "}
        {invites.length} pending
      </div>

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
                  <select
                    value={field.state.value}
                    onChange={(e) =>
                      field.handleChange(e.target.value as ProviderRole)
                    }
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="admin">Admin</option>
                    <option value="staff">Staff</option>
                  </select>
                </div>
              )}
            </inviteForm.Field>
            <inviteForm.Subscribe selector={(s) => s.errorMap.onSubmit}>
              {(err) =>
                err ? (
                  <div className="text-sm text-destructive">{String(err)}</div>
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

function StatCard({
  label,
  value,
  hint,
  icon,
  hintClassName,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  hintClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="mt-3 truncate text-2xl font-bold">{value}</div>
      <div
        className={`mt-1 text-xs text-muted-foreground ${hintClassName ?? ""}`}
      >
        {hint}
      </div>
    </div>
  );
}

function MemberSkeletons() {
  return (
    <ul className="divide-y divide-border">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-52" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

function PermissionRow({
  role,
  dot,
  cells,
}: {
  role: string;
  dot: string;
  cells: string[];
}) {
  return (
    <tr>
      <td className="px-5 py-3">
        <div className="flex items-center gap-2 font-medium">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          {role}
        </div>
      </td>
      {cells.map((c, i) => (
        <td
          key={i}
          className={`px-5 py-3 text-center ${c === "—" ? "text-muted-foreground" : "text-emerald-400"}`}
        >
          {c}
        </td>
      ))}
    </tr>
  );
}
