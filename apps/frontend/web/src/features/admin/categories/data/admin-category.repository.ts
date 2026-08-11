import { queryOptions } from "@tanstack/react-query";
import { sessionGraphql } from "@/shared/lib/graphql/session-graphql";
import type { AdminCategory } from "../domain/types";

const ALL = `
  query CategoryAllForAdmin($input: CategoryAllForAdminInput!) {
    categoryAllForAdmin(input: $input) {
      id code imageKey imageUrl icon sortOrder isActive createdAt
      translations { locale name description }
    }
  }`;

const CREATE = `
  mutation CategoryCreate($input: CategoryCreateInput!) {
    categoryCreate(input: $input) { categoryId }
  }`;

const REORDER = `
  mutation CategoryReorder($input: CategoryReorderInput!) {
    categoryReorder(input: $input) { ok }
  }`;

const UPDATE = `
  mutation CategoryUpdate($input: CategoryUpdateInput!) {
    categoryUpdate(input: $input) { ok }
  }`;

export interface SaveCategoryInput {
  categoryId?: string;
  code?: string;
  icon?: string | null;
  imageKey?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  translations: { locale: string; name: string; description?: string | null }[];
}

export const adminCategoryQueries = {
  all: (input: { search?: string }) =>
    queryOptions({
      queryKey: ["admin", "categories", input],
      queryFn: async (): Promise<AdminCategory[]> => {
        const d = await sessionGraphql<{ categoryAllForAdmin: AdminCategory[] }>(
          ALL,
          { input },
        );
        return d.categoryAllForAdmin;
      },
    }),
};

export async function reorderCategories(orderedIds: string[]): Promise<void> {
  await sessionGraphql(REORDER, { input: { orderedIds } });
}

export async function saveCategory(input: SaveCategoryInput): Promise<void> {
  if (input.categoryId) {
    const { categoryId, ...rest } = input;
    await sessionGraphql(UPDATE, { input: { categoryId, ...rest } });
    return;
  }
  const { categoryId: _ignored, ...rest } = input;
  await sessionGraphql(CREATE, { input: rest });
}

/**
 * Uploads a category image and hands back the key.
 *
 * The key, not the URL: the URL is composed from the public base at read time,
 * so moving the bucket or putting a CDN in front of it does not rewrite every
 * row. Locally there is no base and the server returns a null URL, which is
 * why the caller falls back to a local object URL for the preview.
 */
export async function uploadCategoryImage(
  categoryId: string,
  file: File,
): Promise<{ key: string; url: string | null }> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(
    `${import.meta.env["VITE_API_URL"] ?? "http://localhost:8788"}/api/media/category/${categoryId}`,
    { method: "POST", credentials: "include", body },
  );
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({ error: "UPLOAD_FAILED" }))) as {
      error?: string;
    };
    throw new Error(error ?? "UPLOAD_FAILED");
  }
  return (await res.json()) as { key: string; url: string | null };
}
