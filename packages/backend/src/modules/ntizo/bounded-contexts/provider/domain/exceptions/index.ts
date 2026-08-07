// Provider BC domain exceptions.

export class ProviderNotFoundError extends Error {
  constructor(id: string) {
    super(`Provider not found: ${id}`);
    this.name = "ProviderNotFoundError";
  }
}

export class NotProviderOwnerError extends Error {
  constructor(providerId: string, userId: string) {
    super(`User ${userId} is not the owner of provider ${providerId}`);
    this.name = "NotProviderOwnerError";
  }
}

export class InsufficientProviderPermissionsError extends Error {
  constructor(providerId: string, userId: string) {
    super(
      `User ${userId} lacks the required role on provider ${providerId}`,
    );
    this.name = "InsufficientProviderPermissionsError";
  }
}

export class InviteExpiredError extends Error {
  constructor(token: string) {
    super(`Invite token expired: ${token}`);
    this.name = "InviteExpiredError";
  }
}

export class InviteAlreadyUsedError extends Error {
  constructor(token: string) {
    super(`Invite token already used or revoked: ${token}`);
    this.name = "InviteAlreadyUsedError";
  }
}

export class InviteNotFoundError extends Error {
  constructor(token: string) {
    super(`Invite not found: ${token}`);
    this.name = "InviteNotFoundError";
  }
}

export class MemberAlreadyExistsError extends Error {
  constructor(providerId: string, userId: string) {
    super(`User ${userId} is already a member of provider ${providerId}`);
    this.name = "MemberAlreadyExistsError";
  }
}

export class MemberNotFoundError extends Error {
  constructor(providerId: string, userId: string) {
    super(`User ${userId} is not a member of provider ${providerId}`);
    this.name = "MemberNotFoundError";
  }
}

export class IndividualProviderCannotHaveMembersError extends Error {
  constructor(providerId: string) {
    super(
      `Provider ${providerId} is of type "individual" and cannot have additional members`,
    );
    this.name = "IndividualProviderCannotHaveMembersError";
  }
}
