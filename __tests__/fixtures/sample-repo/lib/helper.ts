// A utility with a relative import and an external import
import { format } from '../utils/format';
import path from 'path';

export function helper(input: string): string {
  return format(path.basename(input));
}
