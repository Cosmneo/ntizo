export interface CreateUserOnSignUpInternalInput {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface CreateUserOnSignUpInternalPort {
  execute(input: CreateUserOnSignUpInternalInput): Promise<void>;
}
