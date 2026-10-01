// ===== Chat assistant panel =====
// Sends one question at a time to /api/chat and renders the streamed reply, which
// arrives as SSE lines: `data: {"text": "..."}` chunks, then `data: {"done": true}`.

import { API_BASE } from './config.js';

const TOOLTIP_DURATION_MS = 5000;

const toggleBtn = document.getElementById('chat-toggle');
const panel = document.getElementById('chat-panel');
const messagesEl = document.getElementById('chat-messages');
const form = document.getElementById('chat-form');
const input = document.getElementById('chat-input');
const tooltip = document.getElementById('chat-tooltip');

const hideTooltip = () => tooltip.classList.add('hidden');
setTimeout(hideTooltip, TOOLTIP_DURATION_MS);

toggleBtn.addEventListener('click', () => {
  const isOpen = panel.classList.toggle('open');
  toggleBtn.classList.toggle('open', isOpen);
  toggleBtn.setAttribute('aria-expanded', String(isOpen));
  toggleBtn.setAttribute('aria-label', isOpen ? 'Close chat assistant' : 'Open chat assistant');
  hideTooltip();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  sendMessage(text);
});

// Appends a "<label>: <text>" message and returns the element holding its text.
function appendMessage(label, text) {
  const message = document.createElement('div');
  message.className = 'chat-message';
  const labelEl = document.createElement('strong');
  labelEl.textContent = `${label}:`;
  const textEl = document.createElement('span');
  textEl.className = 'message-text';
  textEl.textContent = text;
  message.append(labelEl, ' ', textEl);
  messagesEl.append(message);
  scrollToBottom();
  return textEl;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function sendMessage(text) {
  appendMessage('You', text);
  const replyEl = appendMessage('Assistant', '● ● ●');
  replyEl.classList.add('thinking');

  let reply = '';
  try {
    const response = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    await readEventStream(response, (event) => {
      if (!event.text) return;
      reply += event.text;
      replyEl.classList.remove('thinking');
      replyEl.textContent = reply;
      scrollToBottom();
    });

    if (!reply) {
      replyEl.classList.remove('thinking');
      replyEl.textContent = 'No response from the AI.';
    }
  } catch (error) {
    replyEl.classList.remove('thinking');
    replyEl.classList.add('chat-error');
    replyEl.textContent = `Error: ${error.message}`;
  }
}

// Reads a `data: <json>` SSE stream, calling onEvent with each parsed payload.
async function readEventStream(response, onEvent) {
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
      if (!line.startsWith('data: ')) continue;
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch {
        // ignore malformed lines
      }
    }
  }
}
