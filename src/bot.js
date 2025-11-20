import { Telegraf, Markup } from 'telegraf'
import { config } from './config.js'
import { detectLanguage } from './language.js'
import { generatePersonaOptions } from './personaGenerator.js'
import { generateBoardResponse } from './responseBuilder.js'
import { getSession, resetSession } from './sessionStore.js'

if (!config.telegramToken) {
  throw new Error('Не задан telegram_token')
}

const DEMO_LIMIT = config.demoMessageLimit ?? 10

export const bot = new Telegraf(config.telegramToken, {
  handlerTimeout: 90_000
})

const BROAD_PATTERNS = [
  /заработ(ать)? много денег/i,
  /что делать/i,
  /что посоветуешь/i,
  /дай совет/i,
  /помоги/i,
  /i need help/i,
  /what should i do/i,
  /i feel lost/i,
  /help me/i
]

const DETAIL_KEYWORDS = [
  'клиент', 'проект', 'курс', 'стартап', 'продаж', 'маркет',
  'евро', 'доллар', 'руб', 'budget', 'revenue', 'users',
  'launch', 'pricing', 'team', 'timeline'
]

function ensureUserProfile (session, from) {
  if (!session.userProfile) {
    session.userProfile = {
      id: from.id,
      firstName: from.first_name ?? '',
      lastName: from.last_name ?? '',
      username: from.username ?? ''
    }
  }
}

function pushLog (session, role, text) {
  session.conversationLog.push({ role, text })
}

async function sendMessageAndLog (ctx, text, extra) {
  const response = await ctx.reply(text, extra)
  const session = getSession(ctx.chat.id)
  pushLog(session, 'bot', text)
  return response
}

function ensureSentence (text) {
  if (!text) return ''
  const trimmed = text.trim()
  if (!trimmed) return ''
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

function buildPersonaListMessage (personas, languageCode) {
  const intro = languageCode === 'ru'
    ? 'Вот пять экспертов, которые лучше всего подойдут к вашей ситуации. Выберите трёх с помощью кнопок:'
    : 'Here are five experts tailored to your situation. Please pick three using the buttons below:'

  const list = personas.map((persona, index) => {
    const reasonSentence = ensureSentence(persona.reason)
    const headlineSentence = persona.headline?.trim() ?? ''
    const details = [reasonSentence, headlineSentence].filter(Boolean).join(' ')
    return details
      ? `${index + 1}. ${persona.name} - ${details}`
      : `${index + 1}. ${persona.name}`
  }).join('\n\n')

  return `${intro}\n\n${list}`
}

function buildSelectionKeyboard (personas, selectedIndexes) {
  return Markup.inlineKeyboard(
    personas.map((persona, index) => ([
      Markup.button.callback(
        `${selectedIndexes.includes(index) ? '✅' : '➕'} ${persona.name}`,
        `select_${index}`
      )
    ]))
  )
}

async function answerQuestion (ctx, session, questionText, language) {
  try {
    const answer = await generateBoardResponse({
      question: questionText,
      targetLanguage: language,
      personas: session.selectedPersonas,
      situationDescription: session.situationDescription,
      conversationLog: session.conversationLog
    })

    await sendMessageAndLog(ctx, answer)
    session.messagePairs += 1

    if (session.messagePairs >= DEMO_LIMIT) {
      await finalizeDemo(ctx, session)
    }
  } catch (error) {
    console.error(error)
    const failMessage = language === 'ru'
      ? 'Совету не удалось сформировать ответ. Попробуйте задать вопрос иначе.'
      : 'The board could not generate a response. Please try rephrasing.'
    await sendMessageAndLog(ctx, failMessage)
  }
}

function needsClarification (text) {
  const normalized = text.trim().toLowerCase()
  if (!normalized) return true

  if (BROAD_PATTERNS.some(pattern => pattern.test(normalized))) {
    return true
  }

  if (normalized.length < 80) {
    const hasDetailKeyword = DETAIL_KEYWORDS.some(keyword => normalized.includes(keyword))
    const hasNumbers = /\d/.test(normalized)
    const hasPunctuation = /[,.;:!?]/.test(normalized)

    if (!hasDetailKeyword && !hasNumbers && !hasPunctuation) {
      return true
    }
  }

  return false
}

function buildClarificationPrompt (language) {
  if (language === 'ru') {
    return [
      'Запрос пока слишком общий. Чтобы Совет дал конкретные шаги, уточни, пожалуйста:',
      '• в какой сфере или проекте ты работаешь',
      '• какой результат нужен (цифры, сроки, формат)',
      '• какие ресурсы или ограничения есть (деньги, время, команда)',
      '',
      'Например: «Хочу выйти на 3000 € в месяц за счёт бизнес-коучинга или художественной фотосъёмки, есть 10 часов в неделю и база из 200 подписчиков».'
    ].join('\n')
  }

  return [
    'Your request is very broad. To get actionable advice, please clarify:',
    '• the context or project you are working on',
    '• the target outcome (numbers, timeframe, format)',
    '• resources or constraints (budget, time, team)',
    '',
    'Example: “I want to reach €3k/month from AI coaching, have 10 hours weekly and a list of 200 subscribers.”'
  ].join('\n')
}

async function handleStart (ctx) {
  const chatId = ctx.chat.id
  const session = resetSession(chatId)
  ensureUserProfile(session, ctx.from)
  session.stage = 'awaitingSituation'
  session.language = 'ru'

  const greeting = [
    'Привет! Я помогу собрать персональный Совет директоров.',
    'Опиши, пожалуйста, свою жизненную, рабочую или бизнесовую ситуацию:',
    '• Контекст и цель',
    '• Какие возможности/ограничения есть',
    '• Чего хочешь добиться'
  ].join('\n')

  await sendMessageAndLog(ctx, greeting)
}

bot.start(handleStart)

bot.action(/select_\d+/, async (ctx) => {
  const session = getSession(ctx.chat.id)
  if (session.stage !== 'awaitingSelection') {
    return ctx.answerCbQuery('Сейчас выбор недоступен')
  }

  const index = Number(ctx.match[0].split('_')[1])
  if (Number.isNaN(index) || !session.personaCandidates[index]) {
    return ctx.answerCbQuery('Некорректный выбор')
  }

  if (!session.selectedPersonas.includes(index)) {
    session.selectedPersonas.push(index)
  }

  if (session.selectedPersonas.length > 3) {
    session.selectedPersonas = session.selectedPersonas.slice(0, 3)
  }

  const keyboard = buildSelectionKeyboard(session.personaCandidates, session.selectedPersonas)
  await ctx.editMessageReplyMarkup(keyboard.reply_markup)

  const message = session.language === 'ru'
    ? `Отлично! Осталось выбрать ${3 - session.selectedPersonas.length} из 3.`
    : `Great! ${3 - session.selectedPersonas.length} slots left.`

  await ctx.answerCbQuery(message, { show_alert: false })

  if (session.selectedPersonas.length === 3) {
    session.stage = 'active'
    session.selectedPersonas = session.selectedPersonas.map(i => session.personaCandidates[i])
    const readyMessage = session.language === 'ru'
      ? 'Совет сформирован! Скоро вы получите его мнение...'
      : 'Your board is assembled! You will receive its perspective shortly...'
    await sendMessageAndLog(ctx, readyMessage)

    const initialLanguage = detectLanguage(session.situationDescription) || session.language
    session.language = initialLanguage
    await answerQuestion(ctx, session, session.situationDescription, initialLanguage)
  }
})

bot.on('text', async (ctx) => {
  if (ctx.message.text === '/start') {
    return handleStart(ctx)
  }

  const session = getSession(ctx.chat.id)
  ensureUserProfile(session, ctx.from)

  const text = ctx.message.text.trim()
  if (!text) {
    return
  }

  pushLog(session, 'user', text)

  if (session.stage === 'awaitingSituation') {
    return handleSituationDescription(ctx, session, text)
  }

  if (session.stage === 'awaitingSelection') {
    const reminder = session.language === 'ru'
      ? 'Пожалуйста, выберите трёх экспертов с помощью кнопок ниже.'
      : 'Please select three experts using the buttons below.'
    return sendMessageAndLog(ctx, reminder)
  }

  if (session.stage === 'active') {
    return handleActiveQuestion(ctx, session, text)
  }

  if (session.stage === 'demoComplete') {
    const message = session.language === 'ru'
      ? 'Демо-режим завершён. Мы свяжемся с вами для продолжения.'
      : 'Demo mode finished. We will contact you about the full version.'
    return sendMessageAndLog(ctx, message)
  }
})

async function handleSituationDescription (ctx, session, text) {
  session.situationDescription = text
  session.language = detectLanguage(text)

  try {
    await sendMessageAndLog(
      ctx,
      session.language === 'ru'
        ? 'Анализирую ситуацию и подбираю экспертов...'
        : 'Analyzing your situation and selecting the best experts...'
    )

    const personas = await generatePersonaOptions({
      situationSummary: text,
      targetLanguage: session.language
    })

    session.personaCandidates = personas
    session.stage = 'awaitingSelection'

    const message = buildPersonaListMessage(personas, session.language)
    const keyboard = buildSelectionKeyboard(personas, [])
    await sendMessageAndLog(ctx, message, keyboard)
  } catch (error) {
    console.error(error)
    await sendMessageAndLog(
      ctx,
      session.language === 'ru'
        ? 'Не удалось подобрать экспертов. Попробуйте описать ситуацию ещё раз.'
        : 'Failed to select experts. Please describe your situation again.'
    )
  }
}

async function handleActiveQuestion (ctx, session, text) {
  const questionLanguage = detectLanguage(text)
  session.language = questionLanguage

  if (needsClarification(text)) {
    const clarification = buildClarificationPrompt(questionLanguage)
    await sendMessageAndLog(ctx, clarification)
    return
  }

  await answerQuestion(ctx, session, text, questionLanguage)
}

async function finalizeDemo (ctx, session) {
  session.stage = 'demoComplete'
  const farewell = session.language === 'ru'
    ? 'Это был 10-й ответ — демо завершено. Спасибо за доверие! Мы свяжемся с вами для продолжения.'
    : 'That was the 10th response — the demo is complete. Thank you! We will reach out for the full version.'

  await sendMessageAndLog(ctx, farewell)

  if (!config.adminTelegramId) return

  const userName = [session.userProfile?.firstName, session.userProfile?.lastName].filter(Boolean).join(' ') || 'Без имени'
  const username = session.userProfile?.username ? `@${session.userProfile.username}` : '—'

  const adminMessage = [
    'Демо-режим завершён.',
    `Пользователь: ${userName}`,
    `Username: ${username}`,
    `ID: ${session.userProfile?.id}`,
    `Сообщений в демо: ${session.messagePairs}`
  ].join('\n')

  await ctx.telegram.sendMessage(config.adminTelegramId, adminMessage)

  const transcript = session.conversationLog
    .map((entry, index) => `[${index + 1}] ${entry.role === 'user' ? 'User' : 'Bot'}: ${entry.text}`)
    .join('\n\n')

  const filename = `demo_${session.chatId}_${Date.now()}.txt`
  await ctx.telegram.sendDocument(
    config.adminTelegramId,
    { source: Buffer.from(transcript, 'utf-8'), filename }
  )

  session.conversationLog = []
}

