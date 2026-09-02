import { configure } from "@testing-library/react";

/**
 * The extra setup file for `src/routes/__tests__/**`, and for nothing else.
 *
 * **Why route suites need their own bound.** Each one mounts the router,
 * resolves an async `beforeLoad` and settles at least one query before
 * anything is assertable — ~450ms on an idle machine, and more beside 138
 * other web files and a database-backed backend suite running concurrently
 * under `turbo run test`. Testing Library's `asyncUtilTimeout` defaults to one
 * second, which is comfortable alone and was not comfortable there:
 * `book.$serviceId` and `booking.$bookingId.details` both went red on loaded
 * full runs, repeatedly, on assertions that pass every time their file runs by
 * itself. Reproduced on an untouched tree, so it was the bound failing rather
 * than the code.
 *
 * These assertions are about *where* a route sends somebody and *what* it
 * draws, never about how quickly. A bound that fails on a loaded machine is
 * testing the machine — and a suite that reddens at random is worse than a
 * slow one, because it destroys the signal every other check on the branch
 * depends on and teaches whoever meets it to re-run rather than read.
 *
 * **Why a setup file rather than something the suite calls.** Two earlier
 * shapes rotted the same way, one level apart. A `{ timeout: 4000 }` threaded
 * through every wait was forgotten by the next assertion added — the confirm
 * suite had four call sites and its two siblings were written with none. A
 * `widenAsyncTimeout()` invoked once per file fixed that and moved the same
 * failure up a level: the next route suite written without the import
 * silently gets one second back, and no lint rule or meta-test would catch
 * it. `vite.config.ts` binds this file to the directory instead, so a fourth
 * route suite is covered by existing.
 *
 * It covers `findBy*` as well as `waitFor`: both read the same
 * `asyncUtilTimeout`.
 */
configure({ asyncUtilTimeout: 4000 });
