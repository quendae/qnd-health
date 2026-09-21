import { ArrowDown, ArrowUp, RotateCcw, X } from 'lucide-react';
import { defaultTodayWidgetLayout, moveWidget, type TodayWidgetId, type TodayWidgetPreference } from './widget-layout';

const labels: Record<TodayWidgetId, string> = {
  health_metrics: 'Parametry zdrowia',
  activity: 'Aktywność',
  nutrition: 'Odżywianie',
  week_progress: 'Postęp tygodnia',
  remaining_week: 'Pozostało w tygodniu',
  coach: 'AI Coach',
};

export function WidgetSettings({ layout, onChange, onClose }: { layout: TodayWidgetPreference[]; onChange: (layout: TodayWidgetPreference[]) => void; onClose: () => void }) {
  function toggle(id: TodayWidgetId) {
    onChange(layout.map(widget => widget.id === id ? { ...widget, visible: !widget.visible } : widget));
  }

  return <div className="modal-backdrop widget-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}>
    <aside className="widget-settings" role="dialog" aria-modal="true" aria-labelledby="widget-settings-title">
      <header><div><h2 id="widget-settings-title">Dostosuj widok</h2><p>Wybierz pola widoczne na ekranie Dzisiaj i ustaw ich kolejność.</p></div><button className="icon-button" onClick={onClose} aria-label="Zamknij"><X size={18} /></button></header>
      <div className="widget-settings-list">
        {layout.map((widget, index) => <div className="widget-setting-row" key={widget.id}>
          <label><input type="checkbox" checked={widget.visible} onChange={() => toggle(widget.id)} /><span>{labels[widget.id]}</span></label>
          <div><button className="icon-button" disabled={index === 0} onClick={() => onChange(moveWidget(layout, widget.id, -1))} aria-label="Przesuń wyżej"><ArrowUp size={15} /></button><button className="icon-button" disabled={index === layout.length - 1} onClick={() => onChange(moveWidget(layout, widget.id, 1))} aria-label="Przesuń niżej"><ArrowDown size={15} /></button></div>
        </div>)}
      </div>
      <footer><button className="ghost" onClick={() => onChange(defaultTodayWidgetLayout.map(widget => ({ ...widget })))}><RotateCcw size={15} /> Przywróć domyślne</button><button className="primary" onClick={onClose}>Gotowe</button></footer>
    </aside>
  </div>;
}
