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
    '1) Резюме: 1-2 предложения, без Markdown.',
    '2) Каждый эксперт: строка формата "🧠 NAVAL: короткий совет", максимум 1-2 предложения.',
    '3) Синтез: 1 строка "Синтез: ..." с общим планом и различиями.',
    'Если запрос расплывчатый, попроси уточнить детали вместо советов.',
    'Не используй Markdown, символы #, **, _ и дополнительные заголовки.',
    'Ответь на том же языке, что и пользователь.'
  ].join('\n')

  const conversationExcerpt = buildConversationExcerpt(conversationLog)

  const systemPrompt = [
    'Ты — фасилитатор персонального совета директоров.',
    'Не выдумывай фактов, опирайся на данные о персонажах.',
    'Будь сверхлаконичным: ни один блок не длиннее двух предложений.',
    'Если вопрос общий, попроси уточнить детали вместо советов.',
    'Не используй Markdown-разметку (никаких #, **, списков).',
    'Важны разные углы зрения и actionable шаги.',
    'Соблюдай формат без добавления лишних разделов.'
  ].join(' ')

  const messages = [
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
    system: systemPrompt,
    messages
  })

  const block = response.content?.[0]
  if (!block || block.type !== 'text') {
    throw new Error('Не удалось получить ответ совета')
  }

  return block.text.trim()
}

