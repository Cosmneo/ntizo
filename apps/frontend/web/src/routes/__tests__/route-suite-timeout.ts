import { configure } from "@testing-library/react";

/**
 * Widen this file's async waits from Testing Library's one-second default.
 *
 * **Measured rather than guessed.** The first render in a route suite costs
 * ~450ms on an idle machine — the route's async `beforeLoad`, then its
 * queries, then the effect that reads them, on top of a first mount that
 * processes the app's CSS (`vite.config.ts` sets `css: true`). One second is
 * comfortable alone. Beside 140 other web files and a database-backed backend
 * suite running concurrently under `turbo run test`, it is not: on a loaded
 * full run `book.$serviceId` and `booking.$bookingId.details` both went red,
 * repeatedly, on assertions that pass every time their file is run alone.
 * That was reproduced on an untouched tree, so it is the bound failing rather
 * than the code.
 *
 * These assertions are about *where* a route sends somebody and *what* it
 * draws, never about how quickly — so a bound that fails on a loaded machine
 * is testing the machine, and a suite that reddens at random is worse than a
 * slow one: it destroys the signal every other check on the branch depends
 * on, and teaches whoever meets it to re-run rather than read.
 *
 * **`configure` rather than a `{ timeout }` passed at each call site.** The
 * confirm suite threaded a `SETTLES_IN` constant through every wait, which
 * works and then quietly stops working: the next assertion added to the file
 * is the one that forgets it, and the two files above were red for exactly
 * that reason — the commit that fixed the confirm suite left its siblings on
 * the default. Setting it once covers every wait in the file, present and
 * future, including `findBy*`, which shares the same `asyncUtilTimeout`.
 *
 * **Scoped to route suites rather than set in `test/setup.ts`.** A global
 * would change the bound for 141 files nobody on this task has read, some of
 * which may legitimately want a wait to give up quickly. This module is a
 * one-line import that sits beside the suites that need it, which is also
 * where the next route suite's author will find it.
 *
 * Safe as a module-level side effect: vitest isolates each test file, so this
 * reaches nothing but the file that imports it.
 */
export function widenAsyncTimeout(): void {
  configure({ asyncUtilTimeout: 4000 });
}
