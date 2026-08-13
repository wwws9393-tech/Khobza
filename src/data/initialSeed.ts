import { AdminUser, Family, Mandoub, Order } from '../types';

export const INITIAL_ADMINS: AdminUser[] = [
  {
    id: 'admin-1',
    username: 'admin123',
    password: 'admin123',
    fullName: 'المدير العام (الأدمن الرئيس)',
  },
];

export const INITIAL_MANDOUBS: Mandoub[] = [];

export const INITIAL_FAMILIES: Family[] = [];

export const INITIAL_BLOCKED_PHONES: string[] = [];

export const INITIAL_ORDERS: Order[] = [];
