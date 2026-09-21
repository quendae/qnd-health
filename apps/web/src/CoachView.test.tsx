import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CoachView } from './CoachView';
import type { QndHealthApi } from './api';

describe('CoachView', () => {
  it('renders the conversation rail, new conversation action and empty chat state', () => {
    const api = {} as QndHealthApi;
    const html = renderToStaticMarkup(<CoachView api={api} onError={() => undefined} />);

    expect(html).toContain('AI Coach');
    expect(html).toContain('Nowa rozmowa');
    expect(html).toContain('Wybierz rozmowę');
  });
});
