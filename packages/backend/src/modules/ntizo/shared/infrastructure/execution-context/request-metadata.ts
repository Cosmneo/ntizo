export interface RequestMetadata {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
  receivedAt: Date;
}
