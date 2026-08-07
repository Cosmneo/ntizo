// Tiny local saga runner.
//
// No @cosmneo/onion-lasagna-saga dependency — ntizo owns this helper.
// Runs steps sequentially; on failure, compensates already-completed steps
// in reverse order. Any compensation errors are collected and attached to
// the rethrown original failure as a `.compensationErrors` array so callers
// can surface both.

export interface SagaStep<Ctx> {
  name: string;
  run: (ctx: Ctx) => Promise<void>;
  compensate?: (ctx: Ctx) => Promise<void>;
}

export interface SagaCompensationError extends Error {
  stepName: string;
  cause?: unknown;
}

export interface SagaFailure extends Error {
  failedStep: string;
  compensationErrors: SagaCompensationError[];
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export async function runSaga<Ctx>(
  ctx: Ctx,
  steps: SagaStep<Ctx>[],
): Promise<Ctx> {
  const completed: SagaStep<Ctx>[] = [];

  for (const step of steps) {
    try {
      await step.run(ctx);
      completed.push(step);
    } catch (err) {
      const failure = toError(err) as SagaFailure;
      failure.failedStep = step.name;
      failure.compensationErrors = [];

      // Compensate in reverse order.
      for (let i = completed.length - 1; i >= 0; i--) {
        const done = completed[i]!;
        if (!done.compensate) continue;
        try {
          await done.compensate(ctx);
        } catch (compErr) {
          const wrapped = toError(compErr) as SagaCompensationError;
          wrapped.stepName = done.name;
          wrapped.cause = compErr;
          failure.compensationErrors.push(wrapped);
        }
      }

      throw failure;
    }
  }

  return ctx;
}
