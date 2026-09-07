export interface RemoveListInput {
  /** From the session, never from the request. */
  requesterUserId: string;
  listId: string;
}

export interface RemoveListOutput {
  /** Whatever the repository's own `remove` reported. See its doc comment. */
  removed: boolean;
}

export interface RemoveListPort {
  execute(input: RemoveListInput): Promise<RemoveListOutput>;
}
