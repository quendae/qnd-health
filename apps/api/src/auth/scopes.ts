export const apiScopes = [
  'today:read',
  'plans:read', 'plans:write',
  'activities:read', 'activities:write',
  'nutrition:read', 'nutrition:write',
  'measurements:read', 'measurements:write',
  'health:read', 'health:write',
  'progress:read',
  'coach:read', 'coach:write',
] as const;

export type ApiScope = (typeof apiScopes)[number];

export function hasRequiredScopes(
  grantedScopes: readonly string[],
  requiredScopes: readonly ApiScope[],
): boolean {
  const granted = new Set(grantedScopes);
  return requiredScopes.every((scope) => granted.has(scope));
}
