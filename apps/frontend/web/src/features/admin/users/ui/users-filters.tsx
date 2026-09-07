import { useTranslation } from "react-i18next";
import { Select } from "@ntizo/frontend-ui";
import { USER_ROLES } from "@ntizo/shared";
import { FilterField, FilterSheet } from "@/shared/components/filter-sheet";

/**
 * The user list's filters, in the panel every list shares.
 *
 * Role only. Status is in the list and worth seeing, but it is not what
 * anybody narrows by — the question that brings somebody here is "show me the
 * providers" or "show me the admins", and a filter nobody reaches for is one
 * more control between them and the list.
 */
export function UsersFilterSheet({
  open,
  onOpenChange,
  role,
  onRoleChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: string;
  onRoleChange: (role: string) => void;
}) {
  const { t } = useTranslation("admin");

  return (
    <FilterSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("usersFilterTitle")}
      canClear={role !== ""}
      onClear={() => onRoleChange("")}
    >
      <FilterField id="filter-role" label={t("usersRole")}>
        <Select
          id="filter-role"
          value={role}
          onChange={onRoleChange}
          ariaLabel={t("usersRole")}
          options={[
            { value: "", label: t("usersAllRoles") },
            ...USER_ROLES.map((value) => ({
              value,
              label: t(`userRole.${value}`),
            })),
          ]}
        />
      </FilterField>
    </FilterSheet>
  );
}
