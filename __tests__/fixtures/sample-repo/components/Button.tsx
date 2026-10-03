// A React component with alias import and dynamic import
import { Item } from '@/lib/types';
export async function loadPlugin(): Promise<unknown> {
  const plugin = await import('./plugin');
  return plugin;
}

export function Button({ label }: { label: string }): JSX.Element {
  return { type: 'button', props: { children: label } } as unknown as JSX.Element;
}
