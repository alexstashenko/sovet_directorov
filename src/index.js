import express from 'express'
import { bot } from './bot.js'

const PORT = process.env.PORT || 3000

async function launchBot () {
  try {
    await bot.launch()
    console.log('Telegram bot запущен (long polling).')
  } catch (error) {
    console.error('Ошибка запуска бота:', error)
    process.exit(1)
  }
}

function createServer () {
  const app = express()

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' })
  })

  app.get('/', (_req, res) => {
    res.status(200).send('Personal Board Telegram Bot is running.')
  })

  app.listen(PORT, () => {
    console.log(`HTTP сервер запущен на порту ${PORT}`)
  })
}

launchBot()
createServer()

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))


