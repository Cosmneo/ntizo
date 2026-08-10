export interface CreateUserOnSignUpInternalInput {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  /** E.164, or null. Written onto the Profile so it matches the auth user. */
  phoneNumber?: string | null;
}

export interface CreateUserOnSignUpInternalPort {
  execute(input: CreateUserOnSignUpInternalInput): Promise<void>;
}
