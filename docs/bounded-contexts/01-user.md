# User Bounded Context

## 1. Overview

The User Bounded Context is the **foundation** of the Ntizo service marketplace platform. It owns all concerns related to identity, authentication, authorization, user profiles, provider profiles, organization entities, and verification workflows.

**Owns:**
- Authentication and session management (delegated to Better Auth with custom hooks)
- User registration, login, and account lifecycle
- Profile management (phone, avatar, and optionally provider data: bio, skills, service areas, portfolio, verification)
- Organization entity management (creation, verification, metadata)
- Organization membership management (owner, manager, staff roles)
- Role management (customer, individual_provider, organization_owner, admin)
- Identity and organization verification workflows

**Delegates:**
- Service creation and catalog management to **Catalog BC**
- Availability and scheduling configuration to **Scheduling BC**
- Payment wallets and payout accounts to **Payment BC**
- Notifications and messaging to **Communication BC**

**Foundation BC:** All other bounded contexts depend on User. User depends on no other BC upstream, except subscribing to `ReviewSubmitted` events from the Review BC to update aggregate ratings.

---

## 2. Ubiquitous Language

| Term | Definition |
|------|-----------|
| **User** | Any person who has registered on the platform. A User is the root identity entity that holds credentials, profile data, and one or more roles. |
| **Customer** | A User in the `customer` role. Can browse services, create bookings, submit reviews, and post tasks. Every new User starts with this role. |
| **Individual Provider** | A User in the `individual_provider` role who offers services independently (e.g., a freelance plumber, personal trainer). Must have a Profile upgraded with provider fields. |
| **Organization Owner** | A User in the `organization_owner` role who owns one or more Organization entities. Automatically assigned when creating an Organization. |
| **Admin** | A User in the `admin` role with platform-wide privileges: verification approvals, user suspension, content moderation. |
| **Profile** | An aggregate that every User gets upon registration. Holds personal contact info (phone, avatar) and optionally provider-specific data (bio, skills, service areas, portfolio, verification, ratings). When a user becomes a provider, the same Profile is upgraded with provider fields. |
| **Organization** | An aggregate representing a registered business establishment (salon, clinic, workshop, etc.) with its own identity, location, verification status, and rating metrics. |
| **Organization Member** | An entity within the Organization aggregate representing a person (User) who works at or manages the Organization. Has a member role (owner, manager, staff). |
| **Member Role** | The role an OrganizationMember holds within an Organization: `owner` (full control, one per organization), `manager` (can manage staff and services), `staff` (can be assigned to bookings). |
| **Verification Status** | The state of identity or organization verification: `pending` (not yet submitted or awaiting review), `verified` (approved by admin), `rejected` (denied by admin with reason). |
| **Roles** | The set of platform-level capabilities a User holds. Stored as a JSON array. A User can hold multiple roles simultaneously (e.g., customer + individual_provider + organization_owner). |
| **Organization Type** | Classification of an Organization: `salon`, `workshop`, `restaurant`, `clinic`, `agency`, `other`. Influences UI presentation and category filtering. |
| **Address** | A Value Object representing a physical location with street, city, state, postal code, country, and GPS coordinates. Embedded directly in aggregates at the domain level. At the persistence layer, stored in a shared `addresses` table referenced via FK by profiles, organizations, and any future entity that needs an address. |
| **Service Area** | A geographic region where a provider offers services. Stored as JSON with area name, coordinates, and radius. |
| **Mode Switch** | The UX concept of toggling between customer mode and provider mode within the app. Does not change roles; it changes the active UI perspective. |

---

## 3. Aggregates & Entities

### 3.0 Address (Value Object — shared via DB table)

**Type:** Value Object (in the domain layer)
**Persisted as:** Shared `addresses` table (in the infrastructure layer)
**Used by:** Profile, Organization (and any future entity that needs an address)

In the **domain layer**, Address is a Value Object embedded directly in aggregates — the aggregate owns the full address data (street, city, lat, lng, etc.). In the **infrastructure/persistence layer**, addresses are stored in a single shared `addresses` table and referenced via `address_id` FK. The repository handles the mapping between the embedded VO and the separate table.

#### Fields

| Field | Type | Constraints |
|-------|------|------------|
| `label` | `string \| null` | Optional label (e.g., "Home", "Office", "Main Branch") |
| `street` | `string` | Required, full street address |
| `city` | `string` | Required |
| `state` | `string \| null` | State/province (nullable for countries without states) |
| `postal_code` | `string \| null` | ZIP/postal code |
| `country` | `string` | Required, ISO 3166-1 alpha-2 code (e.g., `MZ`, `US`, `PT`) |
| `lat` | `number` | Required, latitude coordinate (-90 to 90) |
| `lng` | `number` | Required, longitude coordinate (-180 to 180) |

#### Domain Logic

```typescript
interface AddressProps {
  label: string | null;
  street: string;
  city: string;
  state: string | null;
  postalCode: string | null;
  country: string; // ISO 3166-1 alpha-2
  lat: number;
  lng: number;
}

class Address extends ValueObject<AddressProps> {
  static create(props: AddressProps): Address {
    if (!props.street || props.street.trim().length === 0) {
      throw new DomainError('Street address is required');
    }
    if (!props.city || props.city.trim().length === 0) {
      throw new DomainError('City is required');
    }
    if (!props.country || props.country.length !== 2) {
      throw new DomainError('Country must be a valid ISO 3166-1 alpha-2 code');
    }
    if (props.lat < -90 || props.lat > 90) {
      throw new DomainError('Latitude must be between -90 and 90');
    }
    if (props.lng < -180 || props.lng > 180) {
      throw new DomainError('Longitude must be between -180 and 180');
    }
    return new Address(props);
  }

  get fullAddress(): string {
    const parts = [this.props.street, this.props.city];
    if (this.props.state) parts.push(this.props.state);
    if (this.props.postalCode) parts.push(this.props.postalCode);
    parts.push(this.props.country);
    return parts.join(', ');
  }

  distanceKmTo(other: Address): number {
    const R = 6371;
    const dLat = this.toRad(other.props.lat - this.props.lat);
    const dLng = this.toRad(other.props.lng - this.props.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(this.props.lat)) * Math.cos(this.toRad(other.props.lat)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
```

> **Persistence note:** The repository maps this VO to/from the shared `addresses` table. When saving an aggregate that contains an Address, the repository upserts the `addresses` row and stores the `address_id` FK on the aggregate's table. When loading, the repository JOINs the address data and hydrates it into the VO.

---

### 3.1 User Aggregate

**Aggregate Root:** `User`
**Children:** None (Profile is a separate aggregate linked by `user_id`)

#### Attributes

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | Primary key, auto-generated |
| `email` | `string` | Unique, required, max 255 chars, valid email format |
| `first_name` | `string` | Required, max 100 chars |
| `last_name` | `string` | Required, max 100 chars |
| `roles` | `UserRole[]` | JSON array, at least one role required, default `["customer"]` |
| `email_verified` | `boolean` | Default `false` |
| `status` | `UserStatus` | Enum: `pending`, `active`, `suspended`. Default `pending` |
| `created_at` | `Date` | Auto-set on creation |
| `updated_at` | `Date` | Auto-set on every update |

#### Invariants

1. Email must be unique across all users.
2. Roles array must contain at least one role.
3. A user can hold multiple roles simultaneously (customer + individual_provider + organization_owner).
4. Status can only transition along defined paths (see state transitions).
5. Admin role can only be assigned by another admin.
6. Password handling, session management, failed login lockouts, and OTP are delegated to Better Auth.

#### State Transitions

```
pending ---[email/phone verified]---> active
active  ---[admin suspends]---------> suspended
suspended --[admin reactivates]-----> active
```

- A `pending` user has limited access (can complete profile, verify email/phone).
- An `active` user has full access according to their roles.
- A `suspended` user cannot log in; all active sessions are invalidated.

#### Domain Logic

```typescript
import { Entity } from 'onion-lasagna';

type UserStatus = 'active' | 'suspended' | 'pending';
type UserRole = 'customer' | 'individual_provider' | 'organization_owner' | 'admin';

interface UserProps {
  email: string;
  firstName: string;
  lastName: string;
  roles: UserRole[];
  emailVerified: boolean;
  status: UserStatus;
}

class User extends Entity<UserProps> {
  get fullName(): string {
    return `${this.props.firstName} ${this.props.lastName}`;
  }

  get isActive(): boolean {
    return this.props.status === 'active';
  }

  addRole(role: UserRole): void {
    if (this.props.roles.includes(role)) return;
    if (role === 'admin') {
      throw new DomainError('Admin role can only be assigned by another admin through dedicated use case');
    }
    this.props.roles = [...this.props.roles, role];
    this.markUpdated();
  }

  removeRole(role: UserRole): void {
    if (this.props.roles.length === 1) {
      throw new DomainError('User must have at least one role');
    }
    if (role === 'customer') {
      throw new DomainError('Customer role cannot be removed');
    }
    this.props.roles = this.props.roles.filter(r => r !== role);
    this.markUpdated();
  }

  hasRole(role: UserRole): boolean {
    return this.props.roles.includes(role);
  }

  verify(): void {
    if (this.props.status !== 'pending') {
      throw new DomainError('Only pending users can be verified');
    }
    if (!this.props.emailVerified && !this.props.phoneVerified) {
      throw new DomainError('At least one of email or phone must be verified');
    }
    this.props.status = 'active';
    this.markUpdated();
  }

  suspend(reason: string): void {
    if (this.props.status !== 'active') {
      throw new DomainError('Only active users can be suspended');
    }
    this.props.status = 'suspended';
    this.markUpdated();
    this.addDomainEvent(new UserSuspended(this.id, reason));
  }

  reactivate(): void {
    if (this.props.status !== 'suspended') {
      throw new DomainError('Only suspended users can be reactivated');
    }
    this.props.status = 'active';
    this.markUpdated();
  }

  updateName(data: { firstName?: string; lastName?: string }): void {
    if (data.firstName) this.props.firstName = data.firstName;
    if (data.lastName) this.props.lastName = data.lastName;
    this.markUpdated();
  }
}
```

---

### 3.2 Profile Aggregate

**Aggregate Root:** `Profile`
**Children:** None

Every user gets a Profile automatically upon registration, created with all fields empty/default (no phone, no image, provider fields null). The user then updates their profile info at their own pace. When a user becomes a provider (adds `individual_provider` role), the same Profile is **upgraded** with provider-specific fields (bio, skills, service areas, portfolio, verification, ratings). This avoids having two separate profile concepts — there is one profile per user that grows with the user's roles.

#### Attributes

**Base fields (all users):**

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | Primary key, auto-generated |
| `user_id` | `UUID` | FK -> users, unique, required |
| `phone_code_prefix` | `string \| null` | Country calling code (e.g., `+258`, `+1`, `+44`) |
| `phone_number` | `string \| null` | Local phone number without prefix (e.g., `84 123 4567`) |
| `phone_verified` | `boolean` | Default `false` |
| `profile_image_url` | `string \| null` | URL to avatar image |
| `address` | `Address \| null` | Embedded Address VO, nullable (user sets their address later) |
| `created_at` | `Date` | Auto-set on creation |
| `updated_at` | `Date` | Auto-set on every update |

**Provider fields (nullable — populated when user becomes a provider):**

| Attribute | Type | Constraints |
|-----------|------|------------|
| `bio` | `string \| null` | Min 50 chars, max 2000 chars when set |
| `service_areas` | `ServiceArea[]` | JSON array, default `[]` |
| `skills` | `string[]` | JSON array of skill tags, default `[]` |
| `portfolio_images` | `string[]` | JSON array of URLs, max 10 items, default `[]` |
| `identity_document_url` | `string \| null` | URL to uploaded ID document |
| `verification_status` | `VerificationStatus \| null` | Enum: `pending`, `verified`, `rejected`. Null for non-providers |
| `verification_rejected_reason` | `string \| null` | Reason provided by admin on rejection |
| `average_rating` | `number` | Decimal(3,2), range 0.00-5.00, default 0.00 |
| `total_reviews` | `number` | Integer, default 0 |
| `total_completed_tasks` | `number` | Integer, default 0 |

#### Invariants

**Base invariants:**
1. Every user has exactly one Profile (created automatically on registration).
2. If `phone_number` is provided, `phone_code_prefix` must also be provided (and vice versa).
3. Phone number (prefix + number combination) must be unique across all profiles if provided.
4. `phone_verified` can only be `true` if both `phone_code_prefix` and `phone_number` are set.

**Provider invariants (only enforced when profile is upgraded to provider):**
5. Bio must be at least 50 characters and no more than 2000 when set.
6. Portfolio images array cannot exceed 10 items.
7. Identity document must be uploaded before requesting verification.
8. Only an admin can transition verification_status to `verified` or `rejected`.
9. Average rating must be between 0.00 and 5.00.
10. Verification can be re-submitted after rejection (status goes back to `pending`).

#### Domain Logic

```typescript
type VerificationStatus = 'pending' | 'verified' | 'rejected';

interface ServiceArea {
  name: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
}

interface ProfileProps {
  userId: string;
  // Base fields (all users)
  phoneCodePrefix: string | null;
  phoneNumber: string | null;
  phoneVerified: boolean;
  profileImageUrl: string | null;
  address: AddressProps | null;
  // Provider fields (null for non-providers)
  bio: string | null;
  serviceAreas: ServiceArea[];
  skills: string[];
  portfolioImages: string[];
  identityDocumentUrl: string | null;
  verificationStatus: VerificationStatus | null;
  verificationRejectedReason: string | null;
  averageRating: number;
  totalReviews: number;
  totalCompletedTasks: number;
}

class Profile extends Entity<ProfileProps> {

  // --- Factory: creates empty profile on user registration ---

  static createForUser(userId: string): Profile {
    return new Profile({
      userId,
      phoneCodePrefix: null,
      phoneNumber: null,
      phoneVerified: false,
      profileImageUrl: null,
      address: null,
      bio: null,
      serviceAreas: [],
      skills: [],
      portfolioImages: [],
      identityDocumentUrl: null,
      verificationStatus: null,
      verificationRejectedReason: null,
      averageRating: 0,
      totalReviews: 0,
      totalCompletedTasks: 0,
    });
  }

  // --- Base profile methods ---

  get fullPhone(): string | null {
    if (!this.props.phoneCodePrefix || !this.props.phoneNumber) return null;
    return `${this.props.phoneCodePrefix} ${this.props.phoneNumber}`;
  }

  get hasPhone(): boolean {
    return this.props.phoneCodePrefix !== null && this.props.phoneNumber !== null;
  }

  get isProvider(): boolean {
    return this.props.verificationStatus !== null;
  }

  get isVerified(): boolean {
    return this.props.verificationStatus === 'verified';
  }

  updatePhone(phoneCodePrefix: string, phoneNumber: string): void {
    this.props.phoneCodePrefix = phoneCodePrefix;
    this.props.phoneNumber = phoneNumber;
    this.props.phoneVerified = false; // reset verification on phone change
    this.markUpdated();
  }

  removePhone(): void {
    this.props.phoneCodePrefix = null;
    this.props.phoneNumber = null;
    this.props.phoneVerified = false;
    this.markUpdated();
  }

  markPhoneVerified(): void {
    if (!this.hasPhone) {
      throw new DomainError('Cannot verify phone: no phone number set');
    }
    this.props.phoneVerified = true;
    this.markUpdated();
  }

  updateProfileImage(url: string | null): void {
    this.props.profileImageUrl = url;
    this.markUpdated();
  }

  updateAddress(address: AddressProps | null): void {
    if (address) {
      Address.create(address); // validate
    }
    this.props.address = address;
    this.markUpdated();
  }

  // --- Provider upgrade ---

  upgradeToProvider(bio: string, skills: string[], serviceAreas: ServiceArea[]): void {
    if (this.isProvider) {
      throw new DomainError('Profile is already a provider profile');
    }
    if (bio.length < 50) {
      throw new DomainError('Bio must be at least 50 characters');
    }
    if (bio.length > 2000) {
      throw new DomainError('Bio must not exceed 2000 characters');
    }
    this.props.bio = bio;
    this.props.skills = skills;
    this.props.serviceAreas = serviceAreas;
    this.props.verificationStatus = 'pending';
    this.markUpdated();
  }

  // --- Provider-specific methods (require isProvider) ---

  updateBio(bio: string): void {
    this.ensureProvider();
    if (bio.length < 50) {
      throw new DomainError('Bio must be at least 50 characters');
    }
    if (bio.length > 2000) {
      throw new DomainError('Bio must not exceed 2000 characters');
    }
    this.props.bio = bio;
    this.markUpdated();
  }

  addPortfolioImage(imageUrl: string): void {
    this.ensureProvider();
    if (this.props.portfolioImages.length >= 10) {
      throw new DomainError('Portfolio cannot exceed 10 images');
    }
    this.props.portfolioImages = [...this.props.portfolioImages, imageUrl];
    this.markUpdated();
  }

  removePortfolioImage(imageUrl: string): void {
    this.ensureProvider();
    this.props.portfolioImages = this.props.portfolioImages.filter(url => url !== imageUrl);
    this.markUpdated();
  }

  uploadIdentityDocument(documentUrl: string): void {
    this.ensureProvider();
    this.props.identityDocumentUrl = documentUrl;
    this.markUpdated();
  }

  submitForVerification(): void {
    this.ensureProvider();
    if (!this.props.identityDocumentUrl) {
      throw new DomainError('Identity document must be uploaded before submitting for verification');
    }
    if (this.props.verificationStatus === 'verified') {
      throw new DomainError('Profile is already verified');
    }
    this.props.verificationStatus = 'pending';
    this.props.verificationRejectedReason = null;
    this.markUpdated();
  }

  approve(): void {
    this.ensureProvider();
    this.props.verificationStatus = 'verified';
    this.props.verificationRejectedReason = null;
    this.markUpdated();
    this.addDomainEvent(new ProviderVerified(this.id, this.props.userId));
  }

  reject(reason: string): void {
    this.ensureProvider();
    this.props.verificationStatus = 'rejected';
    this.props.verificationRejectedReason = reason;
    this.markUpdated();
    this.addDomainEvent(new ProviderRejected(this.id, this.props.userId, reason));
  }

  updateRating(newAverage: number, newTotalReviews: number): void {
    this.ensureProvider();
    if (newAverage < 0 || newAverage > 5) {
      throw new DomainError('Rating must be between 0 and 5');
    }
    this.props.averageRating = newAverage;
    this.props.totalReviews = newTotalReviews;
    this.markUpdated();
  }

  incrementCompletedTasks(): void {
    this.ensureProvider();
    this.props.totalCompletedTasks += 1;
    this.markUpdated();
  }

  // --- Guards ---

  private ensureProvider(): void {
    if (!this.isProvider) {
      throw new DomainError('This operation requires a provider profile');
    }
  }
}
```

---

### 3.3 Organization Aggregate

**Aggregate Root:** `Organization`
**Children:** `OrganizationMember`

#### Organization Attributes

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | Primary key, auto-generated |
| `owner_id` | `UUID` | FK -> users, required |
| `name` | `string` | Required, max 200 chars |
| `description` | `string` | Required, max 2000 chars |
| `logo_url` | `string \| null` | URL to logo image |
| `cover_photos` | `string[]` | JSON array of URLs, max 5 items |
| `address` | `Address` | Embedded Address VO, required |
| `phone` | `string` | Required, international format |
| `email` | `string` | Required, valid email |
| `website` | `string \| null` | Optional URL |
| `organization_type` | `OrganizationType` | Enum: `salon`, `workshop`, `restaurant`, `clinic`, `agency`, `other` |
| `verification_status` | `VerificationStatus` | Enum: `pending`, `verified`, `rejected`. Default `pending` |
| `verification_document_url` | `string \| null` | URL to business license document |
| `verification_rejected_reason` | `string \| null` | Reason for rejection |
| `average_rating` | `number` | Decimal(3,2), range 0.00-5.00, default 0.00 |
| `total_reviews` | `number` | Integer, default 0 |
| `total_completed_bookings` | `number` | Integer, default 0 |
| `is_active` | `boolean` | Default `true` |
| `created_at` | `Date` | Auto-set on creation |
| `updated_at` | `Date` | Auto-set on every update |

#### OrganizationMember Attributes

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | Primary key, auto-generated |
| `organization_id` | `UUID` | FK -> organizations, required |
| `user_id` | `UUID` | FK -> users, required |
| `role` | `MemberRole` | Enum: `owner`, `manager`, `staff`. Required |
| `display_name` | `string` | Required, max 100 chars |
| `photo_url` | `string \| null` | URL to member photo |
| `specialties` | `string[]` | JSON array of specialty tags, default `[]` |
| `is_active` | `boolean` | Default `true` |
| `joined_at` | `Date` | Auto-set on creation |
| `updated_at` | `Date` | Auto-set on every update |

#### Invariants

1. An Organization must have exactly one member with role `owner`.
2. When an Organization is created, the owner is automatically added as an OrganizationMember with role `owner`.
3. A user can own multiple organizations.
4. The owner member cannot be removed from the organization.
5. Organization must have a valid address (embedded Address VO with street, city, country, and valid GPS coordinates).
6. Organization verification requires a business license document to be uploaded.
7. Cover photos array cannot exceed 5 items.
8. A user can only be a member of a given organization once (unique constraint on organization_id + user_id).
9. Only owner or manager can add new members.
10. Only owner can remove members or change member roles.
11. Only owner can deactivate the organization.

#### State Transitions (Verification)

```
pending ----[submit docs]----> pending (with document uploaded)
pending ----[admin approves]--> verified
pending ----[admin rejects]---> rejected
rejected ---[resubmit docs]---> pending
```

#### Domain Logic

```typescript
type OrganizationType = 'salon' | 'workshop' | 'restaurant' | 'clinic' | 'agency' | 'other';
type MemberRole = 'owner' | 'manager' | 'staff';

interface OrganizationProps {
  ownerId: string;
  name: string;
  description: string;
  logoUrl: string | null;
  coverPhotos: string[];
  address: AddressProps;
  phone: string;
  email: string;
  website: string | null;
  organizationType: OrganizationType;
  verificationStatus: VerificationStatus;
  verificationDocumentUrl: string | null;
  verificationRejectedReason: string | null;
  averageRating: number;
  totalReviews: number;
  totalCompletedBookings: number;
  isActive: boolean;
  members: OrganizationMember[];
}

class Organization extends Entity<OrganizationProps> {
  get owner(): OrganizationMember {
    const owner = this.props.members.find(m => m.props.role === 'owner');
    if (!owner) throw new DomainError('Organization must have an owner');
    return owner;
  }

  get activeMembers(): OrganizationMember[] {
    return this.props.members.filter(m => m.props.isActive);
  }

  get staffCount(): number {
    return this.activeMembers.filter(m => m.props.role === 'staff').length;
  }

  addMember(userId: string, role: MemberRole, displayName: string, photoUrl: string | null, specialties: string[]): OrganizationMember {
    if (role === 'owner') {
      throw new DomainError('An organization can only have one owner, set during creation');
    }
    const existingMember = this.props.members.find(m => m.props.userId === userId);
    if (existingMember) {
      throw new DomainError('User is already a member of this organization');
    }
    const member = OrganizationMember.create({
      organizationId: this.id,
      userId,
      role,
      displayName,
      photoUrl,
      specialties,
      isActive: true,
    });
    this.props.members.push(member);
    this.markUpdated();
    this.addDomainEvent(new StaffMemberAdded(this.id, member.id, userId, role));
    return member;
  }

  removeMember(memberId: string): void {
    const member = this.props.members.find(m => m.id === memberId);
    if (!member) {
      throw new DomainError('Member not found');
    }
    if (member.props.role === 'owner') {
      throw new DomainError('Cannot remove the owner from the organization');
    }
    member.deactivate();
    this.markUpdated();
    this.addDomainEvent(new StaffMemberRemoved(this.id, memberId, member.props.userId));
  }

  updateMemberRole(memberId: string, newRole: MemberRole): void {
    if (newRole === 'owner') {
      throw new DomainError('Cannot assign owner role through role update');
    }
    const member = this.props.members.find(m => m.id === memberId);
    if (!member) throw new DomainError('Member not found');
    if (member.props.role === 'owner') throw new DomainError('Cannot change owner role');
    member.updateRole(newRole);
    this.markUpdated();
  }

  submitForVerification(documentUrl: string): void {
    this.props.verificationDocumentUrl = documentUrl;
    this.props.verificationStatus = 'pending';
    this.props.verificationRejectedReason = null;
    this.markUpdated();
  }

  approveVerification(): void {
    if (!this.props.verificationDocumentUrl) {
      throw new DomainError('Verification document is required');
    }
    this.props.verificationStatus = 'verified';
    this.props.verificationRejectedReason = null;
    this.markUpdated();
    this.addDomainEvent(new OrganizationVerified(this.id, this.props.ownerId));
  }

  rejectVerification(reason: string): void {
    this.props.verificationStatus = 'rejected';
    this.props.verificationRejectedReason = reason;
    this.markUpdated();
  }

  deactivate(): void {
    this.props.isActive = false;
    this.markUpdated();
  }

  activate(): void {
    this.props.isActive = true;
    this.markUpdated();
  }

  updateRating(newAverage: number, newTotalReviews: number): void {
    if (newAverage < 0 || newAverage > 5) {
      throw new DomainError('Rating must be between 0 and 5');
    }
    this.props.averageRating = newAverage;
    this.props.totalReviews = newTotalReviews;
    this.markUpdated();
  }
}

class OrganizationMember extends Entity<{
  organizationId: string;
  userId: string;
  role: MemberRole;
  displayName: string;
  photoUrl: string | null;
  specialties: string[];
  isActive: boolean;
}> {
  updateRole(role: MemberRole): void {
    this.props.role = role;
  }

  deactivate(): void {
    this.props.isActive = false;
  }

  updateProfile(displayName: string, photoUrl: string | null, specialties: string[]): void {
    this.props.displayName = displayName;
    this.props.photoUrl = photoUrl;
    this.props.specialties = specialties;
  }
}
```

---

## 4. Value Objects

### UserId

```typescript
class UserId {
  private constructor(private readonly value: string) {
    if (!UserId.isValid(value)) {
      throw new DomainError('Invalid UserId format');
    }
  }

  static create(value: string): UserId {
    return new UserId(value);
  }

  static generate(): UserId {
    return new UserId(crypto.randomUUID());
  }

  static isValid(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: UserId): boolean {
    return this.value === other.value;
  }
}
```

### Email

```typescript
class Email {
  private constructor(private readonly value: string) {}

  static create(value: string): Email {
    const trimmed = value.trim().toLowerCase();
    if (!Email.isValid(trimmed)) {
      throw new DomainError(`Invalid email format: ${value}`);
    }
    return new Email(trimmed);
  }

  static isValid(value: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value) && value.length <= 255;
  }

  toString(): string {
    return this.value;
  }

  get domain(): string {
    return this.value.split('@')[1];
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }
}
```

### Phone

```typescript
class Phone {
  private constructor(private readonly value: string) {}

  static create(value: string): Phone {
    const cleaned = value.replace(/[\s\-()]/g, '');
    if (!Phone.isValid(cleaned)) {
      throw new DomainError(`Invalid phone number format: ${value}`);
    }
    return new Phone(cleaned);
  }

  static isValid(value: string): boolean {
    // International format: + followed by 7-15 digits
    const phoneRegex = /^\+[1-9]\d{6,14}$/;
    return phoneRegex.test(value);
  }

  static isMozambican(value: string): boolean {
    // Mozambique format: +258 followed by 8 or 9 digits
    return /^\+258\d{8,9}$/.test(value.replace(/[\s\-()]/g, ''));
  }

  toString(): string {
    return this.value;
  }

  get countryCode(): string {
    // Extract country code (digits after + up to subscriber number)
    const match = this.value.match(/^\+(\d{1,3})/);
    return match ? match[1] : '';
  }

  equals(other: Phone): boolean {
    return this.value === other.value;
  }
}
```

### Location

> **Note:** Location/address data is now managed by the **Address** Value Object (section 3.0). In the domain layer, aggregates embed the full Address VO directly. The `Address` class includes `distanceKmTo()` for distance calculations. At the persistence layer, addresses are stored in a shared `addresses` table referenced via `address_id` FK — the repository handles this mapping.

### Enums

```typescript
const UserRole = {
  CUSTOMER: 'customer',
  INDIVIDUAL_PROVIDER: 'individual_provider',
  ORGANIZATION_OWNER: 'organization_owner',
  ADMIN: 'admin',
} as const;
type UserRole = (typeof UserRole)[keyof typeof UserRole];

const UserStatus = {
  PENDING: 'pending',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
} as const;
type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

const VerificationStatus = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
} as const;
type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus];

const OrganizationType = {
  SALON: 'salon',
  WORKSHOP: 'workshop',
  RESTAURANT: 'restaurant',
  CLINIC: 'clinic',
  AGENCY: 'agency',
  OTHER: 'other',
} as const;
type OrganizationType = (typeof OrganizationType)[keyof typeof OrganizationType];

const MemberRole = {
  OWNER: 'owner',
  MANAGER: 'manager',
  STAFF: 'staff',
} as const;
type MemberRole = (typeof MemberRole)[keyof typeof MemberRole];
```

---

## 5. Domain Events

### UserRegistered

- **Trigger:** New user completes registration successfully.
- **Payload:**
  ```typescript
  interface UserRegisteredEvent {
    userId: string;
    email: string;
    phoneNumber: string | null;
    firstName: string;
    lastName: string;
    roles: UserRole[];
    registeredAt: Date;
  }
  ```
- **Handlers:**
  - Communication BC: Send welcome email/SMS.
  - Payment BC: Create a payment wallet for the user.

### ProviderVerified

- **Trigger:** Admin approves provider identity verification.
- **Payload:**
  ```typescript
  interface ProviderVerifiedEvent {
    providerId: string;
    userId: string;
    verifiedAt: Date;
    verifiedBy: string; // admin user ID
  }
  ```
- **Handlers:**
  - Communication BC: Send verification approval notification to provider.
  - Catalog BC: Enable service publishing for this provider.

### ProviderRejected

- **Trigger:** Admin rejects provider identity verification.
- **Payload:**
  ```typescript
  interface ProviderRejectedEvent {
    providerId: string;
    userId: string;
    reason: string;
    rejectedAt: Date;
    rejectedBy: string; // admin user ID
  }
  ```
- **Handlers:**
  - Communication BC: Send rejection notification with reason to provider.

### OrganizationCreated

- **Trigger:** User creates a new organization entity.
- **Payload:**
  ```typescript
  interface OrganizationCreatedEvent {
    organizationId: string;
    ownerId: string;
    name: string;
    organizationType: OrganizationType;
    address: AddressProps;
    createdAt: Date;
  }
  ```
- **Handlers:**
  - Scheduling BC: Initialize default scheduling configuration and operating hours for the organization.

### OrganizationVerified

- **Trigger:** Admin approves organization verification.
- **Payload:**
  ```typescript
  interface OrganizationVerifiedEvent {
    organizationId: string;
    ownerId: string;
    verifiedAt: Date;
    verifiedBy: string; // admin user ID
  }
  ```
- **Handlers:**
  - Communication BC: Send verification approval notification to organization owner.
  - Catalog BC: Enable service publishing for this organization.

### StaffMemberAdded

- **Trigger:** Organization owner or manager adds a new staff member.
- **Payload:**
  ```typescript
  interface StaffMemberAddedEvent {
    organizationId: string;
    memberId: string;
    userId: string;
    role: MemberRole;
    displayName: string;
    addedAt: Date;
  }
  ```
- **Handlers:**
  - Communication BC: Send invitation/notification to the added member.
  - Scheduling BC: Update slot capacity for the organization (more staff = more concurrent slots).

### StaffMemberRemoved

- **Trigger:** Organization owner removes a staff member.
- **Payload:**
  ```typescript
  interface StaffMemberRemovedEvent {
    organizationId: string;
    memberId: string;
    userId: string;
    removedAt: Date;
  }
  ```
- **Handlers:**
  - Communication BC: Notify removed member.
  - Scheduling BC: Update slot capacity (fewer concurrent slots).
  - Booking BC: Reassign or cancel future bookings assigned to this staff member.

### UserSuspended

- **Trigger:** Admin suspends a user account.
- **Payload:**
  ```typescript
  interface UserSuspendedEvent {
    userId: string;
    reason: string;
    suspendedAt: Date;
    suspendedBy: string; // admin user ID
  }
  ```
- **Handlers:**
  - Communication BC: Notify user of suspension with reason.
  - Booking BC: Cancel or reassign all future bookings by/for this user.
  - Catalog BC: Deactivate all services by this provider.
  - All BCs: Invalidate any active sessions for this user.

---

## 6. Use Cases

### RegisterUser

- **Actor:** Anonymous visitor
- **Preconditions:** None
- **Input:**
  ```typescript
  interface RegisterUserInput {
    email: string;
    firstName: string;
    lastName: string;
  }
  ```
- **Output:** `User` (with status `pending`)
- **Process Flow:**
  1. Register user via external AuthService (Better Auth handles password, OTP, social login).
  2. Check email uniqueness.
  3. Create User entity with role `["customer"]` and status `pending`.
  4. Create empty Profile via `Profile.createForUser(userId)` (all fields empty/default).
  5. Persist User via UserRepository.
  6. Persist Profile via ProfileRepository.
  7. Trigger email verification via AuthService.
  8. Raise `UserRegistered` domain event.
  9. Return created User.
- **Events Raised:** `UserRegistered`
- **Error Cases:**
  - `EmailAlreadyExistsError`: Email is already registered.
  - `ValidationError`: Invalid email format or missing required fields.

### LoginUser

- **Actor:** Anonymous visitor (with existing account)
- **Preconditions:** User account exists
- **Input/Output:** Fully delegated to Better Auth (handles credentials, sessions, lockouts, OTP)
- **Process Flow:**
  1. Better Auth authenticates the user (email/password, social login, or OTP).
  2. Check if account is suspended. If suspended, reject.
  3. Return session data.
- **Events Raised:** None
- **Error Cases:**
  - `InvalidCredentialsError`: Authentication failed (handled by Better Auth).
  - `AccountSuspendedError`: Account is suspended by admin.

### UpdateProfile

- **Actor:** Authenticated user
- **Preconditions:** User is active
- **Input:**
  ```typescript
  interface UpdateProfileInput {
    userId: string;
    phoneCodePrefix?: string;
    phoneNumber?: string;
    profileImageUrl?: string | null;
    address?: AddressProps | null;
  }
  ```
- **Output:** Updated `Profile`
- **Process Flow:**
  1. Load Profile by userId.
  2. If phone is changing, check uniqueness.
  3. If address is provided, call `profile.updateAddress(address)` (validates via Address VO).
  4. Apply other updates (phone, profile image).
  5. Persist via ProfileRepository (repository handles persisting address to shared `addresses` table).
  6. Return updated Profile.
- **Events Raised:** None
- **Error Cases:**
  - `ProfileNotFoundError`: Profile does not exist.
  - `PhoneAlreadyExistsError`: New phone already in use.

### UpgradeToProvider

- **Actor:** Authenticated user with `customer` role
- **Preconditions:** User is active, Profile is not already a provider profile
- **Input:**
  ```typescript
  interface UpgradeToProviderInput {
    userId: string;
    bio: string;
    skills: string[];
    serviceAreas: ServiceArea[];
  }
  ```
- **Output:** Updated `Profile` (with provider fields populated)
- **Process Flow:**
  1. Load User by ID. Verify active status.
  2. Load Profile by userId.
  3. Check that profile is not already a provider profile (`isProvider === false`).
  4. Call `profile.upgradeToProvider(bio, skills, serviceAreas)`.
  5. Add `individual_provider` role to User.
  6. Persist Profile via ProfileRepository.
  7. Persist updated User via UserRepository.
  8. Return updated Profile.
- **Events Raised:** None (profile is not yet verified; events fire on verification)
- **Error Cases:**
  - `UserNotFoundError`: User does not exist.
  - `AlreadyProviderError`: Profile is already a provider profile.
  - `BioTooShortError`: Bio is under 50 characters.

### SubmitVerification

- **Actor:** Provider (individual_provider role)
- **Preconditions:** Profile is a provider profile, identity document uploaded
- **Input:**
  ```typescript
  interface SubmitVerificationInput {
    userId: string;
    identityDocumentUrl: string;
  }
  ```
- **Output:** Updated `Profile`
- **Process Flow:**
  1. Load Profile by userId.
  2. Upload identity document URL.
  3. Call `profile.submitForVerification()`.
  4. Persist via ProfileRepository.
  5. Return updated Profile.
- **Events Raised:** None (awaiting admin review)
- **Error Cases:**
  - `ProfileNotFoundError`: Profile does not exist.
  - `NotProviderError`: Profile is not a provider profile.
  - `AlreadyVerifiedError`: Profile is already verified.

### ApproveVerification

- **Actor:** Admin
- **Preconditions:** Profile is a provider profile with status `pending` and identity document uploaded
- **Input:**
  ```typescript
  interface ApproveVerificationInput {
    userId: string;
    adminId: string;
  }
  ```
- **Output:** Updated `Profile`
- **Process Flow:**
  1. Load Profile by userId.
  2. Verify admin has `admin` role.
  3. Call `profile.approve()`.
  4. Persist via ProfileRepository.
  5. Return updated Profile.
- **Events Raised:** `ProviderVerified`
- **Error Cases:**
  - `ProfileNotFoundError`: Profile does not exist.
  - `NotProviderError`: Profile is not a provider profile.
  - `UnauthorizedError`: Caller is not an admin.
  - `InvalidStateError`: Profile is not in pending status.

### RejectVerification

- **Actor:** Admin
- **Preconditions:** Profile is a provider profile with status `pending`
- **Input:**
  ```typescript
  interface RejectVerificationInput {
    userId: string;
    adminId: string;
    reason: string;
  }
  ```
- **Output:** Updated `Profile`
- **Process Flow:**
  1. Load Profile by userId.
  2. Verify admin has `admin` role.
  3. Call `profile.reject(reason)`.
  4. Persist via ProfileRepository.
  5. Return updated Profile.
- **Events Raised:** `ProviderRejected`
- **Error Cases:**
  - `ProfileNotFoundError`: Profile does not exist.
  - `NotProviderError`: Profile is not a provider profile.
  - `UnauthorizedError`: Caller is not an admin.
  - `InvalidStateError`: Profile is not in pending status.

### CreateOrganization

- **Actor:** Authenticated user
- **Preconditions:** User is active
- **Input:**
  ```typescript
  interface CreateOrganizationInput {
    userId: string;
    name: string;
    description: string;
    address: AddressProps;
    phone: string;
    email: string;
    website?: string;
    organizationType: OrganizationType;
    logoUrl?: string;
  }
  ```
- **Output:** `Organization` (with owner as first OrganizationMember)
- **Process Flow:**
  1. Load User by ID. Verify active status.
  2. Validate address via `Address.create(input.address)`.
  3. Create Organization entity with embedded address.
  4. Auto-create OrganizationMember with role `owner` for the creating user.
  5. Add `organization_owner` role to User if not already present.
  6. Persist Organization vian OrganizationRepository (repository handles persisting address to shared `addresses` table).
  7. Persist updated User via UserRepository.
  8. Raise `OrganizationCreated` domain event.
  9. Return created Organization.
- **Events Raised:** `OrganizationCreated`
- **Error Cases:**
  - `UserNotFoundError`: User does not exist.
  - `InvalidAddressError`: Address validation failed (coordinates out of range, missing required fields).
  - `ValidationError`: Missing required fields.

### UpdateOrganization

- **Actor:** Organization owner or manager
- **Preconditions:** Organization exists, caller is owner or manager
- **Input:**
  ```typescript
  interface UpdateOrganizationInput {
    organizationId: string;
    callerId: string;
    name?: string;
    description?: string;
    address?: AddressProps; // updates existing Address record or creates new one
    phone?: string;
    email?: string;
    website?: string | null;
    logoUrl?: string | null;
    coverPhotos?: string[];
  }
  ```
- **Output:** Updated `Organization`
- **Process Flow:**
  1. Load Organization by ID.
  2. Verify caller is owner or manager vian OrganizationMember lookup.
  3. Apply updates to Organization entity.
  4. Persist vian OrganizationRepository.
  5. Return updated Organization.
- **Events Raised:** None
- **Error Cases:**
  - `OrganizationNotFoundError`: Organization does not exist.
  - `UnauthorizedError`: Caller is not owner or manager.

### AddStaffMember

- **Actor:** Organization owner or manager
- **Preconditions:** Organization exists, target user exists, target user is not already a member
- **Input:**
  ```typescript
  interface AddStaffMemberInput {
    organizationId: string;
    callerId: string;
    userId: string;
    role: 'manager' | 'staff';
    displayName: string;
    photoUrl?: string;
    specialties?: string[];
  }
  ```
- **Output:** `OrganizationMember`
- **Process Flow:**
  1. Load Organization by ID.
  2. Verify caller is owner or manager.
  3. Load target User by ID. Verify exists and is active.
  4. Call `organization.addMember(...)`.
  5. Persist Organization vian OrganizationRepository.
  6. Return created OrganizationMember.
- **Events Raised:** `StaffMemberAdded`
- **Error Cases:**
  - `OrganizationNotFoundError`: Organization does not exist.
  - `UnauthorizedError`: Caller is not owner or manager.
  - `UserNotFoundError`: Target user does not exist.
  - `AlreadyMemberError`: User is already a member of this organization.

### RemoveStaffMember

- **Actor:** Organization owner
- **Preconditions:** Organization exists, member exists, member is not the owner
- **Input:**
  ```typescript
  interface RemoveStaffMemberInput {
    organizationId: string;
    callerId: string;
    memberId: string;
  }
  ```
- **Output:** `void`
- **Process Flow:**
  1. Load Organization by ID.
  2. Verify caller is the owner.
  3. Call `organization.removeMember(memberId)`.
  4. Persist Organization vian OrganizationRepository.
- **Events Raised:** `StaffMemberRemoved`
- **Error Cases:**
  - `OrganizationNotFoundError`: Organization does not exist.
  - `UnauthorizedError`: Caller is not the owner.
  - `MemberNotFoundError`: Member does not exist.
  - `CannotRemoveOwnerError`: Attempting to remove the owner.

### SubmitOrganizationVerification

- **Actor:** Organization owner
- **Preconditions:** Organization exists, caller is owner
- **Input:**
  ```typescript
  interface SubmitOrganizationVerificationInput {
    organizationId: string;
    callerId: string;
    documentUrl: string;
  }
  ```
- **Output:** Updated `Organization`
- **Process Flow:**
  1. Load Organization by ID.
  2. Verify caller is the owner.
  3. Call `organization.submitForVerification(documentUrl)`.
  4. Persist vian OrganizationRepository.
  5. Return updated Organization.
- **Events Raised:** None (awaiting admin review)
- **Error Cases:**
  - `OrganizationNotFoundError`: Organization does not exist.
  - `UnauthorizedError`: Caller is not the owner.

### ApproveOrganizationVerification

- **Actor:** Admin
- **Preconditions:** Organization exists with pending verification
- **Input:**
  ```typescript
  interface ApproveOrganizationVerificationInput {
    organizationId: string;
    adminId: string;
  }
  ```
- **Output:** Updated `Organization`
- **Process Flow:**
  1. Load Organization by ID.
  2. Verify admin role.
  3. Call `organization.approveVerification()`.
  4. Persist vian OrganizationRepository.
  5. Return updated Organization.
- **Events Raised:** `OrganizationVerified`
- **Error Cases:**
  - `OrganizationNotFoundError`: Organization does not exist.
  - `UnauthorizedError`: Caller is not an admin.
  - `InvalidStateError`: No verification document uploaded.

### SuspendUser

- **Actor:** Admin
- **Preconditions:** User exists and is active
- **Input:**
  ```typescript
  interface SuspendUserInput {
    userId: string;
    adminId: string;
    reason: string;
  }
  ```
- **Output:** Updated `User`
- **Process Flow:**
  1. Load User by ID.
  2. Verify admin role.
  3. Call `user.suspend(reason)`.
  4. Persist via UserRepository.
  5. Invalidate all active sessions via AuthService.
  6. Return updated User.
- **Events Raised:** `UserSuspended`
- **Error Cases:**
  - `UserNotFoundError`: User does not exist.
  - `UnauthorizedError`: Caller is not an admin.
  - `InvalidStateError`: User is not in active status.

---

## 7. Repository Ports

```typescript
interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByStatus(status: UserStatus): Promise<User[]>;
  search(query: string, limit: number, offset: number): Promise<{ users: User[]; total: number }>;
  save(user: User): Promise<void>;
  delete(id: string): Promise<void>;
}

interface ProfileRepository {
  findById(id: string): Promise<Profile | null>;
  findByUserId(userId: string): Promise<Profile | null>;
  findByPhone(phoneCodePrefix: string, phoneNumber: string): Promise<Profile | null>;
  findPendingVerification(limit: number, offset: number): Promise<{ profiles: Profile[]; total: number }>;
  findByVerificationStatus(status: VerificationStatus): Promise<Profile[]>;
  save(profile: Profile): Promise<void>;
}

interface OrganizationRepository {
  findById(id: string): Promise<Organization | null>;
  findByOwner(ownerId: string): Promise<Organization[]>;
  findByVerificationStatus(status: VerificationStatus): Promise<Organization[]>;
  findNearby(lat: number, lng: number, radiusKm: number, limit: number): Promise<Organization[]>;
  search(query: string, organizationType: OrganizationType | null, limit: number, offset: number): Promise<{ organizations: Organization[]; total: number }>;
  save(organization: Organization): Promise<void>;
}

interface OrganizationMemberRepository {
  findById(id: string): Promise<OrganizationMember | null>;
  findByOrganization(organizationId: string): Promise<OrganizationMember[]>;
  findByUser(userId: string): Promise<OrganizationMember[]>;
  findByOrganizationAndUser(organizationId: string, userId: string): Promise<OrganizationMember | null>;
  findActiveByOrganization(organizationId: string): Promise<OrganizationMember[]>;
  save(member: OrganizationMember): Promise<void>;
  delete(memberId: string): Promise<void>;
}
```

### External Service Ports

```typescript
// Better Auth handles: registration, login, passwords, sessions, OTP, social login, lockouts
interface AuthService {
  register(data: { email: string; name: string }): Promise<{ userId: string; sessionToken: string }>;
  logout(sessionToken: string): Promise<void>;
  invalidateAllSessions(userId: string): Promise<void>;
  sendEmailVerification(email: string): Promise<void>;
  verifyEmailToken(email: string, token: string): Promise<boolean>;
  sendPhoneOTP(phoneCodePrefix: string, phoneNumber: string): Promise<void>;
  verifyPhoneOTP(phoneCodePrefix: string, phoneNumber: string, otp: string): Promise<boolean>;
}

interface FileStorageService {
  uploadImage(file: Buffer, path: string): Promise<string>; // returns URL
  deleteImage(url: string): Promise<void>;
}

interface GeocodingService {
  geocode(address: string): Promise<{ lat: number; lng: number } | null>;
  reverseGeocode(lat: number, lng: number): Promise<string | null>;
}
```

---

## 8. Entity Schemas

### Addresses Table (Shared)

| Column | Type | Constraints |
|--------|------|------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `label` | `varchar(100)` | nullable |
| `street` | `text` | NOT NULL |
| `city` | `varchar(100)` | NOT NULL |
| `state` | `varchar(100)` | nullable |
| `postal_code` | `varchar(20)` | nullable |
| `country` | `varchar(2)` | NOT NULL, ISO 3166-1 alpha-2 |
| `lat` | `decimal(10,7)` | NOT NULL, CHECK `>= -90 AND <= 90` |
| `lng` | `decimal(10,7)` | NOT NULL, CHECK `>= -180 AND <= 180` |
| `created_at` | `timestamptz` | NOT NULL, default `now()` |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` |

**Indexes:**
- `idx_addresses_location` on (`lat`, `lng`) (for proximity queries)
- `idx_addresses_country` on `country`

**Note:** This table is shared across all bounded contexts. Any entity needing an address holds a FK `address_id` pointing here. Currently used by `profiles` and `organizations`.

### Users Table

| Column | Type | Constraints |
|--------|------|------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `email` | `varchar(255)` | UNIQUE, NOT NULL |
| `first_name` | `varchar(100)` | NOT NULL |
| `last_name` | `varchar(100)` | NOT NULL |
| `roles` | `jsonb` | NOT NULL, default `'["customer"]'` |
| `email_verified` | `boolean` | NOT NULL, default `false` |
| `status` | `varchar(20)` | NOT NULL, default `'pending'`, CHECK IN (`active`, `suspended`, `pending`) |
| `created_at` | `timestamptz` | NOT NULL, default `now()` |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` |

**Indexes:**
- `idx_users_email` on `email`
- `idx_users_status` on `status`

**Note:** Better Auth manages its own `session`, `account`, and `verification` tables, as well as passwords, OTP, social login, and session management. The `users` table integrates with Better Auth via the `id` field as the shared user identifier.

### Profiles Table

| Column | Type | Constraints |
|--------|------|------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `user_id` | `uuid` | FK -> `users.id`, UNIQUE, NOT NULL, ON DELETE CASCADE |
| `phone_code_prefix` | `varchar(10)` | nullable (e.g., `+258`, `+1`) |
| `phone_number` | `varchar(20)` | nullable |
| `phone_verified` | `boolean` | NOT NULL, default `false` |
| `profile_image_url` | `text` | nullable |
| `address_id` | `uuid` | FK -> `addresses.id`, nullable, ON DELETE SET NULL |
| `bio` | `text` | nullable, CHECK `length(bio) >= 50` when NOT NULL |
| `service_areas` | `jsonb` | NOT NULL, default `'[]'` |
| `skills` | `jsonb` | NOT NULL, default `'[]'` |
| `portfolio_images` | `jsonb` | NOT NULL, default `'[]'` |
| `identity_document_url` | `text` | nullable |
| `verification_status` | `varchar(20)` | nullable, CHECK IN (`pending`, `verified`, `rejected`) when NOT NULL |
| `verification_rejected_reason` | `text` | nullable |
| `average_rating` | `decimal(3,2)` | NOT NULL, default `0.00`, CHECK `>= 0 AND <= 5` |
| `total_reviews` | `integer` | NOT NULL, default `0` |
| `total_completed_tasks` | `integer` | NOT NULL, default `0` |
| `created_at` | `timestamptz` | NOT NULL, default `now()` |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` |

**Indexes:**
- `idx_profiles_user_id` UNIQUE on `user_id`
- `idx_profiles_phone` UNIQUE on (`phone_code_prefix`, `phone_number`) WHERE both are NOT NULL
- `idx_profiles_verification_status` on `verification_status` WHERE `verification_status` IS NOT NULL
- `idx_profiles_average_rating` on `average_rating` WHERE `verification_status` IS NOT NULL

**Note:** Provider-specific fields (`bio`, `verification_status`, etc.) are nullable. When `verification_status` is NULL, the profile is a regular user profile. When it is set (to `pending`, `verified`, or `rejected`), the profile is a provider profile.

### Organizations Table

| Column | Type | Constraints |
|--------|------|------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `owner_id` | `uuid` | FK -> `users.id`, NOT NULL, ON DELETE RESTRICT |
| `name` | `varchar(200)` | NOT NULL |
| `description` | `text` | NOT NULL |
| `logo_url` | `text` | nullable |
| `cover_photos` | `jsonb` | NOT NULL, default `'[]'` |
| `address_id` | `uuid` | FK -> `addresses.id`, NOT NULL, ON DELETE RESTRICT |
| `phone` | `varchar(20)` | NOT NULL |
| `email` | `varchar(255)` | NOT NULL |
| `website` | `text` | nullable |
| `organization_type` | `varchar(20)` | NOT NULL, CHECK IN (`salon`, `workshop`, `restaurant`, `clinic`, `agency`, `other`) |
| `verification_status` | `varchar(20)` | NOT NULL, default `'pending'`, CHECK IN (`pending`, `verified`, `rejected`) |
| `verification_document_url` | `text` | nullable |
| `verification_rejected_reason` | `text` | nullable |
| `average_rating` | `decimal(3,2)` | NOT NULL, default `0.00`, CHECK `>= 0 AND <= 5` |
| `total_reviews` | `integer` | NOT NULL, default `0` |
| `total_completed_bookings` | `integer` | NOT NULL, default `0` |
| `is_active` | `boolean` | NOT NULL, default `true` |
| `created_at` | `timestamptz` | NOT NULL, default `now()` |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` |

**Indexes:**
- `idx_organizations_owner_id` on `owner_id`
- `idx_organizations_organization_type` on `organization_type`
- `idx_organizations_verification_status` on `verification_status`
- `idx_organizations_is_active` on `is_active`
- `idx_organizations_address_id` on `address_id`
- `idx_organizations_average_rating` on `average_rating`

### Organization Members Table

| Column | Type | Constraints |
|--------|------|------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `organization_id` | `uuid` | FK -> `organizations.id`, NOT NULL, ON DELETE CASCADE |
| `user_id` | `uuid` | FK -> `users.id`, NOT NULL, ON DELETE CASCADE |
| `role` | `varchar(20)` | NOT NULL, CHECK IN (`owner`, `manager`, `staff`) |
| `display_name` | `varchar(100)` | NOT NULL |
| `photo_url` | `text` | nullable |
| `specialties` | `jsonb` | NOT NULL, default `'[]'` |
| `is_active` | `boolean` | NOT NULL, default `true` |
| `joined_at` | `timestamptz` | NOT NULL, default `now()` |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` |

**Indexes:**
- `idx_organization_members_organization_id` on `organization_id`
- `idx_organization_members_user_id` on `user_id`
- `uq_organization_members_organization_user` UNIQUE on (`organization_id`, `user_id`)
- `idx_organization_members_is_active` on `is_active`

### Drizzle ORM Schema

```typescript
import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  boolean,
  timestamp,
  decimal,
  integer,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const addresses = pgTable(
  'addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    label: varchar('label', { length: 100 }),
    street: text('street').notNull(),
    city: varchar('city', { length: 100 }).notNull(),
    state: varchar('state', { length: 100 }),
    postalCode: varchar('postal_code', { length: 20 }),
    country: varchar('country', { length: 2 }).notNull(),
    lat: decimal('lat', { precision: 10, scale: 7 }).notNull(),
    lng: decimal('lng', { precision: 10, scale: 7 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_addresses_location').on(table.lat, table.lng),
    index('idx_addresses_country').on(table.country),
    check('lat_range_check', sql`${table.lat} >= -90 AND ${table.lat} <= 90`),
    check('lng_range_check', sql`${table.lng} >= -180 AND ${table.lng} <= 180`),
  ],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).unique().notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    roles: jsonb('roles').notNull().default(sql`'["customer"]'::jsonb`),
    emailVerified: boolean('email_verified').notNull().default(false),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_users_email').on(table.email),
    index('idx_users_status').on(table.status),
    check('status_check', sql`${table.status} IN ('active', 'suspended', 'pending')`),
  ],
);

export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Base fields (all users)
    phoneCodePrefix: varchar('phone_code_prefix', { length: 10 }),
    phoneNumber: varchar('phone_number', { length: 20 }),
    phoneVerified: boolean('phone_verified').notNull().default(false),
    profileImageUrl: text('profile_image_url'),
    addressId: uuid('address_id').references(() => addresses.id, { onDelete: 'set null' }),
    // Provider fields (nullable — populated when user becomes a provider)
    bio: text('bio'),
    serviceAreas: jsonb('service_areas').notNull().default(sql`'[]'::jsonb`),
    skills: jsonb('skills').notNull().default(sql`'[]'::jsonb`),
    portfolioImages: jsonb('portfolio_images').notNull().default(sql`'[]'::jsonb`),
    identityDocumentUrl: text('identity_document_url'),
    verificationStatus: varchar('verification_status', { length: 20 }),
    verificationRejectedReason: text('verification_rejected_reason'),
    averageRating: decimal('average_rating', { precision: 3, scale: 2 }).notNull().default('0.00'),
    totalReviews: integer('total_reviews').notNull().default(0),
    totalCompletedTasks: integer('total_completed_tasks').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_profiles_phone')
      .on(table.phoneCodePrefix, table.phoneNumber)
      .where(sql`${table.phoneCodePrefix} IS NOT NULL AND ${table.phoneNumber} IS NOT NULL`),
    index('idx_profiles_verification_status')
      .on(table.verificationStatus)
      .where(sql`${table.verificationStatus} IS NOT NULL`),
    index('idx_profiles_average_rating')
      .on(table.averageRating)
      .where(sql`${table.verificationStatus} IS NOT NULL`),
    check(
      'bio_length_check',
      sql`${table.bio} IS NULL OR length(${table.bio}) >= 50`,
    ),
    check(
      'verification_status_check',
      sql`${table.verificationStatus} IS NULL OR ${table.verificationStatus} IN ('pending', 'verified', 'rejected')`,
    ),
    check(
      'rating_range_check',
      sql`${table.averageRating} >= 0 AND ${table.averageRating} <= 5`,
    ),
  ],
);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description').notNull(),
    logoUrl: text('logo_url'),
    coverPhotos: jsonb('cover_photos').notNull().default(sql`'[]'::jsonb`),
    addressId: uuid('address_id')
      .notNull()
      .references(() => addresses.id, { onDelete: 'restrict' }),
    phone: varchar('phone', { length: 20 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    website: text('website'),
    organizationType: varchar('organization_type', { length: 20 }).notNull(),
    verificationStatus: varchar('verification_status', { length: 20 }).notNull().default('pending'),
    verificationDocumentUrl: text('verification_document_url'),
    verificationRejectedReason: text('verification_rejected_reason'),
    averageRating: decimal('average_rating', { precision: 3, scale: 2 }).notNull().default('0.00'),
    totalReviews: integer('total_reviews').notNull().default(0),
    totalCompletedBookings: integer('total_completed_bookings').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_organizations_owner_id').on(table.ownerId),
    index('idx_organizations_organization_type').on(table.organizationType),
    index('idx_organizations_verification_status').on(table.verificationStatus),
    index('idx_organizations_is_active').on(table.isActive),
    index('idx_organizations_address_id').on(table.addressId),
    index('idx_organizations_average_rating').on(table.averageRating),
    check(
      'organization_type_check',
      sql`${table.organizationType} IN ('salon', 'workshop', 'restaurant', 'clinic', 'agency', 'other')`,
    ),
    check(
      'organization_verification_status_check',
      sql`${table.verificationStatus} IN ('pending', 'verified', 'rejected')`,
    ),
    check(
      'organization_rating_range_check',
      sql`${table.averageRating} >= 0 AND ${table.averageRating} <= 5`,
    ),
  ],
);

export const organizationMembers = pgTable(
  'organization_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 20 }).notNull(),
    displayName: varchar('display_name', { length: 100 }).notNull(),
    photoUrl: text('photo_url'),
    specialties: jsonb('specialties').notNull().default(sql`'[]'::jsonb`),
    isActive: boolean('is_active').notNull().default(true),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_organization_members_organization_id').on(table.organizationId),
    index('idx_organization_members_user_id').on(table.userId),
    uniqueIndex('uq_organization_members_organization_user').on(table.organizationId, table.userId),
    index('idx_organization_members_is_active').on(table.isActive),
    check(
      'member_role_check',
      sql`${table.role} IN ('owner', 'manager', 'staff')`,
    ),
  ],
);
```

---

## 9. Organization Rules & Invariants

### User Rules

| # | Rule | Enforcement |
|---|------|-------------|
| U1 | A user must verify email or phone to transition from `pending` to `active`. | Domain logic in `User.verify()` |
| U2 | Account locks for 30 minutes after 5 consecutive failed login attempts. | Delegated to Better Auth |
| U3 | Sessions expire after 7 days of inactivity. | Better Auth configuration |
| U4 | Soft delete with 30-day retention before permanent deletion. | Application service + scheduled job |
| U5 | A user can hold multiple roles simultaneously (customer, individual_provider, organization_owner, admin). | JSON array storage, domain logic |
| U6 | Customer role cannot be removed (it is the base role). | Domain logic in `User.removeRole()` |
| U7 | Admin role can only be assigned by another admin. | Use case authorization check |
| U8 | Email must be unique across all users. | DB unique constraint + domain validation |
| U9 | Phone must be unique if provided. | DB unique constraint + domain validation |
| U10 | Password validation delegated to Better Auth (external provider). | Better Auth configuration |

### Provider Rules (Profile with provider fields)

| # | Rule | Enforcement |
|---|------|-------------|
| P1 | Bio must be at least 50 characters and no more than 2000 when set. | Domain logic + DB CHECK constraint |
| P2 | Portfolio images cannot exceed 10 items. | Domain logic in `addPortfolioImage()` |
| P3 | Identity document must be uploaded before requesting verification. | Domain logic in `submitForVerification()` |
| P4 | Only an admin can approve or reject verification. | Use case authorization check |
| P5 | Verified providers can publish services in the Catalog BC. | Cross-context event: `ProviderVerified` |
| P6 | Average rating must be between 0.00 and 5.00. | Domain logic + DB CHECK constraint |
| P7 | A user has exactly one Profile; provider fields are populated via `upgradeToProvider()`. | DB unique constraint on `user_id`, domain logic guard |
| P8 | Verification can be re-submitted after rejection. | Domain logic in `submitForVerification()` |

### Organization Rules

| # | Rule | Enforcement |
|---|------|-------------|
| B1 | An organization must have exactly one member with role `owner`. | Domain logic at creation + `removeMember()` guard |
| B2 | Owner is auto-created as OrganizationMember on organization creation. | Use case: `CreateOrganization` |
| B3 | A user can own multiple organizations. | No uniqueness constraint on `owner_id` |
| B4 | The owner member cannot be removed from the organization. | Domain logic in `removeMember()` |
| B5 | Organization must have a valid address (embedded Address VO). | Domain: Address VO validation. DB: `address_id` FK to shared `addresses` table |
| B6 | Organization verification requires a business license document. | Domain logic in `approveVerification()` |
| B7 | Cover photos cannot exceed 5 items. | Domain validation |
| B8 | A user can only be a member of a given organization once. | DB unique constraint on (`organization_id`, `user_id`) |
| B9 | Only owner or manager can add new members. | Use case authorization check |
| B10 | Only owner can remove members or change member roles. | Use case authorization check |
| B11 | Only owner can deactivate the organization. | Use case authorization check |
| B12 | Staff members must set availability within organization operating hours. | Enforced in Scheduling BC (cross-context invariant) |

---

## 10. Cross-Context Dependencies

### Upstream Dependencies

**None.** The User BC is the foundation context. It does not depend on any other bounded context for its core operations.

**Exception:** The User BC subscribes to `ReviewSubmitted` events from the Review BC to update aggregate ratings on `Profile` (provider) and `Organization` entities. This is a reactive update, not a dependency for any command operation.

### Downstream Dependents

| Consuming BC | What It Needs | How It Gets It |
|-------------|---------------|----------------|
| **Catalog** | User/provider/organization identity for service creation. Verification status to gate publishing. | Queries User BC read models. Consumes `ProviderVerified`, `OrganizationVerified`, `UserSuspended` events. |
| **Scheduling** | Organization identity and staff roster for availability management. Operating hours initialization. | Consumes `OrganizationCreated`, `StaffMemberAdded`, `StaffMemberRemoved` events. Queries User BC for staff details. |
| **Pricing** | Provider identity for quote management and discount rules. | Queries User BC read models for provider context. |
| **Booking** | User identity for booking creation. Staff assignment data. | Queries User BC read models. Consumes `StaffMemberRemoved`, `UserSuspended` events to reassign/cancel. |
| **Payment** | User identity for wallet creation and payment processing. | Consumes `UserRegistered` event to create wallet. Queries User BC for payout account info. |
| **Communication** | User identity and contact info for notifications, messaging. | Consumes all User events for notifications. Queries User BC for delivery preferences. |
| **Review** | User identity for review authorship and target (provider/organization). | Queries User BC read models. Publishes `ReviewSubmitted` consumed by User BC. |

### Events Published (Summary)

| Event | Consumers |
|-------|-----------|
| `UserRegistered` | Communication (welcome), Payment (wallet creation) |
| `ProviderVerified` | Communication (notification), Catalog (enable publishing) |
| `ProviderRejected` | Communication (notification with reason) |
| `OrganizationCreated` | Scheduling (init operating hours and config) |
| `OrganizationVerified` | Communication (notification), Catalog (enable organization services) |
| `StaffMemberAdded` | Communication (invitation), Scheduling (increase slot capacity) |
| `StaffMemberRemoved` | Communication (notification), Scheduling (decrease slot capacity), Booking (reassign future bookings) |
| `UserSuspended` | Communication (notification), Booking (cancel/reassign), Catalog (deactivate services), all BCs (invalidate sessions) |

### Events Subscribed

| Event | Source BC | Handler |
|-------|----------|---------|
| `ReviewSubmitted` | Review | Recalculate `average_rating` and `total_reviews` on the target `Profile` (provider) or `Organization` aggregate. |
| `BookingCompleted` | Booking | Increment `total_completed_tasks` on `Profile` (provider) or `total_completed_bookings` on `Organization`. |

### Integration Pattern

The User BC uses the **Published Language** pattern. All downstream BCs conform to the User BC's model for identity and role concepts. There is no Anti-Corruption Layer needed on the downstream side because the User model is the canonical source of truth for identity.

Downstream BCs maintain local read-model copies of essential user data (userId, name, roles) denormalized for query performance, updated via domain events. They never write back to the User BC's data store.
