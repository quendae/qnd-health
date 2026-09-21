export interface CoachConversationRecord {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CoachMessageRecord {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  model: string | null;
  toolMetadata: unknown | null;
  createdAt: string;
}

export interface NewCoachMessage {
  conversationId: string;
  role: CoachMessageRecord['role'];
  content: string;
  model?: string | null;
  toolMetadata?: unknown | null;
}

export interface CoachRepository {
  createConversation(title?: string | null): Promise<CoachConversationRecord>;
  listConversations(): Promise<CoachConversationRecord[]>;
  findConversation(id: string): Promise<CoachConversationRecord | null>;
  listMessages(conversationId: string): Promise<CoachMessageRecord[]>;
  addMessage(input: NewCoachMessage): Promise<CoachMessageRecord>;
}
