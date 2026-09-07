# Home Page Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the customer home page at `/` on the rules the listings refresh established — white ground, Figtree, navy, borderless — so it says what Ntizo sells and shows a price.

**Architecture:** `features/landing/ui/sections.tsx` is split into one file per section, because the page grows from four thin sections to six substantial ones and the flow screens alone are longer than today's whole file. The service tiles reuse `ServiceTile` from the directory feature, so there is one price treatment on the platform. One new query joins the landing's three; nothing changes on the server.

**Tech Stack:** React 19, TanStack Router + Query, Tailwind v4 with CSS custom properties, i18next (8 locales, parity-enforced), vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-09-07-home-refresh-design.md`

## Global Constraints

- **Work in this worktree.** `.claude/worktrees/home-refresh`, branch `feat/home-refresh`, cut from `origin/dev`.
- **All commands run from `apps/frontend/web`.** Tests: `pnpm test <path>`. Types: `pnpm typecheck`. Lint: `pnpm lint`.
- **Eight locales, no exceptions.** `src/shared/lib/__tests__/i18n-parity.test.ts` fails the build if any key is missing from any of `en-US`, `pt-PT`, `pt-MZ`, `es-ES`, `de-DE`, `fr-FR`, `it-IT`, `nl-NL`, or if interpolation placeholders differ between them.
- **One blue per page.** `--color-primary` appears only on the search button. Everything else is `--color-headline`, `--color-navy-surface`, `--color-navy-on`, foreground, muted-foreground, and `--color-warning` for stars.
- **No borders, no shadows, no cards** — except the three phone frames, which are devices.
- **Never invent data.** A null rating renders "no reviews yet", never `0,0`. An absent price renders no price line.
- **Do not delete `SurfaceArt` or the header's `overlay` prop.** `become-provider-page.tsx` imports `SurfaceArt` five times; `become-provider` and `company-page` both pass `overlay`.
- **Commit after every task.** Message style: lower-case `type(scope): sentence`, no trailing period.

---

### Task 1: The page's words, in eight languages

Everything else depends on these keys existing. Do this first, or every later test asserts against a raw key name.

**Files:**
- Modify: `src/shared/locales/en-US/landing.json`
- Modify: `src/shared/locales/pt-PT/landing.json`
- Modify: `src/shared/locales/pt-MZ/landing.json`
- Modify: `src/shared/locales/es-ES/landing.json`
- Modify: `src/shared/locales/de-DE/landing.json`
- Modify: `src/shared/locales/fr-FR/landing.json`
- Modify: `src/shared/locales/it-IT/landing.json`
- Modify: `src/shared/locales/nl-NL/landing.json`
- Test: `src/shared/lib/__tests__/i18n-parity.test.ts` (exists; must stay green)

**Interfaces:**
- Consumes: nothing.
- Produces: the `home` namespace object inside the `landing` namespace. Every later task reads it as `t("home.<key>")` with `useTranslation("landing")`.

Add one `"home"` object to each file, as a sibling of the existing `"footer"` object. Leave every existing key alone — Task 10 removes the dead ones once nothing reads them.

- [ ] **Step 1: Add the block to `en-US/landing.json`**

```json
  "home": {
    "heroTitle": "Hire someone who knows the work, at the price you see.",
    "heroSubtitle": "Plumbers, electricians, cleaning, beauty and more. Verified providers in Maputo, with the price and the duration fixed before you book.",
    "proofPrice": "Fixed price before you book",
    "proofVerified": "Verified providers",
    "proofPayment": "Pay with M-Pesa",
    "categoriesTitle": "Browse by category",
    "categoriesBlurb": "Pick a trade to see who works in it.",
    "categoriesAll": "All categories",
    "servicesTitle": "Popular services",
    "servicesBlurb": "Fixed price and duration. Book, and the amount does not change on the way.",
    "servicesAll": "See all services",
    "howTitle": "How it works",
    "howBlurb": "From the first tap to the work done, without a single call to agree a price.",
    "stepFindTitle": "Find",
    "stepFindBody": "Search for the service or pick a category. Every listing says the price, how long it takes and where it happens, before you speak to anyone.",
    "stepBookTitle": "Book",
    "stepBookBody": "Choose the time from the provider's real calendar and pay with M-Pesa. No deposit, no haggling at the door.",
    "stepDoneTitle": "Done",
    "stepDoneBody": "You get their address and phone number, and they arrive at the time booked. Afterwards, rate them: that is what decides who appears first.",
    "providersTitle": "Verified providers",
    "providersBlurb": "Identity and documents checked by Ntizo. Rated by the people who hired them.",
    "providersAll": "See all providers",
    "storiesTitle": "What customers say",
    "storiesBlurb": "Real reviews, from bookings made through Ntizo.",
    "bandTitle": "Work for yourself? Set your price and leave the calendar to us.",
    "bandBody": "List your services at the price and duration you set. Ntizo brings the customers, handles the booking and the M-Pesa payment, and keeps a fixed percentage you see before you publish.",
    "bandCta": "Create a provider account",
    "bandLink": "How it works for providers",
    "factPriceTitle": "The price is yours",
    "factPriceBody": "The customer pays exactly what you set.",
    "factAgendaTitle": "The calendar is yours",
    "factAgendaBody": "Bookings land only in the hours you open.",
    "factMoneyTitle": "The money arrives by M-Pesa",
    "factMoneyBody": "No collecting at the door.",
    "flowMore": "See {{count}} more services",
    "flowHours": "Available times · {{minutes}} min",
    "flowTotal": "Total to pay",
    "flowPay": "Pay with M-Pesa",
    "flowInstant": "Confirmed on your phone straight away",
    "flowConfirmed": "Booking confirmed",
    "flowPaid": "Paid {{amount}} with M-Pesa",
    "flowMessage": "Send a message",
    "flowBooking": "View booking",
    "flowReference": "Reference",
    "flowRate": "How did it go?"
  },
```

- [ ] **Step 2: Add the block to `pt-MZ/landing.json`**

```json
  "home": {
    "heroTitle": "Contrate quem sabe fazer, ao preço que vê.",
    "heroSubtitle": "Canalizadores, electricistas, limpeza, beleza e mais. Prestadores verificados em Maputo, com o preço e a duração fixos antes de reservar.",
    "proofPrice": "Preço fixo antes de reservar",
    "proofVerified": "Prestadores verificados",
    "proofPayment": "Pagamento por M-Pesa",
    "categoriesTitle": "Explorar por categoria",
    "categoriesBlurb": "Escolha um ofício para ver quem trabalha nele.",
    "categoriesAll": "Todas as categorias",
    "servicesTitle": "Serviços populares",
    "servicesBlurb": "Preço e duração fixos. Reserve, e o valor não muda pelo caminho.",
    "servicesAll": "Ver todos os serviços",
    "howTitle": "Como funciona",
    "howBlurb": "Do primeiro toque ao trabalho feito, sem uma única chamada para combinar preço.",
    "stepFindTitle": "Encontre",
    "stepFindBody": "Procure o serviço ou escolha uma categoria. Cada anúncio diz o preço, quanto tempo demora e onde acontece, antes de falar com alguém.",
    "stepBookTitle": "Reserve",
    "stepBookBody": "Escolha a hora na agenda real do prestador e pague por M-Pesa. Sem sinal, sem negociar à porta.",
    "stepDoneTitle": "Feito",
    "stepDoneBody": "Recebe a morada e o contacto dele, e ele vai ter consigo à hora marcada. No fim, avalie: é isso que decide quem aparece primeiro.",
    "providersTitle": "Prestadores verificados",
    "providersBlurb": "Identidade e documentos conferidos pela Ntizo. Avaliados por quem os contratou.",
    "providersAll": "Ver todos os prestadores",
    "storiesTitle": "O que dizem os clientes",
    "storiesBlurb": "Avaliações reais, de reservas feitas pela Ntizo.",
    "bandTitle": "Trabalha por conta própria? Ponha o seu preço e deixe a agenda connosco.",
    "bandBody": "Liste os serviços com o preço e a duração que definir. A Ntizo traz os clientes, trata da marcação e do pagamento por M-Pesa, e fica com uma percentagem fixa que vê antes de publicar.",
    "bandCta": "Criar conta de prestador",
    "bandLink": "Como funciona para prestadores",
    "factPriceTitle": "O preço é seu",
    "factPriceBody": "O cliente paga exactamente o valor que definiu.",
    "factAgendaTitle": "A agenda é sua",
    "factAgendaBody": "Marca-se só nas horas que abrir.",
    "factMoneyTitle": "O dinheiro chega por M-Pesa",
    "factMoneyBody": "Sem cobrar à porta.",
    "flowMore": "Ver mais {{count}} serviços",
    "flowHours": "Horas disponíveis · {{minutes}} min",
    "flowTotal": "Total a pagar",
    "flowPay": "Pagar por M-Pesa",
    "flowInstant": "Confirmação imediata no telemóvel",
    "flowConfirmed": "Reserva confirmada",
    "flowPaid": "Pago {{amount}} por M-Pesa",
    "flowMessage": "Enviar mensagem",
    "flowBooking": "Ver reserva",
    "flowReference": "Referência",
    "flowRate": "Como correu?"
  },
```

- [ ] **Step 3: Add the block to `pt-PT/landing.json`**

Copy the block from Step 2 verbatim, every key, no changes.

The two Portugueses are allowed to diverge — that is why `pt-MZ` is a real file rather than an alias, as `i18n.ts` explains — but nothing on this page is a place where they do. Every listed business is in Maputo and M-Pesa is the only method the checkout charges, so a pt-PT reader needs the same sentences and the same payment name. Do not invent a difference: naming a Portuguese payment method here would advertise something the checkout refuses.

- [ ] **Step 4: Add the block to `es-ES/landing.json`**

```json
  "home": {
    "heroTitle": "Contrata a quien sabe hacerlo, al precio que ves.",
    "heroSubtitle": "Fontaneros, electricistas, limpieza, belleza y más. Profesionales verificados, con el precio y la duración fijados antes de reservar.",
    "proofPrice": "Precio fijo antes de reservar",
    "proofVerified": "Profesionales verificados",
    "proofPayment": "Pago con M-Pesa",
    "categoriesTitle": "Explorar por categoría",
    "categoriesBlurb": "Elige un oficio para ver quién trabaja en él.",
    "categoriesAll": "Todas las categorías",
    "servicesTitle": "Servicios populares",
    "servicesBlurb": "Precio y duración fijos. Reserva, y el importe no cambia por el camino.",
    "servicesAll": "Ver todos los servicios",
    "howTitle": "Cómo funciona",
    "howBlurb": "Del primer toque al trabajo hecho, sin una sola llamada para acordar el precio.",
    "stepFindTitle": "Encuentra",
    "stepFindBody": "Busca el servicio o elige una categoría. Cada anuncio dice el precio, cuánto tarda y dónde ocurre, antes de hablar con nadie.",
    "stepBookTitle": "Reserva",
    "stepBookBody": "Elige la hora en la agenda real del profesional y paga con M-Pesa. Sin señal, sin negociar en la puerta.",
    "stepDoneTitle": "Hecho",
    "stepDoneBody": "Recibes su dirección y su teléfono, y llega a la hora reservada. Al final, valóralo: eso decide quién aparece primero.",
    "providersTitle": "Profesionales verificados",
    "providersBlurb": "Identidad y documentos comprobados por Ntizo. Valorados por quienes los contrataron.",
    "providersAll": "Ver todos los profesionales",
    "storiesTitle": "Lo que dicen los clientes",
    "storiesBlurb": "Valoraciones reales, de reservas hechas por Ntizo.",
    "bandTitle": "¿Trabajas por tu cuenta? Pon tu precio y déjanos la agenda.",
    "bandBody": "Publica tus servicios con el precio y la duración que fijes. Ntizo trae los clientes, gestiona la reserva y el pago con M-Pesa, y se queda un porcentaje fijo que ves antes de publicar.",
    "bandCta": "Crear cuenta de profesional",
    "bandLink": "Cómo funciona para profesionales",
    "factPriceTitle": "El precio es tuyo",
    "factPriceBody": "El cliente paga exactamente lo que fijaste.",
    "factAgendaTitle": "La agenda es tuya",
    "factAgendaBody": "Solo se reserva en las horas que abras.",
    "factMoneyTitle": "El dinero llega por M-Pesa",
    "factMoneyBody": "Sin cobrar en la puerta.",
    "flowMore": "Ver {{count}} servicios más",
    "flowHours": "Horas disponibles · {{minutes}} min",
    "flowTotal": "Total a pagar",
    "flowPay": "Pagar con M-Pesa",
    "flowInstant": "Confirmación inmediata en el móvil",
    "flowConfirmed": "Reserva confirmada",
    "flowPaid": "Pagado {{amount}} con M-Pesa",
    "flowMessage": "Enviar mensaje",
    "flowBooking": "Ver reserva",
    "flowReference": "Referencia",
    "flowRate": "¿Qué tal fue?"
  },
```

- [ ] **Step 5: Add the block to `fr-FR/landing.json`**

```json
  "home": {
    "heroTitle": "Faites appel à quelqu'un qui sait faire, au prix affiché.",
    "heroSubtitle": "Plomberie, électricité, ménage, beauté et plus encore. Des prestataires vérifiés, avec le prix et la durée fixés avant la réservation.",
    "proofPrice": "Prix fixe avant de réserver",
    "proofVerified": "Prestataires vérifiés",
    "proofPayment": "Paiement par M-Pesa",
    "categoriesTitle": "Explorer par catégorie",
    "categoriesBlurb": "Choisissez un métier pour voir qui l'exerce.",
    "categoriesAll": "Toutes les catégories",
    "servicesTitle": "Services populaires",
    "servicesBlurb": "Prix et durée fixes. Réservez, et le montant ne change pas en chemin.",
    "servicesAll": "Voir tous les services",
    "howTitle": "Comment ça marche",
    "howBlurb": "Du premier clic au travail fait, sans un seul appel pour négocier le prix.",
    "stepFindTitle": "Trouvez",
    "stepFindBody": "Cherchez le service ou choisissez une catégorie. Chaque annonce indique le prix, la durée et le lieu, avant de parler à qui que ce soit.",
    "stepBookTitle": "Réservez",
    "stepBookBody": "Choisissez l'heure dans l'agenda réel du prestataire et payez par M-Pesa. Sans acompte, sans négocier sur le pas de la porte.",
    "stepDoneTitle": "C'est fait",
    "stepDoneBody": "Vous recevez son adresse et son téléphone, et il arrive à l'heure réservée. Ensuite, notez-le : c'est ce qui décide qui apparaît en premier.",
    "providersTitle": "Prestataires vérifiés",
    "providersBlurb": "Identité et documents contrôlés par Ntizo. Notés par ceux qui les ont engagés.",
    "providersAll": "Voir tous les prestataires",
    "storiesTitle": "Ce que disent les clients",
    "storiesBlurb": "De vrais avis, sur des réservations faites via Ntizo.",
    "bandTitle": "Vous travaillez à votre compte ? Fixez votre prix, on s'occupe de l'agenda.",
    "bandBody": "Publiez vos services au prix et à la durée que vous fixez. Ntizo amène les clients, gère la réservation et le paiement par M-Pesa, et garde un pourcentage fixe que vous voyez avant de publier.",
    "bandCta": "Créer un compte prestataire",
    "bandLink": "Comment ça marche pour les prestataires",
    "factPriceTitle": "Le prix est le vôtre",
    "factPriceBody": "Le client paie exactement ce que vous avez fixé.",
    "factAgendaTitle": "L'agenda est le vôtre",
    "factAgendaBody": "On ne réserve que sur les heures que vous ouvrez.",
    "factMoneyTitle": "L'argent arrive par M-Pesa",
    "factMoneyBody": "Sans encaisser sur le pas de la porte.",
    "flowMore": "Voir {{count}} services de plus",
    "flowHours": "Heures disponibles · {{minutes}} min",
    "flowTotal": "Total à payer",
    "flowPay": "Payer par M-Pesa",
    "flowInstant": "Confirmation immédiate sur le téléphone",
    "flowConfirmed": "Réservation confirmée",
    "flowPaid": "Payé {{amount}} par M-Pesa",
    "flowMessage": "Envoyer un message",
    "flowBooking": "Voir la réservation",
    "flowReference": "Référence",
    "flowRate": "Comment ça s'est passé ?"
  },
```

- [ ] **Step 6: Add the block to `de-DE/landing.json`**

```json
  "home": {
    "heroTitle": "Beauftragen Sie jemanden, der es kann, zum angezeigten Preis.",
    "heroSubtitle": "Sanitär, Elektrik, Reinigung, Beauty und mehr. Geprüfte Anbieter, mit Preis und Dauer fest vor der Buchung.",
    "proofPrice": "Fester Preis vor der Buchung",
    "proofVerified": "Geprüfte Anbieter",
    "proofPayment": "Zahlung per M-Pesa",
    "categoriesTitle": "Nach Kategorie stöbern",
    "categoriesBlurb": "Wählen Sie ein Gewerk und sehen Sie, wer darin arbeitet.",
    "categoriesAll": "Alle Kategorien",
    "servicesTitle": "Beliebte Leistungen",
    "servicesBlurb": "Fester Preis, feste Dauer. Buchen Sie, und der Betrag ändert sich unterwegs nicht.",
    "servicesAll": "Alle Leistungen ansehen",
    "howTitle": "So funktioniert es",
    "howBlurb": "Vom ersten Tippen bis zur erledigten Arbeit, ohne einen einzigen Anruf zur Preisabsprache.",
    "stepFindTitle": "Finden",
    "stepFindBody": "Suchen Sie die Leistung oder wählen Sie eine Kategorie. Jedes Angebot nennt Preis, Dauer und Ort, bevor Sie mit jemandem sprechen.",
    "stepBookTitle": "Buchen",
    "stepBookBody": "Wählen Sie die Uhrzeit im echten Kalender des Anbieters und zahlen Sie per M-Pesa. Ohne Anzahlung, ohne Verhandeln an der Tür.",
    "stepDoneTitle": "Erledigt",
    "stepDoneBody": "Sie erhalten Adresse und Telefonnummer, und er kommt zur gebuchten Zeit. Danach bewerten Sie: das entscheidet, wer zuerst erscheint.",
    "providersTitle": "Geprüfte Anbieter",
    "providersBlurb": "Identität und Unterlagen von Ntizo geprüft. Bewertet von denen, die sie beauftragt haben.",
    "providersAll": "Alle Anbieter ansehen",
    "storiesTitle": "Was Kundinnen und Kunden sagen",
    "storiesBlurb": "Echte Bewertungen aus Buchungen über Ntizo.",
    "bandTitle": "Selbstständig? Setzen Sie Ihren Preis, den Kalender übernehmen wir.",
    "bandBody": "Stellen Sie Ihre Leistungen zu dem Preis und der Dauer ein, die Sie festlegen. Ntizo bringt die Kunden, übernimmt Buchung und M-Pesa-Zahlung und behält einen festen Prozentsatz, den Sie vor dem Veröffentlichen sehen.",
    "bandCta": "Anbieterkonto erstellen",
    "bandLink": "So funktioniert es für Anbieter",
    "factPriceTitle": "Der Preis gehört Ihnen",
    "factPriceBody": "Die Kundschaft zahlt genau das, was Sie festgelegt haben.",
    "factAgendaTitle": "Der Kalender gehört Ihnen",
    "factAgendaBody": "Gebucht wird nur zu den Zeiten, die Sie öffnen.",
    "factMoneyTitle": "Das Geld kommt per M-Pesa",
    "factMoneyBody": "Kein Kassieren an der Tür.",
    "flowMore": "{{count}} weitere Leistungen ansehen",
    "flowHours": "Verfügbare Zeiten · {{minutes}} Min.",
    "flowTotal": "Zu zahlen",
    "flowPay": "Per M-Pesa zahlen",
    "flowInstant": "Sofortige Bestätigung auf dem Handy",
    "flowConfirmed": "Buchung bestätigt",
    "flowPaid": "{{amount}} per M-Pesa bezahlt",
    "flowMessage": "Nachricht senden",
    "flowBooking": "Buchung ansehen",
    "flowReference": "Referenz",
    "flowRate": "Wie ist es gelaufen?"
  },
```

- [ ] **Step 7: Add the block to `it-IT/landing.json`**

```json
  "home": {
    "heroTitle": "Affida il lavoro a chi sa farlo, al prezzo che vedi.",
    "heroSubtitle": "Idraulici, elettricisti, pulizie, bellezza e altro. Professionisti verificati, con prezzo e durata fissati prima di prenotare.",
    "proofPrice": "Prezzo fisso prima di prenotare",
    "proofVerified": "Professionisti verificati",
    "proofPayment": "Pagamento con M-Pesa",
    "categoriesTitle": "Esplora per categoria",
    "categoriesBlurb": "Scegli un mestiere per vedere chi lo esercita.",
    "categoriesAll": "Tutte le categorie",
    "servicesTitle": "Servizi popolari",
    "servicesBlurb": "Prezzo e durata fissi. Prenota, e l'importo non cambia per strada.",
    "servicesAll": "Vedi tutti i servizi",
    "howTitle": "Come funziona",
    "howBlurb": "Dal primo tocco al lavoro finito, senza una sola telefonata per concordare il prezzo.",
    "stepFindTitle": "Trova",
    "stepFindBody": "Cerca il servizio o scegli una categoria. Ogni annuncio dice il prezzo, quanto dura e dove avviene, prima di parlare con qualcuno.",
    "stepBookTitle": "Prenota",
    "stepBookBody": "Scegli l'ora nell'agenda reale del professionista e paga con M-Pesa. Senza caparra, senza trattare sulla porta.",
    "stepDoneTitle": "Fatto",
    "stepDoneBody": "Ricevi il suo indirizzo e il suo telefono, e arriva all'ora prenotata. Alla fine, valutalo: è questo che decide chi appare per primo.",
    "providersTitle": "Professionisti verificati",
    "providersBlurb": "Identità e documenti controllati da Ntizo. Valutati da chi li ha ingaggiati.",
    "providersAll": "Vedi tutti i professionisti",
    "storiesTitle": "Cosa dicono i clienti",
    "storiesBlurb": "Recensioni vere, da prenotazioni fatte tramite Ntizo.",
    "bandTitle": "Lavori in proprio? Metti il tuo prezzo e lascia a noi l'agenda.",
    "bandBody": "Pubblica i tuoi servizi al prezzo e alla durata che decidi. Ntizo porta i clienti, gestisce la prenotazione e il pagamento con M-Pesa, e trattiene una percentuale fissa che vedi prima di pubblicare.",
    "bandCta": "Crea un account professionista",
    "bandLink": "Come funziona per i professionisti",
    "factPriceTitle": "Il prezzo è tuo",
    "factPriceBody": "Il cliente paga esattamente quello che hai deciso.",
    "factAgendaTitle": "L'agenda è tua",
    "factAgendaBody": "Si prenota solo nelle ore che apri.",
    "factMoneyTitle": "I soldi arrivano con M-Pesa",
    "factMoneyBody": "Senza incassare sulla porta.",
    "flowMore": "Vedi altri {{count}} servizi",
    "flowHours": "Orari disponibili · {{minutes}} min",
    "flowTotal": "Totale da pagare",
    "flowPay": "Paga con M-Pesa",
    "flowInstant": "Conferma immediata sul telefono",
    "flowConfirmed": "Prenotazione confermata",
    "flowPaid": "Pagato {{amount}} con M-Pesa",
    "flowMessage": "Invia un messaggio",
    "flowBooking": "Vedi la prenotazione",
    "flowReference": "Riferimento",
    "flowRate": "Com'è andata?"
  },
```

- [ ] **Step 8: Add the block to `nl-NL/landing.json`**

```json
  "home": {
    "heroTitle": "Huur iemand in die het kan, voor de prijs die je ziet.",
    "heroSubtitle": "Loodgieters, elektriciens, schoonmaak, beauty en meer. Geverifieerde aanbieders, met prijs en duur vast vóór je boekt.",
    "proofPrice": "Vaste prijs voor je boekt",
    "proofVerified": "Geverifieerde aanbieders",
    "proofPayment": "Betalen met M-Pesa",
    "categoriesTitle": "Zoek op categorie",
    "categoriesBlurb": "Kies een vak en zie wie erin werkt.",
    "categoriesAll": "Alle categorieën",
    "servicesTitle": "Populaire diensten",
    "servicesBlurb": "Vaste prijs en duur. Boek, en het bedrag verandert onderweg niet.",
    "servicesAll": "Bekijk alle diensten",
    "howTitle": "Hoe het werkt",
    "howBlurb": "Van de eerste tik tot het werk gedaan, zonder één telefoontje over de prijs.",
    "stepFindTitle": "Vind",
    "stepFindBody": "Zoek de dienst of kies een categorie. Elke aanbieding noemt de prijs, hoe lang het duurt en waar het gebeurt, voor je iemand spreekt.",
    "stepBookTitle": "Boek",
    "stepBookBody": "Kies het tijdstip in de echte agenda van de aanbieder en betaal met M-Pesa. Geen aanbetaling, geen onderhandelen aan de deur.",
    "stepDoneTitle": "Klaar",
    "stepDoneBody": "Je krijgt het adres en telefoonnummer, en hij komt op het geboekte tijdstip. Beoordeel achteraf: dat bepaalt wie het eerst verschijnt.",
    "providersTitle": "Geverifieerde aanbieders",
    "providersBlurb": "Identiteit en documenten gecontroleerd door Ntizo. Beoordeeld door wie ze inhuurde.",
    "providersAll": "Bekijk alle aanbieders",
    "storiesTitle": "Wat klanten zeggen",
    "storiesBlurb": "Echte beoordelingen, van boekingen via Ntizo.",
    "bandTitle": "Werk je voor jezelf? Bepaal je prijs, wij doen de agenda.",
    "bandBody": "Zet je diensten online tegen de prijs en duur die jij bepaalt. Ntizo brengt de klanten, regelt de boeking en de M-Pesa-betaling, en houdt een vast percentage dat je ziet voor je publiceert.",
    "bandCta": "Aanbiedersaccount aanmaken",
    "bandLink": "Hoe het werkt voor aanbieders",
    "factPriceTitle": "De prijs is van jou",
    "factPriceBody": "De klant betaalt precies wat jij hebt bepaald.",
    "factAgendaTitle": "De agenda is van jou",
    "factAgendaBody": "Er wordt alleen geboekt in de uren die je openzet.",
    "factMoneyTitle": "Het geld komt via M-Pesa",
    "factMoneyBody": "Geen geld innen aan de deur.",
    "flowMore": "Bekijk {{count}} diensten meer",
    "flowHours": "Beschikbare tijden · {{minutes}} min",
    "flowTotal": "Te betalen",
    "flowPay": "Betalen met M-Pesa",
    "flowInstant": "Meteen bevestigd op je telefoon",
    "flowConfirmed": "Boeking bevestigd",
    "flowPaid": "{{amount}} betaald met M-Pesa",
    "flowMessage": "Bericht sturen",
    "flowBooking": "Boeking bekijken",
    "flowReference": "Referentie",
    "flowRate": "Hoe ging het?"
  },
```

- [ ] **Step 9: Run the parity gate**

Run: `pnpm test src/shared/lib/__tests__/i18n-parity.test.ts`
Expected: PASS. A failure names the locale and the key that is missing or whose `{{placeholder}}` set differs — fix that file and run again.

- [ ] **Step 10: Commit**

```bash
git add src/shared/locales
git commit -m "feat(home): the words the rebuilt home page needs, in eight languages"
```

---

### Task 2: A provider's door in the header

**Files:**
- Modify: `src/shared/components/site-header.tsx`
- Test: `src/shared/components/__tests__/site-header.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `SiteHeader` accepts `providerCta?: boolean` (default `false`). Task 4 passes it.

An opt-in prop, not an always-on link: seven other surfaces import this header and the `search` variant's right column is already documented as crowded.

- [ ] **Step 1: Write the failing tests**

Append to `src/shared/components/__tests__/site-header.test.tsx`, inside the existing `describe("SiteHeader")`:

```tsx
  it("offers the provider a door when asked", async () => {
    await renderHeader({ providerCta: true });
    expect(
      screen.getByRole("link", { name: "Become a Provider" }).getAttribute("href"),
    ).toBe("/become-provider");
  });

  // Seven surfaces import this header and none of them asked for a new link.
  // The prop is the whole point: absent, the header they render is unchanged.
  it("grows no link for the callers that did not ask", async () => {
    await renderHeader();
    expect(screen.queryByRole("link", { name: "Become a Provider" })).toBeNull();
  });
```

- [ ] **Step 2: Run them and watch the first fail**

Run: `pnpm test src/shared/components/__tests__/site-header.test.tsx`
Expected: the first FAILS ("Unable to find role link"), the second PASSES.

- [ ] **Step 3: Add the prop**

In `site-header.tsx`, add to the props type, beside `search`:

```tsx
  /**
   * Renders "Become a Provider" in the right-hand cluster.
   *
   * Opt-in rather than always on. Seven other surfaces import this header and
   * none of them asked for another link, and the `search` variant's right
   * column is already tight enough to carry a `whitespace-nowrap` fix. The
   * home page is the one page whose second reader is a provider.
   */
  providerCta?: boolean;
```

Destructure it with `providerCta = false`, then render it immediately before `<HeaderActions`, inside the same `<div>`:

```tsx
          {providerCta && (
            <Link
              to="/become-provider"
              className="hidden text-sm font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] lg:inline"
            >
              {t("footer.becomeProvider")}
            </Link>
          )}
```

The key is the footer's existing one — the same words, already translated in all eight locales, and a second key saying "Become a Provider" is a second place for them to drift.

- [ ] **Step 4: Run the tests**

Run: `pnpm test src/shared/components/__tests__/site-header.test.tsx`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add src/shared/components/site-header.tsx src/shared/components/__tests__/site-header.test.tsx
git commit -m "feat(header): a page can offer the provider a door of its own"
```

---

### Task 3: The services the home page recommends

**Files:**
- Create: `src/features/landing/data/service.repository.ts`
- Create: `src/features/landing/viewmodel/use-popular-services.ts`
- Test: `src/features/landing/data/__tests__/service.repository.test.ts`

**Interfaces:**
- Consumes: `publicGraphql` from `@/shared/lib/graphql/public-graphql`; `SERVICE_FIELDS` from `@/features/directory/services/data/service.repository`; `ServicePageDTO` from `@ntizo/shared/read-models`.
- Produces:
  - `landingServiceQueries.popular(locale: string, limit: number)` → `queryOptions` yielding `ServicePageDTO`, key `["public", "services", "popular", locale, limit]`.
  - `usePopularServices(limit: number)` → `UseQueryResult<ServicePageDTO>`. Task 6 calls it.

Its own query rather than `browseServicesQueries.page`, for the reason `landingProviderQueries.popular` gives in its own comment: the two want different sizes, and sharing a cache entry would make the home page render whatever the browse had last filtered down to.

- [ ] **Step 1: Write the failing test**

Create `src/features/landing/data/__tests__/service.repository.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { landingServiceQueries } from "../service.repository";

vi.mock("@/shared/lib/graphql/public-graphql", () => ({
  publicGraphql: vi.fn(async () => ({ serviceAll: { items: [], nextOffset: null, total: 0 } })),
}));
const { publicGraphql } = await import("@/shared/lib/graphql/public-graphql");

describe("landingServiceQueries.popular", () => {
  it("keys on the locale and the size, so two callers never share a payload", () => {
    expect(landingServiceQueries.popular("pt-MZ", 8).queryKey).toEqual([
      "public",
      "services",
      "popular",
      "pt-MZ",
      8,
    ]);
  });

  it("asks for the provider's own arrangement, which is what Sugeridos means", async () => {
    const options = landingServiceQueries.popular("pt-MZ", 8);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (options.queryFn as any)({});
    const [, variables] = vi.mocked(publicGraphql).mock.calls[0]!;
    // No `sort`. Absent is the provider's arrangement; "newest" and "price"
    // each throw it away, and neither is what a home page means by popular.
    expect(variables).toEqual({ input: { locale: "pt-MZ", limit: 8, offset: 0 } });
  });

  it("asks for the fields the tile draws", async () => {
    const options = landingServiceQueries.popular("pt-MZ", 8);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (options.queryFn as any)({});
    const [query] = vi.mocked(publicGraphql).mock.calls[0]!;
    // The one field whose absence shipped /providers/undefined for a release.
    expect(query).toContain("providerSlug");
    expect(query).toContain("defaultOption");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/features/landing/data/__tests__/service.repository.test.ts`
Expected: FAIL — "Failed to resolve import ../service.repository".

- [ ] **Step 3: Write the repository**

Create `src/features/landing/data/service.repository.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import type { ServicePageDTO } from "@ntizo/shared/read-models";
import { publicGraphql } from "@/shared/lib/graphql/public-graphql";
import { SERVICE_FIELDS } from "@/features/directory/services/data/service.repository";

/**
 * The services the home page puts under "popular".
 *
 * `SERVICE_FIELDS` is imported rather than restated: the home page draws the
 * browse's own `ServiceTile`, so a field the browse adds and this string
 * forgets is a field the tile silently renders as nothing.
 */
const POPULAR = `
  query LandingPopularServices($input: ServiceAllInput!) {
    serviceAll(input: $input) {
      items {${SERVICE_FIELDS}
      }
      nextOffset
      total
    }
  }`;

export const landingServiceQueries = {
  /**
   * Its own query rather than the browse's first page, for the reason
   * `landingProviderQueries.popular` and `categoryQueries.preview` both give:
   * the two want different sizes, and sharing a cache entry would make the
   * home page render whatever the browse had last filtered down to.
   *
   * No `sort`, which is the provider's own arrangement — what `/services`
   * calls "Sugeridos". `newest` and `price` each discard that arrangement,
   * and neither answers what a home page means by "popular".
   *
   * The locale is in the key because the tile prints the category name the
   * server resolved.
   */
  popular: (locale: string, limit: number) =>
    queryOptions({
      queryKey: ["public", "services", "popular", locale, limit] as const,
      queryFn: async (): Promise<ServicePageDTO> => {
        const d = await publicGraphql<{ serviceAll: ServicePageDTO }>(POPULAR, {
          input: { locale, limit, offset: 0 },
        });
        return d.serviceAll;
      },
    }),
};
```

- [ ] **Step 4: Write the hook**

Create `src/features/landing/viewmodel/use-popular-services.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { landingServiceQueries } from "../data/service.repository";
import { useLocale } from "./use-locale";

/** The priced services the home page leads with. */
export function usePopularServices(limit: number) {
  return useQuery(landingServiceQueries.popular(useLocale(), limit));
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test src/features/landing/data/__tests__/service.repository.test.ts`
Expected: PASS, three cases.

- [ ] **Step 6: Commit**

```bash
git add src/features/landing/data/service.repository.ts src/features/landing/viewmodel/use-popular-services.ts src/features/landing/data/__tests__/service.repository.test.ts
git commit -m "feat(home): the home page can ask for priced services, not only providers"
```

---

### Task 4: The hero

**Files:**
- Rewrite: `src/features/landing/ui/hero.tsx`
- Create: `src/features/landing/ui/hero-collage.tsx`
- Test: `src/features/landing/ui/__tests__/hero.test.tsx`

**Interfaces:**
- Consumes: `SiteHeader` with `providerCta` (Task 2); `ServiceSearch`; `BrandTile` from `@/shared/components/browse/brand-tile`; `t("home.*")` (Task 1).
- Produces: `Hero` (no props), `HeroCollage` (no props). Task 10 composes `Hero`.

- [ ] **Step 1: Write the failing test**

Create `src/features/landing/ui/__tests__/hero.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { Hero } from "../hero";

async function renderHero() {
  const rootRoute = createRootRoute();
  const stub = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <p>{path}</p> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <Hero /> }),
      ...["/sign-in", "/services", "/providers", "/become-provider"].map(stub),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("Hero", () => {
  it("leads with the offer rather than a slogan", async () => {
    await renderHero();
    expect(
      await screen.findByRole("heading", { level: 1, name: /at the price you see/i }),
    ).toBeInTheDocument();
  });

  it("makes three promises the platform can keep today", async () => {
    await renderHero();
    expect(screen.getByText("Fixed price before you book")).toBeInTheDocument();
    expect(screen.getByText("Verified providers")).toBeInTheDocument();
    expect(screen.getByText("Pay with M-Pesa")).toBeInTheDocument();
  });

  it("carries the search that reaches the catalogue", async () => {
    await renderHero();
    expect(screen.getByLabelText("Search services")).toBeInTheDocument();
  });

  it("offers the provider their own door", async () => {
    await renderHero();
    expect(
      screen.getByRole("link", { name: "Become a Provider" }).getAttribute("href"),
    ).toBe("/become-provider");
  });

  // The collage stands in for photographs nobody has uploaded. A grey box
  // reads as a page that failed to load; the brand tile reads as a designed
  // state, and it is what every other empty surface on the platform draws.
  it("draws the brand rather than a grey box while there are no photographs", async () => {
    await renderHero();
    expect(screen.getAllByTestId("brand-tile")).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/features/landing/ui/__tests__/hero.test.tsx`
Expected: FAIL — the heading is still "Find it. Book it. Done."

- [ ] **Step 3: Write the collage**

Create `src/features/landing/ui/hero-collage.tsx`:

```tsx
import { BrandTile } from "@/shared/components/browse/brand-tile";

/**
 * Three photographs of the work, at two scales.
 *
 * Ntizo owns none yet, so all three draw the brand tile — the same designed
 * empty state every listing uses. When the company has photographs, they
 * replace `SLOTS` and nothing else here changes.
 *
 * The names are what the tile prints when it has no picture, so the empty
 * state still says which trades this marketplace is for.
 */
const SLOTS = [
  { name: "Pintura", className: "row-span-2" },
  { name: "Beleza", className: "" },
  { name: "Carpintaria", className: "" },
] as const;

export function HeroCollage() {
  return (
    <div
      aria-hidden="true"
      className="grid h-[360px] grid-cols-[1.15fr_1fr] grid-rows-2 gap-3 lg:h-[520px]"
    >
      {SLOTS.map((slot) => (
        <div
          key={slot.name}
          className={`relative overflow-hidden rounded-[20px] bg-[var(--color-navy-surface)] ${slot.className}`}
        >
          <BrandTile name={slot.name} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Rewrite the hero**

Replace the whole of `src/features/landing/ui/hero.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Tag, ShieldCheck, Smartphone } from "lucide-react";
import { SiteHeader } from "@/shared/components/site-header";
import { ServiceSearch } from "@/shared/components/service-search";
import { HeroCollage } from "@/features/landing/ui/hero-collage";

/**
 * The offer, the search, and three photographs.
 *
 * White, not artwork. The header used to sit on a generated gradient with a
 * wave cut out of the bottom of it, which is why it needed `overlay`; the
 * page now begins where every other public page begins, so the header is the
 * ordinary solid one. `overlay` stays on the component — `become-provider`
 * and the company pages still pass it — and so does `SurfaceArt`, which
 * `become-provider-page.tsx` imports five times.
 *
 * The headline is the offer in a customer's words. "Encontre. Reserve.
 * Feito." was a slogan that said nothing about what is being sold; it now
 * titles the three steps under "Como funciona", where it does a job.
 */
export function Hero() {
  const { t } = useTranslation("landing"); // t:Hero

  return (
    <>
      <SiteHeader providerCta />
      <section className="page-shell grid items-center gap-10 pb-14 pt-12 lg:grid-cols-[minmax(0,1fr)_580px] lg:gap-[72px]">
        <div>
          <h1 className="font-display max-w-[13ch] text-[clamp(2.4rem,5.2vw,3.6rem)] font-extrabold leading-[1.02] tracking-[-0.035em] text-[var(--color-headline)]">
            {t("home.heroTitle")}
          </h1>
          <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-[var(--color-foreground)]">
            {t("home.heroSubtitle")}
          </p>
          <ServiceSearch className="mt-7 max-w-[640px]" />
          {/* Three claims the read models can support today. The version this
              replaces promised "payment held until it's done", which nothing
              on the platform does. */}
          <ul className="mt-6 flex flex-wrap gap-x-7 gap-y-2.5">
            {[
              { Icon: Tag, label: t("home.proofPrice") },
              { Icon: ShieldCheck, label: t("home.proofVerified") },
              { Icon: Smartphone, label: t("home.proofPayment") },
            ].map(({ Icon, label }) => (
              <li key={label} className="flex items-center gap-2.5 text-sm font-medium">
                <Icon
                  className="h-5 w-5 text-[var(--color-headline)]"
                  strokeWidth={1.7}
                  aria-hidden="true"
                />
                {label}
              </li>
            ))}
          </ul>
        </div>
        <HeroCollage />
      </section>
    </>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test src/features/landing/ui/__tests__/hero.test.tsx`
Expected: PASS, five cases. If "Search services" is not found, check `ServiceSearch`'s own `aria-label` and match it.

- [ ] **Step 6: Commit**

```bash
git add src/features/landing/ui/hero.tsx src/features/landing/ui/hero-collage.tsx src/features/landing/ui/__tests__/hero.test.tsx
git commit -m "feat(home): the hero says the offer and proves it, on a white page"
```

---

### Task 5: The section heading, and categories with pictures

**Files:**
- Create: `src/features/landing/ui/section-head.tsx`
- Create: `src/features/landing/ui/category-grid.tsx`
- Test: `src/features/landing/ui/__tests__/category-grid.test.tsx`

**Interfaces:**
- Consumes: `useCategoryPreview(limit)` from `../viewmodel/use-categories`; `CategoryDTO` (`{ id, code, name, description, imageUrl, icon, isFallback }`).
- Produces:
  - `SectionHead({ title, blurb?, more? })` where `more` is `{ label: string; to: string }`. Tasks 6, 7, 8 and 9 all import it.
  - `CategoryGrid` (no props) and `LANDING_CATEGORIES = 8`. Task 10 composes it.

`SectionHead` is created here because this is the first section that needs one. It has no test of its own — it renders no logic, and every section's test asserts the heading and the "see all" link it produces.

- [ ] **Step 1: Write the failing test**

Create `src/features/landing/ui/__tests__/category-grid.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import i18n from "i18next";
import type { CategoryDTO } from "@ntizo/shared/read-models";
import { CategoryGrid, LANDING_CATEGORIES } from "../category-grid";

function category(over: Partial<CategoryDTO> = {}): CategoryDTO {
  return {
    id: "c-1",
    code: "plumbing",
    name: "Plumbing",
    description: null,
    imageUrl: "https://cdn.example/plumbing.jpg",
    icon: "wrench",
    isFallback: false,
    ...over,
  };
}

/** The hook's own key. Seeding the cache beats mocking the transport. */
function previewKey() {
  return ["categories", "preview", i18n.resolvedLanguage ?? i18n.language, LANDING_CATEGORIES];
}

async function renderGrid(items: CategoryDTO[]) {
  const rootRoute = createRootRoute();
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <CategoryGrid /> }),
      createRoute({ getParentRoute: () => rootRoute, path: "/services", component: () => <p>services</p> }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(previewKey(), { items, nextOffset: null });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("CategoryGrid", () => {
  it("sends a tile to that category's services", async () => {
    await renderGrid([category()]);
    expect(
      (await screen.findByRole("link", { name: "Plumbing" })).getAttribute("href"),
    ).toBe("/services?category=plumbing");
  });

  it("draws the category's photograph when it has one", async () => {
    await renderGrid([category()]);
    expect(screen.getByRole("presentation")).toHaveAttribute(
      "src",
      "https://cdn.example/plumbing.jpg",
    );
  });

  // The bug on dev today: four categories with no image draw one repeated
  // mark, which reads as a broken grid rather than as a set of choices.
  it("draws the category's own icon rather than one repeated mark", async () => {
    await renderGrid([
      category({ id: "a", code: "plumbing", name: "Plumbing", imageUrl: null, icon: "wrench" }),
      category({ id: "b", code: "beauty", name: "Beauty", imageUrl: null, icon: "scissors" }),
    ]);
    expect(await screen.findByTestId("category-icon-wrench")).toBeInTheDocument();
    expect(screen.getByTestId("category-icon-scissors")).toBeInTheDocument();
    expect(screen.queryByTestId("brand-tile")).toBeNull();
  });

  it("falls back to one shape for a category whose icon nobody set", async () => {
    await renderGrid([category({ imageUrl: null, icon: null })]);
    expect(await screen.findByTestId("category-icon-fallback")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/features/landing/ui/__tests__/category-grid.test.tsx`
Expected: FAIL — "Failed to resolve import ../category-grid".

- [ ] **Step 3: Write the shared section heading**

Create `src/features/landing/ui/section-head.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

/**
 * One heading shape for every section on the page.
 *
 * The title and its line on the left, the way out on the right, aligned on the
 * title's baseline rather than the blurb's last line — a two-line blurb used to
 * drag the link down and put it in a different place in every section.
 */
export function SectionHead({
  title,
  blurb,
  more,
}: {
  title: string;
  blurb?: string;
  more?: { label: string; to: string };
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-5">
      <div>
        <h2 className="font-display text-[27px] font-bold leading-tight tracking-[-0.02em] text-[var(--color-headline)]">
          {title}
        </h2>
        {blurb ? (
          <p className="mt-1 text-[14.5px] text-[var(--color-muted-foreground)]">{blurb}</p>
        ) : null}
      </div>
      {more ? (
        <Link
          to={more.to}
          className="inline-flex shrink-0 items-center gap-1 border-b-[1.5px] border-transparent pb-[3px] text-sm font-semibold text-[var(--color-headline)] hover:border-[var(--color-headline)]"
        >
          {more.label}
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Write the grid**

Create `src/features/landing/ui/category-grid.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Brush,
  Camera,
  Car,
  ChefHat,
  Hammer,
  Leaf,
  Scissors,
  Shirt,
  Sparkles,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@ntizo/frontend-ui";
import { useCategoryPreview } from "@/features/landing/viewmodel/use-categories";
import { SectionHead } from "@/features/landing/ui/section-head";

/** How many the home page shows before "all categories". */
export const LANDING_CATEGORIES = 8;

/**
 * The icon a category draws when it has no photograph.
 *
 * Keyed on the `icon` the administrator set. A category with none, or with a
 * name this map has never heard of, draws `Sparkles` — one shape rather than
 * nothing, because an empty navy square says less than a wrong-but-present
 * mark.
 */
const ICONS: Record<string, LucideIcon> = {
  scissors: Scissors,
  wrench: Wrench,
  zap: Zap,
  sparkles: Sparkles,
  car: Car,
  chef: ChefHat,
  hammer: Hammer,
  leaf: Leaf,
  camera: Camera,
  shirt: Shirt,
  brush: Brush,
};

/**
 * Eight trades, each with a picture.
 *
 * A photograph rather than the icon strip `/services` uses. On a browse page a
 * category is a filter and an icon is the right size for it; on a home page it
 * is an invitation, and an invitation with a picture is the difference between
 * this section and the four empty tiles it replaces.
 *
 * A category with no `imageUrl` draws navy and its own icon rather than
 * `BrandImage`'s brand tile: the brand tile prints initials, and a row of
 * eight tiles each printing two letters of its own name is a row of eight
 * near-identical squares.
 */
export function CategoryGrid() {
  const { t } = useTranslation("landing"); // t:CategoryGrid
  const { data, isLoading } = useCategoryPreview(LANDING_CATEGORIES);
  const items = data?.items ?? [];

  if (!isLoading && items.length === 0) return null;

  return (
    <section className="page-shell pt-14">
      <SectionHead
        title={t("home.categoriesTitle")}
        blurb={t("home.categoriesBlurb")}
        more={{ label: t("home.categoriesAll"), to: "/services" }}
      />
      <ul className="grid grid-cols-4 gap-x-4 gap-y-4 sm:gap-x-4 xl:grid-cols-8">
        {isLoading
          ? Array.from({ length: LANDING_CATEGORIES }, (_, i) => (
              <li key={i}>
                <Skeleton className="aspect-square w-full rounded-2xl" />
                <Skeleton className="mx-auto mt-2.5 h-[17px] w-16" />
              </li>
            ))
          : items.map((c) => {
              const Icon = (c.icon && ICONS[c.icon]) ?? null;
              return (
                <li key={c.id}>
                  <Link
                    to="/services"
                    search={{ category: c.code }}
                    className="group block"
                  >
                    <div className="relative aspect-square overflow-hidden rounded-2xl bg-[var(--color-navy-surface)]">
                      {c.imageUrl ? (
                        <img
                          src={c.imageUrl}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center">
                          {Icon ? (
                            <Icon
                              data-testid={`category-icon-${c.icon}`}
                              className="h-9 w-9 text-[var(--color-navy-on)]"
                              strokeWidth={1.4}
                              aria-hidden="true"
                            />
                          ) : (
                            <Sparkles
                              data-testid="category-icon-fallback"
                              className="h-9 w-9 text-[var(--color-navy-on)]"
                              strokeWidth={1.4}
                              aria-hidden="true"
                            />
                          )}
                        </span>
                      )}
                    </div>
                    <b className="mt-2.5 block truncate text-center text-sm font-semibold group-hover:underline group-hover:underline-offset-[3px]">
                      {c.name}
                    </b>
                  </Link>
                </li>
              );
            })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test src/features/landing/ui/__tests__/category-grid.test.tsx`
Expected: PASS, four cases.

- [ ] **Step 6: Commit**

```bash
git add src/features/landing/ui/section-head.tsx src/features/landing/ui/category-grid.tsx src/features/landing/ui/__tests__/category-grid.test.tsx
git commit -m "feat(home): categories are eight pictures, and an empty one draws its own icon"
```

---

### Task 6: Services with prices

**Files:**
- Create: `src/features/landing/ui/popular-services.tsx`
- Test: `src/features/landing/ui/__tests__/popular-services.test.tsx`

**Interfaces:**
- Consumes: `usePopularServices` (Task 3); `SectionHead` (Task 5); `ServiceTile` from `@/features/directory/services/ui/service-tile`; `ServiceDTO`.
- Produces: `PopularServices` (no props) and `LANDING_SERVICES = 8`. Task 10 composes it.

- [ ] **Step 1: Write the failing test**

Create `src/features/landing/ui/__tests__/popular-services.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import i18n from "i18next";
import type { ServiceDTO } from "@ntizo/shared/read-models";
import { PopularServices, LANDING_SERVICES } from "../popular-services";

function service(over: Partial<ServiceDTO> = {}): ServiceDTO {
  return {
    id: "s-1",
    providerId: "p-1",
    providerSlug: "estudio-mavalane",
    providerName: "Estúdio Mavalane",
    providerType: "company",
    providerVerified: true,
    providerRatingAverage: 4.7,
    providerReviewCount: 6,
    categoryCode: "beauty",
    categoryName: "Beauty",
    name: "Corte de cabelo",
    description: null,
    locationType: "at_provider",
    bookingMode: "instant",
    imageUrls: [],
    isFallback: false,
    fromAmountMinor: null,
    optionCount: 1,
    defaultOption: {
      amountMinor: 80000,
      currency: "MZN",
      durationMinutes: 45,
      minMinutes: null,
      stepMinutes: null,
      pricingMode: "fixed",
    },
    ...over,
  } as ServiceDTO;
}

function popularKey() {
  return [
    "public",
    "services",
    "popular",
    i18n.resolvedLanguage ?? i18n.language,
    LANDING_SERVICES,
  ];
}

async function renderServices(items?: ServiceDTO[]) {
  const rootRoute = createRootRoute();
  const stub = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <p>{path}</p> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <PopularServices /> }),
      ...["/services", "/services/$id", "/providers/$slug"].map(stub),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (items) qc.setQueryData(popularKey(), { items, nextOffset: null, total: items.length });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("PopularServices", () => {
  it("puts a price on the home page, which is the whole point", async () => {
    await renderServices([service()]);
    expect(await screen.findByText("Corte de cabelo")).toBeInTheDocument();
    expect(screen.getByText(/800/)).toBeInTheDocument();
  });

  it("sends a tile to that service, not to a directory", async () => {
    await renderServices([service()]);
    expect(
      (await screen.findByRole("link", { name: "Corte de cabelo" })).getAttribute("href"),
    ).toBe("/services/s-1");
  });

  // A heading over an empty grid tells a visitor the platform sells nothing,
  // which is worse than the section not being there. It returns on its own
  // the day a provider publishes.
  it("does not appear at all when there is nothing published", async () => {
    await renderServices([]);
    expect(screen.queryByRole("heading", { name: "Popular services" })).toBeNull();
  });

  it("leads to the whole catalogue", async () => {
    await renderServices([service()]);
    expect(
      (await screen.findByRole("link", { name: "See all services" })).getAttribute("href"),
    ).toBe("/services");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/features/landing/ui/__tests__/popular-services.test.tsx`
Expected: FAIL — "Failed to resolve import ../popular-services".

- [ ] **Step 3: Write the section**

Create `src/features/landing/ui/popular-services.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Skeleton } from "@ntizo/frontend-ui";
import { ServiceTile } from "@/features/directory/services/ui/service-tile";
import { usePopularServices } from "@/features/landing/viewmodel/use-popular-services";
import { useLocale } from "@/features/landing/viewmodel/use-locale";
import { SectionHead } from "@/features/landing/ui/section-head";

/** How many services the home page leads with. */
export const LANDING_SERVICES = 8;

/**
 * The services, with their prices.
 *
 * This section used to be called "popular services" and show three
 * *providers*, with no price on any of them — so the home page of a
 * marketplace whose whole promise is a fixed price never showed one.
 *
 * `ServiceTile` is the browse's own component, imported rather than
 * reimplemented. One price treatment, one hover, one empty state, and a change
 * to how a service looks happens once.
 */
export function PopularServices() {
  const { t } = useTranslation("landing"); // t:PopularServices
  const locale = useLocale();
  const { data, isLoading } = usePopularServices(LANDING_SERVICES);
  const items = data?.items ?? [];

  // Nothing published, so the section does not appear. A heading over an empty
  // grid says the platform sells nothing.
  if (!isLoading && items.length === 0) return null;

  return (
    <section className="page-shell pt-14">
      <SectionHead
        title={t("home.servicesTitle")}
        blurb={t("home.servicesBlurb")}
        more={{ label: t("home.servicesAll"), to: "/services" }}
      />
      <ul className="grid gap-x-6 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: LANDING_SERVICES }, (_, i) => (
              <li key={i}>
                <Skeleton className="aspect-[4/3] w-full rounded-[var(--radius-card)]" />
                <Skeleton className="mt-2.5 h-[17px] w-2/3" />
                <Skeleton className="mt-1.5 h-[15px] w-1/2" />
              </li>
            ))
          : items.map((s) => (
              <li key={s.id}>
                <ServiceTile service={s} locale={locale} />
              </li>
            ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test src/features/landing/ui/__tests__/popular-services.test.tsx`
Expected: PASS, four cases. If the price assertion fails, read `servicePriceLine` in `@/features/directory/services/domain/service-card` and match how it formats — the tile owns that, and this test only asserts the number reaches the page.

- [ ] **Step 5: Commit**

```bash
git add src/features/landing/ui/popular-services.tsx src/features/landing/ui/__tests__/popular-services.test.tsx
git commit -m "feat(home): the popular section shows services with prices, on the browse's own tile"
```

---

### Task 7: How it works, drawn as the app

**Files:**
- Create: `src/features/landing/ui/how-it-works.tsx`
- Create: `src/features/landing/ui/flow-screens.tsx`
- Test: `src/features/landing/ui/__tests__/how-it-works.test.tsx`

**Interfaces:**
- Consumes: `t("home.step*")` and `t("home.flow*")` (Task 1); `BrandTile`.
- Produces: `HowItWorks` (no props). Task 10 composes it.

Static markup, no query. These are drawings of the product, so they translate, follow dark mode and cannot go stale as a screenshot would.

- [ ] **Step 1: Write the failing test**

Create `src/features/landing/ui/__tests__/how-it-works.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HowItWorks } from "../how-it-works";

describe("HowItWorks", () => {
  it("names the three steps in the order they happen", () => {
    render(<HowItWorks />);
    const steps = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(steps).toEqual(["Find", "Book", "Done"]);
  });

  it("numbers them, because the order is the information", () => {
    render(<HowItWorks />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  // The section exists to show the promise being kept, so the three facts it
  // draws are the price, the payment and the contact details the platform
  // hands over. A screen that stops showing one of them is the section
  // failing at its job.
  it("shows a price, the M-Pesa payment and the revealed contact", () => {
    render(<HowItWorks />);
    expect(screen.getByText("Pay with M-Pesa")).toBeInTheDocument();
    expect(screen.getByText("Booking confirmed")).toBeInTheDocument();
    expect(screen.getByText("+258 84 123 4567")).toBeInTheDocument();
    expect(screen.getAllByText(/800/).length).toBeGreaterThan(0);
  });

  it("asks for a rating rather than showing one already given", () => {
    render(<HowItWorks />);
    expect(screen.getByText("How did it go?")).toBeInTheDocument();
    // Five empty stars, not a five-star score. A filled row beside the words
    // "how did it go?" answers its own question.
    expect(screen.getByTestId("rating-ask").querySelectorAll("svg")).toHaveLength(5);
    expect(screen.queryByTestId("rating-ask-filled")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/features/landing/ui/__tests__/how-it-works.test.tsx`
Expected: FAIL — "Failed to resolve import ../how-it-works".

- [ ] **Step 3: Write the three screens**

Create `src/features/landing/ui/flow-screens.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Check, Phone, Search, Star } from "lucide-react";
import { BrandTile } from "@/shared/components/browse/brand-tile";

/**
 * The three moments, drawn rather than screenshotted.
 *
 * Sample content — the service names, the business, the address — is
 * deliberately Mozambican and deliberately untranslated: it stands in for one
 * provider's real listing, the way a quoted review stands in for one
 * customer's words. Only the interface chrome around it takes a translation
 * key, because an English reader looking at a Portuguese app is being shown
 * somebody else's product.
 */

/** One row of the results screen. */
function Row({ name, provider, price, minutes }: {
  name: string;
  provider: string;
  price: string;
  minutes: string;
}) {
  return (
    <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-3 border-t border-[var(--color-border)] py-2.5 first:border-t-0 first:pt-0.5">
      <span className="aspect-square overflow-hidden rounded-lg bg-[var(--color-navy-surface)]">
        <BrandTile name={provider} />
      </span>
      <span className="min-w-0">
        <b className="block truncate text-[12.5px] font-semibold">{name}</b>
        <span className="flex items-center gap-1 text-[11px] text-[var(--color-muted-foreground)]">
          {provider}
          <Star className="h-2.5 w-2.5 fill-[var(--color-warning)] text-[var(--color-warning)]" aria-hidden="true" />
          4,7
        </span>
        <em className="mt-0.5 block text-[12.5px] font-bold not-italic text-[var(--color-headline)]">
          {price}
          <i className="ml-1.5 text-[11px] font-medium not-italic text-[var(--color-muted-foreground)]">
            {minutes}
          </i>
        </em>
      </span>
    </div>
  );
}

export function FindScreen() {
  const { t } = useTranslation("landing"); // t:FindScreen
  return (
    <div className="grid content-start gap-3 p-3.5 text-[12.5px]">
      <span className="flex h-9 items-center gap-2 rounded-full border border-[var(--color-border)] px-3">
        <Search className="h-3.5 w-3.5 text-[var(--color-headline)]" aria-hidden="true" />
        <b className="text-[12.5px] font-semibold">Beleza e cabelo</b>
      </span>
      <div>
        <Row name="Corte de cabelo" provider="Estúdio Mavalane" price="800 MZN" minutes="45 min" />
        <Row name="Escova e brushing" provider="Estúdio Mavalane" price="1 100 MZN" minutes="70 min" />
        <Row name="Maquilhagem" provider="Studio Glam" price="1 500 MZN" minutes="90 min" />
        <Row name="Manicure com gel" provider="Nádia Macuácua" price="650 MZN" minutes="60 min" />
      </div>
      <p className="border-t border-[var(--color-border)] pt-3 text-center text-xs font-semibold text-[var(--color-headline)]">
        {t("home.flowMore", { count: 12 })}
      </p>
    </div>
  );
}

export function BookScreen() {
  const { t } = useTranslation("landing"); // t:BookScreen
  const days = [
    { day: "Qui", n: "10" },
    { day: "Sex", n: "11" },
    { day: "Sáb", n: "12", on: true },
    { day: "Dom", n: "13" },
  ];
  const slots = [
    { at: "09:00", off: true },
    { at: "10:30" },
    { at: "14:00", on: true },
    { at: "15:30" },
    { at: "17:00" },
  ];
  return (
    <div className="grid content-start gap-3 p-3.5 text-[12.5px]">
      <div className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-3">
        <span className="aspect-square overflow-hidden rounded-lg bg-[var(--color-navy-surface)]">
          <BrandTile name="Estúdio Mavalane" />
        </span>
        <span>
          <b className="block text-[13px] font-bold">Corte de cabelo</b>
          <span className="text-[11.5px] text-[var(--color-muted-foreground)]">
            Estúdio Mavalane · Polana
          </span>
        </span>
      </div>
      <div className="flex gap-1.5">
        {days.map((d) => (
          <span
            key={d.n}
            className={
              d.on
                ? "flex-1 rounded-lg border border-[var(--color-navy-surface)] bg-[var(--color-navy-surface)] py-1.5 text-center text-[11px] leading-tight text-[var(--color-navy-on)]/70"
                : "flex-1 rounded-lg border border-[var(--color-border)] py-1.5 text-center text-[11px] leading-tight text-[var(--color-muted-foreground)]"
            }
          >
            {d.day}
            <b className={d.on ? "block text-[13px] font-bold text-[var(--color-navy-on)]" : "block text-[13px] font-bold text-[var(--color-foreground)]"}>
              {d.n}
            </b>
          </span>
        ))}
      </div>
      <p className="text-[11px] font-semibold text-[var(--color-muted-foreground)]">
        {t("home.flowHours", { minutes: 45 })}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {slots.map((s) => (
          <span
            key={s.at}
            className={
              s.on
                ? "rounded-lg border border-[var(--color-navy-surface)] bg-[var(--color-navy-surface)] px-2.5 py-2 text-xs font-semibold text-[var(--color-navy-on)]"
                : s.off
                  ? "rounded-lg border border-dashed border-[var(--color-border)] px-2.5 py-2 text-xs font-semibold text-[var(--color-muted-foreground)] line-through"
                  : "rounded-lg border border-[var(--color-border)] px-2.5 py-2 text-xs font-semibold"
            }
          >
            {s.at}
          </span>
        ))}
      </div>
      <div className="flex items-baseline justify-between border-t border-[var(--color-border)] pt-2.5 text-xs text-[var(--color-muted-foreground)]">
        {t("home.flowTotal")}
        <b className="text-base font-bold text-[var(--color-headline)]">800 MZN</b>
      </div>
      <span className="rounded-full bg-[var(--color-navy-surface)] py-3 text-center text-[13px] font-bold text-[var(--color-navy-on)]">
        {t("home.flowPay")}
      </span>
      <p className="text-center text-[11px] text-[var(--color-muted-foreground)]">
        {t("home.flowInstant")}
      </p>
    </div>
  );
}

export function DoneScreen() {
  const { t } = useTranslation("landing"); // t:DoneScreen
  return (
    <div className="grid content-start gap-3 p-3.5 text-[12.5px]">
      <div className="grid justify-items-center gap-0.5 pb-0.5 pt-1.5 text-center">
        <span className="mb-1.5 grid h-10 w-10 place-items-center rounded-full bg-[var(--color-navy-surface)]">
          <Check className="h-5 w-5 text-[var(--color-navy-on)]" strokeWidth={3} aria-hidden="true" />
        </span>
        <b className="text-[14.5px] font-bold">{t("home.flowConfirmed")}</b>
        <span className="text-[11.5px] text-[var(--color-muted-foreground)]">
          {t("home.flowPaid", { amount: "800 MZN" })}
        </span>
      </div>
      <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-3 border-t border-[var(--color-border)] pt-2.5">
        <span className="aspect-square overflow-hidden rounded-lg bg-[var(--color-navy-surface)]">
          <BrandTile name="Estúdio Mavalane" />
        </span>
        <span>
          <b className="block text-[12.5px] font-semibold">Corte de cabelo</b>
          <span className="text-[11px] text-[var(--color-muted-foreground)]">
            Sábado, 12 de Set · 14:00
          </span>
        </span>
      </div>
      {/* The reveal. Street address and phone number appear at exactly this
          moment and never before it, which is the platform's own rule. */}
      <div className="grid gap-1 border-t border-[var(--color-border)] pt-2.5 text-[11.5px] text-[var(--color-muted-foreground)]">
        <b className="text-[12.5px] font-semibold text-[var(--color-foreground)]">
          Estúdio Mavalane
        </b>
        <span>Av. Julius Nyerere 1234, Polana</span>
        <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--color-headline)]">
          <Phone className="h-3 w-3" aria-hidden="true" />
          +258 84 123 4567
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[t("home.flowMessage"), t("home.flowBooking")].map((label) => (
          <span
            key={label}
            className="rounded-lg border border-[var(--color-border)] py-2.5 text-center text-[11.5px] font-semibold text-[var(--color-headline)]"
          >
            {label}
          </span>
        ))}
      </div>
      <div className="flex justify-between border-t border-[var(--color-border)] pt-2.5 text-[11.5px] text-[var(--color-muted-foreground)]">
        {t("home.flowReference")}
        <b className="font-semibold tabular-nums text-[var(--color-foreground)]">NTZ-4821</b>
      </div>
      <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-2.5">
        <span className="text-xs font-semibold">{t("home.flowRate")}</span>
        {/* Empty, because this is a question. */}
        <span data-testid="rating-ask" className="flex gap-0.5">
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} className="h-3.5 w-3.5 fill-[var(--color-border)] text-[var(--color-border)]" aria-hidden="true" />
          ))}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the section**

Create `src/features/landing/ui/how-it-works.tsx`:

```tsx
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SectionHead } from "@/features/landing/ui/section-head";
import { BookScreen, DoneScreen, FindScreen } from "@/features/landing/ui/flow-screens";

/**
 * One step: a number, a word, a sentence, and the screen it describes.
 *
 * The three columns are laid out by the parent grid rather than by three
 * self-contained cards, so the phones start on one line however long the
 * sentences run — `display: contents` dissolves this wrapper into that grid.
 * Three columns whose pictures begin at three different heights is the ragged
 * edge that made the block this replaces look unfinished.
 */
function Step({ n, title, body, children }: {
  n: number;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="contents">
      <div className="row-start-1 flex items-center gap-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--color-navy-surface)] text-[13px] font-bold tabular-nums text-[var(--color-navy-on)]">
          {n}
        </span>
        <h3 className="font-display text-[21px] font-extrabold leading-none tracking-[-0.025em] text-[var(--color-headline)]">
          {title}
        </h3>
      </div>
      <p className="row-start-2 mt-3 max-w-[37ch] self-start text-[15px] leading-relaxed">
        {body}
      </p>
      {/* The bezel is a device, not a card — the one bordered object the page
          allows. Below `lg` it is dropped entirely: a phone drawn inside a
          phone is redundant, and the screen renders on a hairline instead. */}
      <div className="row-start-3 mt-6 w-full border-t border-[var(--color-border)] pt-4 lg:w-[274px] lg:overflow-hidden lg:rounded-[36px] lg:border-[9px] lg:border-[#0d1626] lg:pt-0 lg:shadow-[0_26px_54px_-32px_rgba(0,36,76,0.6)]">
        {children}
      </div>
    </div>
  );
}

/**
 * The flow, on the device customers use.
 *
 * This section used to be three paragraphs in three columns under a heading,
 * which told a visitor nothing they could not have guessed. It now shows the
 * product: the prices in a result list, the free hours and the M-Pesa total,
 * and the address and phone number the platform hands over the moment a
 * booking is confirmed.
 */
export function HowItWorks() {
  const { t } = useTranslation("landing"); // t:HowItWorks

  return (
    <section className="page-shell pt-14">
      <SectionHead title={t("home.howTitle")} blurb={t("home.howBlurb")} />
      <div className="grid gap-x-11 lg:grid-cols-3 lg:grid-rows-[auto_auto_auto]">
        <Step n={1} title={t("home.stepFindTitle")} body={t("home.stepFindBody")}>
          <FindScreen />
        </Step>
        <Step n={2} title={t("home.stepBookTitle")} body={t("home.stepBookBody")}>
          <BookScreen />
        </Step>
        <Step n={3} title={t("home.stepDoneTitle")} body={t("home.stepDoneBody")}>
          <DoneScreen />
        </Step>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test src/features/landing/ui/__tests__/how-it-works.test.tsx`
Expected: PASS, four cases.

- [ ] **Step 6: Commit**

```bash
git add src/features/landing/ui/how-it-works.tsx src/features/landing/ui/flow-screens.tsx src/features/landing/ui/__tests__/how-it-works.test.tsx
git commit -m "feat(home): how it works shows the app, not three paragraphs about it"
```

---

### Task 8: The verified providers

**Files:**
- Create: `src/features/landing/ui/verified-providers.tsx`
- Test: `src/features/landing/ui/__tests__/verified-providers.test.tsx`

**Interfaces:**
- Consumes: `usePopularProviders(limit)`; `ProviderPublicDTO`; `SectionHead` (Task 6); `BrandImage`, `BrandTile`.
- Produces: `VerifiedProviders` (no props), `LANDING_PROVIDERS = 3`.

- [ ] **Step 1: Write the failing test**

Create `src/features/landing/ui/__tests__/verified-providers.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import i18n from "i18next";
import type { ProviderPublicDTO } from "@ntizo/shared";
import { VerifiedProviders, LANDING_PROVIDERS } from "../verified-providers";

function provider(over: Partial<ProviderPublicDTO> = {}): ProviderPublicDTO {
  return {
    id: "p-1",
    name: "Oficina do Zeca",
    slug: "oficina-do-zeca",
    type: "individual",
    description: null,
    city: "Maputo",
    district: "Malhazine",
    country: "MZ",
    logoUrl: null,
    photoUrls: [],
    verified: true,
    ratingAverage: 4.8,
    reviewCount: 12,
    categories: [{ code: "electrical", name: "Electrical" }],
    serviceCount: 3,
    fromAmountMinor: 45000,
    fromCurrency: "MZN",
    services: [],
    ...over,
  };
}

function popularKey() {
  return [
    "public",
    "providers",
    "popular",
    i18n.resolvedLanguage ?? i18n.language,
    LANDING_PROVIDERS,
  ];
}

async function renderProviders(items?: ProviderPublicDTO[]) {
  const rootRoute = createRootRoute();
  const stub = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <p>{path}</p> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <VerifiedProviders /> }),
      ...["/providers", "/providers/$slug"].map(stub),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (items) qc.setQueryData(popularKey(), { items, total: items.length });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("VerifiedProviders", () => {
  it("draws the business, its trade, its score and its cheapest price", async () => {
    await renderProviders([provider()]);
    expect(await screen.findByText("Oficina do Zeca")).toBeInTheDocument();
    expect(screen.getByText("Electrical")).toBeInTheDocument();
    expect(screen.getByText("4.8")).toBeInTheDocument();
    expect(screen.getByText(/450/)).toBeInTheDocument();
  });

  it("links to that business", async () => {
    await renderProviders([provider()]);
    expect(
      (await screen.findByRole("link", { name: /Oficina do Zeca/ })).getAttribute("href"),
    ).toBe("/providers/oficina-do-zeca");
  });

  // Null, not zero. A 0,0 beside a business nobody has rated tells every
  // visitor it is the worst on the platform.
  it("says so rather than printing a zero when nobody has rated a business", async () => {
    await renderProviders([provider({ ratingAverage: null, reviewCount: 0 })]);
    expect(await screen.findByText("No reviews yet")).toBeInTheDocument();
    expect(screen.queryByText("0.0")).toBeNull();
  });

  it("omits the price line for a business that publishes nothing priced", async () => {
    await renderProviders([provider({ fromAmountMinor: null, fromCurrency: null })]);
    await screen.findByText("Oficina do Zeca");
    expect(screen.queryByText(/from/i)).toBeNull();
  });

  it("does not appear when nobody is verified yet", async () => {
    await renderProviders([]);
    expect(screen.queryByRole("heading", { name: "Verified providers" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/features/landing/ui/__tests__/verified-providers.test.tsx`
Expected: FAIL — "Failed to resolve import ../verified-providers".

- [ ] **Step 3: Write the section**

Create `src/features/landing/ui/verified-providers.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Check, Star } from "lucide-react";
import { Skeleton } from "@ntizo/frontend-ui";
import { BrandImage } from "@/shared/components/brand-image";
import { BrandTile } from "@/shared/components/browse/brand-tile";
import { TILE_TITLE_LINK_CLASS } from "@/shared/components/browse/result-tile";
import { formatRating } from "@/shared/domain/rating";
import { initialsOf } from "@/shared/domain/initials";
import { usePopularProviders } from "@/features/landing/viewmodel/use-popular-providers";
import { useLocale } from "@/features/landing/viewmodel/use-locale";
import { SectionHead } from "@/features/landing/ui/section-head";

/** How many businesses the home page names. */
export const LANDING_PROVIDERS = 3;

/**
 * Minor units as money, in the reader's language.
 *
 * Whole units only: this is a "from" price and two decimals on an
 * approximation is noise. `useGrouping: "always"` because pt-MZ and pt-PT set
 * `minimumGroupingDigits: 2`, so their default leaves a four-digit price
 * ungrouped.
 */
function formatFrom(amountMinor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    useGrouping: "always",
  }).format(amountMinor / 100);
}

/**
 * The businesses whose documents an administrator checked.
 *
 * The section this splits from used to be called "popular services" and show
 * providers; services have their own section now, so this one can say what it
 * actually means. Both halves of its claim come off the row: a score customers
 * gave, and a verification an administrator performed.
 */
export function VerifiedProviders() {
  const { t } = useTranslation("landing"); // t:VerifiedProviders
  const locale = useLocale();
  const { data, isLoading } = usePopularProviders(LANDING_PROVIDERS);
  const items = data?.items ?? [];

  if (!isLoading && items.length === 0) return null;

  return (
    <section className="page-shell pt-14">
      <SectionHead
        title={t("home.providersTitle")}
        blurb={t("home.providersBlurb")}
        more={{ label: t("home.providersAll"), to: "/providers" }}
      />
      <ul className="grid gap-x-6 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: LANDING_PROVIDERS }, (_, i) => (
              <li key={i}>
                <Skeleton className="aspect-[16/10] w-full rounded-[var(--radius-card)]" />
                <Skeleton className="mt-2.5 h-[18px] w-2/3" />
                <Skeleton className="mt-1.5 h-[15px] w-1/2" />
              </li>
            ))
          : items.map((p) => {
              const where = [p.district, p.city].filter(Boolean).join(", ");
              const priced = p.fromAmountMinor !== null && p.fromCurrency !== null;
              const photo = p.photoUrls[0] ?? p.logoUrl;
              return (
                <li key={p.id}>
                  <article className="group relative">
                    <div className="relative aspect-[16/10] overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-navy-surface)]">
                      <BrandImage
                        src={photo}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
                        fallback={<BrandTile name={p.name} />}
                      />
                      {/* The logo badge only when there is a photograph behind
                          it: over the brand tile it would be the same initials
                          twice. */}
                      {photo ? (
                        <span className="absolute bottom-3 left-3 z-[2] grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-white text-sm font-bold text-[var(--color-headline)] shadow-md">
                          {p.logoUrl ? (
                            <img src={p.logoUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            initialsOf(p.name)
                          )}
                        </span>
                      ) : null}
                    </div>
                    <div className="grid gap-[3px] pt-2.5">
                      <h3 className="flex items-center gap-1.5 text-base font-bold group-hover:underline group-hover:underline-offset-[3px]">
                        <Link
                          to="/providers/$slug"
                          params={{ slug: p.slug }}
                          className={TILE_TITLE_LINK_CLASS}
                        >
                          {p.name}
                        </Link>
                        {p.verified ? (
                          <span
                            className="grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full bg-[var(--color-navy-surface)]"
                            aria-label={t("badgeVerified")}
                          >
                            <Check className="h-2.5 w-2.5 text-[var(--color-navy-on)]" strokeWidth={3.4} aria-hidden="true" />
                          </span>
                        ) : null}
                      </h3>
                      <p className="flex items-center gap-1.5 text-[13.5px] text-[var(--color-muted-foreground)]">
                        {p.categories[0]?.name}
                        {where ? <span>· {where}</span> : null}
                        {p.ratingAverage !== null ? (
                          <span className="ml-auto inline-flex shrink-0 items-center gap-1 font-semibold text-[var(--color-foreground)]">
                            <Star className="h-3 w-3 fill-[var(--color-warning)] text-[var(--color-warning)]" aria-hidden="true" />
                            <span className="tabular-nums">{formatRating(p.ratingAverage, locale)}</span>
                            <span className="font-normal">({p.reviewCount})</span>
                          </span>
                        ) : (
                          <span className="ml-auto shrink-0">{t("noReviewsYet")}</span>
                        )}
                      </p>
                      {priced ? (
                        <p className="mt-0.5 text-[13.5px] text-[var(--color-muted-foreground)]">
                          <b className="text-[15px] font-bold text-[var(--color-headline)]">
                            {formatFrom(p.fromAmountMinor!, p.fromCurrency!, locale)}
                          </b>
                        </p>
                      ) : null}
                    </div>
                  </article>
                </li>
              );
            })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test src/features/landing/ui/__tests__/verified-providers.test.tsx`
Expected: PASS, five cases.

- [ ] **Step 5: Commit**

```bash
git add src/features/landing/ui/verified-providers.tsx src/features/landing/ui/__tests__/verified-providers.test.tsx
git commit -m "feat(home): verified providers get their own section, in the listings' shape"
```

---

### Task 9: Reviews that line up

**Files:**
- Create: `src/features/landing/ui/customer-reviews.tsx`
- Test: `src/features/landing/ui/__tests__/customer-reviews.test.tsx`

**Interfaces:**
- Consumes: `useFeaturedReviews(limit)`; `FeaturedReviewDTO` (`{ id, rating, comment, authorName, createdAt, providerName, providerSlug }`); `SectionHead`.
- Produces: `CustomerReviews` (no props), `LANDING_STORIES = 3`.

The alignment is the deliverable. Reviews are different lengths, and the naive version puts three footers at three different heights.

- [ ] **Step 1: Write the failing test**

Create `src/features/landing/ui/__tests__/customer-reviews.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import type { FeaturedReviewDTO } from "@ntizo/shared/read-models";
import { CustomerReviews, LANDING_STORIES } from "../customer-reviews";

function story(over: Partial<FeaturedReviewDTO> = {}): FeaturedReviewDTO {
  return {
    id: "rev-1",
    rating: 4,
    comment: "Chegou à hora combinada e deixou tudo limpo.",
    authorName: "Ana Rodrigues",
    createdAt: "2026-08-01T10:00:00.000Z",
    providerName: "Canalizações Zimpeto",
    providerSlug: "canalizacoes-zimpeto",
    ...over,
  };
}

async function renderReviews(items?: FeaturedReviewDTO[]) {
  const rootRoute = createRootRoute();
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <CustomerReviews /> }),
      createRoute({ getParentRoute: () => rootRoute, path: "/providers/$slug", component: () => <p>provider</p> }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (items) qc.setQueryData(["public", "reviews", "featured", LANDING_STORIES], items);
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("CustomerReviews", () => {
  it("quotes the reviewer in their own words", async () => {
    await renderReviews([story()]);
    expect(
      await screen.findByText("Chegou à hora combinada e deixou tudo limpo."),
    ).toBeInTheDocument();
    expect(screen.getByText("Ana Rodrigues")).toBeInTheDocument();
  });

  it("shows the score the reviewer gave, not five stars", async () => {
    await renderReviews([story({ rating: 3 })]);
    expect(await screen.findByRole("img", { name: "3 out of 5" })).toBeInTheDocument();
  });

  it("names an author who set no name rather than rendering an empty chip", async () => {
    await renderReviews([story({ authorName: null })]);
    expect(await screen.findByText("Anonymous")).toBeInTheDocument();
  });

  it("leads to the business the review is about", async () => {
    await renderReviews([story()]);
    expect(
      (await screen.findByRole("link", { name: /Canalizações Zimpeto/ })).getAttribute("href"),
    ).toBe("/providers/canalizacoes-zimpeto");
  });

  /**
   * The flaw this section exists to fix: reviews are different lengths, so a
   * naive column puts three footers at three different heights and the row
   * reads as unfinished. Asserted on the declared style rather than a measured
   * position — jsdom does no layout, so a geometric check would pass on
   * anything.
   */
  it("pins the footer to the bottom whatever the quote runs to", async () => {
    await renderReviews([story(), story({ id: "rev-2", comment: "Bom." })]);
    const footers = await screen.findAllByTestId("review-footer");
    expect(footers).toHaveLength(2);
    for (const f of footers) expect(f.style.marginTop).toBe("auto");
  });

  it("does not appear when an administrator has featured nothing", async () => {
    await renderReviews([]);
    expect(screen.queryByRole("heading", { name: "What customers say" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/features/landing/ui/__tests__/customer-reviews.test.tsx`
Expected: FAIL — "Failed to resolve import ../customer-reviews".

- [ ] **Step 3: Write the section**

Create `src/features/landing/ui/customer-reviews.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronRight, Star } from "lucide-react";
import { Skeleton } from "@ntizo/frontend-ui";
import { initialsOf } from "@/shared/domain/initials";
import { useFeaturedReviews } from "@/features/landing/viewmodel/use-featured-reviews";
import { useLocale } from "@/features/landing/viewmodel/use-locale";
import { SectionHead } from "@/features/landing/ui/section-head";

/** How many reviews the section draws. */
export const LANDING_STORIES = 3;

/**
 * What customers wrote, set as type.
 *
 * Nothing here is translated and nothing should be: a review is what one
 * person wrote, in the language they wrote it, and rendering it in the
 * reader's language would make it no longer a quotation. Only the month is
 * formatted, from `createdAt`, in the reader's locale.
 *
 * **The alignment is the feature.** Reviews are different lengths, so the
 * reviewer block takes `margin-top: auto` inside a flex column and every
 * column is stretched by the grid — the reviewer's row and the business row
 * land on one baseline across all three however long the quote runs. Three
 * footers at three different heights is what made the block this replaces
 * read as unfinished.
 */
export function CustomerReviews() {
  const { t } = useTranslation("landing"); // t:CustomerReviews
  const locale = useLocale();
  const { data, isLoading } = useFeaturedReviews(LANDING_STORIES);
  const stories = data ?? [];

  if (!isLoading && stories.length === 0) return null;

  const month = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });

  return (
    <section className="page-shell pt-14">
      <SectionHead title={t("home.storiesTitle")} blurb={t("home.storiesBlurb")} />
      <ul className="grid items-stretch gap-9 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: LANDING_STORIES }, (_, i) => (
              <li key={i} className="border-t border-[var(--color-border)] pt-5">
                <Skeleton className="h-[15px] w-20" />
                <Skeleton className="mt-3 h-[17px] w-full" />
                <Skeleton className="mt-1.5 h-[17px] w-2/3" />
              </li>
            ))
          : stories.map((s) => (
              <li
                key={s.id}
                className="flex flex-col border-t border-[var(--color-border)] pt-5"
              >
                <span
                  className="mb-3 flex gap-0.5"
                  role="img"
                  aria-label={t("storyRating", { rating: s.rating })}
                >
                  {Array.from({ length: 5 }, (_, star) => (
                    <Star
                      key={star}
                      aria-hidden="true"
                      className={
                        star < s.rating
                          ? "h-[15px] w-[15px] fill-[var(--color-warning)] text-[var(--color-warning)]"
                          : "h-[15px] w-[15px] fill-[var(--color-border)] text-[var(--color-border)]"
                      }
                    />
                  ))}
                </span>
                <blockquote className="line-clamp-4 text-[17.5px] leading-[1.48] tracking-[-0.006em]">
                  {s.comment}
                </blockquote>
                {/* `margin-top: auto` as an inline style, not a class: the test
                    asserts the declared value, because jsdom does no layout and
                    a class name proves nothing about where this lands. */}
                <div
                  data-testid="review-footer"
                  style={{ marginTop: "auto" }}
                  className="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-3 pt-[18px]"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--color-muted)] text-[12.5px] font-bold text-[var(--color-headline)]">
                    {s.authorName ? initialsOf(s.authorName) : "—"}
                  </span>
                  <span className="min-w-0">
                    <b className="block truncate text-sm font-semibold">
                      {s.authorName ?? t("storyAnonymous")}
                    </b>
                    <span className="text-[12.5px] text-[var(--color-muted-foreground)]">
                      {month.format(new Date(s.createdAt))}
                    </span>
                  </span>
                </div>
                <Link
                  to="/providers/$slug"
                  params={{ slug: s.providerSlug }}
                  className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3.5 text-[13.5px] font-semibold hover:underline hover:underline-offset-[3px]"
                >
                  <span className="truncate">{s.providerName}</span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-[var(--color-headline)]"
                    strokeWidth={2.2}
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test src/features/landing/ui/__tests__/customer-reviews.test.tsx`
Expected: PASS, six cases.

- [ ] **Step 5: Commit**

```bash
git add src/features/landing/ui/customer-reviews.tsx src/features/landing/ui/__tests__/customer-reviews.test.tsx
git commit -m "feat(home): reviews line up, and each one leads to the business it praises"
```

---

### Task 10: The band, the page, and the demolition

**Files:**
- Create: `src/features/landing/ui/provider-band.tsx`
- Rewrite: `src/features/landing/components/landing-page.tsx`
- Rewrite: `src/features/landing/components/landing-page.test.tsx`
- Delete: `src/features/landing/ui/sections.tsx`
- Modify: `src/features/landing/ui/palette.ts`
- Modify: all eight `src/shared/locales/*/landing.json`

**Interfaces:**
- Consumes: `Hero` (4), `CategoryGrid` (5), `PopularServices` (6), `HowItWorks` (7), `VerifiedProviders` (8), `CustomerReviews` (9), `Footer` (unchanged).
- Produces: `LandingPage`, already routed by `src/routes/index.tsx`. No route change.

- [ ] **Step 1: Write the failing test**

Replace the whole of `src/features/landing/components/landing-page.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelpCenterProvider } from "@/features/help-center/viewmodel/use-help-center";
import { LandingPage } from "./landing-page";

/**
 * The whole page, with every query left unseeded.
 *
 * That is the state dev actually serves: no category has an image, no provider
 * has a photograph, and the featured reviews table is usually empty. A home
 * page that only holds together with data is a home page that is broken on the
 * day it matters most.
 */
async function renderPage() {
  const rootRoute = createRootRoute();
  const stub = (path: string) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <p>{path}</p> });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <LandingPage /> }),
      ...[
        "/sign-in",
        "/sign-up",
        "/services",
        "/services/$id",
        "/providers",
        "/providers/$slug",
        "/become-provider",
        "/about",
        "/contact",
        "/help",
        "/feedback",
        "/careers",
        "/terms",
        "/privacy",
      ].map(stub),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await router.load();
  render(
    <QueryClientProvider client={qc}>
      <HelpCenterProvider>
        <RouterProvider router={router} />
      </HelpCenterProvider>
    </QueryClientProvider>,
  );
}

describe("LandingPage", () => {
  it("leads with the offer and a way to search for it", async () => {
    await renderPage();
    expect(
      await screen.findByRole("heading", { level: 1, name: /at the price you see/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Search services")).toBeInTheDocument();
  });

  it("explains itself with the product, whatever the queries return", async () => {
    await renderPage();
    expect(await screen.findByRole("heading", { name: "How it works" })).toBeInTheDocument();
    expect(screen.getByText("Booking confirmed")).toBeInTheDocument();
  });

  it("makes the offer to the other reader", async () => {
    await renderPage();
    expect(
      await screen.findByRole("link", { name: "Create a provider account" }),
    ).toBeInTheDocument();
  });

  it("keeps the footer's promises", async () => {
    await renderPage();
    expect(await screen.findByText("M-Pesa")).toBeInTheDocument();
    expect(screen.queryByText("Visa")).toBeNull();
  });

  // The three data-fed sections each hide themselves rather than render a
  // heading over nothing. With no data seeded, none of them should be here.
  it("shows no empty section headings when there is nothing to put in them", async () => {
    await renderPage();
    await screen.findByRole("heading", { name: "How it works" });
    expect(screen.queryByRole("heading", { name: "Popular services" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Verified providers" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "What customers say" })).toBeNull();
  });

  // The slogan is gone from the hero; its three words title the steps now.
  it("no longer opens with a slogan", async () => {
    await renderPage();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText("Find it.")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/features/landing/components/landing-page.test.tsx`
Expected: FAIL — the page still renders the old hero and sections.

- [ ] **Step 3: Write the band**

Create `src/features/landing/ui/provider-band.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

/**
 * The offer made to somebody thinking about listing their work.
 *
 * The page's only dark surface, and full width rather than a rounded box
 * floating in the page — a navy card with two blurred circles on it was the
 * last piece of the template. The brand's tie pattern is the only ornament.
 *
 * The copy is deliberately not a headline percentage: the commission is
 * per-provider, so a number printed here would be wrong for everybody not on
 * the default.
 */
export function ProviderBand() {
  const { t } = useTranslation("landing"); // t:ProviderBand
  const facts = [
    { title: t("home.factPriceTitle"), body: t("home.factPriceBody") },
    { title: t("home.factAgendaTitle"), body: t("home.factAgendaBody") },
    { title: t("home.factMoneyTitle"), body: t("home.factMoneyBody") },
  ];

  return (
    <section className="relative mt-16 overflow-hidden bg-[var(--color-navy-surface)] text-[var(--color-navy-on)]">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 h-[520px] w-[620px] -rotate-[8deg] bg-[url('/brand/tie-pattern.svg')] bg-[length:144px_244px] opacity-[0.14]"
      />
      <div className="page-shell relative z-[1] grid items-center gap-14 py-16 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <h2 className="font-display max-w-[18ch] text-[clamp(1.75rem,3.4vw,2.25rem)] font-extrabold leading-[1.08] tracking-[-0.03em]">
            {t("home.bandTitle")}
          </h2>
          <p className="mt-4 max-w-[52ch] text-base leading-relaxed text-[var(--color-navy-on)]/75">
            {t("home.bandBody")}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-6">
            {/* White, not the brand blue: the page spends its one blue on the
                header's search button. */}
            <Link
              to="/become-provider"
              className="font-rounded rounded-full bg-white px-6 py-3.5 text-[15px] font-bold text-[var(--color-headline)]"
            >
              {t("home.bandCta")}
            </Link>
            <Link
              to="/become-provider"
              className="text-[14.5px] font-semibold underline decoration-[var(--color-navy-on)]/40 underline-offset-4"
            >
              {t("home.bandLink")}
            </Link>
          </div>
        </div>
        <ul className="grid gap-3.5 border-l border-[var(--color-navy-on)]/20 pl-7">
          {facts.map((f) => (
            <li key={f.title} className="text-[15px] leading-snug text-[var(--color-navy-on)]/90">
              <b className="block font-bold text-[var(--color-navy-on)]">{f.title}</b>
              {f.body}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Recompose the page**

Replace the whole of `src/features/landing/components/landing-page.tsx`:

```tsx
import { Hero } from "@/features/landing/ui/hero";
import { CategoryGrid } from "@/features/landing/ui/category-grid";
import { PopularServices } from "@/features/landing/ui/popular-services";
import { HowItWorks } from "@/features/landing/ui/how-it-works";
import { VerifiedProviders } from "@/features/landing/ui/verified-providers";
import { CustomerReviews } from "@/features/landing/ui/customer-reviews";
import { ProviderBand } from "@/features/landing/ui/provider-band";
import { Footer } from "@/features/landing/ui/footer";

/**
 * The customer home page.
 *
 * White, on the design system's own tokens. It carried its palette to its
 * sections as local custom properties because it painted itself a tinted blue
 * nothing else on the site used; every colour here is now a token every other
 * page shares, so there is nothing to carry.
 *
 * The order is an argument: what we sell, what you can browse, what it costs,
 * how it works, who does it, what they were like, and then — once — the offer
 * to the person who might do the work.
 */
export function LandingPage() {
  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)]">
      <Hero />
      <CategoryGrid />
      <PopularServices />
      <HowItWorks />
      <VerifiedProviders />
      <CustomerReviews />
      <ProviderBand />
      <Footer />
    </main>
  );
}
```

- [ ] **Step 5: Delete what nothing reads any more**

```bash
git rm src/features/landing/ui/sections.tsx
```

In `src/features/landing/ui/palette.ts`, delete `PAGE_TOP`, `PAGE_MID` and `PAGE_BOTTOM` — the page tint and the wave fill are both gone. Keep `NAVY`, `ACCENT`, `CARD`, `MUTED` and `BORDER`: `footer.tsx` still imports them.

Then confirm nothing dangles:

```bash
grep -rn "sections\|PAGE_TOP\|PAGE_MID\|PAGE_BOTTOM\|LANDING_VARS" src/features/landing src/routes
```

Expected: no hits outside `palette.ts`'s own removed lines. Any hit is an import to fix now.

- [ ] **Step 6: Remove the dead copy from all eight locales**

Delete these keys from every `src/shared/locales/*/landing.json`, now that nothing reads them: `heroLine1`, `heroLine2`, `heroLine3`, `heroSubtitle`, `place`, `promiseRated`, `promiseMessage`, `promiseVerified`, `categoriesTitle`, `categoriesBlurb`, `popularTitle`, `popularBlurb`, `storiesTitle`, `storiesBlurb`, `seeAll`, `zeroFeeTitle`, `zeroFeeBody`, `zeroFeeCta`, `fromPrice`.

Keep `signIn`, `favorites`, `nav.*`, `footer.*`, `badgeVerified`, `noReviewsYet`, `reviewCount`, `storyRating` and `storyAnonymous` — all are still read, several by the header and the footer.

Verify with the compiler, which is the only reliable reader of a translation key:

```bash
grep -rn "heroLine\|zeroFee\|promiseRated\|seeAll\|fromPrice" src/
```

Expected: no hits.

- [ ] **Step 7: Run the whole suite**

Run: `pnpm test`
Expected: PASS. The parity gate covers the deletions across all eight files; a key removed from one and left in another fails here.

- [ ] **Step 8: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both clean. `sections.tsx`'s deletion is the likely source of any unused-import errors.

- [ ] **Step 9: Look at it**

Run: `pnpm dev` and open `http://localhost:3000/`.

Check, at 1440 and at 390: the header is solid with the provider link; the hero is white with three brand tiles; the categories draw icons, not repeated marks; the three phones sit on one line at 1440 and lose their bezels at 390; the reviews' footers align; the band runs full width; nothing scrolls sideways.

- [ ] **Step 10: Commit**

```bash
git add -A src/features/landing src/shared/locales
git commit -m "feat(home): the rebuilt home page, and the template it replaces removed"
```

---

## Self-Review

**Spec coverage.** Header → Task 2. Hero → Task 4. Categories → Task 5. Popular services → Tasks 3 and 6. Como funciona → Task 7. Providers → Task 8. Reviews → Task 9. Band, assembly, demolition → Task 10. Copy → Task 1, with the deletions in Task 10. Testing section → distributed across each task, with the full-page cases in Task 10.

**Deviations honoured.** The review's business row ships as a name and a chevron with no logo and no service name, matching deviation 1 — `FeaturedReviewDTO` carries neither. The hero collage draws brand tiles, matching deviation 2. "Mais procurados" appears nowhere, matching deviation 3. No scroll-docked search, matching deviation 4.

**Dependency order.** `SectionHead` is created in Task 5, the first section that needs it, and imported unchanged by Tasks 6, 7, 8 and 9. No task imports a file a later task creates.

**Type consistency.** `LANDING_CATEGORIES = 8`, `LANDING_SERVICES = 8`, `LANDING_PROVIDERS = 3`, `LANDING_STORIES = 3` are each defined once and imported by their own test. `landingServiceQueries.popular(locale, limit)` and `usePopularServices(limit)` match between Tasks 3 and 6. `SectionHead`'s `more` is `{ label, to }` in Tasks 5, 6, 8 and 9 alike.

**Assumption to verify in Task 4.** `ServiceSearch`'s accessible name is asserted as "Search services", taken from the suite this plan replaces. If its label has changed, match the component and update both tests that use it.
