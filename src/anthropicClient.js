import { Anthropic } from '@anthropic-ai/sdk'
import { config } from './config.js'
import { assertConfig } from './config.js'

assertConfig()

export const anthropic = new Anthropic({
  apiKey: config.anthropicApiKey
})

