import dotenv from 'dotenv'

dotenv.config()

export const config = {
  telegramToken: process.env.telegram_token,
  anthropicApiKey: process.env.anthropic_api_key,
  adminTelegramId: process.env.admin_telegram_id,
  webhookUrl: process.env.webhook_url,
  demoMessageLimit: 10
}

export function assertConfig () {
  const missing = Object.entries({
    telegram_token: config.telegramToken,
    anthropic_api_key: config.anthropicApiKey,
    admin_telegram_id: config.adminTelegramId
  }).filter(([, value]) => !value)

  if (missing.length > 0) {
    const keys = missing.map(([key]) => key).join(', ')
    throw new Error(`Отсутствуют переменные окружения: ${keys}`)
  }
}

