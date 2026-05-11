import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(prefix: string = 'CM') {
  return `${prefix}${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
}
