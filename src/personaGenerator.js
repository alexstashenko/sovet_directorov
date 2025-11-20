import { anthropic } from './anthropicClient.js'
import { config } from './config.js'
import { getLanguageDisplayName } from './language.js'

const PERSONA_MODEL = 'claude-sonnet-4-5-20250929'

export async function generatePersonaOptions ({ situationSummary, targetLanguage }) {
  const languageName = getLanguageDisplayName(targetLanguage)

  const systemPrompt = [
    'Ты — куратор виртуального совета директоров.',
    'Подбираешь 5 публичных фигур (предприниматели, мыслители, артисты, создатели)',
    'так, чтобы они давали разные перспективы на запрос пользователя.',
    'Всегда выбирай международно известных персон, избегая повторов и слишком узких специализаций.'
  ].join(' ')

  const userPrompt = [
    `Ситуация пользователя: """${situationSummary}"""`,
    '',
    'Сформируй JSON-массив из 5 объектов со структурой:',
    '{',
    '  "name": "Имя персоны",',
    '  "headline": "1 предложение о ключевых достижениях",',
    '  "reason": "Почему она полезна пользователю",',
    '  "signatureStyle": "Как звучит её голос",',
    '  "principles": ["краткий принцип 1", "принцип 2", "принцип 3"]',
    '}',
    '',
    `Ответь на ${languageName} без дополнительного текста, только валидный JSON.`
  ].join('\n')

  const response = await anthropic.messages.create({
    model: PERSONA_MODEL,
    max_tokens: 1200,
    temperature: 0.6,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userPrompt
      }
    ]
  })

  const contentBlock = response.content?.[0]
  if (!contentBlock || contentBlock.type !== 'text') {
    throw new Error('Не удалось получить текст с вариантами персон')
  }

  try {
    const parsed = JSON.parse(contentBlock.text)
    if (!Array.isArray(parsed) || parsed.length !== 5) {
      throw new Error('Ожидалось 5 персон в массиве')
    }
    return parsed
  } catch (error) {
    throw new Error(`Ошибка парсинга персон: ${error.message}`)
  }
}

