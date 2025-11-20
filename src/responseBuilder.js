import { anthropic } from './anthropicClient.js'
import { getLanguageDisplayName } from './language.js'

const RESPONSE_MODEL = 'claude-sonnet-4-5-20250929'

function buildConversationExcerpt (log, limit = 6) {
  const recent = log.slice(-limit)
  return recent.map(entry => `${entry.role === 'user' ? 'Пользователь' : 'Совет'}: ${entry.text}`).join('\n')
}

export async function generateBoardResponse ({
  question,
  targetLanguage,
  personas,
  situationDescription,
  conversationLog
}) {
  const languageName = getLanguageDisplayName(targetLanguage)
  const personaBriefs = personas.map((persona, index) => {
    return [
      `Персона ${index + 1}: ${persona.name}`,
      `Краткое описание: ${persona.headline}`,
      `Причина релевантности: ${persona.reason}`,
      `Подпись стиля: ${persona.signatureStyle}`,
      `Принципы: ${persona.principles.join('; ')}`
    ].join('\n')
  }).join('\n\n')

  const formatInstructions = [
    'Формат ответа:',
    '1) Краткое резюме ситуации (1-2 предложения).',
    '2) Блоки по каждому члену совета:',
    '   **[emoji + ИМЯ]:** 2-3 абзаца, персональный стиль, конкретные советы.',
    '3) Синтез и рекомендация: общий план действий, точки согласия и расхождения.',
    '',
    'Обязательно используй эмодзи и имена из примера (**🧠 NAME:**).',
    'Сохраняй индивидуальный тон каждого эксперта.',
    `Ответь на ${languageName}.`
  ].join('\n')

  const conversationExcerpt = buildConversationExcerpt(conversationLog)

  const messages = [
    {
      role: 'system',
      content: [
        'Ты — фасилитатор персонального совета директоров.',
        'Не выдумывай фактов, опирайся на данные о персонажах.',
        'Будь конкретным, избегай общих фраз.',
        'Важны разные углы зрения и actionable шаги.',
        'Соблюдай формат без добавления лишних разделов.'
      ].join(' ')
    },
    {
      role: 'user',
      content: [
        `Исходная ситуация пользователя: ${situationDescription}`,
        '',
        'Состав совета:',
        personaBriefs,
        '',
        conversationExcerpt ? `Последние сообщения:\n${conversationExcerpt}` : 'Это первый вопрос после формирования совета.',
        '',
        `Вопрос пользователя: """${question}"""`,
        '',
        formatInstructions
      ].join('\n')
    }
  ]

  const response = await anthropic.messages.create({
    model: RESPONSE_MODEL,
    max_tokens: 1500,
    temperature: 0.7,
    messages
  })

  const block = response.content?.[0]
  if (!block || block.type !== 'text') {
    throw new Error('Не удалось получить ответ совета')
  }

  return block.text.trim()
}

