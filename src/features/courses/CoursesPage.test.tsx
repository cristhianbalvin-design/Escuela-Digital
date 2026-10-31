import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import '@/lib/i18n'
import { CoursesPage } from './CoursesPage'

vi.mock('@/lib/supabase', () => ({ supabase: null }))
vi.mock('@/features/tenants', () => ({
  useTenantAccess: () => ({ active: null }),
}))

describe('CoursesPage', () => {
  it('muestra el estado sin backend', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><CoursesPage /></MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByText('Conecta Supabase para usar esta sección')).toBeInTheDocument()
  })
})
