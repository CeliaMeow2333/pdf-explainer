/**
 * Minimal OpenAI-compatible chat client (DeepSeek, OpenAI, or any compatible
 * endpoint). Supports streaming responses and vision input.
 */

import { languageNameForPrompt } from "./languages.js";

export class AIError extends Error {
  constructor(message, { status = 0, detail = "" } = {}) {
    super(message);
    this.name = "AIError";
    this.status = status;
    this.detail = detail;
  }
}

export function chatEndpoint(baseUrl) {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!base) {
    throw new AIError("No AI platform URL configured. Open Settings to add one.");
  }
  if (/\/chat\/completions$/i.test(base)) {
    return base;
  }
  return `${base}/chat/completions`;
}

export function buildSystemPrompt(settings) {
  const language = languageNameForPrompt(settings.aiLanguage);
  return [
    "You are PDF Explainer, an assistant embedded in a PDF reader.",
    "The user selects passages or regions of a PDF and asks you about them.",
    `Always answer in ${language}.`,
    "Be accurate and concrete. Start with the meaning in one sentence, then explain",
    "key terms, grammar or structure when useful. Use short paragraphs and bullet",
    "points, never invent content that is not supported by the selection.",
    "If the selection is too small or ambiguous, say what you can and ask one brief question.",
  ].join(" ");
}

const EXPLAIN_PROMPTS = {
  zh: "解释这段内容：它是什么意思，有哪些关键术语，在文档里起什么作用。",
  en: "Explain this content: what it means, any key terms, and its role in the document.",
  ja: "この内容を説明してください。意味、重要な用語、文書内での役割を含めてください。",
  ko: "이 내용을 설명해 주세요. 의미, 핵심 용어, 문서에서의 역할을 포함해 주세요.",
  fr: "Explique ce contenu : son sens, les termes clés et son rôle dans le document.",
  de: "Erkläre diesen Inhalt: Bedeutung, Schlüsselbegriffe und seine Rolle im Dokument.",
  es: "Explica este contenido: qué significa, los términos clave y su función en el documento.",
  ru: "Объясни этот фрагмент: смысл, ключевые термины и его роль в документе.",
  pt: "Explique este conteúdo: o que significa, os termos-chave e seu papel no documento.",
  it: "Spiega questo contenuto: cosa significa, i termini chiave e il suo ruolo nel documento.",
  ar: "اشرح هذا المحتوى: معناه، المصطلحات الأساسية، ودوره في المستند.",
};

export function defaultExplainPrompt(languageCode) {
  const base = String(languageCode || "en").split("-")[0];
  return EXPLAIN_PROMPTS[base] || EXPLAIN_PROMPTS.en;
}

function extractErrorDetail(bodyText) {
  if (!bodyText) {
    return "";
  }
  try {
    const json = JSON.parse(bodyText);
    const message = json?.error?.message || json?.message || json?.detail;
    if (typeof message === "string") {
      return message;
    }
  } catch {
    // not JSON
  }
  return bodyText.slice(0, 300);
}

function friendlyError(status, detail) {
  if (status === 401 || status === 403) {
    return `The API key was rejected (${status}). Check the key in Settings. ${detail}`.trim();
  }
  if (status === 404) {
    return `Endpoint or model not found (404). Check the AI platform URL and model name. ${detail}`.trim();
  }
  if (status === 429) {
    return "The AI platform is rate limiting requests. Try again in a moment.";
  }
  if (status >= 500) {
    return `The AI platform had a server error (${status}). ${detail}`.trim();
  }
  return `Request failed (${status}). ${detail}`.trim();
}

function messagesContainImage(messages) {
  return messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part) => part.type === "image_url"),
  );
}

function stripImages(messages) {
  return messages.map((message) => {
    if (!Array.isArray(message.content)) {
      return message;
    }
    const text = message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n\n");
    return { ...message, content: text };
  });
}

/**
 * Sends a chat request and streams the answer back.
 *
 * @param {object} options
 * @param {object} options.settings current settings (model, key, url)
 * @param {Array}  options.messages OpenAI style message array
 * @param {AbortSignal} [options.signal]
 * @param {(chunk: string) => void} [options.onDelta]
 * @param {(notice: string) => void} [options.onNotice]
 * @returns {Promise<string>} full answer text
 */
export async function streamChat({ settings, messages, signal, onDelta, onNotice }) {
  if (!settings.aiApiKey) {
    throw new AIError("No API key configured. Open Settings and paste your key.");
  }

  const attempt = async (payloadMessages) =>
    requestCompletion({
      settings,
      messages: payloadMessages,
      signal,
      onDelta,
    });

  try {
    return await attempt(messages);
  } catch (error) {
    const imageFailure =
      error instanceof AIError &&
      error.status >= 400 &&
      error.status < 500 &&
      messagesContainImage(messages) &&
      /image|vision|media|unsupported|invalid/i.test(error.detail || error.message);

    if (imageFailure) {
      onNotice?.(
        "This model cannot read images, so only the text in the selection was sent. Enable a vision model to analyse pictures.",
      );
      return attempt(stripImages(messages));
    }
    throw error;
  }
}

async function requestCompletion({ settings, messages, signal, onDelta }) {
  const endpoint = chatEndpoint(settings.aiBaseUrl);
  const body = {
    model: settings.aiModel || "deepseek-chat",
    messages,
    stream: Boolean(onDelta),
    temperature: 0.3,
  };

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.aiApiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }
    throw new AIError(
      `Could not reach ${endpoint}. Check your connection and the platform URL.`,
      { detail: String(error?.message || error) },
    );
  }

  if (!response.ok) {
    const detail = extractErrorDetail(await response.text().catch(() => ""));
    throw new AIError(friendlyError(response.status, detail), {
      status: response.status,
      detail,
    });
  }

  const contentType = response.headers.get("content-type") || "";
  if (response.body && contentType.includes("text/event-stream")) {
    return readEventStream(response, onDelta);
  }

  // Gateways occasionally mislabel SSE payloads, so sniff the body.
  const raw = await response.text();
  if (/^\s*data:/.test(raw.trimStart())) {
    const parser = createSseParser(onDelta);
    parser.push(raw);
    parser.flush();
    return parser.result();
  }

  let json = null;
  try {
    json = JSON.parse(raw);
  } catch {
    // fall through to the error below
  }
  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new AIError("The AI platform returned an unexpected response.", {
      detail: raw.slice(0, 300),
    });
  }
  onDelta?.(text);
  return text;
}

function createSseParser(onDelta) {
  let buffer = "";
  let full = "";

  const handleLine = (rawLine) => {
    const line = rawLine.trim();
    if (!line || !line.startsWith("data:")) {
      return;
    }
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") {
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }
    if (parsed.error) {
      throw new AIError(parsed.error.message || "The AI platform returned an error.");
    }
    const delta = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.text ?? "";
    if (delta) {
      full += delta;
      onDelta?.(delta);
    }
  };

  return {
    push(chunk) {
      buffer += chunk;
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        handleLine(line);
      }
    },
    flush() {
      if (buffer) {
        handleLine(buffer);
        buffer = "";
      }
    },
    result() {
      if (!full.trim()) {
        throw new AIError("The AI platform returned an empty answer.");
      }
      return full;
    },
  };
}

async function readEventStream(response, onDelta) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser(onDelta);

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    parser.push(decoder.decode(value, { stream: true }));
  }
  parser.push(decoder.decode());
  parser.flush();
  return parser.result();
}
