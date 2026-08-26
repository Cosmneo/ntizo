# Profile photo, phone and timezone — design

**Date:** 2026-08-26
**Status:** awaiting review, then an implementation plan

## What this is

Three things a person cannot currently change about themselves, and one they
cannot see:

1. **Phone number** — stored, displayed, never editable after signup.
2. **Photo** — the column exists and is always `null`. Nothing writes it,
   nothing renders it, and someone who signed up with Google has a photo
   sitting in `better_auth.user.image` that the product never looks at.
3. **Timezone** — displayed on the profile card as `UTC` for every user who
   has ever registered, because that is the aggregate's default and no code
   path has ever written anything else.

## What already exists

More than it looks like from the account page.

| | |
|---|---|
| `Profile` aggregate | already has `phoneNumber` and `avatarUrl`, with `updateContact` accepting both |
| `user.updateMe` | already accepts `phoneNumber`, `bio`, `avatarUrl` |
| `CurrentUserDTO` | already returns `avatarUrl` and `phoneNumber` |
| Google sign-in | works, including account linking on a matching verified e-mail |
| `better_auth.user.image` | **already holds Google's `picture`** — see below |
| R2 media | public bucket, `POST /api/media/:providerId/:kind`, `mediaUrl(key)` |
| `LogoUpload` | picker, preview, 1:1 crop at 512px, type and size validation |
| `PhoneInput` | in `@ntizo/frontend-ui`, emits E.164 and nothing else |

The Google photo deserves its own note, because it changes the size of the
work. `@better-auth/core`'s Google provider builds the user as
`{ ..., image: user.picture, ...userMap }` — the `mapProfileToUser` result is
spread **after** the default mapping. Our override supplies `firstName` and
`lastName` only, so it does not displace `image`. The photo has been arriving
in the auth table all along; nothing carries it across to the domain profile.

**Nothing needs to change in `mapProfileToUser`.**

## Decisions

Settled in conversation, recorded here so the plan does not relitigate them:

| Question | Decision |
|---|---|
| Phone: profile-only, synced, or OTP? | **Synced without OTP.** The profile writes the number and pushes it to the auth identity. |
| Photo storage | **Two columns.** `avatar_key` for our uploads, `avatar_url` for Google's. |
| Google photo | **Referenced, not copied.** Store the URL as-is. |
| Photo precedence | **Key beats URL.** An uploaded photo is never displaced by a later Google sign-in. |
| Where the photo is edited | **Inside the "edit profile" form**, saved with everything else. |
| Timezone | **Detected at signup and editable.** |
| Payment methods, social links | Out of scope — a separate, already-shipped change. |

Two decisions were taken by default when the review did not settle them. Both
are cheap to reverse; say so and they change.

**The "Verified" badge is removed from the profile card.** It currently reads
`Boolean(user.phoneNumber)` — it says "verified" to anyone who typed a number
at signup, which is a claim nobody checked. The obvious repair, pointing it at
`phoneNumberVerified`, makes it read "unverified" for every user in dev, qa and
prod, because no SMS provider is configured there and verification is
unreachable. The other repair, pointing it at the e-mail, makes it permanently
green: `requireEmailVerification: true` means an unverified e-mail cannot hold
a session at all, and Google's e-mails arrive verified. A badge that is always
one colour is decoration. So: no badge, and a small "unverified" marker beside
the phone number itself — the one place where the answer actually varies, and
the one place where it matters when SMS eventually exists.

**The photo appears everywhere an avatar is already drawn**: the account page,
the user menu, and both sidebars' user menus. No component in the app renders
`AvatarImage` today; all four fall back to initials. Shipping the photo to one
of the four reads as a bug in the other three.

## Data model

One migration on `ntizo_user.profile`, generated with `bun db:ntizo:generate`:

```sql
ALTER TABLE "ntizo_user"."profile" ADD COLUMN "avatar_key" text;
```

`avatar_url` stays exactly as it is.

### Why two columns

The two sources have different shapes. Google hands over an absolute URL on a
host we do not control. Our own upload produces an R2 key, and the URL for that
key is composed at read time by `mediaUrl()` from `MEDIA_PUBLIC_URL_BASE` —
which is a different value in local, dev, qa and prod.

Composing the URL at write time would put a stage's own hostname into the
database. Locally that hostname is `http://localhost:8788/api/media`, so a
dev database restored from a developer's machine would point every avatar at a
laptop. This is the same reason `provider.logo_key` stores a key, and this
follows it.

Precedence lives in one place, the read repository:

```
avatarUrl = mediaUrl(row.avatarKey) ?? row.avatarUrl
```

Uploading sets the key and the uploaded photo wins. Clearing the key falls back
to the Google photo, which for someone who signed up with Google is the
sensible "reset" and for everyone else is `null` and therefore initials.

## Domain

**`Profile` aggregate.** Add `avatarKey: string | null` to `ProfileProps` and
its getter. `updateContact` accepts `avatarKey` alongside the fields it already
takes — it is a contact detail in the same sense the other three are, and a
fourth method would split one form submission across two calls for no gain.

`Profile.create` currently hardcodes `avatarUrl: null` and defaults `timezone`
to `"UTC"`. Both become parameters, so signup can supply what it knows.

**New: `user/domain/value-objects/phone-number.ts`.** A pure normaliser:
parses with `libphonenumber-js`, returns E.164, throws a domain error on
anything invalid.

The better-auth module has `normalizeSignUpPhoneNumber`, which does the same
parsing — and throws better-auth's `APIError`. It is not reused: a domain value
object that imports an auth framework's HTTP error type is a domain that cannot
be tested or reasoned about without that framework. The duplicated line is
`parsePhoneNumberFromString(raw)`; the coupling avoided is larger than that.

**New exception: `PhoneNumberAlreadyInUseError`**, in the user context's
exceptions barrel.

## The photo

### Upload

New route in `apps/backend/api/src/media.ts`:

```
POST /api/media/avatar
```

No id in the path. The subject is the session user, for the same reason
`user.updateMe` takes no `userId`: a route that accepts a target id is one
authorization bug away from letting anyone replace anyone's face. Key shape:
`avatar/<userId>/<timestamp>`.

Reuses the module's existing `IMAGE_MIME_TYPES` (jpeg, png, webp — no SVG) and
`MAX_IMAGE_BYTES` (5 MB), re-checked server-side because `accept` is a hint to
a file dialog and the size check runs in code the caller controls.

Routing note: `/api/media/avatar` is one segment after the prefix, so it cannot
match `/:providerId/:kind`, which needs two. No ordering dependency.

### Write

`user.updateMe` gains `avatarKey` (nullable, optional) and **loses**
`avatarUrl`.

Removing it is deliberate. The mutation currently accepts any URL that parses,
which lets any account point its face at any image anywhere on the internet —
hotlinking someone else's bandwidth, or serving a tracking pixel from a page
other users load. Nothing in the app sends the field, so removing it breaks no
caller. After this, `avatar_url` has exactly one writer: the signup hook.

### Read

`CurrentUserDTO` gains `avatarKey: string | null` beside the resolved
`avatarUrl`. The UI needs to distinguish "this is my photo, I can remove it"
from "this is what Google has", and a resolved URL cannot answer that.

### Google

`SignUpHookInput` gains `image: string | null`. The `user.create.after` hook
reads `authUser.image` — already populated — and
`CreateUserOnSignUpInternalCommand` passes it to `Profile.create` as
`avatarUrl`.

Known gap, not addressed: a user who registers with e-mail and password and
*links* Google later never runs the create hook, so their Google photo is never
picked up. They can upload one. Closing this means a hook on account linking;
it is not worth it before anyone asks.

## The phone

### Sync

New outbound port on the user context:

```ts
export interface AuthIdentityPort {
  /** Writes the number onto the auth identity, and clears its verified flag. */
  setPhoneNumber(userId: string, phoneNumber: string | null): Promise<void>;
}
```

Implemented by `better-auth-identity.adapter.ts` in the user context's
`infrastructure/`, writing `better_auth.user.phone_number` and
`phone_number_verified = false` in a single `UPDATE`.

This crosses a module boundary the read repository is explicit about not
crossing, and it is the only place in the user context that does. It is an
adapter, which is exactly the layer where a boundary crossing is allowed to be
named and contained rather than diffused: the use case depends on the port and
knows nothing about better-auth's tables.

The verified flag is cleared in the same statement as the write, not in a
second one. Two statements is one crash away from a number nobody verified
carrying a verified flag.

### Uniqueness

`better_auth.user.phone_number` is `unique`. A collision surfaces as Postgres
`23505`, which the adapter translates into `PhoneNumberAlreadyInUseError`.
Without this, two accounts could claim one number in their profiles and the
disagreement would only surface the day an SMS reached the wrong person.

### Validation

The mutation's `phoneNumber` is untyped today (`z.string().nullable()`). The
command normalises it through the new value object before it reaches the
aggregate, so the profile and the auth identity store the same E.164 string —
`"+258 84 987 6543"` and `"+258849876543"` are one number that the unique index
sees as two.

### Changing, clearing, and not touching

The command already reads the profile before writing it, so it compares the
incoming number against the stored one and calls the port only when they
differ. Saving the form without touching the phone must not clear a
verification flag.

An empty phone field means cleared, not "leave alone" — the field was on screen
and the user emptied it, which is an instruction, and it is the same rule the
bio already follows. Clearing writes `null` to both the profile and the auth
identity, which releases the number from the unique index so the person can
claim it on another account.

### What "verified" means now

`phoneNumberVerified` lives on the auth identity and reaches the browser on the
session, where `inferAdditionalFields` already declares it. The account page
reads it from `useSession()`, not from the GraphQL read model: it is an auth
fact, and copying it into the domain profile would create a second truth that
drifts.

It will be `false` for essentially everyone until an SMS provider exists. That
is accurate, and it is why the marker sits beside the number instead of being a
verdict on the whole account.

## Timezone

**Editable**: a select in the profile form, built from
`Intl.supportedValuesOf("timeZone")` with the browser's own resolved zone
first.

**Detected at signup**: the web app already sends `Accept-Language` on the
`signUp.email` call so the profile is born in the language on screen. A
`X-Timezone` header rides the same call, is read by `config.middleware.ts` into
the `infraStore` exactly as the language is, and reaches `Profile.create`.

`X-Timezone` must also be added to `allowHeaders` in
`apps/backend/api/src/middlewares/cors.ts`, which lists `Content-Type` and
`Authorization` and nothing else. `Accept-Language` gets away with not being
listed because it is a CORS-safelisted request header; a custom `X-` header is
not, so the preflight refuses it. This would pass every local test — dev goes
through the Vite proxy and is same-origin — and fail silently in dev, qa and
prod, where the app and the api are different hosts.

**Known gap:** a Google signup creates the user during the OAuth callback — a
request that comes from Google's redirect and carries no header of ours. Those
profiles are born `UTC` and are corrected in the form. Language has this same
gap today and it has not hurt. The alternative is the app silently rewriting
the field after first load, which means the client deciding a value the user is
allowed to choose; not worth it for the difference.

## UI

**`profile-form.tsx`** gains three fields:

- The avatar, at the top: `LogoUpload` from `@ntizo/frontend-ui`, in a round
  variant. Choosing a file uploads immediately and yields a key; the key sits
  in form state and is written by "Save" with the rest. Uploading and saving
  stay separate so a wrong photograph is discarded rather than undone.
- Phone: `PhoneInput`, the same component the signup form uses, so a number
  that passes here cannot be refused there.
- Timezone: the select described above.

**`LogoUpload`** gains `shape?: "square" | "round"`, defaulting to `"square"`.
The only difference is the preview's border radius — `LOGO_CROP` is already
`{ aspect: 1, width: 512 }`, which is an avatar's shape. A second component
copied from the first would duplicate the picker, the crop dialog, the
rejection handling and the busy state to change one class.

**`account-page.tsx`**: `AvatarImage` with `user.avatarUrl`, initials as
fallback; badge removed; verification marker beside the phone number.

**`user-menu.tsx`, `app-sidebar/sidebar-user-menu.tsx`,
`admin-sidebar/sidebar-user-menu.tsx`**: `AvatarImage` with the same fallback.

Upload errors reuse the existing `mediaError.*` translation keys.

## Testing

| Level | What |
|---|---|
| Domain | `Profile` carries and clears `avatarKey`; `create` honours a supplied avatar URL and timezone |
| Domain | the E.164 normaliser: valid, spaced, national-without-country, junk |
| Use case | `CreateUserOnSignUpInternalCommand` writes image and timezone onto the profile |
| Use case | `UpdateMyProfileCommand` calls `AuthIdentityPort` when the phone changes and not when it does not |
| Use case | a `23505` from the adapter surfaces as `PhoneNumberAlreadyInUseError` |
| Read | the repository prefers `mediaUrl(avatarKey)` over `avatarUrl`, and falls back when the key is null |
| Route | `POST /api/media/avatar` refuses anonymously, refuses a PDF, refuses 6 MB, accepts a JPEG |
| E2E | sign in, edit profile, upload a photo, set a phone, save, see all three |

## Scope

**In:** everything above.

**Out:** an SMS provider, and therefore any working phone verification. The
marker will say "unverified" until one exists.

**Out:** copying the Google photo into R2, and picking one up when Google is
linked to an existing account.

**Out:** the footer's placeholder support phone and e-mail, and its untranslated
English company description. Noticed while working nearby; unrelated.

## Size

Roughly 31 files, of which 7 are new: the migration, the phone value object,
the port, the adapter, the avatar route, and the frontend's avatar repository
and its viewmodel. Eight locale files carry the new labels.
