import { useState } from 'react';
import { Save, Utensils, X } from 'lucide-react';
import type { QndHealthApi } from './api';
import type { NutritionEntry } from './types';

function numberText(value: number | null): string {
  return value == null ? '' : String(value);
}

function nullableNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('Wartości odżywcze muszą być liczbami nieujemnymi.');
  return parsed;
}

export function NutritionEntryDialog({
  api,
  entry,
  onClose,
  onSaved,
}: {
  api: QndHealthApi;
  entry: NutritionEntry;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [title, setTitle] = useState(entry.title);
  const [calories, setCalories] = useState(numberText(entry.caloriesKcal));
  const [protein, setProtein] = useState(numberText(entry.proteinGrams));
  const [carbs, setCarbs] = useState(numberText(entry.carbsGrams));
  const [fat, setFat] = useState(numberText(entry.fatGrams));
  const [fiber, setFiber] = useState(numberText(entry.fiberGrams));
  const [quantity, setQuantity] = useState(entry.quantityText ?? '');
  const [notes, setNotes] = useState(entry.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateNutrition(entry.id, {
        title: title.trim(),
        caloriesKcal: nullableNumber(calories),
        proteinGrams: nullableNumber(protein),
        carbsGrams: nullableNumber(carbs),
        fatGrams: nullableNumber(fat),
        fiberGrams: nullableNumber(fiber),
        quantityText: quantity.trim() || null,
        notes: notes.trim() || null,
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zapisać zmian.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="modal-card nutrition-dialog" role="dialog" aria-modal="true" aria-labelledby="nutrition-edit-title">
      <header className="modal-head">
        <div><h2 id="nutrition-edit-title"><Utensils size={19} /> Edytuj wpis</h2><p>Popraw ilość lub wartości odżywcze bez tworzenia duplikatu.</p></div>
        <button className="icon-button" onClick={onClose} aria-label="Zamknij"><X size={17} /></button>
      </header>
      {error && <div className="error-banner">{error}</div>}
      <div className="form-grid nutrition-form-grid">
        <label className="span-2">Nazwa
          <input autoFocus value={title} onChange={event => setTitle(event.target.value)} />
        </label>
        <label>Kalorie (kcal)<input type="number" min="0" step="1" value={calories} onChange={event => setCalories(event.target.value)} /></label>
        <label>Białko (g)<input type="number" min="0" step="0.1" value={protein} onChange={event => setProtein(event.target.value)} /></label>
        <label>Węglowodany (g)<input type="number" min="0" step="0.1" value={carbs} onChange={event => setCarbs(event.target.value)} /></label>
        <label>Tłuszcz (g)<input type="number" min="0" step="0.1" value={fat} onChange={event => setFat(event.target.value)} /></label>
        <label>Błonnik (g)<input type="number" min="0" step="0.1" value={fiber} onChange={event => setFiber(event.target.value)} /></label>
        <label>Ilość<input value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="np. 80 g" /></label>
        <label className="span-2">Notatka<textarea rows={3} value={notes} onChange={event => setNotes(event.target.value)} /></label>
      </div>
      <footer className="modal-actions">
        <button className="ghost" onClick={onClose} disabled={saving}>Anuluj</button>
        <button className="primary" onClick={() => void submit()} disabled={!title.trim() || saving}><Save size={16} /> {saving ? 'Zapisywanie…' : 'Zapisz'}</button>
      </footer>
    </section>
  </div>;
}
