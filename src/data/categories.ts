import type { Entry } from '../types';

/** Default categories have the same fixed ids for every user, so shared entries resolve to the right category. */
export const DEFAULT_CATEGORIES = [
  { id: 'leads', name: 'Business Leads', icon: 'briefcase', color: '#0B4F6C' },
  { id: 'food', name: 'Best Restaurants & Food', icon: 'utensils', color: '#E8590C' },
  { id: 'shops', name: 'Best Shops & Shopping', icon: 'shopping-bag', color: '#AE3EC9' },
  { id: 'places', name: 'Must Visit Places', icon: 'landmark', color: '#2F9E44' },
  { id: 'contacts', name: 'Important Contacts', icon: 'phone', color: '#1C7ED6' },
  { id: 'hotels', name: 'Hotels & Accommodation', icon: 'bed', color: '#6741D9' },
  { id: 'transport', name: 'Transport & Travel', icon: 'car', color: '#495057' },
  { id: 'research', name: 'Market Research', icon: 'chart', color: '#0CA678' },
  { id: 'opportunities', name: 'Business Opportunities', icon: 'lightbulb', color: '#F59F00' },
  { id: 'notes', name: 'General Notes', icon: 'note', color: '#868E96' },
] as const;

export const FALLBACK_CATEGORY = 'notes';

type Field = keyof Pick<Entry, 'address' | 'contactName' | 'phone' | 'email' | 'website' | 'visitDate' | 'rating' | 'priority'>;

/** Fields shown up-front per category; everything else sits behind "More fields". */
const FIELDS: Record<string, Field[]> = {
  leads: ['contactName', 'phone', 'email', 'website', 'address', 'priority'],
  food: ['address', 'phone', 'rating', 'visitDate', 'website'],
  shops: ['address', 'phone', 'rating', 'website'],
  places: ['address', 'rating', 'visitDate', 'website'],
  contacts: ['contactName', 'phone', 'email', 'address'],
  hotels: ['address', 'phone', 'rating', 'website', 'visitDate'],
  transport: ['phone', 'contactName', 'website'],
  research: ['priority', 'website'],
  opportunities: ['priority', 'contactName', 'phone', 'email'],
  notes: [],
};
export const ALL_FIELDS: Field[] = ['address', 'contactName', 'phone', 'email', 'website', 'visitDate', 'rating', 'priority'];
export const primaryFields = (categoryId: string): Field[] => FIELDS[categoryId] ?? ['address', 'contactName', 'phone', 'rating'];
export type { Field };

/** Tabs on the city detail page (besides Overview / Images / Visits). */
export const CITY_TABS: { key: string; label: string; categoryIds?: string[] }[] = [
  { key: 'leads', label: 'Business Leads', categoryIds: ['leads', 'opportunities'] },
  { key: 'food', label: 'Food', categoryIds: ['food'] },
  { key: 'shops', label: 'Shops', categoryIds: ['shops'] },
  { key: 'places', label: 'Must Visit', categoryIds: ['places'] },
  { key: 'contacts', label: 'Contacts' }, // contacts category + any entry with phone/email
  { key: 'notes', label: 'Notes & More' }, // everything not covered above
];
