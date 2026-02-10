# Catalog Bounded Context

## 1. Overview

The Catalog Bounded Context manages the **service marketplace catalog** for the Ntizo platform. It owns all concerns related to service categories, service definitions (with full lifecycle management), and service packages.

**Owns:**
- Service category hierarchy (parent/child classification with icons and ordering)
- Service creation, editing, and lifecycle management (draft through published)
- Service package management (fixed-price offerings within a service)
- Service approval workflow (admin review gate before publishing)
- Service metadata: pricing mode, location type, provider type, duration, buffer

**Delegates:**
- Pricing calculation, quote management, and discount rules to **Pricing BC**
- Slot generation and availability configuration to **Scheduling BC**
- Booking creation and orchestration to **Booking BC**
- Notifications (approval, rejection, publishing) to **Communication BC**

**Key Design Principles:**
- Services have a strict lifecycle: `draft` -> `pending_approval` -> `approved` -> `published`, with `rejected`, `unpublished`, and `archived` branches.
- Each service defines its `provider_type` (individual or organization), `service_location_type` (at_customer, at_provider, remote, flexible), `pricing_mode` (package, hourly, quote), `duration_minutes`, and `buffer_minutes`.
- Fixed-price packages are the **recommended default** pricing mode for most categories.
- The Catalog BC is the single source of truth for what services exist and their current status. Downstream BCs (Scheduling, Pricing, Booking) react to Catalog events.

---

## 2. Ubiquitous Language

| Term | Definition |
|------|-----------|
| **Service** | A category-linked offering created by a provider or organization. A Service can have packages, an hourly rate, or accept custom quotes depending on its pricing mode. Services go through a lifecycle before becoming visible to customers. |
| **Service Category** | A hierarchical classification (parent/child, max 2 levels) used to organize services in the marketplace. Categories have icons and display ordering. Examples: Home Cleaning, Repairs, Beauty, Tutoring. |
| **Service Package** | A pre-defined offering within a Service that has a fixed price, name, description, duration override, and a list of what is included. Packages are the building blocks of Path A (Fixed-Price Package) bookings. |
| **Pricing Mode** | Determines how a service is priced. `package`: fixed-price packages (recommended default). `hourly`: per-hour rate with minimum hours. `quote`: custom pricing negotiated per request. |
| **Service Location Type** | Defines where the service is delivered. `at_customer`: provider goes to the customer. `at_provider`: customer goes to the provider's location. `remote`: delivered via video/chat. `flexible`: customer chooses at booking time. |
| **Provider Type** | Indicates whether the service is offered by an `individual` (a person) or an `organization` (an establishment). Determines ownership validation and allowed location types. |
| **Service Status** | The current state of a service in its lifecycle. One of: `draft`, `pending_approval`, `approved`, `published`, `rejected`, `unpublished`, `archived`. |
| **Service Lifecycle** | The state machine governing a service from creation to publication. Enforces that all published services have been reviewed and approved by an admin. |
| **Submission** | The act of a provider sending a draft service for admin review. Transitions the service from `draft` to `pending_approval`. |
| **Approval** | An admin action that marks a pending service as ready to be published. Transitions from `pending_approval` to `approved`. |
| **Rejection** | An admin action that returns a service to the provider with a reason for correction. Transitions from `pending_approval` to `rejected`. The provider can edit and resubmit. |
| **Publishing** | A provider action that makes an approved service visible to customers in the marketplace. Transitions from `approved` to `published`. |

---

## 3. Aggregates & Entities

### 3.1 ServiceCategory Aggregate

**Aggregate Root:** `ServiceCategory`
**Children:** None

#### Attributes

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | Primary key, auto-generated |
| `name` | `string` | Required, max 100 chars, unique within same parent level |
| `description` | `string` | Required, max 500 chars |
| `icon_url` | `string \| null` | URL to category icon image |
| `parent_category_id` | `UUID \| null` | FK -> service_categories (self-referencing), null for root categories |
| `is_active` | `boolean` | Default `true` |
| `sort_order` | `number` | Integer, default 0, determines display position |
| `created_at` | `Date` | Auto-set on creation |
| `updated_at` | `Date` | Auto-set on every update |

#### Domain Categories

The platform launches with the following root categories and their children:

| Root Category | Child Categories |
|---------------|-----------------|
| Home Cleaning | Regular Cleaning, Deep Cleaning, Move-in/Move-out Cleaning |
| Repairs | Plumbing, Electrical, General Repairs, Painting |
| Assembly | Furniture Assembly, Equipment Assembly |
| Moving | Local Moving, Long-distance Moving, Packing Services |
| Gardening | Lawn Care, Landscaping, Tree Trimming |
| Personal Services | Personal Assistant, Babysitting, Elder Care |
| Events | Event Planning, Catering, Photography, DJ/Music |
| Beauty | Haircuts, Nails, Makeup, Massage, Spa |
| Tutoring | Academic Tutoring, Language Lessons, Music Lessons, Test Prep |
| Technology | Computer Repair, Software Development, IT Support, Web Design |
| Professional | Accounting, Legal, Consulting, Translation |
| Automotive | Car Wash, Oil Change, Tire Service, General Mechanic |

#### Invariants

1. Category name must be unique within the same parent level (two root categories cannot share a name; two children of the same parent cannot share a name).
2. Maximum 2 levels of nesting allowed: root (parent_category_id = null) and child (parent_category_id = a root category). A child category cannot have children of its own.
3. Cannot deactivate a category that has active (published) services linked to it.
4. Sort order determines display position within its sibling group.
5. A parent category cannot reference itself (no circular references).

#### Domain Logic

```typescript
import { Entity, DomainError } from 'onion-lasagna';

interface ServiceCategoryProps {
  name: string;
  description: string;
  iconUrl: string | null;
  parentCategoryId: string | null;
  isActive: boolean;
  sortOrder: number;
}

class ServiceCategory extends Entity<ServiceCategoryProps> {
  get isRoot(): boolean {
    return this.props.parentCategoryId === null;
  }

  get isChild(): boolean {
    return this.props.parentCategoryId !== null;
  }

  static create(props: {
    name: string;
    description: string;
    iconUrl?: string | null;
    parentCategoryId?: string | null;
    sortOrder?: number;
  }): ServiceCategory {
    if (!props.name || props.name.trim().length === 0) {
      throw new DomainError('Category name is required');
    }
    if (props.name.length > 100) {
      throw new DomainError('Category name must not exceed 100 characters');
    }
    if (!props.description || props.description.trim().length === 0) {
      throw new DomainError('Category description is required');
    }
    if (props.description.length > 500) {
      throw new DomainError('Category description must not exceed 500 characters');
    }

    return new ServiceCategory({
      name: props.name.trim(),
      description: props.description.trim(),
      iconUrl: props.iconUrl ?? null,
      parentCategoryId: props.parentCategoryId ?? null,
      isActive: true,
      sortOrder: props.sortOrder ?? 0,
    });
  }

  update(data: {
    name?: string;
    description?: string;
    iconUrl?: string | null;
  }): void {
    if (data.name !== undefined) {
      if (!data.name || data.name.trim().length === 0) {
        throw new DomainError('Category name is required');
      }
      if (data.name.length > 100) {
        throw new DomainError('Category name must not exceed 100 characters');
      }
      this.props.name = data.name.trim();
    }
    if (data.description !== undefined) {
      if (!data.description || data.description.trim().length === 0) {
        throw new DomainError('Category description is required');
      }
      this.props.description = data.description.trim();
    }
    if (data.iconUrl !== undefined) {
      this.props.iconUrl = data.iconUrl;
    }
    this.markUpdated();
  }

  deactivate(activeServiceCount: number): void {
    if (activeServiceCount > 0) {
      throw new DomainError(
        `Cannot deactivate category with ${activeServiceCount} active services. Reassign or archive services first.`
      );
    }
    this.props.isActive = false;
    this.markUpdated();
  }

  activate(): void {
    this.props.isActive = true;
    this.markUpdated();
  }

  reorder(newSortOrder: number): void {
    if (newSortOrder < 0) {
      throw new DomainError('Sort order must be non-negative');
    }
    this.props.sortOrder = newSortOrder;
    this.markUpdated();
  }
}
```

---

### 3.2 Service Aggregate

**Aggregate Root:** `Service`
**Children:** `ServicePackage` (collection, managed through the aggregate root)

#### Attributes

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | Primary key, auto-generated |
| `provider_type` | `ProviderType` | Enum: `individual`, `organization`. Required |
| `provider_id` | `UUID \| null` | FK -> users. Set when provider_type = `individual` |
| `organization_id` | `UUID \| null` | FK -> organizations. Set when provider_type = `organization` |
| `category_id` | `UUID` | FK -> service_categories. Required |
| `title` | `string` | Required, max 200 chars |
| `description` | `string` | Required, max 5000 chars |
| `service_location_type` | `ServiceLocationType` | Enum: `at_customer`, `at_provider`, `remote`, `flexible`. Required |
| `pricing_mode` | `PricingMode` | Enum: `package`, `hourly`, `quote`. Required |
| `hourly_rate` | `number \| null` | Required when pricing_mode = `hourly`. Must be > 0 |
| `minimum_hours` | `number \| null` | For hourly mode, default 1. Must be >= 1 |
| `duration_minutes` | `number` | Required, must be > 0. Default service duration for slot generation |
| `buffer_minutes` | `number` | Required, must be >= 0. Rest/travel time between appointments |
| `accepts_custom_quotes` | `boolean` | Default `false`. Whether the service accepts Path C requests |
| `status` | `ServiceStatus` | Enum: `draft`, `pending_approval`, `approved`, `published`, `rejected`, `unpublished`, `archived`. Default `draft` |
| `submitted_at` | `Date \| null` | Timestamp when submitted for approval |
| `approved_at` | `Date \| null` | Timestamp when approved by admin |
| `rejected_at` | `Date \| null` | Timestamp when rejected by admin |
| `rejection_reason` | `string \| null` | Reason provided by admin on rejection |
| `published_at` | `Date \| null` | Timestamp when published by provider |
| `created_at` | `Date` | Auto-set on creation |
| `updated_at` | `Date` | Auto-set on every update |
| `packages` | `ServicePackage[]` | Child entity collection |

#### Service Lifecycle State Machine

```
                                    ┌─────────────┐
                                    │   DRAFT     │
                                    └──────┬──────┘
                                           │ submit()
                                           v
                                ┌───────────────────────┐
                         ┌──────│  PENDING_APPROVAL      │──────┐
                         │      └───────────────────────┘      │
                 approve()│                                     │reject(reason)
                         v                                     v
                  ┌──────────────┐                    ┌──────────────┐
                  │  APPROVED    │                    │  REJECTED    │
                  └──────┬───────┘                    └──────┬───────┘
                         │ publish()                         │ (edit & resubmit)
                         v                                   v
                  ┌──────────────┐                    ┌─────────────┐
            ┌─────│  PUBLISHED   │                    │   DRAFT     │
            │     └──────┬───────┘                    └─────────────┘
            │            │
   unpublish()│          │ archive()
            │            v
            │     ┌──────────────┐
            │     │  ARCHIVED    │
            │     └──────────────┘
            v
     ┌──────────────┐
     │ UNPUBLISHED  │
     └──────┬───────┘
            │ publish() (no re-approval needed)
            v
     ┌──────────────┐
     │  PUBLISHED   │
     └──────────────┘
```

**Transition Rules:**
- `draft` -> `pending_approval`: Provider calls `submit()`. Service must have required fields filled. If pricing_mode is `package`, at least one active ServicePackage must exist.
- `pending_approval` -> `approved`: Admin calls `approve(adminId)`.
- `pending_approval` -> `rejected`: Admin calls `reject(adminId, reason)`. Reason is required.
- `rejected` -> `draft`: Automatic when provider edits the rejected service. Provider can then resubmit.
- `approved` -> `published`: Provider calls `publish()`.
- `published` -> `unpublished`: Provider calls `unpublish()`. Service is hidden but existing bookings are unaffected.
- `unpublished` -> `published`: Provider calls `publish()`. No re-approval required.
- `published` -> `archived`: Provider calls `archive()`. Service is permanently hidden. Existing bookings are unaffected.

#### Invariants

1. A service must belong to either `provider_id` (when provider_type = `individual`) or `organization_id` (when provider_type = `organization`). Both cannot be set, and both cannot be null.
2. Individual providers cannot use `at_provider` service location type (they have no fixed location).
3. If pricing_mode is `hourly`, `hourly_rate` must be set and greater than 0.
4. If pricing_mode is `package`, at least one active ServicePackage must exist before the service can be submitted for approval.
5. `duration_minutes` must be greater than 0.
6. `buffer_minutes` must be greater than or equal to 0.
7. Can only submit for approval from `draft` status.
8. Can only approve or reject from `pending_approval` status.
9. Can only publish from `approved` or `unpublished` status.
10. Can only unpublish from `published` status.
11. Can only archive from `published` status.
12. Only admin users can approve or reject services.
13. Rejected services transition to `draft` so the provider can edit and resubmit.
14. Title must be between 1 and 200 characters.
15. Description must be between 1 and 5000 characters.

#### Domain Logic

```typescript
import { Entity, DomainError } from 'onion-lasagna';

type ServiceStatus = 'draft' | 'pending_approval' | 'approved' | 'published' | 'rejected' | 'unpublished' | 'archived';
type PricingMode = 'package' | 'hourly' | 'quote';
type ServiceLocationType = 'at_customer' | 'at_provider' | 'remote' | 'flexible';
type ProviderType = 'individual' | 'organization';

interface ServiceProps {
  providerType: ProviderType;
  providerId: string | null;
  organizationId: string | null;
  categoryId: string;
  title: string;
  description: string;
  serviceLocationType: ServiceLocationType;
  pricingMode: PricingMode;
  hourlyRate: number | null;
  minimumHours: number | null;
  durationMinutes: number;
  bufferMinutes: number;
  acceptsCustomQuotes: boolean;
  status: ServiceStatus;
  submittedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  publishedAt: Date | null;
  packages: ServicePackage[];
}

class Service extends Entity<ServiceProps> {
  get isPublished(): boolean {
    return this.props.status === 'published';
  }

  get isDraft(): boolean {
    return this.props.status === 'draft';
  }

  get isEditable(): boolean {
    return this.props.status === 'draft' || this.props.status === 'rejected';
  }

  get activePackages(): ServicePackage[] {
    return this.props.packages.filter(p => p.props.isActive);
  }

  get ownerId(): string {
    if (this.props.providerType === 'individual') {
      return this.props.providerId!;
    }
    return this.props.organizationId!;
  }

  static create(props: {
    providerType: ProviderType;
    providerId?: string | null;
    organizationId?: string | null;
    categoryId: string;
    title: string;
    description: string;
    serviceLocationType: ServiceLocationType;
    pricingMode: PricingMode;
    hourlyRate?: number | null;
    minimumHours?: number | null;
    durationMinutes: number;
    bufferMinutes: number;
    acceptsCustomQuotes?: boolean;
  }): Service {
    // Validate ownership
    if (props.providerType === 'individual') {
      if (!props.providerId) {
        throw new DomainError('Individual service must have a provider_id');
      }
      if (props.organizationId) {
        throw new DomainError('Individual service cannot have an organization_id');
      }
    } else if (props.providerType === 'organization') {
      if (!props.organizationId) {
        throw new DomainError('Organization service must have an organization_id');
      }
      if (props.providerId) {
        throw new DomainError('Organization service cannot have a provider_id');
      }
    }

    // Validate location type
    if (props.providerType === 'individual' && props.serviceLocationType === 'at_provider') {
      throw new DomainError('Individual providers cannot use at_provider location type (no fixed location)');
    }

    // Validate title
    if (!props.title || props.title.trim().length === 0) {
      throw new DomainError('Service title is required');
    }
    if (props.title.length > 200) {
      throw new DomainError('Service title must not exceed 200 characters');
    }

    // Validate description
    if (!props.description || props.description.trim().length === 0) {
      throw new DomainError('Service description is required');
    }
    if (props.description.length > 5000) {
      throw new DomainError('Service description must not exceed 5000 characters');
    }

    // Validate pricing mode specifics
    if (props.pricingMode === 'hourly') {
      if (!props.hourlyRate || props.hourlyRate <= 0) {
        throw new DomainError('Hourly rate must be set and greater than 0 for hourly pricing mode');
      }
    }

    // Validate duration and buffer
    if (props.durationMinutes <= 0) {
      throw new DomainError('Duration must be greater than 0 minutes');
    }
    if (props.bufferMinutes < 0) {
      throw new DomainError('Buffer time must be 0 or more minutes');
    }

    return new Service({
      providerType: props.providerType,
      providerId: props.providerId ?? null,
      organizationId: props.organizationId ?? null,
      categoryId: props.categoryId,
      title: props.title.trim(),
      description: props.description.trim(),
      serviceLocationType: props.serviceLocationType,
      pricingMode: props.pricingMode,
      hourlyRate: props.hourlyRate ?? null,
      minimumHours: props.minimumHours ?? (props.pricingMode === 'hourly' ? 1 : null),
      durationMinutes: props.durationMinutes,
      bufferMinutes: props.bufferMinutes,
      acceptsCustomQuotes: props.acceptsCustomQuotes ?? false,
      status: 'draft',
      submittedAt: null,
      approvedAt: null,
      rejectedAt: null,
      rejectionReason: null,
      publishedAt: null,
      packages: [],
    });
  }

  update(data: {
    title?: string;
    description?: string;
    serviceLocationType?: ServiceLocationType;
    pricingMode?: PricingMode;
    hourlyRate?: number | null;
    minimumHours?: number | null;
    durationMinutes?: number;
    bufferMinutes?: number;
    acceptsCustomQuotes?: boolean;
    categoryId?: string;
  }): void {
    if (!this.isEditable) {
      throw new DomainError(`Cannot update service in '${this.props.status}' status. Service must be in draft or rejected status.`);
    }

    if (data.title !== undefined) {
      if (!data.title || data.title.trim().length === 0) {
        throw new DomainError('Service title is required');
      }
      if (data.title.length > 200) {
        throw new DomainError('Service title must not exceed 200 characters');
      }
      this.props.title = data.title.trim();
    }

    if (data.description !== undefined) {
      if (!data.description || data.description.trim().length === 0) {
        throw new DomainError('Service description is required');
      }
      if (data.description.length > 5000) {
        throw new DomainError('Service description must not exceed 5000 characters');
      }
      this.props.description = data.description.trim();
    }

    if (data.serviceLocationType !== undefined) {
      if (this.props.providerType === 'individual' && data.serviceLocationType === 'at_provider') {
        throw new DomainError('Individual providers cannot use at_provider location type');
      }
      this.props.serviceLocationType = data.serviceLocationType;
    }

    if (data.pricingMode !== undefined) {
      this.props.pricingMode = data.pricingMode;
    }

    if (data.hourlyRate !== undefined) {
      this.props.hourlyRate = data.hourlyRate;
    }

    if (data.minimumHours !== undefined) {
      this.props.minimumHours = data.minimumHours;
    }

    if (data.durationMinutes !== undefined) {
      if (data.durationMinutes <= 0) {
        throw new DomainError('Duration must be greater than 0 minutes');
      }
      this.props.durationMinutes = data.durationMinutes;
    }

    if (data.bufferMinutes !== undefined) {
      if (data.bufferMinutes < 0) {
        throw new DomainError('Buffer time must be 0 or more minutes');
      }
      this.props.bufferMinutes = data.bufferMinutes;
    }

    if (data.acceptsCustomQuotes !== undefined) {
      this.props.acceptsCustomQuotes = data.acceptsCustomQuotes;
    }

    if (data.categoryId !== undefined) {
      this.props.categoryId = data.categoryId;
    }

    // If service was rejected, transition back to draft on edit
    if (this.props.status === 'rejected') {
      this.props.status = 'draft';
      this.props.rejectedAt = null;
      this.props.rejectionReason = null;
    }

    this.markUpdated();
  }

  submit(): void {
    if (this.props.status !== 'draft') {
      throw new DomainError(`Cannot submit service for approval from '${this.props.status}' status. Must be in draft status.`);
    }

    // Validate hourly rate for hourly mode
    if (this.props.pricingMode === 'hourly') {
      if (!this.props.hourlyRate || this.props.hourlyRate <= 0) {
        throw new DomainError('Hourly rate must be set before submitting an hourly-priced service');
      }
    }

    // Validate at least one active package for package mode
    if (this.props.pricingMode === 'package') {
      if (this.activePackages.length === 0) {
        throw new DomainError('At least one active package is required before submitting a package-priced service');
      }
    }

    this.props.status = 'pending_approval';
    this.props.submittedAt = new Date();
    this.markUpdated();
    this.addDomainEvent(new ServiceSubmitted(
      this.id,
      this.ownerId,
      this.props.providerType,
      this.props.title,
      this.props.categoryId,
    ));
  }

  approve(adminId: string): void {
    if (this.props.status !== 'pending_approval') {
      throw new DomainError(`Cannot approve service from '${this.props.status}' status. Must be in pending_approval status.`);
    }

    this.props.status = 'approved';
    this.props.approvedAt = new Date();
    this.props.rejectedAt = null;
    this.props.rejectionReason = null;
    this.markUpdated();
    this.addDomainEvent(new ServiceApproved(
      this.id,
      adminId,
      this.props.approvedAt,
    ));
  }

  reject(adminId: string, reason: string): void {
    if (this.props.status !== 'pending_approval') {
      throw new DomainError(`Cannot reject service from '${this.props.status}' status. Must be in pending_approval status.`);
    }
    if (!reason || reason.trim().length === 0) {
      throw new DomainError('Rejection reason is required');
    }

    this.props.status = 'rejected';
    this.props.rejectedAt = new Date();
    this.props.rejectionReason = reason.trim();
    this.markUpdated();
    this.addDomainEvent(new ServiceRejected(
      this.id,
      adminId,
      reason.trim(),
      this.props.rejectedAt,
    ));
  }

  publish(): void {
    if (this.props.status !== 'approved' && this.props.status !== 'unpublished') {
      throw new DomainError(`Cannot publish service from '${this.props.status}' status. Must be in approved or unpublished status.`);
    }

    // Re-validate package requirement at publish time
    if (this.props.pricingMode === 'package' && this.activePackages.length === 0) {
      throw new DomainError('Cannot publish a package-priced service without at least one active package');
    }

    this.props.status = 'published';
    this.props.publishedAt = new Date();
    this.markUpdated();
    this.addDomainEvent(new ServicePublished(
      this.id,
      this.ownerId,
      this.props.providerType,
      this.props.title,
      this.props.categoryId,
      this.props.serviceLocationType,
      this.props.pricingMode,
      this.props.durationMinutes,
      this.props.bufferMinutes,
    ));
  }

  unpublish(): void {
    if (this.props.status !== 'published') {
      throw new DomainError(`Cannot unpublish service from '${this.props.status}' status. Must be in published status.`);
    }

    this.props.status = 'unpublished';
    this.markUpdated();
    this.addDomainEvent(new ServiceUnpublished(this.id));
  }

  archive(): void {
    if (this.props.status !== 'published') {
      throw new DomainError(`Cannot archive service from '${this.props.status}' status. Must be in published status.`);
    }

    this.props.status = 'archived';
    this.markUpdated();
    this.addDomainEvent(new ServiceArchived(this.id));
  }

  addPackage(pkg: ServicePackage): void {
    const nameExists = this.props.packages.some(
      p => p.props.name.toLowerCase() === pkg.props.name.toLowerCase() && p.props.isActive
    );
    if (nameExists) {
      throw new DomainError(`A package with the name '${pkg.props.name}' already exists in this service`);
    }
    this.props.packages.push(pkg);
    this.markUpdated();
  }

  updatePackage(packageId: string, data: {
    name?: string;
    description?: string;
    fixedPrice?: number;
    durationMinutes?: number;
    includes?: string[];
    variables?: Record<string, unknown>;
    sortOrder?: number;
  }): void {
    const pkg = this.props.packages.find(p => p.id === packageId);
    if (!pkg) {
      throw new DomainError('Package not found in this service');
    }

    if (data.name !== undefined) {
      const nameConflict = this.props.packages.some(
        p => p.id !== packageId && p.props.name.toLowerCase() === data.name!.toLowerCase() && p.props.isActive
      );
      if (nameConflict) {
        throw new DomainError(`A package with the name '${data.name}' already exists in this service`);
      }
    }

    pkg.update(data);
    this.markUpdated();
  }

  deactivatePackage(packageId: string): void {
    const pkg = this.props.packages.find(p => p.id === packageId);
    if (!pkg) {
      throw new DomainError('Package not found in this service');
    }

    if (this.props.pricingMode === 'package') {
      const activeCount = this.activePackages.length;
      if (activeCount <= 1 && pkg.props.isActive) {
        throw new DomainError('Cannot deactivate the last active package when pricing mode is package');
      }
    }

    pkg.deactivate();
    this.markUpdated();
  }
}
```

---

### 3.3 ServicePackage (Entity within Service Aggregate)

**Parent Aggregate:** Service
**Role:** Child entity, managed through the Service aggregate root

#### Attributes

| Attribute | Type | Constraints |
|-----------|------|------------|
| `id` | `UUID` | Primary key, auto-generated |
| `service_id` | `UUID` | FK -> services. Required |
| `name` | `string` | Required, max 200 chars, unique within the same service |
| `description` | `string` | Required, max 2000 chars |
| `fixed_price` | `number` | Required, must be > 0. Stored as integer cents or smallest currency unit |
| `duration_minutes` | `number` | Required, must be > 0. Overrides service default duration for slot generation |
| `includes` | `string[]` | JSON array of what is included (e.g., ["materials", "equipment", "cleanup"]) |
| `variables` | `Record<string, unknown>` | JSON object for package-specific variables (e.g., {"house_type": "T2", "rooms": 2}) |
| `is_active` | `boolean` | Default `true` |
| `sort_order` | `number` | Integer, default 0, determines display position |
| `created_at` | `Date` | Auto-set on creation |
| `updated_at` | `Date` | Auto-set on every update |

#### Invariants

1. `fixed_price` must be greater than 0.
2. `duration_minutes` must be greater than 0.
3. Name must be unique within the same service (among active packages).
4. Cannot deactivate the last active package if the parent service's pricing_mode is `package`.
5. Name must not exceed 200 characters.
6. Description must not exceed 2000 characters.

#### Domain Logic

```typescript
import { Entity, DomainError } from 'onion-lasagna';

interface ServicePackageProps {
  serviceId: string;
  name: string;
  description: string;
  fixedPrice: number;
  durationMinutes: number;
  includes: string[];
  variables: Record<string, unknown>;
  isActive: boolean;
  sortOrder: number;
}

class ServicePackage extends Entity<ServicePackageProps> {
  static create(props: {
    serviceId: string;
    name: string;
    description: string;
    fixedPrice: number;
    durationMinutes: number;
    includes?: string[];
    variables?: Record<string, unknown>;
    sortOrder?: number;
  }): ServicePackage {
    if (!props.name || props.name.trim().length === 0) {
      throw new DomainError('Package name is required');
    }
    if (props.name.length > 200) {
      throw new DomainError('Package name must not exceed 200 characters');
    }
    if (!props.description || props.description.trim().length === 0) {
      throw new DomainError('Package description is required');
    }
    if (props.description.length > 2000) {
      throw new DomainError('Package description must not exceed 2000 characters');
    }
    if (props.fixedPrice <= 0) {
      throw new DomainError('Package price must be greater than 0');
    }
    if (props.durationMinutes <= 0) {
      throw new DomainError('Package duration must be greater than 0 minutes');
    }

    return new ServicePackage({
      serviceId: props.serviceId,
      name: props.name.trim(),
      description: props.description.trim(),
      fixedPrice: props.fixedPrice,
      durationMinutes: props.durationMinutes,
      includes: props.includes ?? [],
      variables: props.variables ?? {},
      isActive: true,
      sortOrder: props.sortOrder ?? 0,
    });
  }

  update(data: {
    name?: string;
    description?: string;
    fixedPrice?: number;
    durationMinutes?: number;
    includes?: string[];
    variables?: Record<string, unknown>;
    sortOrder?: number;
  }): void {
    if (data.name !== undefined) {
      if (!data.name || data.name.trim().length === 0) {
        throw new DomainError('Package name is required');
      }
      if (data.name.length > 200) {
        throw new DomainError('Package name must not exceed 200 characters');
      }
      this.props.name = data.name.trim();
    }
    if (data.description !== undefined) {
      if (!data.description || data.description.trim().length === 0) {
        throw new DomainError('Package description is required');
      }
      if (data.description.length > 2000) {
        throw new DomainError('Package description must not exceed 2000 characters');
      }
      this.props.description = data.description.trim();
    }
    if (data.fixedPrice !== undefined) {
      if (data.fixedPrice <= 0) {
        throw new DomainError('Package price must be greater than 0');
      }
      this.props.fixedPrice = data.fixedPrice;
    }
    if (data.durationMinutes !== undefined) {
      if (data.durationMinutes <= 0) {
        throw new DomainError('Package duration must be greater than 0 minutes');
      }
      this.props.durationMinutes = data.durationMinutes;
    }
    if (data.includes !== undefined) {
      this.props.includes = data.includes;
    }
    if (data.variables !== undefined) {
      this.props.variables = data.variables;
    }
    if (data.sortOrder !== undefined) {
      this.props.sortOrder = data.sortOrder;
    }
  }

  deactivate(): void {
    this.props.isActive = false;
  }

  activate(): void {
    this.props.isActive = true;
  }
}
```

---

## 4. Value Objects

### ServiceId

```typescript
class ServiceId {
  private constructor(private readonly value: string) {
    if (!ServiceId.isValid(value)) {
      throw new DomainError('Invalid ServiceId format');
    }
  }

  static create(value: string): ServiceId {
    return new ServiceId(value);
  }

  static generate(): ServiceId {
    return new ServiceId(crypto.randomUUID());
  }

  static isValid(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: ServiceId): boolean {
    return this.value === other.value;
  }
}
```

### CategoryId

```typescript
class CategoryId {
  private constructor(private readonly value: string) {
    if (!CategoryId.isValid(value)) {
      throw new DomainError('Invalid CategoryId format');
    }
  }

  static create(value: string): CategoryId {
    return new CategoryId(value);
  }

  static generate(): CategoryId {
    return new CategoryId(crypto.randomUUID());
  }

  static isValid(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: CategoryId): boolean {
    return this.value === other.value;
  }
}
```

### PackageId

```typescript
class PackageId {
  private constructor(private readonly value: string) {
    if (!PackageId.isValid(value)) {
      throw new DomainError('Invalid PackageId format');
    }
  }

  static create(value: string): PackageId {
    return new PackageId(value);
  }

  static generate(): PackageId {
    return new PackageId(crypto.randomUUID());
  }

  static isValid(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  toString(): string {
    return this.value;
  }

  equals(other: PackageId): boolean {
    return this.value === other.value;
  }
}
```

### Money

```typescript
class Money {
  private constructor(
    public readonly amount: number,
    public readonly currency: string,
  ) {}

  static create(amount: number, currency: string): Money {
    if (amount < 0) {
      throw new DomainError('Money amount cannot be negative');
    }
    if (!currency || currency.length !== 3) {
      throw new DomainError('Currency must be a 3-letter ISO 4217 code');
    }
    return new Money(amount, currency.toUpperCase());
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new DomainError('Cannot add Money with different currencies');
    }
    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new DomainError('Cannot subtract Money with different currencies');
    }
    if (this.amount < other.amount) {
      throw new DomainError('Resulting amount cannot be negative');
    }
    return new Money(this.amount - other.amount, this.currency);
  }

  multiply(factor: number): Money {
    if (factor < 0) {
      throw new DomainError('Multiplication factor cannot be negative');
    }
    return new Money(Math.round(this.amount * factor), this.currency);
  }

  isGreaterThan(other: Money): boolean {
    if (this.currency !== other.currency) {
      throw new DomainError('Cannot compare Money with different currencies');
    }
    return this.amount > other.amount;
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }

  toString(): string {
    return `${this.currency} ${(this.amount / 100).toFixed(2)}`;
  }
}
```

### Enums

```typescript
const ServiceStatus = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  PUBLISHED: 'published',
  REJECTED: 'rejected',
  UNPUBLISHED: 'unpublished',
  ARCHIVED: 'archived',
} as const;
type ServiceStatus = (typeof ServiceStatus)[keyof typeof ServiceStatus];

const PricingMode = {
  PACKAGE: 'package',
  HOURLY: 'hourly',
  QUOTE: 'quote',
} as const;
type PricingMode = (typeof PricingMode)[keyof typeof PricingMode];

const ServiceLocationType = {
  AT_CUSTOMER: 'at_customer',
  AT_PROVIDER: 'at_provider',
  REMOTE: 'remote',
  FLEXIBLE: 'flexible',
} as const;
type ServiceLocationType = (typeof ServiceLocationType)[keyof typeof ServiceLocationType];

const ProviderType = {
  INDIVIDUAL: 'individual',
  ORGANIZATION: 'organization',
} as const;
type ProviderType = (typeof ProviderType)[keyof typeof ProviderType];
```

---

## 5. Domain Events

### ServiceSubmitted

- **Trigger:** Provider submits a draft service for admin review.
- **Payload:**
  ```typescript
  interface ServiceSubmittedEvent {
    serviceId: string;
    ownerId: string;
    providerType: ProviderType;
    title: string;
    categoryId: string;
    submittedAt: Date;
  }
  ```
- **Handlers:**
  - Admin panel: Queue for admin review. Display in pending approvals list.
  - Communication BC: Notify admins that a new service is awaiting review.

### ServiceApproved

- **Trigger:** Admin approves a pending service.
- **Payload:**
  ```typescript
  interface ServiceApprovedEvent {
    serviceId: string;
    adminId: string;
    approvedAt: Date;
  }
  ```
- **Handlers:**
  - Communication BC: Notify the provider that their service has been approved and is ready to publish.

### ServiceRejected

- **Trigger:** Admin rejects a pending service with a reason.
- **Payload:**
  ```typescript
  interface ServiceRejectedEvent {
    serviceId: string;
    adminId: string;
    reason: string;
    rejectedAt: Date;
  }
  ```
- **Handlers:**
  - Communication BC: Notify the provider with the rejection reason so they can edit and resubmit.

### ServicePublished

- **Trigger:** Provider publishes an approved service, making it visible to customers.
- **Payload:**
  ```typescript
  interface ServicePublishedEvent {
    serviceId: string;
    ownerId: string;
    providerType: ProviderType;
    title: string;
    categoryId: string;
    serviceLocationType: ServiceLocationType;
    pricingMode: PricingMode;
    durationMinutes: number;
    bufferMinutes: number;
    publishedAt: Date;
  }
  ```
- **Handlers:**
  - Scheduling BC: Trigger slot generation using the service's duration and buffer configuration.
  - Pricing BC: Register the service for quote management and discount rule association.
  - Search/Discovery: Index the service for customer search results.

### ServiceUnpublished

- **Trigger:** Provider temporarily hides a published service.
- **Payload:**
  ```typescript
  interface ServiceUnpublishedEvent {
    serviceId: string;
    unpublishedAt: Date;
  }
  ```
- **Handlers:**
  - Search/Discovery: Remove the service from search results.
  - Scheduling BC: Pause slot generation for this service (existing bookings remain unaffected).

### ServiceArchived

- **Trigger:** Provider permanently archives a published service.
- **Payload:**
  ```typescript
  interface ServiceArchivedEvent {
    serviceId: string;
    archivedAt: Date;
  }
  ```
- **Handlers:**
  - Search/Discovery: Remove the service from search results permanently.
  - Scheduling BC: Stop slot generation for this service. Existing bookings remain unaffected.

---

## 6. Use Cases

### CreateService

- **Actor:** Provider (individual_provider role) or Organization owner/manager
- **Preconditions:** Actor has an active account. If individual provider, must have a Profile upgraded with provider fields. If organization, the organization must exist and the actor must be owner or manager.
- **Input:**
  ```typescript
  interface CreateServiceInput {
    providerType: ProviderType;
    providerId?: string;    // required for individual
    organizationId?: string;    // required for organization
    categoryId: string;
    title: string;
    description: string;
    serviceLocationType: ServiceLocationType;
    pricingMode: PricingMode;
    hourlyRate?: number;
    minimumHours?: number;
    durationMinutes: number;
    bufferMinutes: number;
    acceptsCustomQuotes?: boolean;
  }
  ```
- **Output:** `Service` (in `draft` status)
- **Process Flow:**
  1. Validate actor authorization (provider owns the profile, or is owner/manager of the organization).
  2. Validate the category exists and is active.
  3. Validate ownership rules (provider_id XOR organization_id based on provider_type).
  4. Validate location type constraints (individual cannot use at_provider).
  5. Validate pricing mode specifics (hourly_rate required for hourly mode).
  6. Create Service entity in `draft` status.
  7. Persist via ServiceRepository.
  8. Return created Service.
- **Events Raised:** None (draft creation is not an event-worthy action).
- **Error Cases:**
  - `UnauthorizedError`: Actor is not authorized for this provider/organization.
  - `CategoryNotFoundError`: Category does not exist.
  - `CategoryInactiveError`: Category is not active.
  - `ValidationError`: Invalid ownership combination, missing required fields, or constraint violations.

### UpdateService

- **Actor:** Provider (owner of the service) or Organization owner/manager
- **Preconditions:** Service exists and is in `draft` or `rejected` status.
- **Input:**
  ```typescript
  interface UpdateServiceInput {
    serviceId: string;
    callerId: string;
    title?: string;
    description?: string;
    serviceLocationType?: ServiceLocationType;
    pricingMode?: PricingMode;
    hourlyRate?: number | null;
    minimumHours?: number | null;
    durationMinutes?: number;
    bufferMinutes?: number;
    acceptsCustomQuotes?: boolean;
    categoryId?: string;
  }
  ```
- **Output:** Updated `Service`
- **Process Flow:**
  1. Load Service by ID.
  2. Verify caller is the service owner (provider_id or organization owner/manager).
  3. Verify service is in editable status (draft or rejected).
  4. Call `service.update(data)`. If service was rejected, it transitions back to draft.
  5. Persist via ServiceRepository.
  6. Return updated Service.
- **Events Raised:** None.
- **Error Cases:**
  - `ServiceNotFoundError`: Service does not exist.
  - `UnauthorizedError`: Caller is not the service owner.
  - `InvalidStateError`: Service is not in an editable status.
  - `ValidationError`: Invalid field values.

### SubmitServiceForApproval

- **Actor:** Provider (owner of the service) or Organization owner/manager
- **Preconditions:** Service is in `draft` status, has all required fields, and if pricing_mode is `package` then at least one active package exists.
- **Input:**
  ```typescript
  interface SubmitServiceForApprovalInput {
    serviceId: string;
    callerId: string;
  }
  ```
- **Output:** `Service` (in `pending_approval` status)
- **Process Flow:**
  1. Load Service by ID.
  2. Verify caller is the service owner.
  3. Call `service.submit()` which validates completeness and transitions status.
  4. Persist via ServiceRepository.
  5. Return updated Service.
- **Events Raised:** `ServiceSubmitted`
- **Error Cases:**
  - `ServiceNotFoundError`: Service does not exist.
  - `UnauthorizedError`: Caller is not the service owner.
  - `InvalidStateError`: Service is not in draft status.
  - `IncompleteServiceError`: Missing required fields or packages for package mode.

### ApproveService

- **Actor:** Admin
- **Preconditions:** Service exists in `pending_approval` status. Caller has `admin` role.
- **Input:**
  ```typescript
  interface ApproveServiceInput {
    serviceId: string;
    adminId: string;
  }
  ```
- **Output:** `Service` (in `approved` status)
- **Process Flow:**
  1. Load Service by ID.
  2. Verify caller has `admin` role.
  3. Verify service is in `pending_approval` status.
  4. Call `service.approve(adminId)`.
  5. Persist via ServiceRepository.
  6. Return updated Service.
- **Events Raised:** `ServiceApproved`
- **Error Cases:**
  - `ServiceNotFoundError`: Service does not exist.
  - `UnauthorizedError`: Caller is not an admin.
  - `InvalidStateError`: Service is not in pending_approval status.

### RejectService

- **Actor:** Admin
- **Preconditions:** Service exists in `pending_approval` status. Caller has `admin` role.
- **Input:**
  ```typescript
  interface RejectServiceInput {
    serviceId: string;
    adminId: string;
    reason: string;
  }
  ```
- **Output:** `Service` (in `rejected` status)
- **Process Flow:**
  1. Load Service by ID.
  2. Verify caller has `admin` role.
  3. Verify service is in `pending_approval` status.
  4. Call `service.reject(adminId, reason)`.
  5. Persist via ServiceRepository.
  6. Return updated Service.
- **Events Raised:** `ServiceRejected`
- **Error Cases:**
  - `ServiceNotFoundError`: Service does not exist.
  - `UnauthorizedError`: Caller is not an admin.
  - `InvalidStateError`: Service is not in pending_approval status.
  - `ValidationError`: Rejection reason is empty.

### PublishService

- **Actor:** Provider (owner of the service) or Organization owner/manager
- **Preconditions:** Service is in `approved` or `unpublished` status.
- **Input:**
  ```typescript
  interface PublishServiceInput {
    serviceId: string;
    callerId: string;
  }
  ```
- **Output:** `Service` (in `published` status)
- **Process Flow:**
  1. Load Service by ID.
  2. Verify caller is the service owner.
  3. Verify service is in `approved` or `unpublished` status.
  4. Call `service.publish()`.
  5. Persist via ServiceRepository.
  6. Return updated Service.
- **Events Raised:** `ServicePublished`
- **Error Cases:**
  - `ServiceNotFoundError`: Service does not exist.
  - `UnauthorizedError`: Caller is not the service owner.
  - `InvalidStateError`: Service is not in approved or unpublished status.
  - `IncompleteServiceError`: Package-mode service has no active packages.

### UnpublishService

- **Actor:** Provider (owner of the service) or Organization owner/manager
- **Preconditions:** Service is in `published` status.
- **Input:**
  ```typescript
  interface UnpublishServiceInput {
    serviceId: string;
    callerId: string;
  }
  ```
- **Output:** `Service` (in `unpublished` status)
- **Process Flow:**
  1. Load Service by ID.
  2. Verify caller is the service owner.
  3. Call `service.unpublish()`.
  4. Persist via ServiceRepository.
  5. Return updated Service.
- **Events Raised:** `ServiceUnpublished`
- **Error Cases:**
  - `ServiceNotFoundError`: Service does not exist.
  - `UnauthorizedError`: Caller is not the service owner.
  - `InvalidStateError`: Service is not in published status.

### ArchiveService

- **Actor:** Provider (owner of the service) or Organization owner/manager
- **Preconditions:** Service is in `published` status.
- **Input:**
  ```typescript
  interface ArchiveServiceInput {
    serviceId: string;
    callerId: string;
  }
  ```
- **Output:** `Service` (in `archived` status)
- **Process Flow:**
  1. Load Service by ID.
  2. Verify caller is the service owner.
  3. Call `service.archive()`.
  4. Persist via ServiceRepository.
  5. Return updated Service.
- **Events Raised:** `ServiceArchived`
- **Error Cases:**
  - `ServiceNotFoundError`: Service does not exist.
  - `UnauthorizedError`: Caller is not the service owner.
  - `InvalidStateError`: Service is not in published status.

### CreateServicePackage

- **Actor:** Provider (owner of the service) or Organization owner/manager
- **Preconditions:** Service exists. Service is in an editable state (draft or rejected) or any non-archived state (packages can be added to published services too, since new packages do not change the approved status).
- **Input:**
  ```typescript
  interface CreateServicePackageInput {
    serviceId: string;
    callerId: string;
    name: string;
    description: string;
    fixedPrice: number;
    durationMinutes: number;
    includes?: string[];
    variables?: Record<string, unknown>;
    sortOrder?: number;
  }
  ```
- **Output:** `ServicePackage`
- **Process Flow:**
  1. Load Service by ID (with packages).
  2. Verify caller is the service owner.
  3. Create ServicePackage entity.
  4. Call `service.addPackage(package)` which validates name uniqueness.
  5. Persist via ServiceRepository (saves the entire aggregate).
  6. Return created ServicePackage.
- **Events Raised:** None.
- **Error Cases:**
  - `ServiceNotFoundError`: Service does not exist.
  - `UnauthorizedError`: Caller is not the service owner.
  - `DuplicatePackageNameError`: A package with the same name already exists.
  - `ValidationError`: Invalid price, duration, or name.

### UpdateServicePackage

- **Actor:** Provider (owner of the service) or Organization owner/manager
- **Preconditions:** Service and package exist.
- **Input:**
  ```typescript
  interface UpdateServicePackageInput {
    serviceId: string;
    packageId: string;
    callerId: string;
    name?: string;
    description?: string;
    fixedPrice?: number;
    durationMinutes?: number;
    includes?: string[];
    variables?: Record<string, unknown>;
    sortOrder?: number;
  }
  ```
- **Output:** Updated `ServicePackage`
- **Process Flow:**
  1. Load Service by ID (with packages).
  2. Verify caller is the service owner.
  3. Call `service.updatePackage(packageId, data)`.
  4. Persist via ServiceRepository.
  5. Return updated ServicePackage.
- **Events Raised:** None.
- **Error Cases:**
  - `ServiceNotFoundError`: Service does not exist.
  - `PackageNotFoundError`: Package does not exist in this service.
  - `UnauthorizedError`: Caller is not the service owner.
  - `DuplicatePackageNameError`: Another active package has the same name.
  - `ValidationError`: Invalid field values.

### DeactivateServicePackage

- **Actor:** Provider (owner of the service) or Organization owner/manager
- **Preconditions:** Service and package exist. Package is currently active. If pricing_mode is `package`, this is not the last active package.
- **Input:**
  ```typescript
  interface DeactivateServicePackageInput {
    serviceId: string;
    packageId: string;
    callerId: string;
  }
  ```
- **Output:** Updated `ServicePackage` (is_active = false)
- **Process Flow:**
  1. Load Service by ID (with packages).
  2. Verify caller is the service owner.
  3. Call `service.deactivatePackage(packageId)` which enforces the last-package invariant.
  4. Persist via ServiceRepository.
  5. Return updated ServicePackage.
- **Events Raised:** None.
- **Error Cases:**
  - `ServiceNotFoundError`: Service does not exist.
  - `PackageNotFoundError`: Package does not exist in this service.
  - `UnauthorizedError`: Caller is not the service owner.
  - `LastActivePackageError`: Cannot deactivate the last active package for a package-priced service.

### ManageCategories (Admin Use Cases)

#### CreateCategory

- **Actor:** Admin
- **Input:**
  ```typescript
  interface CreateCategoryInput {
    adminId: string;
    name: string;
    description: string;
    iconUrl?: string;
    parentCategoryId?: string;
    sortOrder?: number;
  }
  ```
- **Output:** `ServiceCategory`
- **Process Flow:**
  1. Verify caller has `admin` role.
  2. If parentCategoryId is provided, validate the parent category exists and is a root category (enforce max 2 levels).
  3. Validate name uniqueness within the same parent level.
  4. Create ServiceCategory entity.
  5. Persist via ServiceCategoryRepository.
  6. Return created ServiceCategory.
- **Error Cases:**
  - `UnauthorizedError`: Caller is not an admin.
  - `ParentCategoryNotFoundError`: Parent category does not exist.
  - `NestingLimitError`: Attempting to create a child of a child category (exceeds 2 levels).
  - `DuplicateCategoryNameError`: Name already exists at this level.

#### UpdateCategory

- **Actor:** Admin
- **Input:**
  ```typescript
  interface UpdateCategoryInput {
    adminId: string;
    categoryId: string;
    name?: string;
    description?: string;
    iconUrl?: string | null;
  }
  ```
- **Output:** Updated `ServiceCategory`
- **Process Flow:**
  1. Verify caller has `admin` role.
  2. Load category by ID.
  3. If name is changing, validate uniqueness within the same parent level.
  4. Call `category.update(data)`.
  5. Persist via ServiceCategoryRepository.
  6. Return updated ServiceCategory.
- **Error Cases:**
  - `UnauthorizedError`: Caller is not an admin.
  - `CategoryNotFoundError`: Category does not exist.
  - `DuplicateCategoryNameError`: New name conflicts with an existing sibling.

#### DeactivateCategory

- **Actor:** Admin
- **Input:**
  ```typescript
  interface DeactivateCategoryInput {
    adminId: string;
    categoryId: string;
  }
  ```
- **Output:** Updated `ServiceCategory` (is_active = false)
- **Process Flow:**
  1. Verify caller has `admin` role.
  2. Load category by ID.
  3. Count active (published) services in this category.
  4. Call `category.deactivate(activeServiceCount)` which prevents deactivation if services exist.
  5. Persist via ServiceCategoryRepository.
  6. Return updated ServiceCategory.
- **Error Cases:**
  - `UnauthorizedError`: Caller is not an admin.
  - `CategoryNotFoundError`: Category does not exist.
  - `CategoryHasActiveServicesError`: Cannot deactivate with active services.

#### ReorderCategories

- **Actor:** Admin
- **Input:**
  ```typescript
  interface ReorderCategoriesInput {
    adminId: string;
    orderedIds: Array<{ categoryId: string; sortOrder: number }>;
  }
  ```
- **Output:** `void`
- **Process Flow:**
  1. Verify caller has `admin` role.
  2. Load all specified categories.
  3. Apply new sort orders via `category.reorder(newSortOrder)`.
  4. Persist all updated categories.
- **Error Cases:**
  - `UnauthorizedError`: Caller is not an admin.
  - `CategoryNotFoundError`: One or more categories do not exist.

---

## 7. Repository Ports

```typescript
interface ServiceCategoryRepository {
  findById(id: string): Promise<ServiceCategory | null>;
  findByParent(parentId: string | null): Promise<ServiceCategory[]>;
  findActive(): Promise<ServiceCategory[]>;
  findActiveByParent(parentId: string | null): Promise<ServiceCategory[]>;
  findAll(): Promise<ServiceCategory[]>;
  findByNameAndParent(name: string, parentId: string | null): Promise<ServiceCategory | null>;
  countActiveServicesByCategory(categoryId: string): Promise<number>;
  save(category: ServiceCategory): Promise<void>;
  saveMany(categories: ServiceCategory[]): Promise<void>;
}

interface ServiceRepository {
  findById(id: string): Promise<Service | null>;
  findByIdWithPackages(id: string): Promise<Service | null>;
  findByProvider(providerId: string): Promise<Service[]>;
  findByOrganization(organizationId: string): Promise<Service[]>;
  findByCategory(categoryId: string): Promise<Service[]>;
  findPublished(filters: ServiceFilters): Promise<{ services: Service[]; total: number }>;
  findPendingApproval(limit: number, offset: number): Promise<{ services: Service[]; total: number }>;
  findByStatus(status: ServiceStatus): Promise<Service[]>;
  countPublishedByCategory(categoryId: string): Promise<number>;
  save(service: Service): Promise<void>;
}

interface ServiceFilters {
  categoryId?: string;
  providerType?: ProviderType;
  serviceLocationType?: ServiceLocationType;
  pricingMode?: PricingMode;
  keyword?: string;
  minPrice?: number;
  maxPrice?: number;
  limit: number;
  offset: number;
  sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'newest';
}
```

**Note:** `ServicePackageRepository` is not needed as a separate port. Packages are always accessed and persisted through the Service aggregate root via `ServiceRepository`. This enforces the aggregate boundary and ensures invariants (like the last-active-package check) are always validated.

---

## 8. Entity Schemas

### Service Categories Table

| Column | Type | Constraints |
|--------|------|------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `name` | `varchar(100)` | NOT NULL |
| `description` | `varchar(500)` | NOT NULL |
| `icon_url` | `text` | nullable |
| `parent_category_id` | `uuid` | FK -> `service_categories.id`, nullable, ON DELETE SET NULL |
| `is_active` | `boolean` | NOT NULL, default `true` |
| `sort_order` | `integer` | NOT NULL, default `0` |
| `created_at` | `timestamptz` | NOT NULL, default `now()` |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` |

**Indexes:**
- `idx_service_categories_parent` on `parent_category_id`
- `idx_service_categories_is_active` on `is_active`
- `uq_service_categories_name_parent` UNIQUE on (`name`, `parent_category_id`) -- enforces name uniqueness per level

### Services Table

| Column | Type | Constraints |
|--------|------|------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `provider_type` | `varchar(20)` | NOT NULL, CHECK IN (`individual`, `organization`) |
| `provider_id` | `uuid` | FK -> `users.id`, nullable, ON DELETE SET NULL |
| `organization_id` | `uuid` | FK -> `organizations.id`, nullable, ON DELETE SET NULL |
| `category_id` | `uuid` | FK -> `service_categories.id`, NOT NULL, ON DELETE RESTRICT |
| `title` | `varchar(200)` | NOT NULL |
| `description` | `text` | NOT NULL |
| `service_location_type` | `varchar(20)` | NOT NULL, CHECK IN (`at_customer`, `at_provider`, `remote`, `flexible`) |
| `pricing_mode` | `varchar(20)` | NOT NULL, CHECK IN (`package`, `hourly`, `quote`) |
| `hourly_rate` | `decimal(12,2)` | nullable |
| `minimum_hours` | `decimal(4,2)` | nullable, default `1.00` |
| `duration_minutes` | `integer` | NOT NULL, CHECK `> 0` |
| `buffer_minutes` | `integer` | NOT NULL, default `0`, CHECK `>= 0` |
| `accepts_custom_quotes` | `boolean` | NOT NULL, default `false` |
| `status` | `varchar(20)` | NOT NULL, default `'draft'`, CHECK IN (`draft`, `pending_approval`, `approved`, `published`, `rejected`, `unpublished`, `archived`) |
| `submitted_at` | `timestamptz` | nullable |
| `approved_at` | `timestamptz` | nullable |
| `rejected_at` | `timestamptz` | nullable |
| `rejection_reason` | `text` | nullable |
| `published_at` | `timestamptz` | nullable |
| `created_at` | `timestamptz` | NOT NULL, default `now()` |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` |

**Indexes:**
- `idx_services_category_id` on `category_id`
- `idx_services_provider_id` on `provider_id`
- `idx_services_organization_id` on `organization_id`
- `idx_services_status` on `status`
- `idx_services_provider_type` on `provider_type`
- `idx_services_pricing_mode` on `pricing_mode`
- `idx_services_published` on `status, category_id` WHERE status = 'published' (partial index for marketplace queries)

### Service Packages Table

| Column | Type | Constraints |
|--------|------|------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `service_id` | `uuid` | FK -> `services.id`, NOT NULL, ON DELETE CASCADE |
| `name` | `varchar(200)` | NOT NULL |
| `description` | `text` | NOT NULL |
| `fixed_price` | `decimal(12,2)` | NOT NULL, CHECK `> 0` |
| `duration_minutes` | `integer` | NOT NULL, CHECK `> 0` |
| `includes` | `jsonb` | NOT NULL, default `'[]'::jsonb` |
| `variables` | `jsonb` | NOT NULL, default `'{}'::jsonb` |
| `is_active` | `boolean` | NOT NULL, default `true` |
| `sort_order` | `integer` | NOT NULL, default `0` |
| `created_at` | `timestamptz` | NOT NULL, default `now()` |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` |

**Indexes:**
- `idx_service_packages_service_id` on `service_id`
- `idx_service_packages_is_active` on `is_active`
- `uq_service_packages_name_service` UNIQUE on (`service_id`, `name`) WHERE `is_active = true` (partial unique index)

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
import { users } from './user-schema';
import { organizations } from './user-schema';

export const serviceCategories = pgTable(
  'service_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    description: varchar('description', { length: 500 }).notNull(),
    iconUrl: text('icon_url'),
    parentCategoryId: uuid('parent_category_id').references(
      (): any => serviceCategories.id,
      { onDelete: 'set null' }
    ),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_service_categories_parent').on(table.parentCategoryId),
    index('idx_service_categories_is_active').on(table.isActive),
    uniqueIndex('uq_service_categories_name_parent').on(table.name, table.parentCategoryId),
  ],
);

export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    providerType: varchar('provider_type', { length: 20 }).notNull(),
    providerId: uuid('provider_id').references(() => users.id, { onDelete: 'set null' }),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => serviceCategories.id, { onDelete: 'restrict' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description').notNull(),
    serviceLocationType: varchar('service_location_type', { length: 20 }).notNull(),
    pricingMode: varchar('pricing_mode', { length: 20 }).notNull(),
    hourlyRate: decimal('hourly_rate', { precision: 12, scale: 2 }),
    minimumHours: decimal('minimum_hours', { precision: 4, scale: 2 }).default('1.00'),
    durationMinutes: integer('duration_minutes').notNull(),
    bufferMinutes: integer('buffer_minutes').notNull().default(0),
    acceptsCustomQuotes: boolean('accepts_custom_quotes').notNull().default(false),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_services_category_id').on(table.categoryId),
    index('idx_services_provider_id').on(table.providerId),
    index('idx_services_organization_id').on(table.organizationId),
    index('idx_services_status').on(table.status),
    index('idx_services_provider_type').on(table.providerType),
    index('idx_services_pricing_mode').on(table.pricingMode),
    check(
      'provider_type_check',
      sql`${table.providerType} IN ('individual', 'organization')`,
    ),
    check(
      'service_location_type_check',
      sql`${table.serviceLocationType} IN ('at_customer', 'at_provider', 'remote', 'flexible')`,
    ),
    check(
      'pricing_mode_check',
      sql`${table.pricingMode} IN ('package', 'hourly', 'quote')`,
    ),
    check(
      'service_status_check',
      sql`${table.status} IN ('draft', 'pending_approval', 'approved', 'published', 'rejected', 'unpublished', 'archived')`,
    ),
    check(
      'duration_positive_check',
      sql`${table.durationMinutes} > 0`,
    ),
    check(
      'buffer_non_negative_check',
      sql`${table.bufferMinutes} >= 0`,
    ),
    check(
      'ownership_check',
      sql`(${table.providerType} = 'individual' AND ${table.providerId} IS NOT NULL AND ${table.organizationId} IS NULL)
       OR (${table.providerType} = 'organization' AND ${table.organizationId} IS NOT NULL AND ${table.providerId} IS NULL)`,
    ),
    check(
      'individual_location_check',
      sql`NOT (${table.providerType} = 'individual' AND ${table.serviceLocationType} = 'at_provider')`,
    ),
    check(
      'hourly_rate_check',
      sql`NOT (${table.pricingMode} = 'hourly' AND (${table.hourlyRate} IS NULL OR ${table.hourlyRate} <= 0))`,
    ),
  ],
);

export const servicePackages = pgTable(
  'service_packages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description').notNull(),
    fixedPrice: decimal('fixed_price', { precision: 12, scale: 2 }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    includes: jsonb('includes').notNull().default(sql`'[]'::jsonb`),
    variables: jsonb('variables').notNull().default(sql`'{}'::jsonb`),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_service_packages_service_id').on(table.serviceId),
    index('idx_service_packages_is_active').on(table.isActive),
    uniqueIndex('uq_service_packages_name_service')
      .on(table.serviceId, table.name)
      .where(sql`${table.isActive} = true`),
    check(
      'fixed_price_positive_check',
      sql`${table.fixedPrice} > 0`,
    ),
    check(
      'package_duration_positive_check',
      sql`${table.durationMinutes} > 0`,
    ),
  ],
);
```

---

## 9. Business Rules & Invariants

### Category Rules

| # | Rule | Enforcement |
|---|------|-------------|
| CAT1 | Category name must be unique within the same parent level. | DB unique constraint on (`name`, `parent_category_id`) + domain validation |
| CAT2 | Maximum 2 levels of nesting (root + child). A child category cannot have children. | Use case validation when creating a category with a parent |
| CAT3 | Cannot deactivate a category that has active (published) services. | Domain logic in `ServiceCategory.deactivate()` + repository count query |
| CAT4 | Sort order determines display position within sibling categories. | Domain logic, client-side rendering |
| CAT5 | A parent category cannot reference itself. | Use case validation at creation time |
| CAT6 | Root categories appear first in navigation; child categories appear nested under their parent. | Client-side rendering based on `parent_category_id` and `sort_order` |

### Service Rules

| # | Rule | Enforcement |
|---|------|-------------|
| SVC1 | A service must belong to either `provider_id` (individual) or `organization_id` (organization), never both, never neither. | DB CHECK constraint + domain logic in `Service.create()` |
| SVC2 | Individual providers cannot use `at_provider` location type. | DB CHECK constraint + domain logic in `Service.create()` and `Service.update()` |
| SVC3 | If pricing_mode is `hourly`, `hourly_rate` must be set and > 0. | DB CHECK constraint + domain logic |
| SVC4 | If pricing_mode is `package`, at least one active ServicePackage must exist before submission and publication. | Domain logic in `Service.submit()` and `Service.publish()` |
| SVC5 | `duration_minutes` must be > 0. | DB CHECK constraint + domain logic |
| SVC6 | `buffer_minutes` must be >= 0. | DB CHECK constraint + domain logic |
| SVC7 | Service can only be submitted for approval from `draft` status. | Domain logic in `Service.submit()` |
| SVC8 | Service can only be approved or rejected from `pending_approval` status. | Domain logic in `Service.approve()` and `Service.reject()` |
| SVC9 | Service can only be published from `approved` or `unpublished` status. | Domain logic in `Service.publish()` |
| SVC10 | Only admin users can approve or reject services. | Use case authorization check |
| SVC11 | Rejected services transition to `draft` when the provider edits them, allowing resubmission. | Domain logic in `Service.update()` |
| SVC12 | Re-publishing an unpublished service does not require re-approval. | Domain logic in `Service.publish()` (accepts `unpublished` status) |
| SVC13 | Archiving is a terminal state from `published`. Archived services cannot be re-published. | Domain logic - no transition out of `archived` |
| SVC14 | Service title must be 1-200 characters. | Domain logic + DB varchar(200) |
| SVC15 | Service description must be 1-5000 characters. | Domain logic |

### Package Rules

| # | Rule | Enforcement |
|---|------|-------------|
| PKG1 | `fixed_price` must be > 0. | DB CHECK constraint + domain logic |
| PKG2 | `duration_minutes` must be > 0. | DB CHECK constraint + domain logic |
| PKG3 | Package name must be unique among active packages within the same service. | Domain logic in `Service.addPackage()` and `Service.updatePackage()` |
| PKG4 | Cannot deactivate the last active package if the parent service's pricing_mode is `package`. | Domain logic in `Service.deactivatePackage()` |
| PKG5 | Package name must be 1-200 characters. | Domain logic + DB varchar(200) |
| PKG6 | Package description must be 1-2000 characters. | Domain logic |

### Category-to-Pricing Mapping Defaults

Each service category has a **recommended default pricing mode** that is suggested to providers during service creation. Providers can override the default.

| Category | Default Pricing Mode | Recommended Engagement | Rationale |
|----------|---------------------|----------------------|-----------|
| Home Cleaning | Package | One-time or Recurring | Customers need price certainty; weekly cleaning is common |
| Repairs | Package or Quote | One-time | Simple fixes = package; complex = quote |
| Assembly | Package | One-time | Price per item type is predictable |
| Moving | Quote | One-time | Varies heavily by volume and distance |
| Gardening | Hourly or Package | One-time or Recurring | Ongoing = recurring weekly; one-time = package |
| Personal Services | Hourly | One-time or Recurring | Time-based; can be recurring weekly |
| Events | Quote | One-time | Highly customized per event |
| Beauty | Package | One-time or Recurring | Standardized services; monthly haircuts common |
| Tutoring | Hourly or Package | One-time or Recurring | Per session; recurring weekly/biweekly common |
| Technology | Quote | One-time | Scope varies widely |
| Professional | Quote or Subscription | One-time or Subscription | Accounting, legal = monthly subscription; one-off consulting = quote |
| Automotive | Package | One-time | Standardized services (oil change, tire rotation) |

---

## 10. Cross-Context Dependencies

### Upstream Dependencies (Depends On)

| Source BC | What Catalog Needs | How It Gets It |
|-----------|-------------------|----------------|
| **User** | Provider identity (user_id, roles) to validate service ownership. Organization identity (organization_id, members) to validate organization service ownership. Verification status to gate publishing. | Queries User BC read models for provider/organization details. Subscribes to `ProviderVerified` and `OrganizationVerified` events to enable publishing. Subscribes to `UserSuspended` to deactivate all provider services. |

### Downstream Dependents (Depended On By)

| Consuming BC | What It Needs | How It Gets It |
|-------------|---------------|----------------|
| **Scheduling** | Service `duration_minutes` and `buffer_minutes` to generate time slots. Service `provider_type` and owner to determine slot owner. | Consumes `ServicePublished` event to trigger slot generation. Consumes `ServiceUnpublished` and `ServiceArchived` to pause/stop slot generation. |
| **Pricing** | Service identity for quote management and discount rule association. Service `pricing_mode` to determine applicable pricing strategies. | Consumes `ServicePublished` event to register the service. Queries Catalog read models for service details. |
| **Booking** | Service details (title, description, pricing_mode, duration) and package details (name, fixed_price, includes) to create bookings and capture snapshots. | Queries Catalog read models for service and package data at booking time. |

### Events Published

| Event | Consumers |
|-------|-----------|
| `ServiceSubmitted` | Admin panel (queue for review), Communication (notify admins) |
| `ServiceApproved` | Communication (notify provider) |
| `ServiceRejected` | Communication (notify provider with reason) |
| `ServicePublished` | Scheduling (trigger slot generation), Pricing (register service), Search (index for discovery) |
| `ServiceUnpublished` | Scheduling (pause slot generation), Search (remove from index) |
| `ServiceArchived` | Scheduling (stop slot generation), Search (remove from index) |

### Events Subscribed

| Event | Source BC | Handler |
|-------|----------|---------|
| `ProviderVerified` | User | Marks the provider as eligible to publish services. No direct data mutation; the publishing use case checks verification status at publish time. |
| `OrganizationVerified` | User | Marks the organization as eligible to publish services. Same gating mechanism as provider verification. |
| `UserSuspended` | User | Deactivates all published services by the suspended user. Transitions published services to `unpublished` and raises `ServiceUnpublished` events for each affected service. |

### Integration Pattern

The Catalog BC uses the **Conformist** pattern upstream (it conforms to User BC's model for identity and verification). Downstream, it uses the **Published Language** pattern, publishing well-defined domain events that Scheduling, Pricing, and Booking BCs consume. Downstream BCs may maintain local read-model copies of essential service data (service_id, title, duration_minutes, buffer_minutes, pricing_mode) denormalized for query performance, updated via domain events. They never write back to the Catalog BC's data store.
