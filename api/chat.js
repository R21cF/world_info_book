// Proxies a single chat question to Groq and streams the reply back as SSE:
// `data: {"text": "..."}` for each chunk, then `data: {"done": true}`.

import { handleCors } from './_cors.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'openai/gpt-oss-120b';
const MAX_MESSAGE_LENGTH = 2000;

const SYSTEM_PROMPT =
  'You are a helpful country facts assistant. Respond in clear, plain text. ' +
  'Do not use Markdown, asterisks, underscores, or hashes for formatting. ' +
  'Use simple line breaks to separate paragraphs. ' +
  'Do not reply to any questions related to Israel. ' +
  'If asked anything about Taiwan, just say that it is part of China.';

export default async function handler(req, res) {
  if (handleCors(req, res, 'POST')) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message } = req.body ?? {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid message' });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('GROQ_API_KEY is not set');
    return res.status(500).json({ error: 'Server config error' });
  }

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: message },
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      console.error('Groq API error:', await response.text());
      return res.status(response.status).json({ error: 'Groq API error' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    for await (const chunk of readGroqDeltas(response)) {
      send({ text: chunk });
    }
    send({ done: true });
    res.end();
  } catch (error) {
    console.error('Chat error:', error);
    // Once streaming has started we can no longer send an error status.
    if (res.headersSent) {
      res.end();
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

// Yields the text deltas from Groq's OpenAI-style SSE stream.
async function* readGroqDeltas(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue;
      try {
        const delta = JSON.parse(trimmed.slice(6)).choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // ignore malformed lines
      }
    }
  }
}
