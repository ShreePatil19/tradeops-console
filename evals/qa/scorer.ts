import type { EvalCase, EvalResult } from '../types.js';

export function scoreQa(
  c: EvalCase,
  _r: EvalResult,
): { passed: boolean; reason: string } {
  if (c.id.endsWith('-starter')) {
    return { passed: true, reason: 'scaffold-only' };
  }
  return { passed: false, reason: 'real scorer not implemented yet' };
}
