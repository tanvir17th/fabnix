import { DomainError, ErrorCode } from '../errors/domain-error';

export type OrderStatus =
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'PROCESSING'
  | 'READY_FOR_PICKUP'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED';

export type OrderActor = 'CUSTOMER' | 'SHOPKEEPER' | 'SYSTEM';
export type DeliveryMethod = 'HOME_DELIVERY' | 'PICKUP';
export type StockDeductionMilestone = 'ON_CONFIRMATION' | 'ON_DISPATCH';

interface TransitionRule {
  to: OrderStatus;
  actors: OrderActor[];
  /** Restrict to a delivery method (pickup vs home delivery). */
  method?: DeliveryMethod;
  reasonRequired?: boolean;
}

/** SRS §A3.1 — the only legal edges. */
const RULES: Record<OrderStatus, TransitionRule[]> = {
  PENDING_CONFIRMATION: [
    { to: 'CONFIRMED', actors: ['SHOPKEEPER'] },
    { to: 'REJECTED', actors: ['SHOPKEEPER'], reasonRequired: true },
    { to: 'CANCELLED', actors: ['SHOPKEEPER', 'CUSTOMER', 'SYSTEM'], reasonRequired: true },
  ],
  CONFIRMED: [
    { to: 'PROCESSING', actors: ['SHOPKEEPER'] },
    { to: 'READY_FOR_PICKUP', actors: ['SHOPKEEPER'], method: 'PICKUP' },
    { to: 'DISPATCHED', actors: ['SHOPKEEPER'], method: 'HOME_DELIVERY' },
    { to: 'CANCELLED', actors: ['SHOPKEEPER'], reasonRequired: true },
  ],
  PROCESSING: [
    { to: 'READY_FOR_PICKUP', actors: ['SHOPKEEPER'], method: 'PICKUP' },
    { to: 'DISPATCHED', actors: ['SHOPKEEPER'], method: 'HOME_DELIVERY' },
    { to: 'CANCELLED', actors: ['SHOPKEEPER'], reasonRequired: true },
  ],
  READY_FOR_PICKUP: [
    { to: 'DELIVERED', actors: ['SHOPKEEPER'] },
    { to: 'CANCELLED', actors: ['SHOPKEEPER'], reasonRequired: true },
  ],
  DISPATCHED: [{ to: 'DELIVERED', actors: ['SHOPKEEPER'] }],
  DELIVERED: [{ to: 'COMPLETED', actors: ['SHOPKEEPER', 'SYSTEM'] }],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function allowedTransitions(from: OrderStatus, actor: OrderActor, method?: DeliveryMethod): OrderStatus[] {
  return RULES[from]
    .filter((r) => r.actors.includes(actor) && (!r.method || !method || r.method === method))
    .map((r) => r.to);
}

export function canTransition(from: OrderStatus, to: OrderStatus, actor: OrderActor, method?: DeliveryMethod): boolean {
  return allowedTransitions(from, actor, method).includes(to);
}

export function assertTransition(
  from: OrderStatus,
  to: OrderStatus,
  actor: OrderActor,
  opts: { method?: DeliveryMethod; reason?: string | null } = {},
): void {
  const rule = RULES[from].find(
    (r) => r.to === to && r.actors.includes(actor) && (!r.method || !opts.method || r.method === opts.method),
  );
  if (!rule) throw new DomainError(ErrorCode.ORDER_TRANSITION_INVALID, { from, to, actor });
  if (rule.reasonRequired && !opts.reason?.trim()) throw new DomainError(ErrorCode.REASON_REQUIRED, { to });
}

export const TERMINAL_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set(['COMPLETED', 'REJECTED', 'CANCELLED']);

/** Does entering `to` consume the reservation into a physical stock deduction (FR-121)? */
export function isDeductionPoint(to: OrderStatus, milestone: StockDeductionMilestone): boolean {
  if (milestone === 'ON_CONFIRMATION') return to === 'CONFIRMED';
  return to === 'DISPATCHED' || to === 'READY_FOR_PICKUP';
}

/** Statuses in which a reservation (not yet a deduction) may still be held. */
export function holdsReservation(status: OrderStatus, milestone: StockDeductionMilestone): boolean {
  if (status === 'PENDING_CONFIRMATION') return true;
  return milestone === 'ON_DISPATCH' && (status === 'CONFIRMED' || status === 'PROCESSING');
}
