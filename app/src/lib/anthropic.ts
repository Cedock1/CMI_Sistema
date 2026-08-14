import Anthropic from '@anthropic-ai/sdk';

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

// Extrae el primer bloque JSON de una respuesta del modelo.
export function extraerJSON(texto: string): any {
  const limpio = texto.replace(/```json|```/g, '').trim();
  const ini = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');
  if (ini === -1 || fin === -1) throw new Error('Sin JSON en la respuesta del modelo');
  return JSON.parse(limpio.slice(ini, fin + 1));
}
