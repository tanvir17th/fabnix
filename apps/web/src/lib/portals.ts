import type { UserType } from './auth';

export type Portal = 'customer' | 'business' | 'admin';
export const PORTAL_TYPE: Record<Portal, UserType> = { customer: 'CUSTOMER', business: 'SHOPKEEPER', admin: 'SUPER_ADMIN' };
export const PORTAL_HOME: Record<Portal, string> = { customer: '/', business: '/business', admin: '/admin' };
