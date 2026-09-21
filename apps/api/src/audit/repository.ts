export interface AuditEventInput {
  actorType: 'api_token' | 'coach';
  apiTokenId?: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  requestId: string;
  summaryJson: unknown;
}

export interface AuditRepository {
  record(event: AuditEventInput): Promise<void>;
}

export const noopAuditRepository: AuditRepository = {
  async record() {},
};
