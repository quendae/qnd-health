export interface IdempotencyRecord {
  tokenId: string;
  route: string;
  idempotencyKey: string;
  requestHash: string;
  responseStatus: number;
  responseJson: unknown;
}

export interface IdempotencyRepository {
  find(tokenId: string, route: string, idempotencyKey: string): Promise<IdempotencyRecord | null>;
  save(record: IdempotencyRecord): Promise<void>;
}

export const noopIdempotencyRepository: IdempotencyRepository = {
  async find() { return null; },
  async save() {},
};
