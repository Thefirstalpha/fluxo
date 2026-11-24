import {
  ArrowLeftRight,
  ChartNoAxesCombined,
  FileScan,
  Landmark,
  LayoutDashboard,
  PiggyBank,
  Upload,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export type NavKey =
  | 'dashboard'
  | 'accounts'
  | 'transactions'
  | 'imports'
  | 'payslips'
  | 'analytics'
  | 'budgets'
  | 'documents'

export interface NavItem {
  key: NavKey
  path: string
  icon: LucideIcon
  /** Jalon de livraison si la page n'est pas encore disponible. */
  milestone?: string
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'dashboard', path: '/', icon: LayoutDashboard },
  { key: 'accounts', path: '/accounts', icon: Landmark },
  { key: 'transactions', path: '/transactions', icon: ArrowLeftRight, milestone: 'M2' },
  { key: 'imports', path: '/imports', icon: Upload, milestone: 'M3' },
  { key: 'analytics', path: '/analytics', icon: ChartNoAxesCombined, milestone: 'M5' },
  { key: 'payslips', path: '/payslips', icon: Wallet, milestone: 'M6' },
  { key: 'documents', path: '/documents', icon: FileScan, milestone: 'M7' },
  { key: 'budgets', path: '/budgets', icon: PiggyBank, milestone: 'M8' },
]

export const SETTINGS_PATH = '/settings'

export function isActivePath(location: string, path: string): boolean {
  if (path === '/') return location === '/'
  return location === path || location.startsWith(`${path}/`)
}
