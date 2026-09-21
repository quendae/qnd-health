import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SettingsView } from './SettingsView';
import type { QndHealthApi } from './api';

describe('SettingsView', () => {
  it('renders session web token replacement controls without exposing the current token', () => {
    const api = {} as QndHealthApi;
    const html = renderToStaticMarkup(
      <SettingsView
        api={api}
        energy={null}
        onSaved={() => undefined}
        onError={() => undefined}
        hasWebToken
        onSaveWebToken={() => undefined}
        onClearWebToken={() => undefined}
      />,
    );

    expect(html).toContain('Token web tej sesji');
    expect(html).toContain('Wklej nowy token');
    expect(html).toContain('Zapisz token');
    expect(html).toContain('Wyczyść');
    expect(html).toContain('Token zapisany');
  });
});
