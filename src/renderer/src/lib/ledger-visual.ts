import {
  ArrowLeftRight,
  Baby,
  Banknote,
  Briefcase,
  Car,
  CircleHelp,
  CreditCard,
  GraduationCap,
  Gift,
  HeartPulse,
  House,
  Landmark,
  PawPrint,
  PiggyBank,
  Plane,
  Receipt,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  Ticket,
  TrendingUp,
  Utensils,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { PALETTE, type LedgerIcon, type PaletteColor } from '@shared/ledger/model'

export const LEDGER_ICON_COMPONENTS: Readonly<Record<LedgerIcon, LucideIcon>> = {
  wallet: Wallet,
  landmark: Landmark,
  'piggy-bank': PiggyBank,
  'credit-card': CreditCard,
  banknote: Banknote,
  utensils: Utensils,
  'trending-up': TrendingUp,
  house: House,
  car: Car,
  'shopping-cart': ShoppingCart,
  'heart-pulse': HeartPulse,
  ticket: Ticket,
  repeat: Repeat,
  'shopping-bag': ShoppingBag,
  receipt: Receipt,
  briefcase: Briefcase,
  gift: Gift,
  'arrow-left-right': ArrowLeftRight,
  'graduation-cap': GraduationCap,
  baby: Baby,
  'paw-print': PawPrint,
  plane: Plane,
  zap: Zap,
  'circle-help': CircleHelp,
}

/** Couleur enregistrée → variable CSS de son emplacement (adaptée au thème clair ou sombre). */
export function paletteVar(color: PaletteColor | null): string {
  const slot = color ? PALETTE.indexOf(color) : -1
  return slot >= 0 ? `var(--fx-series-${slot + 1})` : 'var(--fx-text-muted)'
}
