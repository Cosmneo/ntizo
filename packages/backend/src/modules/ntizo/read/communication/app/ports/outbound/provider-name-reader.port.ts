/**
 * A batch of providers' current names, as an inbox row needs one to label
 * itself.
 *
 * A read-tier port of its own — like `read/provider` and `read/user` own
 * theirs — rather than an addition to the write tier's `ProviderReaderPort`
 * (`bounded-contexts/communication/app/ports/outbound/provider-reader.port.ts`):
 * that port answers two authorization questions `StartThreadCommand` needs
 * ("can this provider be messaged", "is this person a member"). A display
 * name is neither, and belongs with the read that renders it, not the write
 * path that gates one.
 *
 * Batched, not a `findNameById` called once per row: an inbox page can name
 * several providers, and a lookup per row is exactly the shape
 * `MessageRepositoryPort.countUnreadForViewer`'s own doc comment already
 * warns off — one query for the whole page, not one per row.
 */
export interface ProviderNameReaderPort {
  /** Provider id → current name. A provider absent from the map no longer exists (or never did). */
  findNamesByIds(providerIds: string[]): Promise<Map<string, string>>;
}
