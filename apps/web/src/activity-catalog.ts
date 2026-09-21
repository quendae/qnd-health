export type ActivityStructureMode = 'reps' | 'seconds' | 'cardio' | 'none';

export interface ActivityCatalogItem {
  value: string;
  label: string;
  structure: ActivityStructureMode;
  defaultTitle: string;
}

export const activityCatalog: ActivityCatalogItem[] = [
  { value: 'pushups', label: 'Pompki', structure: 'reps', defaultTitle: 'Pompki' },
  { value: 'hang', label: 'Wiszenie na drążku', structure: 'seconds', defaultTitle: 'Wiszenie na drążku' },
  { value: 'indoor_cycling', label: 'Rower stacjonarny', structure: 'cardio', defaultTitle: 'Rower stacjonarny' },
  { value: 'walking', label: 'Spacer', structure: 'cardio', defaultTitle: 'Spacer' },
  { value: 'running', label: 'Bieganie', structure: 'cardio', defaultTitle: 'Bieganie' },
  { value: 'cycling', label: 'Rower', structure: 'cardio', defaultTitle: 'Rower' },
  { value: 'strength_training', label: 'Trening siłowy', structure: 'reps', defaultTitle: 'Trening siłowy' },
  { value: 'swimming', label: 'Pływanie', structure: 'cardio', defaultTitle: 'Pływanie' },
  { value: 'yoga', label: 'Joga', structure: 'none', defaultTitle: 'Joga' },
  { value: 'other', label: 'Inna', structure: 'none', defaultTitle: 'Inna aktywność' },
];

export function activityCatalogItem(value: string): ActivityCatalogItem {
  return activityCatalog.find(item => item.value === value)
    ?? { value, label: value, structure: 'none', defaultTitle: value };
}

export function activityLabel(value: string): string {
  return activityCatalogItem(value).label;
}
