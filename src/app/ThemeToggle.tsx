import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { applyTheme, preferredTheme, type Theme } from '@/lib/theme'

export function ThemeToggle() {
  const { t } = useTranslation()
  const [theme, setTheme] = useState<Theme>(preferredTheme)
  useEffect(() => {
    applyTheme(theme)
    const media = matchMedia('(prefers-color-scheme: dark)')
    const listener = () => {
      if (!localStorage.getItem('escuela-digital-theme'))
        setTheme(media.matches ? 'dark' : 'light')
    }
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [theme])
  const next = theme === 'light' ? 'dark' : 'light'
  return (
    <Button
      variant="ghost"
      aria-label={t(next === 'dark' ? 'themeDark' : 'themeLight')}
      onClick={() => {
        setTheme(next)
        applyTheme(next, true)
      }}
      className="px-3"
    >
      {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
    </Button>
  )
}
