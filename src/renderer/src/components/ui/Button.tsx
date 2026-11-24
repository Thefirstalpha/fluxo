import type { ButtonHTMLAttributes } from 'react'
import { cx } from '../../lib/cx'

type Variant = 'primary' | 'secondary' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  iconOnly?: boolean
}

/** primary : dégradé d'action · secondary : cadre dégradé · ghost : discret. */
export function Button({
  variant = 'secondary',
  iconOnly = false,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('fx-btn', `fx-btn--${variant}`, iconOnly && 'fx-btn--icon', className)}
      {...rest}
    />
  )
}
