const Anthropic = require('@anthropic-ai/sdk');

let client = null;

function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

// Generate 3 smart reply suggestions
async function getSmartReplies(messages, language = 'english') {
  const context = messages
    .slice(-6)
    .map((m) => `${m.sender_name || m.sender}: ${m.content}`)
    .join('\n');

  const langGuide =
    language === 'tamil'
      ? 'Write replies in Tamil script.'
      : language === 'tanglish'
      ? 'Write replies in Tanglish (Tamil spoken words written in English letters, e.g. "Seri da", "Enna achu").'
      : 'Write replies in English.';

  try {
    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Chat:\n${context}\n\nGenerate 3 short, natural reply suggestions for the last message. ${langGuide}\nReturn ONLY a JSON array of 3 strings. No other text.\nExample: ["Sure!", "Let me check", "Can you clarify?"]`,
        },
      ],
    });

    const text = response.content[0].text.trim();
    // Strip markdown code fences if present
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) return parsed.slice(0, 3);
    return ['Sure!', 'Got it!', 'Let me check.'];
  } catch (err) {
    console.error('Smart replies error:', err.message);
    return ['Sure!', 'Got it!', 'Let me check.'];
  }
}

// Summarize a conversation in 3 bullet points
async function summarizeConversation(messages, language = 'english') {
  const context = messages
    .filter((m) => m.content && m.content.trim())
    .map((m) => `${m.sender_name}: ${m.content}`)
    .join('\n');

  const langGuide =
    language === 'tamil'
      ? 'Respond in Tamil.'
      : language === 'tanglish'
      ? 'Respond in Tanglish.'
      : 'Respond in English.';

  try {
    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `Summarize this chat in exactly 3 bullet points. Be concise and capture key decisions, topics, and action items. ${langGuide}\n\nChat:\n${context}\n\nReturn ONLY a JSON array of 3 strings.`,
        },
      ],
    });

    const text = response.content[0].text.trim();
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) return parsed.slice(0, 3);
    return ['No summary available.'];
  } catch (err) {
    console.error('Summarize error:', err.message);
    return ['Could not generate summary. Please try again.'];
  }
}

// Detect emotion in a single message
async function detectEmotion(text) {
  if (!text || text.trim().length < 3) return 'neutral';

  try {
    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 20,
      messages: [
        {
          role: 'user',
          content: `Classify the emotion in this message into exactly ONE word from this list: happy, sad, angry, excited, neutral, confused, urgent\n\nMessage: "${text}"\n\nReturn only the emotion word.`,
        },
      ],
    });

    const emotion = response.content[0].text.trim().toLowerCase().replace(/[^a-z]/g, '');
    const valid = ['happy', 'sad', 'angry', 'excited', 'neutral', 'confused', 'urgent'];
    return valid.includes(emotion) ? emotion : 'neutral';
  } catch {
    return 'neutral';
  }
}

// Extract to-do items from conversation
async function extractTodos(messages) {
  const context = messages
    .filter((m) => m.content)
    .map((m) => `${m.sender_name}: ${m.content}`)
    .join('\n');

  try {
    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `Extract all commitments, tasks, and to-dos from this conversation (e.g. "I'll send you the file by Friday", "remind me to call", "I need to check"). Return ONLY a JSON array of strings. If none, return [].\n\nConversation:\n${context}`,
        },
      ],
    });

    const text = response.content[0].text.trim();
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return [];
  }
}

module.exports = { getSmartReplies, summarizeConversation, detectEmotion, extractTodos };
