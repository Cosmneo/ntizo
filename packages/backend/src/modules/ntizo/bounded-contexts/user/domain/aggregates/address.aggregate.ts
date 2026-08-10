// Address aggregate — a customer's saved places. Many per user.

export interface AddressProps {
  id: string;
  userId: string;
  label: string;
  country: string;
  city: string;
  district: string | null;
  line1: string;
  line2: string | null;
  postalCode: string | null;
  directions: string | null;
  latitude: string | null;
  longitude: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class Address {
  private constructor(private readonly props: AddressProps) {}

  static rehydrate(props: AddressProps): Address {
    return new Address(props);
  }

  static create(params: {
    id: string;
    userId: string;
    label: string;
    country: string;
    city: string;
    line1: string;
    district?: string | null;
    line2?: string | null;
    postalCode?: string | null;
    directions?: string | null;
    latitude?: string | null;
    longitude?: string | null;
    isDefault?: boolean;
  }): Address {
    const now = new Date();
    return new Address({
      id: params.id,
      userId: params.userId,
      // Trimmed on the way in, not on the way out. A label of " Casa " and one
      // of "Casa" are the same place, and only one of them sorts correctly.
      label: params.label.trim(),
      country: params.country.trim().toUpperCase(),
      city: params.city.trim(),
      district: params.district?.trim() || null,
      line1: params.line1.trim(),
      line2: params.line2?.trim() || null,
      postalCode: params.postalCode?.trim() || null,
      directions: params.directions?.trim() || null,
      latitude: params.latitude ?? null,
      longitude: params.longitude ?? null,
      isDefault: params.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
    });
  }

  get id() {
    return this.props.id;
  }
  get userId() {
    return this.props.userId;
  }
  get isDefault() {
    return this.props.isDefault;
  }

  update(params: {
    label?: string;
    country?: string;
    city?: string;
    district?: string | null;
    line1?: string;
    line2?: string | null;
    postalCode?: string | null;
    directions?: string | null;
    latitude?: string | null;
    longitude?: string | null;
  }): void {
    if (params.label !== undefined) this.props.label = params.label.trim();
    if (params.country !== undefined)
      this.props.country = params.country.trim().toUpperCase();
    if (params.city !== undefined) this.props.city = params.city.trim();
    if (params.district !== undefined)
      this.props.district = params.district?.trim() || null;
    if (params.line1 !== undefined) this.props.line1 = params.line1.trim();
    if (params.line2 !== undefined) this.props.line2 = params.line2?.trim() || null;
    if (params.postalCode !== undefined)
      this.props.postalCode = params.postalCode?.trim() || null;
    if (params.directions !== undefined)
      this.props.directions = params.directions?.trim() || null;
    if (params.latitude !== undefined) this.props.latitude = params.latitude;
    if (params.longitude !== undefined) this.props.longitude = params.longitude;
    this.props.updatedAt = new Date();
  }

  /**
   * Made or unmade the default.
   *
   * Deliberately does not reach for the user's other addresses: an aggregate
   * cannot see its siblings, and "exactly one default" is a rule about the
   * set, not about any one member. The command that promotes one demotes the
   * rest inside the same transaction.
   */
  setDefault(isDefault: boolean): void {
    this.props.isDefault = isDefault;
    this.props.updatedAt = new Date();
  }

  toJSON(): AddressProps {
    return { ...this.props };
  }
}
