import { beforeEach, describe, expect, test } from "bun:test";
import {
  __resetMediaUrlBaseForTests,
  configureMediaUrlBase,
  mediaUrl,
} from "../media-url";

/**
 * Where an image's URL comes from when nothing is serving a public bucket.
 *
 * Locally `MEDIA_PUBLIC_URL_BASE` is unset, and this used to return `null` for
 * every key. The read projections then *filtered those keys out* — so a
 * provider who had uploaded three photographs saw an empty list, with nothing
 * to say the images existed and could not be shown. The API serves the bucket
 * itself at `/api/media/*`; it can name its own route.
 */
describe("mediaUrl", () => {
  beforeEach(() => __resetMediaUrlBaseForTests());

  test("uses the public base when one is configured", () => {
    configureMediaUrlBase("https://media.example.test", "http://localhost:8788/api/media");

    expect(mediaUrl("provider/p1/service/123")).toBe(
      "https://media.example.test/provider/p1/service/123",
    );
  });

  test("falls back to the API's own media route when there is no public base", () => {
    configureMediaUrlBase(undefined, "http://localhost:8788/api/media");

    expect(mediaUrl("provider/p1/service/123")).toBe(
      "http://localhost:8788/api/media/provider/p1/service/123",
    );
  });

  test("still returns null when neither is known", () => {
    // A URL cannot be invented from nothing, and a plausible link that 404s is
    // worse than an absent one.
    configureMediaUrlBase(undefined, undefined);

    expect(mediaUrl("provider/p1/service/123")).toBeNull();
  });

  test("a missing key is null whatever is configured", () => {
    configureMediaUrlBase("https://media.example.test", "http://localhost:8788/api/media");

    expect(mediaUrl(null)).toBeNull();
    expect(mediaUrl(undefined)).toBeNull();
    expect(mediaUrl("")).toBeNull();
  });

  test("the public base still wins on a later call that only knows the fallback", () => {
    // "First call wins" protects the base; the fallback must not overwrite it
    // on a subsequent request whose env happens to be read differently.
    configureMediaUrlBase("https://media.example.test", undefined);
    configureMediaUrlBase(undefined, "http://localhost:8788/api/media");

    expect(mediaUrl("k")).toBe("https://media.example.test/k");
  });

  test("the fallback is learned even when the base is configured first", () => {
    configureMediaUrlBase("https://media.example.test", undefined);
    __resetMediaUrlBaseForTests();
    configureMediaUrlBase(undefined, "http://localhost:8788/api/media");

    expect(mediaUrl("k")).toBe("http://localhost:8788/api/media/k");
  });
});
