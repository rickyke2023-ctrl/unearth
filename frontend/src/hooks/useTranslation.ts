import { useAppStore } from '../stores/appStore'
import { t } from '../i18n'
import type { Language } from '../i18n'

export function useTranslation() {
  const language = useAppStore((s) => s.language)
  return {
    t: (key: string, vars?: Record<string, string | number>) => t(key, language, vars),
    lang: language as Language,
  }
}
