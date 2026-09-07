import { z } from "zod";
import { defineMutation, defineGraphQLSchema } from "@cosmneo/onion-lasagna/graphql/field";
import { zodSchema } from "@cosmneo/onion-lasagna-zod";
import { ntizoGraphqlContextSchema } from "../../../../graphql/context";

/**
 * Two mutations for saving, one per gesture, rather than one with a mode.
 *
 * `quickSave` is the heart: it saves immediately, into the default list, and
 * returns every list the listing is now in — so the dialog it opens already
 * knows the answer. `setLists` is the dialog: it states the whole desired
 * membership at once.
 *
 * `setLists` replaces an add/remove pair on purpose. The dialog's natural
 * output is "these are the lists it should be in", and a pair would make the
 * client diff two states and send the difference — which is where a stale card
 * sends `add` for something already added, gets a conflict, and the row
 * flickers.
 */
export const quickSave = defineMutation({
  input: zodSchema(
    z.object({
      // The literals are repeated here rather than imported from the bounded
      // context's `FAVOURITE_TARGETS` — the same trade `write/review`'s 1..5
      // rating bound makes, so a schema file never imports a domain module.
      // `Favourite.file` refuses the same set again, on purpose.
      targetType: z.enum(["service", "provider"]),
      targetId: z.string().min(1).max(64),
    }),
  ),
  output: zodSchema(z.object({ listIds: z.array(z.string()) })),
  docs: { summary: "Save a listing into your default list", tags: ["Favourite"] },
});

export const setLists = defineMutation({
  input: zodSchema(
    z.object({
      targetType: z.enum(["service", "provider"]),
      targetId: z.string().min(1).max(64),
      // Bounded so a caller cannot send an unbounded array. Nobody has 64
      // lists, and an empty array is meaningful: it unsaves the listing.
      listIds: z.array(z.string().min(1).max(64)).max(64),
    }),
  ),
  output: zodSchema(z.object({ listIds: z.array(z.string()) })),
  docs: { summary: "Set exactly which of your lists hold this listing", tags: ["Favourite"] },
});

export const createList = defineMutation({
  // 60, matching `favourite_list.name`'s column width and `LIST_NAME_MAX`.
  input: zodSchema(z.object({ name: z.string().trim().min(1).max(60) })),
  output: zodSchema(z.object({ id: z.string().min(1) })),
  docs: { summary: "Create a list", tags: ["Favourite"] },
});

export const renameList = defineMutation({
  input: zodSchema(z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(60) })),
  output: zodSchema(z.object({ id: z.string().min(1) })),
  docs: { summary: "Rename a list", tags: ["Favourite"] },
});

export const removeList = defineMutation({
  input: zodSchema(z.object({ id: z.string().min(1) })),
  output: zodSchema(z.object({ removed: z.boolean() })),
  docs: { summary: "Delete a list and everything in it", tags: ["Favourite"] },
});

/**
 * Nested two ways, like `communication`'s single level: `favourite` holds the
 * two saving gestures, and `favouriteList` holds list management. The field
 * kit flattens each to a single wire name — `{ favourite: { quickSave } }`
 * emits as `favouriteQuickSave`, never `favourite.quickSave` — so the five
 * fields above land as `favouriteQuickSave`, `favouriteSetLists`,
 * `favouriteListCreate`, `favouriteListRename` and `favouriteListRemove`.
 * Task 8 mounts these under `buildPrivateGraphQLFields`; Task 9's frontend
 * calls them by those flattened names.
 */
export const favouriteWriteSchema = defineGraphQLSchema(
  {
    favourite: { quickSave, setLists },
    favouriteList: { create: createList, rename: renameList, remove: removeList },
  },
  { defaults: { context: ntizoGraphqlContextSchema } },
);
