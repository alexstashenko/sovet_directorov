const sessions = new Map()

const defaultSession = (chatId) => ({
  chatId,
  stage: 'awaitingSituation',
  language: 'ru',
  personaCandidates: [],
  selectedPersonas: [],
  situationDescription: '',
  messagePairs: 0,
  conversationLog: [],
  userProfile: null
})

export function getSession (chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, defaultSession(chatId))
  }
  return sessions.get(chatId)
}

export function resetSession (chatId) {
  sessions.set(chatId, defaultSession(chatId))
  return sessions.get(chatId)
}

export function deleteSession (chatId) {
  sessions.delete(chatId)
}

