export interface RenameListInput {
  /** From the session, never from the request. */
  requesterUserId: string;
  listId: string;
  name: string;
}

/** No output type: a rename has nothing to report back beyond success. */
export interface RenameListPort {
  execute(input: RenameListInput): Promise<void>;
}
