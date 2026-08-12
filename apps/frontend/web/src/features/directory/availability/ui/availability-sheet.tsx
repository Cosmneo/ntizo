import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { addDays, localDateAt } from "@ntizo/shared/datetime";
import { Sheet, SheetContent, Skeleton } from "@ntizo/frontend-ui";
import { weekOf } from "@/features/directory/availability/domain/day-strip";
import { distinctMemberIds } from "@/features/directory/availability/domain/types";
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
 * same reason `TranslationsSheet` doesn't need one either once it is only
 * ever rendered while its own service is non-null.
 */
export function AvailabilitySheet({
  service,
  open,
  onOpenChange,
}: {
  service: ServiceDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

  // The member picker's own roster, read from the *unfiltered* window
  // regardless of which person is currently selected. Once a specific
  // member is picked, `data` above is scoped to that one person's own
  // calendar and its `memberIds` never mentions anyone else — building the
  // picker from it would erase every other option the moment one is
  // chosen, trapping the visitor on whoever they just picked with no way
  // back to "anyone" or to a different person. Sharing this feature's own
  // query hook (not a second, separate one) means the very first render —
  // where `selectedMemberId` is still `undefined` — already asks this exact
  // question, so react-query serves it from cache rather than firing a
  // second request; only switching to a specific member costs a new one.
  const rosterQuery = useServiceAvailability({
    serviceId: service.id,
    memberId: undefined,
    from: week[0]!,
    to: week[6]!,
  });
  const memberIds = distinctMemberIds(rosterQuery.data?.days ?? []);

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
  } else if (data.bookingMode === "quote") {
    // The two empty-`days` cases this screen has to tell apart — a quote
    // service genuinely has no calendar, and an entirely closed week for a
    // priced one — are the exact ambiguity `bookingMode` exists to resolve.
    // Branching on it here (never on `data.days.length === 0`) is what
    // keeps those two screens from being swapped.
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
        <MemberPicker memberIds={memberIds} selectedMemberId={selectedMemberId} onChange={selectMember} />
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
