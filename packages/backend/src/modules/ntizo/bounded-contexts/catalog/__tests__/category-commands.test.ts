import { beforeEach, describe, expect, it } from "bun:test";
import { DEFAULT_LOCALE } from "@ntizo/shared";
import { CreateCategoryCommand } from "../app/use-cases/create-category.command";
import { UpdateCategoryCommand } from "../app/use-cases/update-category.command";
import type {
  CategoryRepositoryPort,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../app/ports/outbound/category.repository.port";

class FakeRepo implements CategoryRepositoryPort {
  created: CreateCategoryInput[] = [];
  updated: UpdateCategoryInput[] = [];
  taken = new Set<string>();
  existingIds = new Set<string>(["cat-1"]);

  async create(input: CreateCategoryInput): Promise<string> {
    this.created.push(input);
    this.taken.add(input.code);
    return "new-id";
  }
  async update(input: UpdateCategoryInput): Promise<void> {
    this.updated.push(input);
  }
  async codeTaken(code: string, exceptId?: string): Promise<boolean> {
    // The fake mirrors the real query: a row keeping its own code is not a
    // collision with itself, which is the case an update has to survive.
    return this.taken.has(code) && exceptId !== "cat-1";
  }
  async exists(id: string): Promise<boolean> {
    return this.existingIds.has(id);
  }
}

let repo: FakeRepo;
let create: CreateCategoryCommand;
let update: UpdateCategoryCommand;

beforeEach(() => {
  repo = new FakeRepo();
  create = new CreateCategoryCommand(repo);
  update = new UpdateCategoryCommand(repo);
});

const base = (name = "Canalização") => ({ locale: DEFAULT_LOCALE, name });

describe("CreateCategoryCommand", () => {
  it("derives the code from the default-locale name", async () => {
    await create.execute({
      translations: [base(), { locale: "en-US", name: "Plumbing" }],
    });
    expect(repo.created[0]!.code).toBe("canalizacao");
  });

  it("derives it from the default name even when another language comes first", async () => {
    // Ordering must not decide the URL. Two categories created by two admins
    // working in two languages would otherwise get codes in two languages.
    await create.execute({
      translations: [{ locale: "en-US", name: "Plumbing" }, base()],
    });
    expect(repo.created[0]!.code).toBe("canalizacao");
  });

  it("prefers a code the caller supplied, normalised", async () => {
    await create.execute({ code: "  Home Repairs ", translations: [base()] });
    expect(repo.created[0]!.code).toBe("home-repairs");
  });

  it("refuses a set with no name in the default language", async () => {
    await expect(
      create.execute({ translations: [{ locale: "en-US", name: "Plumbing" }] }),
    ).rejects.toMatchObject({ code: "CATEGORY_DEFAULT_NAME_REQUIRED" });
    expect(repo.created).toHaveLength(0);
  });

  it("treats a whitespace-only name as no name", async () => {
    await expect(
      create.execute({ translations: [base("   ")] }),
    ).rejects.toMatchObject({ code: "CATEGORY_DEFAULT_NAME_REQUIRED" });
  });

  it("drops the languages left blank rather than storing empty names", async () => {
    await create.execute({
      translations: [base(), { locale: "fr-FR", name: "  " }],
    });
    expect(repo.created[0]!.translations.map((t) => t.locale)).toEqual([
      DEFAULT_LOCALE,
    ]);
  });

  it("refuses a code another category already has", async () => {
    repo.taken.add("canalizacao");
    await expect(create.execute({ translations: [base()] })).rejects.toMatchObject(
      { code: "CATEGORY_CODE_TAKEN" },
    );
  });

  it("trims names and turns an empty description into null", async () => {
    await create.execute({
      translations: [{ locale: DEFAULT_LOCALE, name: " Canalização ", description: "  " }],
    });
    expect(repo.created[0]!.translations[0]).toMatchObject({
      name: "Canalização",
      description: null,
    });
  });

  it("defaults to active, at the front of no particular order", async () => {
    await create.execute({ translations: [base()] });
    expect(repo.created[0]).toMatchObject({ isActive: true, sortOrder: 0 });
  });
});

describe("UpdateCategoryCommand", () => {
  it("refuses an id that is not there", async () => {
    await expect(
      update.execute({ categoryId: "nope", sortOrder: 3 }),
    ).rejects.toMatchObject({ code: "CATEGORY_NOT_FOUND" });
  });

  it("leaves translations alone when none are given", async () => {
    await update.execute({ categoryId: "cat-1", sortOrder: 2 });
    expect(repo.updated[0]!.translations).toBeUndefined();
    expect(repo.updated[0]!.sortOrder).toBe(2);
  });

  it("refuses to empty the default name of a live category", async () => {
    await expect(
      update.execute({
        categoryId: "cat-1",
        translations: [{ locale: "en-US", name: "Plumbing" }],
      }),
    ).rejects.toMatchObject({ code: "CATEGORY_DEFAULT_NAME_REQUIRED" });
  });

  it("lets a category keep its own code", async () => {
    repo.taken.add("canalizacao");
    await expect(
      update.execute({ categoryId: "cat-1", code: "canalizacao" }),
    ).resolves.toEqual({ ok: true });
  });

  it("does not re-derive the code when a name is corrected", async () => {
    // The code is in links people have already shared; a typo fix in the
    // Portuguese name must not move the page.
    await update.execute({
      categoryId: "cat-1",
      translations: [base("Canalizações")],
    });
    expect(repo.updated[0]!.code).toBeUndefined();
  });

  it("passes a null image through, so removing one is expressible", async () => {
    await update.execute({ categoryId: "cat-1", imageKey: null });
    expect(repo.updated[0]).toHaveProperty("imageKey", null);
  });
});
