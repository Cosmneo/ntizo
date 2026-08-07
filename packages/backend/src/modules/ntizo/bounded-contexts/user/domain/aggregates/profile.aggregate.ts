// Profile aggregate — extended personal data, one-to-one with User.

import type { Locale } from "@ntizo/shared";

export interface ProfileProps {
  userId: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  avatarUrl: string | null;
  phoneNumber: string | null;
  bio: string | null;
  language: Locale;
  timezone: string;
  dateOfBirth: Date | null;
  gender: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function computeDisplayName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

export class Profile {
  private constructor(private readonly props: ProfileProps) {}

  static rehydrate(props: ProfileProps): Profile {
    return new Profile(props);
  }

  static create(params: {
    userId: string;
    firstName: string;
    lastName: string;
    displayName?: string;
    language?: Locale;
    timezone?: string;
  }): Profile {
    const now = new Date();
    const firstName = params.firstName ?? "";
    const lastName = params.lastName ?? "";
    const displayName =
      params.displayName !== undefined
        ? params.displayName
        : computeDisplayName(firstName, lastName);
    return new Profile({
      userId: params.userId,
      firstName,
      lastName,
      displayName: displayName === "" ? "" : displayName,
      avatarUrl: null,
      phoneNumber: null,
      bio: null,
      language: params.language ?? "en-US",
      timezone: params.timezone ?? "UTC",
      dateOfBirth: null,
      gender: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  get userId() {
    return this.props.userId;
  }
  get firstName() {
    return this.props.firstName;
  }
  get lastName() {
    return this.props.lastName;
  }
  get displayName(): string {
    return (
      this.props.displayName ??
      computeDisplayName(this.props.firstName, this.props.lastName)
    );
  }
  get avatarUrl() {
    return this.props.avatarUrl;
  }
  get phoneNumber() {
    return this.props.phoneNumber;
  }
  get bio() {
    return this.props.bio;
  }
  get language() {
    return this.props.language;
  }
  get timezone() {
    return this.props.timezone;
  }
  get dateOfBirth() {
    return this.props.dateOfBirth;
  }
  get gender() {
    return this.props.gender;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }

  updateName(params: {
    firstName?: string;
    lastName?: string;
    displayName?: string;
  }): void {
    const nameChanged =
      params.firstName !== undefined || params.lastName !== undefined;
    if (params.firstName !== undefined) this.props.firstName = params.firstName;
    if (params.lastName !== undefined) this.props.lastName = params.lastName;
    if (params.displayName !== undefined) {
      this.props.displayName = params.displayName;
    } else if (nameChanged) {
      this.props.displayName = computeDisplayName(
        this.props.firstName,
        this.props.lastName,
      );
    }
    this.props.updatedAt = new Date();
  }

  updateContact(params: {
    phoneNumber?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
  }): void {
    if (params.phoneNumber !== undefined)
      this.props.phoneNumber = params.phoneNumber;
    if (params.bio !== undefined) this.props.bio = params.bio;
    if (params.avatarUrl !== undefined)
      this.props.avatarUrl = params.avatarUrl;
    this.props.updatedAt = new Date();
  }

  updatePreferences(params: { language?: Locale; timezone?: string }): void {
    if (params.language !== undefined) this.props.language = params.language;
    if (params.timezone !== undefined) this.props.timezone = params.timezone;
    this.props.updatedAt = new Date();
  }

  toJSON(): ProfileProps {
    return { ...this.props };
  }
}
