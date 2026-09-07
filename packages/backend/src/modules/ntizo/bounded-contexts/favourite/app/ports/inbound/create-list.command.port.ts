export interface CreateListInput {
  /** From the session, never from the request. */
  requesterUserId: string;
  name: string;
}

export interface CreateListOutput {
  /** The new list's id, straight off the repository's `save`. */
  id: string;
}

export interface CreateListPort {
  execute(input: CreateListInput): Promise<CreateListOutput>;
}
