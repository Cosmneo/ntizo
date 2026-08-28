# Message attachments, and contact detection — Design

**Goal:** a person can send a photo or a PDF in a conversation, and the other
side can open it. Sharing phone numbers or emails is refused, in the message
body and in the file name.

## Why these two things are one spec

Attachments alone would be a straightforward feature. They arrive with contact
detection because a file is otherwise the obvious way around any rule about
sharing a number — a photograph of a business card, or `liga-me-84xxxxxxx.jpg`.

Worth recording that the reasoning ran the other way first and was wrong: an
earlier note said attachments must ship with detection "or they open the door we
want to close". They do not open it. **If plain text is unguarded there is no
door to open** — nobody photographs a card when they can type the number in the
next message. So the decision taken was the larger one: guard the text too,
now, rather than wait for a paid booking to draw the boundary.

That decision was taken knowing the objection: without on-platform payment there
is no alternative to offer someone who wants to arrange things, so this refuses
without yet providing a path. It is the owner's call and it is recorded here so
the trade-off is not rediscovered as a surprise.

## What exists today

| | |
|---|---|
| Messaging phase 1 | Shipped. Attachments were explicitly out of scope. |
| `MEDIA_BUCKET` | R2, **public** — served from an open URL. Avatars, provider photos. |
| `DOCUMENTS_BUCKET` | R2, **private** — downloaded through `/api/documents/:id`, which checks permission and existence *together* so a stranger guessing ids learns nothing from the difference between 403 and 404. |
| `Message.compose` | Refuses an empty body after trimming; `message.body` is `notNull`. |

Attachments follow the documents posture, not media's. Only the two sides of a
conversation may see them, and a public URL cannot express that.

## Storage and the model

A new `ATTACHMENTS_BUCKET`, private, per environment.

```
ntizo_communication.attachment
  id            uuid pk
  message_id    uuid not null -> message (on delete cascade)
  storage_key   text not null
  file_name     text not null
  content_type  text not null
  size_bytes    integer not null
  created_at    timestamptz not null default now()
```

No `uploader_id`. Whoever uploaded is whoever sent the message, and duplicating
that invites the two to disagree.

### The invariant changes shape

`Message.compose` currently throws on an empty body, so **sending a photo with
no caption is impossible today** — and nobody captions a photograph.

The rule becomes *a message must carry something* rather than *a message must
have text*: an empty body is allowed **if** at least one attachment rides with
it. Small and cheap now; expensive once proposals lean on the same aggregate.

That forces the message and its attachments into **one transaction**. Otherwise
there is an instant where a message with no text and no attachments sits
committed, and the invariant just written is false on disk.

### Upload ordering

The file goes to R2 **first**, then the message and attachment rows are written.

The other order leaves a message pointing at a file that does not exist. This
order leaves an orphaned object in the bucket when the write fails — cheap
rubbish, sweepable, and invisible to the person using the product.

### Limits

- **10 MB** per file, **5** attachments per message.
- Accepted: **JPEG, PNG, WebP, PDF**.
- **SVG is excluded on purpose.** It is an image type that can carry script, and
  serving it to another user would be XSS with our signature on it.
- The content type is **decided by the server from the leading bytes**, never
  taken from the client. The sender controls the header they send, and a `.pdf`
  that is really HTML, served as a PDF, is the same attack wearing a hat.

### Download

`/api/communication/attachments/:id`, session-authed, permission and existence
answered together — the same shape `/api/documents/:id` already uses.

Served with **`content-disposition: attachment`, never `inline`**. The documents
endpoint uses `inline` deliberately, because its reader is an admin reviewing an
ID card. Here the file comes from a stranger and is opened by the other side of
a conversation; forcing a download takes away the file's ability to execute on
our origin.

`cache-control: private, no-store`.

## Contact detection

**The detector lives in `packages/shared`.** That is not tidiness. It has to run
in two places — in the client as someone types, for immediate feedback, and on
the server as the gate, because client-side validation is bypassed with one
`curl`. Two implementations would drift, and the day they drift is the day the
client says a message is fine and the server refuses it.

**What it catches:**

- **Mozambican mobile numbers** — nine digits beginning with 8 (82/83 Tmcel,
  84/85 Vodacom, 86/87 Movitel), with or without `+258`, tolerating spaces and
  dashes in the usual positions.
- **Email addresses.**
- **Direct-contact links** — `wa.me`, `t.me` and the like.

**What it deliberately does not catch:** general URLs. A provider linking their
own portfolio sits in a grey area, and blocking every link punishes a great deal
of legitimate use to catch a little.

Separators are matched in plausible positions rather than stripped wholesale. A
detector that removes every space before looking for nine digits will read a
price and an address as a phone number.

**Where it runs:** the message body **and the file name**.

### Two honest gaps

**Image contents are not inspected.** A photograph of a business card, or a
number written on paper, passes. Catching that needs OCR on every attachment —
slow, costly, and still avoidable. Recorded as a known gap rather than something
we believe we solved.

**Nor is anyone determined stopped.** Digits spelled out in words, separated by
full stops, or read aloud in a call arranged elsewhere. The goal is friction in
the casual case, which is most cases — not a wall.

### What the refusal says

This matters more than it looks, because **it has to be true**. We cannot say
"book through Ntizo" while booking through Ntizo does not exist; people notice,
and the rule loses its authority all at once.

What is true today: the conversation is on the record, there is somebody to
appeal to, and a review depends on the relationship existing here. Wording in
that register, in all eight locales.

## Interface

**Composer:** an attach button, a preview before sending, and the ability to
remove a file before it goes. The contact warning appears **while typing**, not
on submit — finding out a message is invalid after writing it is the worst
moment to learn.

**Thread:** images as thumbnails, PDFs as a card with name and size. Both fetch
only when opened. Eagerly loading every attachment in a long conversation spends
the data of somebody on mobile, which here is the norm rather than the exception.

## Errors

| Case | Result |
|---|---|
| Over 10 MB | refused before upload, stating the size |
| Type not accepted | refused, naming what is accepted |
| Bytes disagree with the declared type | refused — this is the bypass attempt |
| More than 5 per message | refused |
| Bucket unconfigured | 503, not 500 — configuration, not fault |
| Attachment of a conversation that is not yours | exactly what a missing attachment returns |

## Testing

Each proven by the mutation that should break it:

- a stranger cannot download another conversation's attachment — **with a second
  real user**, because a fixture holding one person's data passes whether or not
  the check exists
- a file whose bytes disagree with its declared type is refused
- the detector catches Mozambican formats and **does not** catch an address
  containing numbers
- the same detector gives the same answer in the client and on the server
- a message with neither text nor attachments is still refused — the invariant
  changed shape, it did not disappear

And the one that is usually missed: **that the file is served with
`content-disposition: attachment`**. Switch it to `inline` and nothing breaks;
the door simply opens, quietly.

## Out of scope

OCR of attachment contents. General URL blocking. Virus scanning. Attachments on
anything other than a message — proposals and job posts will reuse the upload,
validation, detection and download pieces when they need them, which is why
those are built as their own parts rather than folded into the message flow.
