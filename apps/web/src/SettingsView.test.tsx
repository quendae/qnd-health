import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SettingsView } from './SettingsView';
import type { QndHealthApi } from './api';

describe('SettingsView', () => {
  it('shows editable Coach prompt settings and no longer exposes browser web-token controls', () => {
    const api = {} as QndHealthApi;
    const html = renderToStaticMarkup(
      <SettingsView
        api={api}
        energy={null}
        onSaved={() => undefined}
        onError={() => undefined}
      />,
    );

    expect(html).toContain('Główny prompt Coacha');
    expect(html).toContain('Przywróć domyślny');
    expect(html).toContain('Zapisz prompt');
    expect(html).not.toContain('Token web tej sesji');
    expect(html).not.toContain('Wklej nowy token');
  });
});
