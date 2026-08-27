import { describe, expect, it } from "bun:test";
import { ServiceCreated, ServicePublished, ServiceUnpublished } from "../domain/events";

describe("service events", () => {
  it("say who caused them", () => {
    // Without this the activity row has no owner and the only query that
    // reads the table — one person's history — cannot find it.
    const e = new ServiceCreated({ serviceId: "s1", providerId: "p1", actorUserId: "u1" });
    expect(e.payload.actorUserId).toBe("u1");
  });

  it("carry the actor on publish and unpublish too", () => {
    expect(new ServicePublished({ serviceId: "s1", actorUserId: "u1" }).payload.actorUserId).toBe("u1");
    expect(new ServiceUnpublished({ serviceId: "s1", actorUserId: "u1" }).payload.actorUserId).toBe("u1");
  });

  it("keeps the aggregate id as the service, not the actor", () => {
    // The event is still ABOUT the service. Making the actor the aggregate id
    // would break every existing consumer that keys on it.
    expect(new ServicePublished({ serviceId: "s1", actorUserId: "u1" }).aggregateId).toBe("s1");
  });
});
