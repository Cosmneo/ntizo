import { beforeEach, describe, expect, it } from "bun:test";
import { RecordActivityInternalCommand } from "../app/use-cases/record-activity.internal.command";

class FakeRepo {
  saved: unknown[] = [];
  fail = false;
  async save(e: unknown) {
    if (this.fail) throw new Error("insert failed");
    this.saved.push(e);
    return `a${this.saved.length}`;
  }
  async listForActor() { return { items: [], nextCursor: null }; }
}

let repo: FakeRepo;
let cmd: RecordActivityInternalCommand;

beforeEach(() => {
  repo = new FakeRepo();
  cmd = new RecordActivityInternalCommand(repo as never);
});

const input = {
  actorUserId: "u1",
  type: "service.published" as const,
  payload: { serviceName: "Corte" },
  occurredAt: new Date("2026-08-26T10:00:00Z"),
};

describe("RecordActivityInternalCommand", () => {
  it("writes the row", async () => {
    await cmd.execute(input);
    expect(repo.saved).toHaveLength(1);
  });

  it("never throws at its caller", async () => {
    // This runs from a domain-event handler, after the producing transaction
    // has committed and possibly after the response has gone. Throwing would
    // turn a successful service publication into a 500 over a log entry.
    repo.fail = true;
    await expect(cmd.execute(input)).resolves.toBeUndefined();
  });

  it("logs what it swallowed, so a lost row is not silent", async () => {
    repo.fail = true;
    const seen: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { seen.push(args); };
    await cmd.execute(input);
    console.error = original;
    expect(seen).toHaveLength(1);
  });

  it("rejects an unknown type without reaching the repository", async () => {
    // The aggregate throws; the command swallows it. What must not happen is
    // a bad row being written.
    await cmd.execute({ ...input, type: "service.renamed" as never });
    expect(repo.saved).toEqual([]);
  });
});
