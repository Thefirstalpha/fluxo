import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { SegmentedControl } from './SegmentedControl'

function Harness() {
  const [value, setValue] = useState<'chart' | 'table'>('chart')
  return (
    <SegmentedControl
      ariaLabel="Vue"
      value={value}
      onChange={setValue}
      options={[
        { value: 'chart', label: 'Graphique' },
        { value: 'table', label: 'Tableau' },
      ]}
    />
  )
}

describe('SegmentedControl', () => {
  it('expose un groupe radio accessible', () => {
    render(<Harness />)
    expect(screen.getByRole('radiogroup', { name: 'Vue' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Graphique' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Tableau' })).toHaveAttribute('tabindex', '-1')
  })

  it('change de valeur au clic et aux flèches du clavier', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('radio', { name: 'Tableau' }))
    expect(screen.getByRole('radio', { name: 'Tableau' })).toHaveAttribute('aria-checked', 'true')

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' })
    expect(screen.getByRole('radio', { name: 'Graphique' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Graphique' })).toHaveFocus()
  })
})
