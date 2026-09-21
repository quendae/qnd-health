import { describe, expect, it, vi } from 'vitest';
import { DeepSeekClient } from '../src/coach/deepseek.js';

describe('DeepSeekClient', () => {
  it('uses deepseek-flash and parses tool calls from the OpenAI-compatible API', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.deepseek.com/chat/completions');
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret-key');
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe('deepseek-flash');
      expect(body.tool_choice).toBe('auto');
      expect(body.tools[0].function.name).toBe('set_default_step_goal');
      return new Response(JSON.stringify({
        choices: [{ message: {
          role: 'assistant',
          content: 'Ustawiam cel.',
          tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'set_default_step_goal', arguments: '{"steps":8000}' } }],
        } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const client = new DeepSeekClient({ apiKey: 'secret-key', fetchImpl: fetchMock as typeof fetch });
    const result = await client.completeTurn({
      messages: [{ role: 'user', content: 'Ustaw 8000 kroków.' }],
      tools: [{ type: 'function', function: { name: 'set_default_step_goal', description: 'Set steps', parameters: { type: 'object', properties: { steps: { type: 'integer' } }, required: ['steps'] } } }],
    });

    expect(result.content).toBe('Ustawiam cel.');
    expect(result.toolCalls).toEqual([{ id: 'call_1', name: 'set_default_step_goal', arguments: { steps: 8000 } }]);
  });

  it('fails with a safe provider error for non-2xx responses', async () => {
    const client = new DeepSeekClient({
      apiKey: 'secret-key',
      fetchImpl: (async () => new Response('upstream detail', { status: 429 })) as typeof fetch,
    });
    await expect(client.completeTurn({ messages: [{ role: 'user', content: 'test' }], tools: [] }))
      .rejects.toThrow('DeepSeek API error 429');
  });
});
