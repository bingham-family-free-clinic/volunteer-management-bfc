export const CHATBOT_PLACEHOLDER_ANSWER =
  'The chatbot is not available yet. This is a placeholder response.'

export function createPlaceholderResponse(question) {
  return {
    answer: CHATBOT_PLACEHOLDER_ANSWER,
    sources: [],
    placeholder: true,
    question,
  }
}
