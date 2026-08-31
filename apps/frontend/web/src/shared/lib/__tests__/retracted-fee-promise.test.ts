import { describe, expect, it } from "vitest";

/**
 * The tripwire for the promise this task retracted, on the five surfaces
 * besides the Terms: the landing page's hero band, the sign-up page, the
 * admin hint under the commission field an administrator edits, the
 * customer-facing trust line beside the price on the highest-intent page in
 * the product, and the provider's own rate label -- added when a later
 * review found that this file globbed four locale files per locale and the
 * one Task 2 actually wrote to, `provider.json`, was not among them: the
 * wording that shipped was verified safe by hand, but the tripwire meant to
 * stop it drifting could not see it. The Terms have their own equivalent
 * check in `legal-content.test.ts` -- a contract earns its own file rather
 * than sharing one with marketing copy -- but the shape here is deliberately
 * identical, because a whole-branch review is what caught the first three
 * still live after the Terms and the service page were already fixed once,
 * and `trustFeeIncluded` has now been wrong twice on its own: once under the
 * original model, and once when a ruling that it "still stood" under the
 * new one had to be reversed. One shape, six surfaces, so none of them can
 * drift back the way they did before any of this existed.
 *
 * Absence checks, not presence checks, for the reason `legal-content.test.ts`
 * gives for its own: the rate is per provider and administrator-set
 * (`provider.commission_bps`), so nothing here can assert a specific
 * percentage without becoming exactly the kind of stale pin this task spent
 * itself removing. Written out per locale, in that locale's own words --
 * including the five `become-provider.json` locales that shipped raw
 * English before this task and are genuinely translated after it, where the
 * banned phrasing below is what the retracted claim would read like in that
 * language if it were ever reintroduced, not literally what shipped.
 *
 * Each check reads only the specific keys the retraction touched, not the
 * whole file -- `admin.json` alone has a legitimate "Between 0 and 100%."
 * range hint a few lines from the commission field, and a bare "0%"/"10%"
 * ban across an entire locale file would trip on it for no reason.
 */

function byLocale<T>(modules: Record<string, T>) {
  return Object.entries(modules).map(([path, data]) => ({
    locale: path.match(/locales\/([^/]+)\//)![1]!,
    data,
  }));
}

function checkBanned(
  label: string,
  entries: { locale: string; text: string }[],
  banned: Record<string, string[]>,
) {
  for (const { locale, text } of entries) {
    const list = banned[locale];
    expect(list, `no banned-phrase list recorded for ${label}/${locale}`).toBeDefined();
    const lower = text.toLowerCase();
    for (const phrase of list!)
      expect(lower, `${locale} ${label} still says "${phrase}"`).not.toContain(phrase.toLowerCase());
  }
}

describe("the retracted fee promise never comes back", () => {
  it("landing.json's hero band never claims a zero or customer-paid fee", () => {
    const modules = import.meta.glob<Record<string, unknown>>("../../locales/*/landing.json", {
      eager: true,
      import: "default",
    });
    const entries = byLocale(modules).map(({ locale, data }) => {
      const d = data as { zeroFeeTitle: string; zeroFeeBody: string };
      return { locale, text: `${d.zeroFeeTitle} ${d.zeroFeeBody}` };
    });

    const BANNED: Record<string, string[]> = {
      "en-US": [
        "0%", "10%",
        "commission for the people doing the work",
        "sits on top of your price",
        "exactly what you receive",
        "zero commission",
      ],
      "pt-MZ": [
        "0%", "10%",
        "de comissão para quem trabalha",
        "vem por cima do seu preço",
        "exactamente o que recebe",
        "comissão zero",
      ],
      "pt-PT": [
        "0%", "10%",
        "de comissão para quem trabalha",
        "vem por cima do seu preço",
        "exactamente o que recebe",
        "comissão zero",
      ],
      "es-ES": [
        "0%", "10%",
        "de comisión para quien trabaja",
        "se suma a tu precio",
        "exactamente lo que recibes",
        "comisión cero",
      ],
      "fr-FR": [
        "0 %", "10 %",
        "de commission pour ceux qui travaillent",
        "s’ajoutent à votre prix",
        "exactement ce que vous recevez",
        "commission nulle",
      ],
      "de-DE": [
        "0 %", "10 %",
        "provision für alle, die die arbeit machen",
        "zusätzlich zu deinem preis",
        "bekommst du genau so",
        "nullprovision",
      ],
      "it-IT": [
        "0%", "10%",
        "di commissione per chi lavora",
        "si somma al tuo prezzo",
        "esattamente quello che ricevi",
        "commissione zero",
      ],
      "nl-NL": [
        "0%", "10%",
        "commissie voor wie het werk doet",
        "komt boven op jouw prijs",
        "precies wat je ontvangt",
        "nulcommissie",
      ],
    };

    checkBanned("landing.json", entries, BANNED);
  });

  it("become-provider.json never promises to keep the whole price", () => {
    const modules = import.meta.glob<Record<string, unknown>>("../../locales/*/become-provider.json", {
      eager: true,
      import: "default",
    });
    const entries = byLocale(modules).map(({ locale, data }) => {
      const d = data as {
        titleAccent: string;
        subtitle: string;
        pricingTitle: string;
        pricingBody: string;
      };
      return {
        locale,
        text: `${d.titleAccent} ${d.subtitle} ${d.pricingTitle} ${d.pricingBody}`,
      };
    });

    // es-ES, fr-FR, de-DE, it-IT and nl-NL shipped this file as a literal
    // English copy before this task translated it -- confirmed against
    // 706a49b (the commit before Task 7 touched it), where fr-FR's `title`
    // was "Offer your services." verbatim. A revert of that translation
    // restores English, not French or German, so the only banned list that
    // actually matches what a revert brings back in those five locales is
    // the English one -- byte-exact, including the unspaced "10%"/"0%" the
    // English text used (French and German would write "10 %"/"0 %" if a
    // NEW false claim were authored in-language instead, so both forms are
    // banned for those two). The translated bans below stay too: they catch
    // that second failure, a fresh mistranslation rather than a reverted
    // commit, which is a different way for the same promise to come back.
    // pt-MZ and pt-PT need no such addition -- confirmed against the same
    // commit, they were already genuine Portuguese before this task, so a
    // revert there restores Portuguese, which their existing list already
    // bans.
    const ENGLISH_REVERT_BANNED = [
      "0%", "10%",
      "keep the whole price",
      "no commission on what you earn",
      "zero commission for you",
      "the price you set is the price you receive",
      "on top of your price",
      "never comes out of yours",
    ];

    const BANNED: Record<string, string[]> = {
      "en-US": ENGLISH_REVERT_BANNED,
      "pt-MZ": [
        "0%", "10%",
        "receba o preço inteiro",
        "sem comissão sobre o que ganha",
        "zero de comissão para si",
        "o preço que define é o preço que recebe",
        "por cima do seu preço",
        "nunca sai do seu bolso",
      ],
      "pt-PT": [
        "0%", "10%",
        "receba o preço inteiro",
        "sem comissão sobre o que ganha",
        "zero de comissão para si",
        "o preço que define é o preço que recebe",
        "por cima do seu preço",
        "nunca sai do seu bolso",
      ],
      "es-ES": [
        ...ENGLISH_REVERT_BANNED,
        "quédate con el precio completo",
        "sin comisión sobre lo que ganas",
        "cero comisión para ti",
        "el precio que fijas es el precio que recibes",
        "encima de tu precio",
        "nunca sale de tu bolsillo",
      ],
      "fr-FR": [
        ...ENGLISH_REVERT_BANNED,
        "0 %", "10 %",
        "gardez tout le prix",
        "sans commission sur ce que vous gagnez",
        "zéro commission pour vous",
        "le prix que vous fixez est le prix que vous recevez",
        "en plus de votre prix",
        "ne sort jamais de votre poche",
      ],
      "de-DE": [
        ...ENGLISH_REVERT_BANNED,
        "0 %", "10 %",
        "behalte den vollen preis",
        "keine provision auf das, was du verdienst",
        "null provision für dich",
        "der preis, den du festlegst, ist der preis, den du erhältst",
        "zusätzlich zu deinem preis",
        "kommt nie aus deiner tasche",
      ],
      "it-IT": [
        ...ENGLISH_REVERT_BANNED,
        "tieni l’intero prezzo",
        "nessuna commissione su quanto guadagni",
        "zero commissioni per te",
        "il prezzo che stabilisci è il prezzo che ricevi",
        "sopra il tuo prezzo",
        "non esce mai dalla tua tasca",
      ],
      "nl-NL": [
        ...ENGLISH_REVERT_BANNED,
        "hou de hele prijs",
        "geen commissie op wat je verdient",
        "nul commissie voor jou",
        "de prijs die jij bepaalt is de prijs die je ontvangt",
        "boven op jouw prijs",
        "komt nooit uit jouw zak",
      ],
    };

    checkBanned("become-provider.json", entries, BANNED);
  });

  it("admin.json's commission hint never describes a fee charged to the customer", () => {
    const modules = import.meta.glob<Record<string, unknown>>("../../locales/*/admin.json", {
      eager: true,
      import: "default",
    });
    const entries = byLocale(modules).map(({ locale, data }) => {
      const d = data as { providerDetailCommissionHint: string };
      return { locale, text: d.providerDetailCommissionHint };
    });

    const BANNED: Record<string, string[]> = {
      "en-US": ["charged to the customer"],
      "pt-MZ": ["taxa cobrada ao cliente"],
      "pt-PT": ["taxa cobrada ao cliente"],
      "es-ES": ["tarifa que paga el cliente"],
      "fr-FR": ["frais facturés au client"],
      "de-DE": ["dem kunden berechnete gebühr"],
      "it-IT": ["commissione addebitata al cliente"],
      "nl-NL": ["aan de klant berekende vergoeding"],
    };

    checkBanned("admin.json", entries, BANNED);
  });

  it("directory.json's trust line never claims the total includes a fee", () => {
    // Only the fee-INCLUSION claim is banned here, not "nothing is added
    // later" -- that guarantee is still true under the new model (the price
    // shown is the price paid, full stop) and is exactly what Fix 1 rewrote
    // this string to say instead. Do not extend this list to cover it: a
    // ban on the true half of the sentence would fail the very fix this
    // test exists to guard, the moment someone "completes" the pattern
    // without rereading why it stops here.
    const modules = import.meta.glob<Record<string, unknown>>("../../locales/*/directory.json", {
      eager: true,
      import: "default",
    });
    const entries = byLocale(modules).map(({ locale, data }) => {
      const d = data as { trustFeeIncluded: string };
      return { locale, text: d.trustFeeIncluded };
    });

    const BANNED: Record<string, string[]> = {
      "en-US": ["includes the service fee"],
      "pt-MZ": ["inclui a taxa de serviço"],
      "pt-PT": ["inclui a taxa de serviço"],
      "es-ES": ["incluye la tarifa de servicio"],
      "fr-FR": ["comprend déjà les frais de service"],
      "de-DE": ["servicegebühr ist im gesamtbetrag enthalten"],
      "it-IT": ["include già la commissione di servizio"],
      "nl-NL": ["is inclusief servicekosten"],
    };

    checkBanned("directory.json", entries, BANNED);
  });

  it("provider.json's rate label never hardcodes a percentage or describes a fee charged to the customer", () => {
    const modules = import.meta.glob<Record<string, unknown>>("../../locales/*/provider.json", {
      eager: true,
      import: "default",
    });
    const entries = byLocale(modules).map(({ locale, data }) => {
      const d = data as { commissionRateLabel: string };
      return { locale, text: d.commissionRateLabel };
    });

    // Two different failure modes in one list. "10%"/"0%" is the retracted
    // marketing figure creeping back into a label that must stay a pure
    // function of `commissionBps` -- the whole point of Task 2 is that 1200
    // in dev is 12%, not 10%, so a literal "10%" here can only mean the
    // number stopped being read from the prop. "charged to the customer" is
    // the retracted framing itself, in the exact words `admin.json`'s own
    // check already bans.
    //
    // Both spacings of the percent sign are banned in every locale, not just
    // the ones that write it with one (`fr-FR`, `de-DE`) -- a careless edit
    // pastes whichever spelling was already in front of it, not necessarily
    // the target locale's own. The English customer-charged phrase is banned
    // in every non-English list for the same reason this file's own header
    // now explains: an idiomatic translated ban misses a bad edit that
    // arrives in English and is never translated at all.
    const PERCENT = ["0%", "10%", "0 %", "10 %"];
    const CUSTOMER_CHARGED_EN = "charged to the customer";

    const BANNED: Record<string, string[]> = {
      "en-US": [...PERCENT, CUSTOMER_CHARGED_EN],
      "pt-MZ": [...PERCENT, CUSTOMER_CHARGED_EN, "taxa cobrada ao cliente"],
      "pt-PT": [...PERCENT, CUSTOMER_CHARGED_EN, "taxa cobrada ao cliente"],
      "es-ES": [...PERCENT, CUSTOMER_CHARGED_EN, "tarifa que paga el cliente"],
      "fr-FR": [...PERCENT, CUSTOMER_CHARGED_EN, "frais facturés au client"],
      "de-DE": [...PERCENT, CUSTOMER_CHARGED_EN, "dem kunden berechnete gebühr"],
      "it-IT": [...PERCENT, CUSTOMER_CHARGED_EN, "commissione addebitata al cliente"],
      "nl-NL": [...PERCENT, CUSTOMER_CHARGED_EN, "aan de klant berekende vergoeding"],
    };

    checkBanned("provider.json", entries, BANNED);
  });
});
