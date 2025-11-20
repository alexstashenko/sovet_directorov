import { franc } from 'franc-min'
import langs from 'langs'

const DEFAULT_LANGUAGE = 'ru'

export function detectLanguage (text) {
  if (!text) return DEFAULT_LANGUAGE

  const francCode = franc(text, { minLength: 10 })
  if (francCode === 'und') return DEFAULT_LANGUAGE

  try {
    const match = langs.where('3', francCode)
    return (match?.['1'] ?? DEFAULT_LANGUAGE).toLowerCase()
  } catch {
    return DEFAULT_LANGUAGE
  }
}

export function getLanguageDisplayName (isoCode) {
  try {
    const language = langs.where('1', isoCode)
    return language?.name ?? 'the user’s language'
  } catch {
    return 'the user’s language'
  }
}

export function shouldUseRussian (messageIndex) {
  return messageIndex === 0
}

