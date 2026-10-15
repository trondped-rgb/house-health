import { usePersisted } from './store';
export interface Author { title: string; name: string; org: string; phone: string; email: string }
export const AUTHOR_KEY = 'hh.author';
export const defaultAuthor = (): Author => ({ title: 'Ingeniør', name: 'Trond A. Pedersen', org: '989757474', phone: '', email: '' });
export const useAuthor = () => usePersisted<Author>(AUTHOR_KEY, defaultAuthor);
export function getAuthor(): Author { try { return { ...defaultAuthor(), ...JSON.parse(localStorage.getItem(AUTHOR_KEY) || '{}') }; } catch { return defaultAuthor(); } }
/** "Ingeniør Trond A. Pedersen · Org.nr 989757474 · phone · email" */
export const authorLine = (a: Author) => [[a.title, a.name].filter(Boolean).join(' '), a.org && `Org.nr ${a.org}`, a.phone, a.email].filter(Boolean).join(' · ');
