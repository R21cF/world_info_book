// api/chat.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid message' });
  }

  const API_KEY = process.env.GROQ_API_KEY;
  if (!API_KEY) {
    console.error('❌ GROQ_API_KEY is not set');
    return res.status(500).json({ error: 'Server config error' });
  }

  const url = 'https://api.groq.com/openai/v1/chat/completions';

  const payload = {
    model: 'openai/gpt-oss-120b', // or 'llama3-8b-8192', 'gemma2-9b-it' etc.
    messages: [
        {
            role: 'system',
            content: 'You are a helpful country facts assistant. Respond in clear, plain text. Do not use Markdown, asterisks, underscores, or hashes for formatting. Use simple line breaks to separate paragraphs.',
        },
        {
            role: 'user',
            content: message
        }
    ],
    stream: true,
    temperature: 0.7,
    max_tokens: 1024,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Groq API error:', error);
      return res.status(response.status).json({ error: 'Groq API error' });
    }

    // Set up streaming response to client (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const send = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '') continue;
        if (trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              send({ text: delta });
            }
          } catch (e) {
            // ignore parse errors
          }
        }
      }
    }

    send({ done: true });
    res.end();

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}