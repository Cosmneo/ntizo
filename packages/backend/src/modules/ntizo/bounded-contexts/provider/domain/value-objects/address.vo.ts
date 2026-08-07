// Address value object — embedded in the Provider aggregate.
// Persistence layer flattens it onto the provider table; a future shared
// `addresses` table can replace this. See REQUIREMENTS v3.1 §"Address VO".

export interface AddressProps {
  street?: string;
  city?: string;
  district?: string;
  country?: string;
  postalCode?: string;
  lat?: number;
  lng?: number;
}

export class Address {
  private constructor(private readonly props: AddressProps) {}

  static create(props: AddressProps): Address {
    return new Address({ ...props });
  }

  get street() {
    return this.props.street;
  }
  get city() {
    return this.props.city;
  }
  get district() {
    return this.props.district;
  }
  get country() {
    return this.props.country;
  }
  get postalCode() {
    return this.props.postalCode;
  }
  get lat() {
    return this.props.lat;
  }
  get lng() {
    return this.props.lng;
  }

  toJSON(): AddressProps {
    return { ...this.props };
  }

  equals(other: Address): boolean {
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}
