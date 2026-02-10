# Communication Bounded Context

## 1. Overview

The Communication Bounded Context manages all in-app messaging between customers and providers, and orchestrates multi-channel notification delivery across the Ntizo service marketplace platform. It is a downstream conformist BC that reacts to domain events from User, Booking, Pricing, Payment, and Review BCs.

**Owns:**
- In-app conversations and message lifecycle
- Conversation creation on booking confirmation
- Quote negotiation chat threads (Path C)
- Multi-channel notification dispatch (push, email, SMS)
- Notification preferences per user
- Notification center (in-app notification feed)
- Read status tracking for messages and notifications
- Message content moderation (contact sharing detection, reporting)
- Chat image attachments (up to 5MB)

**Delegates:**
- User identity and contact details to **User BC**
- Booking context and lifecycle to **Booking BC**
- Quote negotiation triggers to **Pricing BC**
- Payment event triggers to **Payment BC**
- Review event triggers to **Review BC**

**Key Design Principles:**
- Conversations are tied to bookings: one booking = one conversation, created on booking confirmation
- Quote negotiation (Path C) reuses the conversation model with a `quote_negotiation` context type
- Messages support text (max 2000 chars) and image attachments (max 5MB per image)
- Contact sharing (phone numbers, emails) in messages triggers an automatic warning to the sender
- Chat history is preserved for 12 months to support dispute resolution
- Notifications are dispatched per a configurable notification matrix mapping events to channels
- Users can configure notification preferences to opt out of non-critical channels
- Notifications are retained for 90 days
- External delivery services (Firebase, SendGrid/Resend, Twilio) are isolated behind port interfaces with ACL adapters

---

## 2. Ubiquitous Language

| Term | Definition |
|------|-----------|
| **Conversation** | A chat thread between two parties (customer and provider) tied to a specific booking or quote negotiation. The root aggregate of the messaging model. |
| **Message** | A single text or image entry within a conversation, sent by one participant to the other. Child entity of Conversation. |
| **Message Type** | The content format: `text` or `image`. |
| **Conversation Status** | The lifecycle state: `active` (open for messaging), `closed` (booking completed or cancelled, read-only), `archived` (past retention window). |
| **Conversation Context** | The reason the conversation exists: `booking` (standard booking chat) or `quote_negotiation` (Path C quote discussion). |
| **Read Status** | Whether a message has been read by its recipient. Tracked per message via `is_read` and `read_at`. |
| **Contact Sharing Warning** | An automated system message inserted when a user's message contains a phone number or email pattern, warning that sharing contact details outside the platform is discouraged. |
| **Message Report** | A user-submitted report flagging a message as inappropriate, abusive, or containing prohibited content. |
| **Notification** | A platform-generated alert delivered to a user through one or more channels (push, email, SMS, in-app). |
| **Notification Channel** | The delivery medium: `push` (Firebase Cloud Messaging), `email` (SendGrid/Resend), `sms` (Twilio), `in_app` (notification center). |
| **Notification Matrix** | The configuration mapping each event type to the set of channels through which it should be delivered. |
| **Notification Preference** | A user-level opt-in/opt-out setting per notification type and channel. Critical notifications (e.g., booking confirmed) cannot be disabled. |
| **Notification Status** | The delivery state of a notification: `pending`, `sent`, `delivered`, `failed`, `read`. |

---

## 3. Aggregates & Entities

### 3.1 Conversation Aggregate

**Aggregate Root:** `Conversation`
**Children:** `Message[]`

#### Conversation Attributes

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | PK, auto-generated |
| `booking_id` | `UUID \| null` | FK -> bookings. Set for booking conversations |
| `quote_request_id` | `UUID \| null` | FK -> quote_requests. Set for quote negotiation |
| `customer_id` | `UUID` | FK -> users. Required |
| `provider_id` | `UUID` | FK -> users (or organization owner). Required |
| `context` | `ConversationContext` | Enum: `booking`, `quote_negotiation`. Required |
| `status` | `ConversationStatus` | Enum: `active`, `closed`, `archived`. Default `active` |
| `last_message_at` | `Date \| null` | Updated on each new message |
| `closed_at` | `Date \| null` | Set when conversation is closed |
| `created_at` | `Date` | Auto-set |
| `updated_at` | `Date` | Auto-set |

#### Message Attributes (Child Entity)

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | PK, auto-generated |
| `conversation_id` | `UUID` | FK -> conversations. Required |
| `sender_id` | `UUID` | FK -> users. Required |
| `type` | `MessageType` | Enum: `text`, `image`, `system`. Required |
| `content` | `string \| null` | Max 2000 chars. Required for text, null for image |
| `image_url` | `string \| null` | S3 URL. Required for image, null for text |
| `image_size_bytes` | `number \| null` | Max 5,242,880 (5MB). Set for image messages |
| `is_read` | `boolean` | Default false |
| `read_at` | `Date \| null` | Set when recipient reads the message |
| `is_reported` | `boolean` | Default false |
| `reported_at` | `Date \| null` | Set when message is reported |
| `report_reason` | `string \| null` | Max 500 chars |
| `created_at` | `Date` | Auto-set |

#### Invariants

1. Exactly one of `booking_id` or `quote_request_id` must be set (XOR constraint).
2. Only the two participants (`customer_id`, `provider_id`) can send messages.
3. Messages cannot be sent to a `closed` or `archived` conversation.
4. Text messages must have `content` with length between 1 and 2000 characters.
5. Image messages must have `image_url` and `image_size_bytes <= 5,242,880`.
6. System messages (type `system`) are created only by the platform, never by users.
7. A message can only be reported by the recipient, not the sender.
8. `last_message_at` must equal the `created_at` of the most recent message.

#### Domain Logic (Key Methods)

```typescript
import { Entity, DomainError } from 'onion-lasagna';

type ConversationContext = 'booking' | 'quote_negotiation';
type ConversationStatus = 'active' | 'closed' | 'archived';
type MessageType = 'text' | 'image' | 'system';

const MAX_TEXT_LENGTH = 2000;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const SYSTEM_SENDER_ID = '00000000-0000-0000-0000-000000000000'; // well-known UUID for system messages
const CONTACT_PATTERN = /(\+?\d[\d\s\-]{7,}|\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b)/;

interface ConversationProps {
  bookingId: string | null;
  quoteRequestId: string | null;
  customerId: string;
  providerId: string;
  context: ConversationContext;
  status: ConversationStatus;
  lastMessageAt: Date | null;
  closedAt: Date | null;
  messages: Message[];
}

class Conversation extends Entity<ConversationProps> {
  static create(props: Omit<ConversationProps, 'status' | 'lastMessageAt' | 'closedAt' | 'messages'>): Conversation {
    if (!props.bookingId && !props.quoteRequestId) {
      throw new DomainError('Conversation must reference a booking or quote request');
    }
    if (props.bookingId && props.quoteRequestId) {
      throw new DomainError('Conversation cannot reference both booking and quote request');
    }
    return new Conversation({
      ...props,
      status: 'active',
      lastMessageAt: null,
      closedAt: null,
      messages: [],
    });
  }

  sendTextMessage(senderId: string, content: string): Message {
    this.assertActive();
    this.assertParticipant(senderId);
    if (!content || content.length > MAX_TEXT_LENGTH) {
      throw new DomainError(`Message content must be between 1 and ${MAX_TEXT_LENGTH} characters`);
    }
    const message = Message.create({
      conversationId: this.id,
      senderId,
      type: 'text',
      content,
      imageUrl: null,
      imageSizeBytes: null,
    });
    this.props.messages.push(message);
    this.props.lastMessageAt = new Date();
    this.markUpdated();

    const recipientId = senderId === this.props.customerId
      ? this.props.providerId
      : this.props.customerId;
    this.addDomainEvent(new MessageSent(this.id, message.id, senderId, recipientId));

    if (CONTACT_PATTERN.test(content)) {
      const warning = Message.create({
        conversationId: this.id,
        senderId: SYSTEM_SENDER_ID,
        type: 'system',
        content: 'Sharing contact details outside the platform is discouraged. All transactions should be conducted within Ntizo for your safety.',
        imageUrl: null,
        imageSizeBytes: null,
      });
      this.props.messages.push(warning);
      this.addDomainEvent(new ContactSharingDetected(this.id, senderId));
    }

    return message;
  }

  sendImageMessage(senderId: string, imageUrl: string, imageSizeBytes: number): Message {
    this.assertActive();
    this.assertParticipant(senderId);
    if (imageSizeBytes > MAX_IMAGE_SIZE_BYTES) {
      throw new DomainError(`Image size must not exceed ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB`);
    }
    const message = Message.create({
      conversationId: this.id,
      senderId,
      type: 'image',
      content: null,
      imageUrl,
      imageSizeBytes,
    });
    this.props.messages.push(message);
    this.props.lastMessageAt = new Date();
    this.markUpdated();

    const recipientId = senderId === this.props.customerId
      ? this.props.providerId
      : this.props.customerId;
    this.addDomainEvent(new MessageSent(this.id, message.id, senderId, recipientId));
    return message;
  }

  markMessageRead(messageId: string, readerId: string): void {
    const message = this.findMessage(messageId);
    if (message.props.senderId === readerId) return; // sender cannot mark own message as read
    this.assertParticipant(readerId);
    message.markRead();
    this.markUpdated();
  }

  reportMessage(messageId: string, reporterId: string, reason: string): void {
    const message = this.findMessage(messageId);
    if (message.props.senderId === reporterId) {
      throw new DomainError('Cannot report your own message');
    }
    this.assertParticipant(reporterId);
    message.report(reason);
    this.markUpdated();
    this.addDomainEvent(new MessageReported(this.id, messageId, reporterId, reason));
  }

  close(): void {
    if (this.props.status !== 'active') {
      throw new DomainError(`Cannot close conversation in '${this.props.status}' status`);
    }
    this.props.status = 'closed';
    this.props.closedAt = new Date();
    this.markUpdated();
  }

  archive(): void {
    if (this.props.status !== 'closed') {
      throw new DomainError('Only closed conversations can be archived');
    }
    this.props.status = 'archived';
    this.markUpdated();
  }

  private assertActive(): void {
    if (this.props.status !== 'active') {
      throw new DomainError('Cannot send messages to a closed or archived conversation');
    }
  }

  private assertParticipant(userId: string): void {
    if (userId !== this.props.customerId && userId !== this.props.providerId && userId !== SYSTEM_SENDER_ID) {
      throw new DomainError('Only conversation participants can perform this action');
    }
  }

  private findMessage(id: string): Message {
    const msg = this.props.messages.find(m => m.id === id);
    if (!msg) throw new DomainError('Message not found');
    return msg;
  }
}
```

#### Message Entity

```typescript
interface MessageProps {
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string | null;
  imageUrl: string | null;
  imageSizeBytes: number | null;
  isRead: boolean;
  readAt: Date | null;
  isReported: boolean;
  reportedAt: Date | null;
  reportReason: string | null;
}

class Message extends Entity<MessageProps> {
  static create(props: Pick<MessageProps, 'conversationId' | 'senderId' | 'type' | 'content' | 'imageUrl' | 'imageSizeBytes'>): Message {
    return new Message({
      ...props,
      isRead: false,
      readAt: null,
      isReported: false,
      reportedAt: null,
      reportReason: null,
    });
  }

  markRead(): void {
    if (!this.props.isRead) {
      this.props.isRead = true;
      this.props.readAt = new Date();
    }
  }

  report(reason: string): void {
    if (this.props.isReported) {
      throw new DomainError('Message already reported');
    }
    this.props.isReported = true;
    this.props.reportedAt = new Date();
    this.props.reportReason = reason;
  }
}
```

---

### 3.2 Notification Aggregate

**Aggregate Root:** `Notification`
**Children:** None

#### Attributes

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | PK, auto-generated |
| `user_id` | `UUID` | FK -> users. Required |
| `type` | `NotificationType` | Required. Maps to notification matrix event |
| `title` | `string` | Required, max 200 chars |
| `body` | `string` | Required, max 500 chars |
| `data` | `JSON \| null` | Contextual payload (bookingId, paymentId, etc.) |
| `channels_sent` | `string[]` | Channels through which notification was dispatched |
| `is_read` | `boolean` | Default false |
| `read_at` | `Date \| null` | Set when user reads in notification center |
| `created_at` | `Date` | Auto-set |

#### Invariants

1. `title` length must be between 1 and 200 characters.
2. `body` length must be between 1 and 500 characters.
3. A notification can only be marked as read by its `user_id`.
4. `channels_sent` must contain at least `in_app`.

#### Domain Logic

```typescript
type NotificationType =
  | 'new_booking' | 'booking_confirmed' | 'booking_cancelled'
  | 'new_message' | 'quote_requested' | 'quote_received'
  | 'quote_accepted' | 'quote_expired' | 'new_bid' | 'bid_accepted'
  | 'task_started' | 'booking_completed' | 'payment_received'
  | 'payout_completed' | 'new_review' | 'verification_update'
  | 'booking_reminder' | 'subscription_created' | 'subscription_renewed'
  | 'subscription_billing_failed' | 'subscription_cancelled'
  | 'subscription_expiring' | 'recurring_booking_generated';

interface NotificationProps {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  channelsSent: string[];
  isRead: boolean;
  readAt: Date | null;
}

class Notification extends Entity<NotificationProps> {
  static create(props: Omit<NotificationProps, 'isRead' | 'readAt'>): Notification {
    if (!props.channelsSent.includes('in_app')) {
      props.channelsSent.push('in_app');
    }
    return new Notification({
      ...props,
      isRead: false,
      readAt: null,
    });
  }

  markRead(userId: string): void {
    if (this.props.userId !== userId) {
      throw new DomainError('Only the notification owner can mark it as read');
    }
    if (!this.props.isRead) {
      this.props.isRead = true;
      this.props.readAt = new Date();
    }
  }
}
```

---

## 4. Value Objects

```typescript
const ConversationContext = {
  BOOKING: 'booking',
  QUOTE_NEGOTIATION: 'quote_negotiation',
} as const;
type ConversationContext = (typeof ConversationContext)[keyof typeof ConversationContext];

const ConversationStatus = {
  ACTIVE: 'active',
  CLOSED: 'closed',
  ARCHIVED: 'archived',
} as const;
type ConversationStatus = (typeof ConversationStatus)[keyof typeof ConversationStatus];

const MessageType = {
  TEXT: 'text',
  IMAGE: 'image',
  SYSTEM: 'system',
} as const;
type MessageType = (typeof MessageType)[keyof typeof MessageType];

const NotificationChannel = {
  PUSH: 'push',
  EMAIL: 'email',
  SMS: 'sms',
  IN_APP: 'in_app',
} as const;
type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];
```

Additional value objects: `ConversationId`, `MessageId`, `NotificationId` (UUID wrappers), `MessageContent` (string with length validation, max 2000 chars), `ImageAttachment` (url + sizeBytes, validated to 5MB max).

---

## 5. Domain Events

| Event | Trigger | Key Payload | Handlers |
|-------|---------|-------------|----------|
| `ConversationCreated` | Booking confirmed or quote negotiation started | conversationId, bookingId or quoteRequestId, customerId, providerId | Internal: no downstream consumers |
| `MessageSent` | User sends text or image message | conversationId, messageId, senderId, recipientId | Notification: send push to recipient |
| `ContactSharingDetected` | Message content matches phone/email pattern | conversationId, senderId | Internal: log for moderation, insert system warning |
| `MessageReported` | Recipient reports a message | conversationId, messageId, reporterId, reason | Admin: flag for review |
| `ConversationClosed` | Booking completed/cancelled or quote resolved | conversationId | Internal: mark conversation read-only |

---

## 6. Use Cases

### Messaging

| Use Case | Actor | Input | Output | Events | Errors |
|----------|-------|-------|--------|--------|--------|
| **CreateConversation** | System (on BookingConfirmed or QuoteRequested) | bookingId or quoteRequestId, customerId, providerId, context | Conversation (active) | ConversationCreated | AlreadyExists, ValidationError |
| **SendTextMessage** | Customer or Provider | conversationId, senderId, content | Message (text) | MessageSent, ContactSharingDetected? | NotFound, ConversationClosed, NotParticipant, ContentTooLong |
| **SendImageMessage** | Customer or Provider | conversationId, senderId, imageUrl, imageSizeBytes | Message (image) | MessageSent | NotFound, ConversationClosed, NotParticipant, ImageTooLarge |
| **MarkMessageRead** | Recipient | conversationId, messageId, readerId | Updated Message | -- | NotFound, NotParticipant |
| **MarkAllMessagesRead** | Recipient | conversationId, readerId | Updated Messages | -- | NotFound, NotParticipant |
| **ReportMessage** | Recipient | conversationId, messageId, reporterId, reason | Updated Message | MessageReported | NotFound, NotParticipant, OwnMessage, AlreadyReported |
| **GetConversation** | Customer or Provider | conversationId, userId | Conversation with messages | -- | NotFound, NotParticipant |
| **ListConversations** | Customer or Provider | userId, pagination | Conversation[] (sorted by lastMessageAt) | -- | -- |
| **CloseConversation** | System (on BookingCompleted/Cancelled) | conversationId | Conversation (closed) | ConversationClosed | NotFound, InvalidState |
| **ArchiveExpiredConversations** | System (scheduled, 12 months after close) | -- | Archived conversations | -- | -- |

### Notifications

| Use Case | Actor | Input | Output | Events | Errors |
|----------|-------|-------|--------|--------|--------|
| **DispatchNotification** | System (on domain event) | userId, notificationType, title, body, data? | Notification + external delivery | -- | UserNotFound, DeliveryFailure |
| **MarkNotificationRead** | User | notificationId, userId | Updated Notification | -- | NotFound, Unauthorized |
| **MarkAllNotificationsRead** | User | userId | Updated Notifications | -- | -- |
| **GetNotificationFeed** | User | userId, pagination, filter? | Notification[] | -- | -- |
| **GetUnreadCount** | User | userId | { count: number } | -- | -- |
| **UpdateNotificationPreferences** | User | userId, preferences | Updated preferences | -- | CriticalChannelRequired |
| **PurgeExpiredNotifications** | System (scheduled, 90 days) | -- | Deleted notifications | -- | -- |

---

## 7. Repository Ports

```typescript
interface ConversationRepository {
  findById(id: string): Promise<Conversation | null>;
  findByBooking(bookingId: string): Promise<Conversation | null>;
  findByQuoteRequest(quoteRequestId: string): Promise<Conversation | null>;
  findByParticipant(userId: string, pagination: { limit: number; offset: number }): Promise<{ conversations: Conversation[]; total: number }>;
  findClosedBefore(date: Date): Promise<Conversation[]>;
  save(conversation: Conversation): Promise<void>;
}

interface MessageRepository {
  findById(id: string): Promise<Message | null>;
  findByConversation(conversationId: string, pagination: { limit: number; offset: number }): Promise<{ messages: Message[]; total: number }>;
  findUnreadByRecipient(conversationId: string, recipientId: string): Promise<Message[]>;
  countUnreadByUser(userId: string): Promise<number>;
  save(message: Message): Promise<void>;
  saveBatch(messages: Message[]): Promise<void>;
}

interface NotificationRepository {
  findById(id: string): Promise<Notification | null>;
  findByUser(userId: string, pagination: { limit: number; offset: number }, filter?: { type?: NotificationType; isRead?: boolean }): Promise<{ notifications: Notification[]; total: number }>;
  countUnread(userId: string): Promise<number>;
  findExpiredBefore(date: Date): Promise<Notification[]>;
  save(notification: Notification): Promise<void>;
  deleteBatch(ids: string[]): Promise<void>;
}

interface NotificationPreferenceRepository {
  findByUser(userId: string): Promise<NotificationPreference[]>;
  upsert(userId: string, preferences: NotificationPreference[]): Promise<void>;
}
```

### External Service Ports (ACL Pattern)

```typescript
/**
 * Anti-Corruption Layer: isolates external notification delivery
 * services from the domain. Each adapter wraps a specific
 * provider SDK (Firebase, SendGrid/Resend, Twilio).
 */
interface PushNotificationService {
  send(params: {
    userId: string;
    deviceTokens: string[];
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<DeliveryResult>;
}

interface EmailNotificationService {
  send(params: {
    to: string;
    templateId: string;
    templateData: Record<string, unknown>;
    subject?: string;
  }): Promise<DeliveryResult>;
}

interface SmsNotificationService {
  send(params: {
    phoneNumber: string;
    message: string;
  }): Promise<DeliveryResult>;
}

interface DeliveryResult {
  success: boolean;
  externalId: string | null;
  failureReason: string | null;
}
```

---

## 8. Entity Schemas

### Drizzle ORM Schema

```typescript
import {
  pgTable, uuid, varchar, text, jsonb, boolean, timestamp,
  integer, index, uniqueIndex, check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// -- Conversations ----------------------------------------------------------

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id'),
    quoteRequestId: uuid('quote_request_id'),
    customerId: uuid('customer_id').notNull(),
    providerId: uuid('provider_id').notNull(),
    context: varchar('context', { length: 30 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_conversations_booking').on(table.bookingId),
    index('idx_conversations_quote_request').on(table.quoteRequestId),
    index('idx_conversations_customer').on(table.customerId),
    index('idx_conversations_provider').on(table.providerId),
    index('idx_conversations_status').on(table.status),
    index('idx_conversations_last_message').on(table.lastMessageAt),
    uniqueIndex('uq_conversations_booking').on(table.bookingId),
    uniqueIndex('uq_conversations_quote_request').on(table.quoteRequestId),
    check('conversation_context_check', sql`${table.context} IN ('booking','quote_negotiation')`),
    check('conversation_status_check', sql`${table.status} IN ('active','closed','archived')`),
    check('conversation_reference_check', sql`(${table.bookingId} IS NOT NULL AND ${table.quoteRequestId} IS NULL) OR (${table.bookingId} IS NULL AND ${table.quoteRequestId} IS NOT NULL)`),
  ],
);

// -- Messages ---------------------------------------------------------------

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id').notNull(),
    type: varchar('type', { length: 10 }).notNull(),
    content: text('content'),
    imageUrl: text('image_url'),
    imageSizeBytes: integer('image_size_bytes'),
    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    isReported: boolean('is_reported').notNull().default(false),
    reportedAt: timestamp('reported_at', { withTimezone: true }),
    reportReason: varchar('report_reason', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_messages_conversation').on(table.conversationId),
    index('idx_messages_sender').on(table.senderId),
    index('idx_messages_created_at').on(table.createdAt),
    index('idx_messages_is_read').on(table.conversationId, table.isRead),
    index('idx_messages_reported').on(table.isReported),
    check('message_type_check', sql`${table.type} IN ('text','image','system')`),
    check('message_content_length', sql`${table.type} != 'text' OR (${table.content} IS NOT NULL AND length(${table.content}) <= 2000)`),
    check('message_image_size', sql`${table.imageSizeBytes} IS NULL OR ${table.imageSizeBytes} <= 5242880`),
  ],
);

// -- Notifications ----------------------------------------------------------

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: varchar('body', { length: 500 }).notNull(),
    data: jsonb('data'),
    channelsSent: jsonb('channels_sent').notNull().default(sql`'["in_app"]'::jsonb`),
    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_notifications_user').on(table.userId),
    index('idx_notifications_user_read').on(table.userId, table.isRead),
    index('idx_notifications_type').on(table.type),
    index('idx_notifications_created_at').on(table.createdAt),
  ],
);

// -- Notification Preferences -----------------------------------------------

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    notificationType: varchar('notification_type', { length: 50 }).notNull(),
    pushEnabled: boolean('push_enabled').notNull().default(true),
    emailEnabled: boolean('email_enabled').notNull().default(true),
    smsEnabled: boolean('sms_enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_notification_pref_user_type').on(table.userId, table.notificationType),
    index('idx_notification_pref_user').on(table.userId),
  ],
);

// -- Device Tokens (for push notifications) ---------------------------------

export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    token: varchar('token', { length: 500 }).notNull(),
    platform: varchar('platform', { length: 10 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_device_tokens_user').on(table.userId),
    uniqueIndex('uq_device_tokens_token').on(table.token),
    check('platform_check', sql`${table.platform} IN ('ios','android','web')`),
  ],
);
```

---

## 9. Business Rules & Invariants

### Messaging Rules

| # | Rule | Enforcement |
|---|------|-------------|
| MSG1 | A conversation is created automatically when a booking is confirmed (`BookingConfirmed`) or a quote is requested (`QuoteRequested`). Users cannot create conversations manually. | `CreateConversation` use case triggered only by domain events |
| MSG2 | Only the two participants (customer and provider) can send and read messages within a conversation. | Domain invariant in `assertParticipant()` |
| MSG3 | Text messages are limited to 2000 characters. Image attachments are limited to 5MB. | Domain validation + DB CHECK constraints |
| MSG4 | When a message contains a phone number or email pattern, the system inserts an automatic warning message. | Regex detection in `sendTextMessage()` + system message insertion |
| MSG5 | Messages cannot be sent to closed or archived conversations. Conversations close when the associated booking is completed or cancelled, or when the quote negotiation resolves. | Domain invariant in `assertActive()` |
| MSG6 | A message can only be reported by the recipient, not the sender. A message can only be reported once. | Domain validation in `reportMessage()` |
| MSG7 | Chat history is preserved for 12 months after the conversation is closed. After that, conversations are archived and eligible for deletion. | `ArchiveExpiredConversations` scheduled job runs against `closed_at + 12 months` |
| MSG8 | System messages (type `system`) cannot be sent by users. They are platform-generated only. | Domain logic in `assertParticipant()` excludes user-initiated system messages |

### Notification Rules

| # | Rule | Enforcement |
|---|------|-------------|
| NOT1 | Every notification creates an in-app entry regardless of other channels. | `Notification.create()` ensures `in_app` is always in `channelsSent` |
| NOT2 | Channel delivery respects the notification matrix. Not all events trigger all channels. | `DispatchNotification` use case consults the matrix before dispatching |
| NOT3 | Users can opt out of non-critical notification channels (email, SMS) but cannot disable push for critical events (booking confirmed, cancelled, payment). | `UpdateNotificationPreferences` validates against critical notification list |
| NOT4 | Notifications are retained for 90 days. Older notifications are purged by a scheduled job. | `PurgeExpiredNotifications` runs against `created_at + 90 days` |
| NOT5 | Push notifications require at least one active device token. If no tokens exist, push is skipped silently. | `DispatchNotification` checks `deviceTokens` before calling `PushNotificationService` |

### Notification Matrix

| Event | Push | Email | SMS | Critical |
|-------|------|-------|-----|----------|
| New booking | yes | yes | yes | yes |
| Booking confirmed | yes | yes | yes | yes |
| Booking cancelled | yes | yes | yes | yes |
| New message | yes | -- | -- | no |
| Quote requested | yes | yes | -- | no |
| Quote received | yes | yes | -- | no |
| Quote accepted | yes | yes | yes | yes |
| Quote expired | yes | yes | -- | no |
| New bid | yes | yes | -- | no |
| Bid accepted | yes | yes | yes | yes |
| Task started | yes | -- | -- | no |
| Booking completed | yes | yes | -- | no |
| Payment received | yes | yes | -- | no |
| Payout completed | yes | yes | yes | yes |
| New review | yes | yes | -- | no |
| Verification update | yes | yes | yes | yes |
| Booking reminder | yes | -- | yes | no |
| Subscription created | yes | yes | -- | no |
| Subscription renewed | yes | yes | -- | no |
| Subscription billing failed | yes | yes | yes | yes |
| Subscription cancelled | yes | yes | -- | no |
| Subscription expiring | yes | yes | -- | no |
| Recurring booking generated | yes | -- | -- | no |

---

## 10. Cross-Context Dependencies

### Upstream Dependencies (Depends On)

| Source BC | What Communication Needs | How It Gets It |
|-----------|-------------------------|----------------|
| **User** | User identity (name, email, phone) for notification delivery. Device tokens for push. | Consumes `UserRegistered` to cache user contact details. Queries User BC read models for email/phone on notification dispatch |
| **Booking** | Booking lifecycle events to create conversations and trigger notifications | Consumes `BookingCreated`, `BookingConfirmed`, `BookingStarted`, `BookingCompleted`, `BookingCancelled`, `BookingExpired`, `BookingDisputed`, `RecurrenceCreated`, `SubscriptionCreated`, `SubscriptionPaused`, `SubscriptionResumed`, `SubscriptionCancelled`, `SubscriptionExpired`, `SubscriptionBillingFailed`, `TaskPosted`, `BidSubmitted`, `BidAccepted` |
| **Pricing** | Quote negotiation events to create conversation threads and notify parties | Consumes `QuoteRequested`, `QuoteResponded`, `QuoteAccepted`, `QuoteDeclined`, `QuoteExpired` |
| **Payment** | Payment lifecycle events for payment and payout notifications | Consumes `PaymentProcessed`, `PaymentFailed`, `PaymentRefunded`, `PayoutCompleted`, `TipAdded` |
| **Review** | Review submission events for review notifications | Consumes `ReviewSubmitted` |

### Downstream Dependents (Depended On By)

None. Communication BC is a terminal downstream BC. It does not publish events consumed by other BCs.

### Events Subscribed

| Event | Source BC | Handler |
|-------|----------|---------|
| `UserRegistered` | User | Cache user contact info (name, email, phone). Initialize default notification preferences. |
| `BookingCreated` | Booking | Dispatch `new_booking` notification to provider (push + email + SMS). |
| `BookingConfirmed` | Booking | Create a `booking` conversation between customer and provider. Dispatch `booking_confirmed` notification to both parties. |
| `BookingStarted` | Booking | Dispatch `task_started` notification to customer (push only). |
| `BookingCompleted` | Booking | Close the booking conversation. Dispatch `booking_completed` notification to customer (push + email). |
| `BookingCancelled` | Booking | Close the booking conversation. Dispatch `booking_cancelled` notification to both parties (push + email + SMS). |
| `BookingExpired` | Booking | Close the booking conversation. Dispatch `booking_cancelled` notification to both parties. |
| `BookingDisputed` | Booking | Dispatch notification to provider and support team. Keep conversation open for dispute evidence. |
| `RecurrenceCreated` | Booking | Dispatch notification to provider about recurring series. |
| `RecurringBookingGenerated` | Booking | Dispatch `recurring_booking_generated` notification to customer (push only). |
| `SubscriptionCreated` | Booking | Dispatch `subscription_created` notification (push + email). |
| `SubscriptionPaused` | Booking | Dispatch notification to provider. |
| `SubscriptionResumed` | Booking | Dispatch notification to provider. |
| `SubscriptionCancelled` | Booking | Dispatch `subscription_cancelled` notification (push + email). |
| `SubscriptionExpired` | Booking | Dispatch `subscription_expiring` notification to both parties. |
| `SubscriptionBillingFailed` | Booking | Dispatch `subscription_billing_failed` notification to customer (push + email + SMS). |
| `TaskPosted` | Booking | Dispatch notification to matching providers in the task's category. |
| `BidSubmitted` | Booking | Dispatch `new_bid` notification to the task's customer (push + email). |
| `BidAccepted` | Booking | Dispatch `bid_accepted` notification to winning provider (push + email + SMS). Notify rejected bidders. |
| `QuoteRequested` | Pricing | Create a `quote_negotiation` conversation. Dispatch `quote_requested` notification to provider (push + email). |
| `QuoteResponded` | Pricing | Dispatch `quote_received` notification to customer (push + email). |
| `QuoteAccepted` | Pricing | Close the quote negotiation conversation. Dispatch `quote_accepted` notification to provider (push + email + SMS). |
| `QuoteDeclined` | Pricing | Dispatch notification to provider that the customer declined the quote, including the reason if provided. Keep quote negotiation conversation open (customer may request a new quote). |
| `QuoteExpired` | Pricing | Close the quote negotiation conversation. Dispatch `quote_expired` notification (push + email). |
| `PaymentProcessed` | Payment | Dispatch `payment_received` notification to both parties (push + email). |
| `PaymentFailed` | Payment | Dispatch notification to customer about payment failure. |
| `PaymentRefunded` | Payment | Dispatch notification to customer about refund processed. |
| `PayoutCompleted` | Payment | Dispatch `payout_completed` notification to provider (push + email + SMS). |
| `TipAdded` | Payment | Dispatch notification to provider about tip received. |
| `ReviewSubmitted` | Review | Dispatch `new_review` notification to the reviewee (push + email). |

### Integration Pattern

The Communication BC uses the **Conformist** pattern with all upstream BCs. It accepts User BC's identity model, Booking BC's lifecycle model, Pricing BC's quote model, Payment BC's payment model, and Review BC's review model as-is, without requesting changes or translating them.

For external notification delivery services (Firebase, SendGrid/Resend, Twilio), Communication uses the **Anti-Corruption Layer** pattern. Each provider has a dedicated adapter implementing the corresponding port interface (`PushNotificationService`, `EmailNotificationService`, `SmsNotificationService`). The ACL translates provider-specific request/response formats into domain-level `DeliveryResult` objects, isolating the domain from external API changes.

Communication BC is a **terminal leaf** in the context map -- it consumes events from five upstream BCs but publishes no events consumed by other BCs. Its internal events (`MessageSent`, `MessageReported`, `ContactSharingDetected`) are handled within its own boundary for notification dispatch and moderation workflows.
