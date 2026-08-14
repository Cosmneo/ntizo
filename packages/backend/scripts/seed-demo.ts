/**
 * Fills a development database with a marketplace that looks like one.
 *
 * The dev data had grown into `Catalog Sweep Test Provider A`, `teste`, four
 * categories named after UUIDs and not a single review — which is fine for the
 * suites that created it and useless for judging a design. Every screen that
 * shows a card, a rating, an icon or a price was being reviewed against
 * placeholder text, and the placeholders were what kept looking wrong.
 *
 * **Development only, and it says so.** It refuses any stage but `dev`, because
 * it writes fictional businesses and fictional verdicts about them, and neither
 * belongs anywhere a customer can read it.
 *
 * Idempotent by slug and by email: a second run updates what it made before
 * rather than adding a parallel set. The test rows it finds are deactivated, not
 * deleted — the suites that created them may still be asserting they exist, and
 * a directory only lists `active` providers, so hiding them is enough.
 *
 *   bun run --env-file=.env scripts/seed-demo.ts            # dry run
 *   export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"   # wrangler needs Node 22
 *   bun run --env-file=.env scripts/seed-demo.ts --apply
 *
 * Images are generated here rather than downloaded: a seed that reaches out to
 * a photo site works until the network is down or the licence changes, and
 * nothing about the layout needs a photograph to be judged. Each one is an SVG
 * — a two-tone wash in the brand's own hues carrying the category's glyph — so
 * a grid of them reads as a grid of different things, which is the property the
 * grey placeholder box was missing. Swapping real photographs in later is
 * putting files in the bucket under the same keys.
 */
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import postgres from "postgres";
import {
  category,
  categoryTranslation,
  service,
  serviceMember,
  serviceOption,
  serviceTranslation,
} from "../src/modules/ntizo/shared/infrastructure/database/catalog/schemas";
import { memberAvailability } from "../src/modules/ntizo/shared/infrastructure/database/scheduling/schemas";
import {
  provider,
  providerDocument,
  providerMember,
} from "../src/modules/ntizo/shared/infrastructure/database/provider/schemas";
import { review } from "../src/modules/ntizo/shared/infrastructure/database/review/schemas";
import { profile, user } from "../src/modules/ntizo/shared/infrastructure/database/user/schemas";

const apply = process.argv.includes("--apply");

/** Same stage selection the cities seed and the slug backfill use. */
function stageUrl(): string {
  const stage = (process.env["STAGE"] ?? "dev").toLowerCase();
  if (stage !== "dev") {
    throw new Error(
      `Refusing to run against "${stage}". This seed writes fictional businesses and fictional reviews of them; only dev may hold either.`,
    );
  }
  const value = process.env["DEV_DB_URL"];
  if (!value) throw new Error("DEV_DB_URL is not set. Seeding dev needs it.");
  return value;
}

/* ── the categories, given the icons the band was built to draw ──────────── */

/**
 * A Lucide name per category.
 *
 * `category.icon` exists for exactly this and every row had it null, so the
 * band drew the same fallback tag eleven times — eleven controls that looked
 * identical in a component whose whole job is to be scannable.
 */
const CATEGORY_ICONS: Record<string, string> = {
  beauty: "Scissors",
  plumbing: "Wrench",
  electrical: "Zap",
  cleaning: "SprayCan",
  mechanic: "Car",
  cooking: "ChefHat",
  delivery: "Truck",
  building: "HardHat",
  driving: "CarFront",
  "aulas-de-musica": "Music",
  "jardinagem-e-piscinas": "Trees",
};

/**
 * Names for a category this platform did not have.
 *
 * `beauty` is added rather than assumed: a hair salon and a manicure were sitting
 * under "Limpeza de casa" for want of anywhere honest to put them, and a filter
 * that returns a barber when a customer asks for house cleaning is worse than
 * one trade missing. Every locale the platform speaks, because a category with
 * no name in the reader's language falls back to its code, and `beauty` on a
 * Portuguese page is not a category name.
 */
const NEW_CATEGORIES: Record<string, Record<string, string>> = {
  beauty: {
    "en-US": "Beauty & hair",
    "pt-MZ": "Beleza e cabelo",
    "pt-PT": "Beleza e cabelo",
    "es-ES": "Belleza y peluquería",
    "fr-FR": "Beauté et coiffure",
    "de-DE": "Beauty & Haare",
    "it-IT": "Bellezza e capelli",
    "nl-NL": "Beauty & haar",
  },
};

/** Two brand-adjacent stops per category, so a grid of covers reads as a grid of different things. */
const CATEGORY_COLOURS: Record<string, [string, string]> = {
  beauty: ["#e64980", "#f06595"],
  plumbing: ["#006ffd", "#00c2d7"],
  electrical: ["#ffb020", "#ff7a45"],
  cleaning: ["#21b872", "#0fb5c9"],
  mechanic: ["#4a4f57", "#8b93a1"],
  cooking: ["#ee4040", "#ff8a5c"],
  delivery: ["#7048e8", "#4c6ef5"],
  building: ["#f08c00", "#e8590c"],
  driving: ["#1098ad", "#0c8599"],
  "aulas-de-musica": ["#ae3ec9", "#7048e8"],
  "jardinagem-e-piscinas": ["#2f9e44", "#66a80f"],
};

/**
 * The glyph drawn on a cover, as a path.
 *
 * Hand-traced rather than imported from Lucide: this file runs in Bun with no
 * DOM, and pulling a React icon set in to extract path data would be a
 * dependency bought for one string per category.
 */
const CATEGORY_GLYPHS: Record<string, string> = {
  beauty: "M6 3 18 17 M18 3 6 17 M6 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z M18 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  plumbing: "M8 8h8v8H8z M4 12h4 M16 12h4 M12 4v4 M12 16v4",
  electrical: "m13 2-9 12h7l-1 8 9-12h-7z",
  cleaning: "M9 3h6v5H9z M7 8h10l-1 13H8z M11 12v5 M14 12v5",
  mechanic: "M5 15h14 M6 15V9l2-4h8l2 4v6 M8 17.5h.01 M16 17.5h.01",
  cooking: "M7 21h10 M6 12a4 4 0 0 1 3-6.8 3.6 3.6 0 0 1 6 0A4 4 0 0 1 18 12v5H6z",
  delivery: "M2 7h11v9H2z M13 10h4l3 3v3h-7z M6 19h.01 M17 19h.01",
  building: "M4 20h16 M6 20V9l6-4 6 4v11 M10 20v-5h4v5",
  driving: "M5 16h14 M7 16V9h10v7 M9 19h.01 M15 19h.01 M9 6h6",
  "aulas-de-musica": "M9 18V5l10-2v13 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  "jardinagem-e-piscinas": "M12 22V9 M12 9c0-4 3-7 8-7 0 4-3 7-8 7Z M12 14c0-3-3-5-7-5 0 3 3 5 7 5Z",
};

function coverSvg(code: string): string {
  const [from, to] = CATEGORY_COLOURS[code] ?? ["#006ffd", "#00c2d7"];
  const glyph = CATEGORY_GLYPHS[code] ?? "M4 4h16v16H4z";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="400" height="300" fill="url(#g)"/>
  <g transform="translate(200 150) scale(5.2) translate(-12 -12)" fill="none"
     stroke="#ffffff" stroke-opacity="0.9" stroke-width="1.4"
     stroke-linecap="round" stroke-linejoin="round">
    <path d="${glyph}"/>
  </g>
</svg>`;
}

/** A business's mark: its initials on a tinted square, in its own trade's hue. */
function logoSvg(initials: string, code: string): string {
  const [from, to] = CATEGORY_COLOURS[code] ?? ["#006ffd", "#00c2d7"];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="160" height="160" rx="34" fill="url(#g)"/>
  <text x="80" y="80" fill="#ffffff" font-family="Poppins, Inter, sans-serif"
        font-size="62" font-weight="600" text-anchor="middle"
        dominant-baseline="central">${initials}</text>
</svg>`;
}

/**
 * One portfolio tile: the trade's hues, rotated per photograph so a gallery is
 * a row of different pictures rather than the same one repeated.
 */
function photoSvg(index: number, code: string): string {
  const [from, to] = CATEGORY_COLOURS[code] ?? ["#006ffd", "#00c2d7"];
  const angle = (index * 47) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <defs>
    <linearGradient id="g" gradientTransform="rotate(${angle} 0.5 0.5)">
      <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="400" height="300" fill="url(#g)"/>
  <circle cx="${60 + ((index * 71) % 280)}" cy="${50 + ((index * 43) % 200)}" r="${28 + ((index * 13) % 46)}"
          fill="#ffffff" fill-opacity="0.16"/>
  <text x="374" y="278" fill="#ffffff" fill-opacity="0.75" text-anchor="end"
        font-family="Poppins, Inter, sans-serif" font-size="26" font-weight="600">${index}</text>
</svg>`;
}

/* ── the businesses ──────────────────────────────────────────────────────── */

interface DemoService {
  name: string;
  description: string;
  category: string;
  /** Minor units. `null` prices the service by quote instead. */
  amountMinor: number | null;
  durationMinutes: number;
  locationType: "at_customer" | "at_provider" | "remote" | "flexible";
}

/**
 * The week a demo business works, in minutes from local midnight.
 *
 * `weekday` is 0 = Sunday, matching `Date#getUTCDay` and the column's own
 * check constraint. Nobody opens on Sunday and everybody closes early on
 * Saturday, which is what Maputo actually looks like and, more usefully here,
 * means the date strip has to render a closed day, a short day and a full one
 * rather than seven identical columns.
 *
 * `slotIntervalMinutes` is 30 for everyone, including the caterer whose real
 * business is an order rather than a 30-minute appointment. The column has a
 * documented third state — `0`, meaning "open, no grid" — and seeding it was
 * tried and reverted: the engine correctly returns no discrete starts for such
 * a window, and the time grid has no way to draw one, so it renders "no times
 * free this day" for a business that is open all week. A demo provider
 * indistinguishable from a broken one is worse than an unexercised branch.
 * The gap is the UI's, not the seed's, and it is recorded in follow-ups.
 *
 * `capacity` stays null, which the column reads as 1. Concurrency in this
 * product comes from an organization having several members with their own
 * calendars, not from one calendar holding several bookings — seeding a
 * capacity would fake the first with the second and hide whether the member
 * picker works.
 */
/** A person's name as an email local part: "Célia Nhaca" -> "celia-nhaca". */
function slugifyName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const WEEK: { weekday: number; startMinute: number; endMinute: number }[] = [
  { weekday: 1, startMinute: 8 * 60, endMinute: 17 * 60 },
  { weekday: 2, startMinute: 8 * 60, endMinute: 17 * 60 },
  { weekday: 3, startMinute: 8 * 60, endMinute: 17 * 60 },
  { weekday: 4, startMinute: 8 * 60, endMinute: 17 * 60 },
  { weekday: 5, startMinute: 8 * 60, endMinute: 17 * 60 },
  { weekday: 6, startMinute: 8 * 60, endMinute: 13 * 60 },
];

interface DemoProvider {
  slug: string;
  name: string;
  type: "individual" | "organization";
  city: string;
  district: string | null;
  description: string;
  /**
   * The people who actually perform this business's services, besides the
   * owner. Empty for an individual, who is the only person there.
   *
   * They exist so the availability picker has something to pick between: it
   * hides itself below two performers, so an organization with one member
   * leaves the feature invisible and untestable. Real names, because the card
   * publishes a first name and "Profissional 2" is what it publishes when a
   * profile has none.
   */
  staff?: string[];
  /** Whether an administrator has accepted a document — drives the verified badge. */
  verified: boolean;
  /** Whether to give it a generated mark, so both card states appear in the grid. */
  logo: boolean;
  /**
   * How many portfolio photographs to generate.
   *
   * Varied on purpose, `0` included: the gallery has to read as finished for a
   * business with none, and has to fold the overflow into a count for one with
   * more than fits.
   */
  photos: number;
  services: DemoService[];
  /** Ratings left by other demo customers. Empty means a business nobody has reviewed yet. */
  ratings: number[];
}

const PROVIDERS: DemoProvider[] = [
  {
    slug: "estudio-mavalane", photos: 7, name: "Estúdio Mavalane", type: "organization",
    city: "Maputo", district: "Polana",
    description: "Salão de cabelo e barbearia com quatro profissionais. Marcação ao minuto, sem filas.",
    staff: ["Ana Sitoe", "Bruno Chirindza", "Célia Nhaca", "Dino Mabjaia"],
    verified: true, logo: true, ratings: [5, 5, 4, 5, 4, 5],
    services: [
      { name: "Corte de cabelo", description: "Corte, lavagem e acabamento.", category: "beauty", amountMinor: 80000, durationMinutes: 45, locationType: "at_provider" },
      { name: "Barba completa", description: "Aparo, toalha quente e óleo.", category: "beauty", amountMinor: 45000, durationMinutes: 30, locationType: "at_provider" },
    ],
  },
  {
    slug: "helder-cossa-electricidade", photos: 3, name: "Hélder Cossa", type: "individual",
    city: "Maputo", district: "Sommerschield",
    description: "Electricista certificado. Instalações, quadros e avarias urgentes ao domicílio.",
    verified: true, logo: false, ratings: [5, 4, 5, 5],
    services: [
      { name: "Avaria eléctrica urgente", description: "Diagnóstico e reparação no próprio dia.", category: "electrical", amountMinor: 120000, durationMinutes: 60, locationType: "at_customer" },
      { name: "Instalação de quadro eléctrico", description: "Quadro novo, com certificado.", category: "electrical", amountMinor: 450000, durationMinutes: 240, locationType: "at_customer" },
    ],
  },
  {
    slug: "canalizacoes-zimpeto", photos: 5, name: "Canalizações Zimpeto", type: "organization",
    city: "Maputo", district: "Zimpeto",
    description: "Fugas, desentupimentos e instalação de canalização. Atendimento em 24 horas.",
    staff: ["Faustino Cuna", "Gito Mucavele"],
    verified: true, logo: true, ratings: [4, 4, 5, 3, 4],
    services: [
      { name: "Desentupimento", description: "Máquina própria, sem partir azulejo.", category: "plumbing", amountMinor: 180000, durationMinutes: 90, locationType: "at_customer" },
      { name: "Reparação de fuga", description: "Localização e reparação.", category: "plumbing", amountMinor: 150000, durationMinutes: 60, locationType: "at_customer" },
    ],
  },
  {
    slug: "casa-limpa-matola", photos: 0, name: "Casa Limpa Matola", type: "organization",
    city: "Matola", district: "Machava",
    description: "Limpeza doméstica e de escritórios, avulsa ou por contrato mensal.",
    staff: ["Helena Zandamela", "Isaura Tembe", "Judite Nhantumbo"],
    verified: false, logo: true, ratings: [4, 5, 4, 4, 5, 4, 4],
    services: [
      { name: "Limpeza profunda", description: "Casa inteira, produtos incluídos.", category: "cleaning", amountMinor: 250000, durationMinutes: 240, locationType: "at_customer" },
      { name: "Limpeza de escritório", description: "Fora do horário de expediente.", category: "cleaning", amountMinor: 150000, durationMinutes: 120, locationType: "at_customer" },
    ],
  },
  {
    slug: "nelia-machava-unhas", photos: 4, name: "Nélia Machava", type: "individual",
    city: "Maputo", district: "Alto Maé",
    description: "Manicure e pedicure ao domicílio, com material esterilizado próprio.",
    verified: false, logo: false, ratings: [5, 5, 5],
    services: [
      { name: "Manicure ao domicílio", description: "Material esterilizado, levo tudo comigo.", category: "beauty", amountMinor: 60000, durationMinutes: 60, locationType: "at_customer" },
    ],
  },
  {
    slug: "auto-costa-do-sol", photos: 8, name: "Auto Costa do Sol", type: "organization",
    city: "Maputo", district: "Costa do Sol",
    description: "Mecânica geral, revisões e diagnóstico electrónico para ligeiros.",
    staff: ["Kito Maluleque", "Lázaro Bila", "Milton Guambe"],
    verified: true, logo: true, ratings: [4, 3, 4, 4],
    services: [
      { name: "Revisão completa", description: "Óleo, filtros e 30 pontos de verificação.", category: "mechanic", amountMinor: 300000, durationMinutes: 180, locationType: "at_provider" },
      { name: "Diagnóstico electrónico", description: "Leitura de erros e relatório.", category: "mechanic", amountMinor: 100000, durationMinutes: 45, locationType: "at_provider" },
    ],
  },
  {
    slug: "jardins-da-cidade", photos: 6, name: "Jardins da Cidade", type: "organization",
    city: "Maputo", district: "Sommerschield",
    description: "Manutenção de jardins, poda e sistemas de rega para casas e condomínios.",
    staff: ["Nelson Chissano", "Osvaldo Mondlane"],
    verified: false, logo: true, ratings: [5, 4, 4],
    services: [
      { name: "Manutenção mensal de jardim", description: "Corte, poda e limpeza, quatro visitas.", category: "jardinagem-e-piscinas", amountMinor: 200000, durationMinutes: 120, locationType: "at_customer" },
      { name: "Tratamento de piscina", description: "Análise, produtos e aspiração.", category: "jardinagem-e-piscinas", amountMinor: 120000, durationMinutes: 90, locationType: "at_customer" },
    ],
  },
  {
    slug: "ana-bila-explicacoes", photos: 0, name: "Ana Bila", type: "individual",
    city: "Beira", district: "Macuti",
    description: "Aulas de piano e teoria musical, do início ao 5.º grau. Online ou em casa.",
    verified: false, logo: false, ratings: [5, 5, 4, 5],
    services: [
      { name: "Aula de piano", description: "Uma hora, online ou em casa.", category: "aulas-de-musica", amountMinor: 50000, durationMinutes: 60, locationType: "flexible" },
    ],
  },
  {
    slug: "cozinha-da-vovo", photos: 2, name: "Cozinha da Vovó", type: "organization",
    city: "Nampula", district: null,
    description: "Catering para festas e almoços de empresa. Cozinha moçambicana e portuguesa.",
    staff: ["Paulina Macuácua", "Quitéria Sambo"],
    verified: false, logo: true, ratings: [4, 5],
    services: [
      { name: "Catering para 20 pessoas", description: "Entrada, prato e sobremesa.", category: "cooking", amountMinor: 900000, durationMinutes: 300, locationType: "at_customer" },
      { name: "Almoço de empresa", description: "Orçamento conforme o número de pessoas.", category: "cooking", amountMinor: null, durationMinutes: 120, locationType: "at_customer" },
    ],
  },
  {
    // The state the design has to hold: newly listed, nobody has been served
    // yet, so there is no score. A blank where the others have stars reads as a
    // bad one, which is the opposite of true.
    slug: "sergio-matola-pinturas", photos: 0, name: "Sérgio Matola", type: "individual",
    city: "Maputo", district: "Malhangalene",
    description: "Pintor e estucador. Interiores, exteriores e pequenas remodelações.",
    verified: false, logo: false, ratings: [],
    services: [
      { name: "Pintura de interiores", description: "Por divisão, tinta incluída.", category: "building", amountMinor: 220000, durationMinutes: 480, locationType: "at_customer" },
    ],
  },
];

/** The fictional customers whose verdicts the ratings above belong to. */
const REVIEWERS = [
  { email: "demo-cliente-1@ntizo.test", name: "Inês Muianga" },
  { email: "demo-cliente-2@ntizo.test", name: "Rui Chirindza" },
  { email: "demo-cliente-3@ntizo.test", name: "Paula Sitoe" },
  { email: "demo-cliente-4@ntizo.test", name: "Jorge Nhaca" },
  { email: "demo-cliente-5@ntizo.test", name: "Célia Banze" },
  { email: "demo-cliente-6@ntizo.test", name: "Tomás Guambe" },
  { email: "demo-cliente-7@ntizo.test", name: "Aida Cumbe" },
];

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => [...w][0] ?? "")
    .join("")
    .toUpperCase();
}

/* ── media ───────────────────────────────────────────────────────────────── */

/**
 * Puts the generated SVGs in the bucket the API serves from.
 *
 * Shelling out to wrangler rather than using the R2 API: the local bucket is a
 * miniflare directory, not an S3 endpoint, and wrangler is the only thing that
 * knows where it is. The dev server picks the objects up without a restart —
 * verified by fetching one back through `/api/media` while it was running.
 */
let mediaChecked = false;

/**
 * Wrangler refuses to start on Node 20, and the default `node` on a machine set
 * up for this project often is 20 — the API's own dev script carries the same
 * requirement. Checked once, before the first upload, so the failure names the
 * fix instead of surfacing as a wrangler banner in the middle of the seed.
 */
async function assertWranglerCanRun(): Promise<void> {
  if (mediaChecked) return;
  const proc = Bun.spawn(["node", "--version"], { stdout: "pipe", stderr: "ignore" });
  const version = (await new Response(proc.stdout).text()).trim();
  const major = Number(/^v(\d+)/.exec(version)?.[1] ?? 0);
  if (major < 22) {
    throw new Error(
      `wrangler needs Node 22 to write the media bucket; \`node\` here is ${version}.\n` +
        `  export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"\n` +
        `and run this again.`,
    );
  }
  mediaChecked = true;
}

async function putMedia(key: string, svg: string): Promise<void> {
  await assertWranglerCanRun();
  const file = `/tmp/ntizo-seed-${key.replace(/[^a-z0-9]/gi, "-")}.svg`;
  await Bun.write(file, svg);
  const proc = Bun.spawn(
    [
      "bunx", "wrangler", "r2", "object", "put", `ntizo-media-local/${key}`,
      "--file", file, "--content-type", "image/svg+xml",
      "--local", "--persist-to", ".wrangler/state",
    ],
    { cwd: "../../apps/backend/api", stdout: "ignore", stderr: "pipe" },
  );
  const code = await proc.exited;
  if (code !== 0) throw new Error(`wrangler put ${key} failed: ${await new Response(proc.stderr).text()}`);
}

/* ── the run ─────────────────────────────────────────────────────────────── */

const sqlClient = postgres(stageUrl(), { ssl: "require", max: 4 });
const db = drizzle(sqlClient);

const DEMO_CODES = Object.keys(CATEGORY_ICONS);
const now = new Date();

async function run(): Promise<void> {
  console.log(apply ? "Applying." : "Dry run — pass --apply to write.\n");

  /* 1. Categories: give them their icons, and hide the ones named after UUIDs. */
  const categories = await db.select().from(category);
  const demoCategories = categories.filter((c) => DEMO_CODES.includes(c.code));
  const junk = categories.filter((c) => /^(catalog-sweep-test|svc-filter-test)/.test(c.code));

  console.log(`categories: ${demoCategories.length} to give icons, ${junk.length} test rows to hide`);
  if (apply) {
    for (const c of demoCategories) {
      await db
        .update(category)
        .set({ icon: CATEGORY_ICONS[c.code]!, updatedAt: now })
        .where(eq(category.id, c.id));
    }
    if (junk.length > 0) {
      await db
        .update(category)
        .set({ isActive: false, updatedAt: now })
        .where(inArray(category.id, junk.map((c) => c.id)));
    }
  }

  /* 1b. Any demo category the platform does not have yet, with its names. */
  const categoryByCode = new Map(demoCategories.map((c) => [c.code, c.id]));
  for (const [code, names] of Object.entries(NEW_CATEGORIES)) {
    if (categoryByCode.has(code)) continue;
    console.log(`categories: creating "${code}" — the platform had nowhere to file it`);
    if (!apply) continue;

    const [row] = await db
      .insert(category)
      .values({
        code,
        icon: CATEGORY_ICONS[code]!,
        isActive: true,
        // Last in the band. The existing order is a layout somebody chose, and
        // inserting into the middle of it would reshuffle a row of controls
        // people have learned the shape of.
        sortOrder: categories.length,
      })
      .returning({ id: category.id });
    categoryByCode.set(code, row!.id);

    for (const [locale, name] of Object.entries(names)) {
      await db.insert(categoryTranslation).values({ categoryId: row!.id, locale, name });
    }
  }

  /* 2. Media. */
  if (apply) {
    for (const code of DEMO_CODES) await putMedia(`demo/category/${code}.svg`, coverSvg(code));
    for (const p of PROVIDERS.filter((p) => p.logo)) {
      await putMedia(
        `demo/logo/${p.slug}.svg`,
        logoSvg(initials(p.name), p.services[0]?.category ?? "plumbing"),
      );
    }
    // A portfolio tile per photograph, numbered — so a gallery of six is
    // visibly six different pictures rather than the same one six times, which
    // is the only thing the layout needs them to prove.
    let photos = 0;
    for (const p of PROVIDERS) {
      for (let i = 1; i <= p.photos; i += 1) {
        await putMedia(
          `demo/portfolio/${p.slug}-${i}.svg`,
          photoSvg(i, p.services[0]?.category ?? "plumbing"),
        );
        photos += 1;
      }
    }
    console.log(
      `media: ${DEMO_CODES.length} covers + ${PROVIDERS.filter((p) => p.logo).length} marks + ${photos} portfolio photos`,
    );
  }

  /* 3. Reviewers — real user rows, because a review carries a foreign key to one. */
  const reviewerIds = new Map<string, string>();
  for (const r of REVIEWERS) {
    const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, r.email));
    let id = existing?.id;
    if (!id) {
      id = `demo-${randomUUID()}`;
      if (apply) {
        await db.insert(user).values({ id, email: r.email, role: "customer", status: "active" });
        await db.insert(profile).values({
          userId: id,
          firstName: r.name.split(" ")[0] ?? r.name,
          lastName: r.name.split(" ").slice(1).join(" "),
          displayName: r.name,
          language: "pt-MZ",
          timezone: "Africa/Maputo",
        });
      }
    }
    reviewerIds.set(r.email, id ?? "(dry-run)");
  }
  console.log(`reviewers: ${REVIEWERS.length}`);

  /* 4. The businesses, their services and their verdicts. */
  for (const p of PROVIDERS) {
    const ownerEmail = `demo-${p.slug}@ntizo.test`;
    const [existingUser] = await db.select({ id: user.id }).from(user).where(eq(user.email, ownerEmail));
    const ownerId = existingUser?.id ?? `demo-${randomUUID()}`;

    if (!apply) {
      console.log(
        `  would seed ${p.name} — ${p.services.length} services, ${p.ratings.length} reviews, ` +
          `${1 + (p.staff?.length ?? 0)} people working ${WEEK.length} days a week`,
      );
      continue;
    }

    if (!existingUser) {
      await db.insert(user).values({
        id: ownerId, email: ownerEmail,
        role: p.type === "organization" ? "organization_owner" : "individual_provider",
        status: "active",
      });
      await db.insert(profile).values({
        userId: ownerId,
        firstName: p.name.split(" ")[0] ?? p.name,
        lastName: p.name.split(" ").slice(1).join(" "),
        displayName: p.name,
        language: "pt-MZ",
        timezone: "Africa/Maputo",
      });
    }

    const [existingProvider] = await db
      .select({ id: provider.id })
      .from(provider)
      .where(eq(provider.slug, p.slug));

    const values = {
      ownerUserId: ownerId,
      type: p.type,
      name: p.name,
      slug: p.slug,
      status: "active",
      description: p.description,
      addressCity: p.city,
      addressDistrict: p.district,
      addressCountry: "MZ",
      timezone: "Africa/Maputo",
      logoKey: p.logo ? `demo/logo/${p.slug}.svg` : null,
      photoKeys: Array.from({ length: p.photos }, (_, i) => `demo/portfolio/${p.slug}-${i + 1}.svg`),
      updatedAt: now,
    };

    let providerId: string;
    if (existingProvider) {
      providerId = existingProvider.id;
      await db.update(provider).set(values).where(eq(provider.id, providerId));
    } else {
      const [row] = await db.insert(provider).values(values).returning({ id: provider.id });
      providerId = row!.id;
    }

    await db
      .insert(providerMember)
      .values({ providerId, userId: ownerId, role: "owner" })
      .onConflictDoNothing();

    // The staff, each a real user with a real profile — the availability
    // picker publishes a first name, and a member whose profile has none falls
    // back to "Profissional 2", which is what this seed exists to stop the
    // design being judged against.
    //
    // Emails are derived from the slug and the name so a second run finds the
    // same people instead of hiring a parallel set, matching how the reviewers
    // above are keyed.
    for (const fullName of p.staff ?? []) {
      const email = `${slugifyName(fullName)}@${p.slug}.demo.ntizo.test`;
      const [existingUser] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
      let staffUserId = existingUser?.id;
      if (!staffUserId) {
        staffUserId = `demo-${randomUUID()}`;
        if (apply) {
          await db.insert(user).values({ id: staffUserId, email, role: "customer", status: "active" });
          await db.insert(profile).values({
            userId: staffUserId,
            firstName: fullName.split(" ")[0] ?? fullName,
            lastName: fullName.split(" ").slice(1).join(" "),
            displayName: fullName,
            language: "pt-MZ",
            timezone: "Africa/Maputo",
          });
        }
      }
      if (apply) {
        await db
          .insert(providerMember)
          .values({ providerId, userId: staffUserId, role: "staff" })
          .onConflictDoNothing();
      }
    }

    // Everyone who works here, owner included: the owner of a one-person
    // business is the person who does the job, and an organization's owner is
    // usually still on the floor.
    const members = apply
      ? await db
          .select({ id: providerMember.id })
          .from(providerMember)
          .where(eq(providerMember.providerId, providerId))
      : [];

    // Replaced wholesale, like the services below — this seed is the authority
    // on when a demo business is open, and a second run must not stack a second
    // identical week on top of the first.
    await db.delete(memberAvailability).where(eq(memberAvailability.providerId, providerId));
    for (const m of members) {
      for (const w of WEEK) {
        await db.insert(memberAvailability).values({
          providerId,
          memberId: m.id,
          weekday: w.weekday,
          startMinute: w.startMinute,
          endMinute: w.endMinute,
          slotIntervalMinutes: 30,
        });
      }
    }

    // The verified badge reads an accepted document, not the provider's status
    // — every listed provider is active, so a badge driven by that would be lit
    // on all of them.
    if (p.verified) {
      const [doc] = await db
        .select({ id: providerDocument.id })
        .from(providerDocument)
        .where(
          and(eq(providerDocument.providerId, providerId), eq(providerDocument.status, "accepted")),
        );
      if (!doc) {
        await db.insert(providerDocument).values({
          providerId,
          type: p.type === "organization" ? "COMMERCIAL_REGISTRY" : "NATIONAL_ID",
          status: "accepted",
          storageKey: `demo/doc/${p.slug}.pdf`,
          uploadedByUserId: ownerId,
        });
      }
    }

    // Services are replaced wholesale so a second run does not stack duplicates
    // — the demo set is the authority on what this business sells.
    const owned = await db.select({ id: service.id }).from(service).where(eq(service.providerId, providerId));
    if (owned.length > 0) {
      await db.delete(service).where(inArray(service.id, owned.map((s) => s.id)));
    }

    for (const [i, s] of p.services.entries()) {
      const categoryId = categoryByCode.get(s.category);
      if (!categoryId) throw new Error(`No category "${s.category}" — run seed-categories first.`);

      const [row] = await db
        .insert(service)
        .values({
          providerId,
          categoryId,
          sourceLocale: "pt-MZ",
          locationType: s.locationType,
          bookingMode: s.amountMinor === null ? "quote" : "priced",
          status: "published",
          sortOrder: i,
          imageKeys: [`demo/category/${s.category}.svg`],
        })
        .returning({ id: service.id });
      const serviceId = row!.id;

      await db.insert(serviceTranslation).values({
        serviceId, locale: "pt-MZ", name: s.name, description: s.description,
      });

      // Who performs it. Without this row the service has nobody, and with
      // nobody it has no availability at all — `availabilityForService`
      // resolves its performers through this table, so a service missing from
      // it returns an empty week however complete its members' calendars are.
      // That was the state of every published service before this seed learned
      // to write it.
      //
      // Everyone, rather than a subset: which of a business's people can do
      // which job is a real distinction, but inventing it here would make some
      // services quietly unbookable for reasons no reader could see.
      for (const m of members) {
        await db.insert(serviceMember).values({ serviceId, memberId: m.id }).onConflictDoNothing();
      }

      // A quote service has no options at all — nothing is priced until the
      // provider has seen the job.
      if (s.amountMinor !== null) {
        await db.insert(serviceOption).values({
          serviceId,
          pricingMode: "fixed",
          amountMinor: s.amountMinor,
          currency: "MZN",
          durationMinutes: s.durationMinutes,
          isDefault: true,
          isActive: true,
          sortOrder: 0,
        });
      }
    }

    await db.delete(review).where(eq(review.providerId, providerId));
    for (const [i, rating] of p.ratings.entries()) {
      const reviewer = REVIEWERS[i % REVIEWERS.length]!;
      await db
        .insert(review)
        .values({
          providerId,
          authorUserId: reviewerIds.get(reviewer.email)!,
          rating,
          comment: i === 0 ? COMMENTS[rating] ?? null : null,
          status: "published",
        })
        .onConflictDoNothing();
    }

    console.log(
      `  ${p.name} — ${p.services.length} services, ${p.ratings.length} reviews, ` +
        `${members.length} people × ${WEEK.length} days = ${members.length * WEEK.length} availability windows`,
    );
  }

  /* 5. Hide the leftover test businesses so the directory reads as a directory. */
  const demoSlugs = PROVIDERS.map((p) => p.slug);
  const stale = await db
    .select({ id: provider.id, name: provider.name })
    .from(provider)
    .where(and(eq(provider.status, "active"), notInArray(provider.slug, demoSlugs)));
  console.log(`\ntest businesses to hide: ${stale.length}`);
  if (apply && stale.length > 0) {
    await db
      .update(provider)
      .set({ status: "suspended", updatedAt: now })
      .where(inArray(provider.id, stale.map((s) => s.id)));
  }

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(provider)
    .where(eq(provider.status, "active"));
  console.log(`\nactive providers now: ${n}`);
}

/** One line of praise or complaint per score, so a card's first comment fits its stars. */
const COMMENTS: Record<number, string> = {
  5: "Trabalho impecável e pontual. Recomendo.",
  4: "Bom serviço, só chegou um pouco atrasado.",
  3: "Resolveu, mas tive de insistir para marcar.",
};

await run();
await sqlClient.end();
