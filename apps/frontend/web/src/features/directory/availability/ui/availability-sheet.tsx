import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { addDays, localDateAt } from "@ntizo/shared/datetime";
import { Sheet, SheetContent, Skeleton } from "@ntizo/frontend-ui";
import { weekOf } from "@/features/directory/availability/domain/day-strip";
import { distinctMemberIds, panelMode } from "@/features/directory/availability/domain/types";
import type { Start } from "@/features/directory/availability/domain/types";
import { useServiceAvailability } from "@/features/directory/availability/viewmodel/use-service-availability";
import { servicePriceCell } from "@/features/directory/services/domain/service-card";
import type { ServiceDTO } from "@/features/directory/services/domain/types";
import { ServicePrice } from "@/features/directory/services/ui/service-card";
import { DateStrip } from "./date-strip";
import { MemberPicker } from "./member-picker";
import { TimeGrid } from "./time-grid";

/** The device's own IANA zone — the only clock available before the first response names the service's own. */
function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * When a service can be had — a sheet over the provider page, opened by
 * selecting a service card.
 *
 * There is no booking control anywhere in this component. Selecting a time
 * (and, for an hourly service, a length) only highlights it; booking is a
 * later slice, and offering a button that could not do anything yet would
 * read as broken software, where the plain absence of one reads as "not
 * built yet".
 *
 * Mounted fresh each time a different service is selected (see
 * `services-section.tsx`, which keys it by `service.id`), so every piece of
 * local state below starts over rather than needing a reset effect — the
 * same reason the languages section doesn't need one either, now that it is
 * ever rendered while its own service is non-null.
 */
export function AvailabilitySheet({
  service,
  open,
  onOpenChange,
  performers,
}: {
  service: ServiceDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * First names to label the member picker's roster with, keyed by matching
   * id. Optional: `services-section.tsx` mounts this same sheet on a
   * provider's public page with no performer data in hand, and must keep
   * showing `MemberPicker`'s own numbered fallback exactly as it does today —
   * see that component's doc comment for why the fallback is not merely a
   * loading state but a real, permanent answer for an id it cannot name.
   */
  performers?: readonly { id: string; firstName: string }[];
}) {
  const { t, i18n } = useTranslation("directory");
  const locale = i18n.resolvedLanguage ?? i18n.language;

  // A reasonable first guess for "what week to open on" — the visitor's own
  // device date. It is not necessarily the *service's* civil today (that
  // depends on `availability.forService`'s own `timezone`, only known after
  // the first response), but it only has to be close enough to land the
  // strip on the right week; `todayIso` below is what the "past" rule
  // actually reads once real data exists.
  const [anchorDate, setAnchorDate] = useState(() => localDateAt(deviceTimeZone(), new Date()));
  const [selectedDate, setSelectedDate] = useState(anchorDate);
  const [selectedMemberId, setSelectedMemberId] = useState<string | undefined>(undefined);
  const [selectedStart, setSelectedStart] = useState<Start | null>(null);
  const [selectedLengthMinutes, setSelectedLengthMinutes] = useState<number | null>(null);

  const week = weekOf(anchorDate);
  const { data, isPending, isError, error } = useServiceAvailability({
    serviceId: service.id,
    memberId: selectedMemberId,
    from: week[0]!,
    to: week[6]!,
  });

  // The member picker's own roster. `data.memberIds` is the response's
  // top-level field — who performs the service, full stop — never
  // `data.days[].starts[].memberIds`, which is scoped to this one window and
  // to whichever person `selectedMemberId` currently filters it to. An
  // earlier version of this file derived the roster from the (possibly
  // filtered, possibly windowed-to-nothing) day list; both a specific
  // selection and an unlucky week could then collapse it to one name or
  // zero, hiding the picker — including "anyone" — and stranding the
  // visitor. See `domain/types.ts`'s own doc comment on `distinctMemberIds`.
  const memberIds = distinctMemberIds(data?.memberIds ?? []);

  function goToWeek(nextAnchor: string) {
    setAnchorDate(nextAnchor);
    setSelectedDate(nextAnchor);
    setSelectedStart(null);
    setSelectedLengthMinutes(null);
  }

  function selectDate(dateIso: string) {
    setSelectedDate(dateIso);
    setSelectedStart(null);
    setSelectedLengthMinutes(null);
  }

  function selectMember(memberId: string | undefined) {
    setSelectedMemberId(memberId);
    setSelectedStart(null);
    setSelectedLengthMinutes(null);
  }

  function selectStart(start: Start) {
    setSelectedStart(start);
    setSelectedLengthMinutes(null);
  }

  let body: React.ReactNode;
  if (isPending) {
    body = (
      <div className="grid gap-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  } else if (isError || !data) {
    const code = (error as { code?: string } | undefined)?.code;
    body = (
      <p className="text-sm text-[var(--color-destructive)]">
        {t(`availabilityForServiceError.${code}`, { defaultValue: t("availabilityForServiceErrorGeneric") })}
      </p>
    );
  } else if (panelMode(data) === "quote") {
    // `panelMode` is the one place this branch is decided — see its own
    // doc comment for why it reads `bookingMode` and never `days.length`.
    body = <p className="text-sm text-[var(--color-muted-foreground)]">{t("availabilityQuoteNotice")}</p>;
  } else {
    const day = data.days.find((d) => d.date === selectedDate);
    const todayIso = localDateAt(data.timezone, new Date());

    body = (
      <div className="grid gap-6">
        <DateStrip
          week={week}
          selectedDate={selectedDate}
          todayIso={todayIso}
          locale={locale}
          onSelectDate={selectDate}
          onPreviousWeek={() => goToWeek(addDays(anchorDate, -7))}
          onNextWeek={() => goToWeek(addDays(anchorDate, 7))}
        />
        <MemberPicker
          memberIds={memberIds}
          selectedMemberId={selectedMemberId}
          onChange={selectMember}
          performers={performers}
        />
        <TimeGrid
          starts={day?.starts ?? []}
          pricingMode={data.pricingMode}
          minMinutes={service.defaultOption?.minMinutes ?? null}
          stepMinutes={service.defaultOption?.stepMinutes ?? null}
          locale={locale}
          timezone={data.timezone}
          selectedStart={selectedStart}
          selectedLengthMinutes={selectedLengthMinutes}
          onSelectStart={selectStart}
          onSelectLength={setSelectedLengthMinutes}
        />
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-lg flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">{service.name}</h2>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              <ServicePrice cell={servicePriceCell(service)} locale={locale} />
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t("close")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">{body}</div>
      </SheetContent>
    </Sheet>
  );
}
