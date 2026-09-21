export interface DeepSeekToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface DeepSeekToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

export interface DeepSeekTurnInput {
  messages: DeepSeekMessage[];
  tools: DeepSeekToolDefinition[];
}

export interface DeepSeekTurnResult {
  content: string | null;
  toolCalls: DeepSeekToolCall[];
}

export interface DeepSeekClientOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

function parseToolArguments(name: string, value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') throw new Error(`Invalid DeepSeek tool arguments for ${name}`);
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid DeepSeek tool arguments for ${name}`);
  }
}

export class DeepSeekClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DeepSeekClientOptions) {
    this.apiKey = options.apiKey.trim();
    if (!this.apiKey) throw new Error('DeepSeek API key is required');
    this.baseUrl = (options.baseUrl?.trim() || 'https://api.deepseek.com').replace(/\/+$/, '');
    this.model = options.model?.trim() || 'deepseek-flash';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async completeTurn(input: DeepSeekTurnInput): Promise<DeepSeekTurnResult> {
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: input.messages,
        tools: input.tools,
        tool_choice: input.tools.length ? 'auto' : undefined,
      }),
    });

    if (!response.ok) throw new Error(`DeepSeek API error ${response.status}`);

    const payload = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id?: string;
            type?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    };
    const message = payload.choices?.[0]?.message;
    if (!message) throw new Error('Invalid DeepSeek API response');

    const toolCalls: DeepSeekToolCall[] = (message.tool_calls ?? []).map((call) => {
      const id = call.id;
      const name = call.function?.name;
      if (!id || call.type !== 'function' || !name) throw new Error('Invalid DeepSeek tool call');
      return { id, name, arguments: parseToolArguments(name, call.function?.arguments) };
    });

    return {
      content: typeof message.content === 'string' ? message.content : null,
      toolCalls,
    };
  }
}
