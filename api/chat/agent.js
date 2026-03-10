import { SYSTEM_PROMPT } from './prompts.js';
import { TOOL_SCHEMAS, executeTool } from './tools.js';
import {
  validateResponse,
  buildCorrectionPrompt,
  SAFE_FALLBACK,
} from './response-validator.js';
import { UsageTracker } from './tracking.js';
import {
  getConversation,
  createConversation,
  updateConversation,
} from './db.js';

const MODEL = 'gpt-4o-mini';
const MAX_ITERATIONS = 10;
const INPUT_MAX_LENGTH = 500;
const MAX_TURNS_PER_CONVERSATION = 50;
const COMPRESS_THRESHOLD = 20; // non-system messages before compression
const KEEP_RECENT = 6;

const INPUT_TOO_LONG_RESPONSE =
  "That message is a bit long for our chat! Could you shorten your question? Or feel free to call us on 086 872 9764 — we're happy to help.";

async function chat(openai, { sessionId, message, ipAddress, userAgent }) {
  // Input guard
  if (!message || typeof message !== 'string') {
    return { sessionId, reply: "I didn't catch that. Could you try again?" };
  }
  const trimmed = message.trim();
  if (trimmed.length === 0) {
    return { sessionId, reply: "I didn't catch that. Could you try again?" };
  }
  if (trimmed.length > INPUT_MAX_LENGTH) {
    return { sessionId, reply: INPUT_TOO_LONG_RESPONSE };
  }

  // Load or create conversation
  let conversation = sessionId ? getConversation(sessionId) : null;

  // Turn cap: prevent runaway conversations
  if (conversation && conversation.turn_count >= MAX_TURNS_PER_CONVERSATION) {
    return {
      sessionId,
      reply: "We've had a great chat! For anything else, feel free to call us on 086 872 9764 or use the 'Leave a message' form.",
    };
  }

  if (!conversation) {
    const { randomUUID } = await import('crypto');
    sessionId = randomUUID();
    createConversation(sessionId, ipAddress, userAgent);
    conversation = {
      id: sessionId,
      messages: [],
      turn_count: 0,
      total_tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_cost: 0,
      total_duration_ms: 0,
    };
  }

  let messages = conversation.messages;
  const tracker = new UsageTracker();

  // Compress history if needed
  messages = await maybeCompressHistory(openai, messages, tracker);

  // Append user message
  messages.push({ role: 'user', content: trimmed });

  // Build messages for API call (prepend system prompt)
  const apiMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];

  let reply = SAFE_FALLBACK;
  let toolResults = [];

  // Orchestration loop
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const start = Date.now();
    let completion;

    try {
      completion = await openai.chat.completions.create({
        model: MODEL,
        messages: apiMessages,
        tools: TOOL_SCHEMAS,
        temperature: 0.7,
        max_tokens: 500,
      });
    } catch (err) {
      console.error('OpenAI API error:', err.message);
      reply = SAFE_FALLBACK;
      break;
    }

    const durationMs = Date.now() - start;
    const choice = completion.choices[0];
    const usage = completion.usage;

    tracker.track(MODEL, usage, durationMs, choice.message.tool_calls?.length || 0);

    // Handle tool calls
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      apiMessages.push(choice.message);

      for (const toolCall of choice.message.tool_calls) {
        let args;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }

        const result = await executeTool(toolCall.function.name, args, sessionId, ipAddress);
        toolResults.push({ name: toolCall.function.name, output: result });

        apiMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
      continue; // Loop again for model to generate text response
    }

    // Text response — validate
    const rawReply = choice.message.content || '';
    const validation = validateResponse(rawReply, toolResults);

    if (validation.valid) {
      reply = rawReply;
      apiMessages.push({ role: 'assistant', content: reply });
      break;
    }

    // Retry once with correction prompt (no tools)
    console.warn('Validation failed:', validation.issues);
    const correctionMessages = [
      ...apiMessages,
      { role: 'assistant', content: rawReply },
      { role: 'user', content: buildCorrectionPrompt(validation.issues) },
    ];

    const retryStart = Date.now();
    try {
      const retryCompletion = await openai.chat.completions.create({
        model: MODEL,
        messages: correctionMessages,
        temperature: 0.5,
        max_tokens: 500,
      });

      tracker.track(MODEL, retryCompletion.usage, Date.now() - retryStart);
      const retryReply = retryCompletion.choices[0].message.content || '';
      const retryValidation = validateResponse(retryReply, toolResults);

      if (retryValidation.valid) {
        reply = retryReply;
        apiMessages.push({ role: 'assistant', content: reply });
      } else {
        console.warn('Retry also failed validation:', retryValidation.issues);
        reply = SAFE_FALLBACK;
        apiMessages.push({ role: 'assistant', content: reply });
      }
    } catch (err) {
      console.error('OpenAI retry error:', err.message);
      reply = SAFE_FALLBACK;
      apiMessages.push({ role: 'assistant', content: reply });
    }
    break;
  }

  // Extract conversation messages (exclude system prompt)
  const updatedMessages = apiMessages.filter((m) => m.role !== 'system');

  // Merge usage: existing + new
  const summary = tracker.getSummary();
  const mergedUsage = {
    turnCount: conversation.turn_count + summary.turnCount,
    totalTokens: conversation.total_tokens + summary.totalTokens,
    inputTokens: conversation.input_tokens + summary.inputTokens,
    outputTokens: conversation.output_tokens + summary.outputTokens,
    totalCost: conversation.total_cost + summary.totalCost,
    totalDurationMs: conversation.total_duration_ms + summary.totalDurationMs,
  };

  updateConversation(sessionId, updatedMessages, mergedUsage);

  return { sessionId, reply };
}

async function maybeCompressHistory(openai, messages, tracker) {
  // Count non-system, non-tool messages
  const contentMessages = messages.filter(
    (m) => m.role === 'user' || m.role === 'assistant'
  );

  if (contentMessages.length < COMPRESS_THRESHOLD) {
    return messages;
  }

  // Keep only the last KEEP_RECENT messages, summarize the rest
  const toSummarize = messages.slice(0, messages.length - KEEP_RECENT);
  const toKeep = messages.slice(messages.length - KEEP_RECENT);

  const summaryPrompt = [
    {
      role: 'system',
      content:
        'Summarize this conversation in 2-3 sentences, preserving key facts (student name, interests, any pricing discussed, any lead captured). Be concise.',
    },
    ...toSummarize,
  ];

  try {
    const start = Date.now();
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: summaryPrompt,
      temperature: 0.3,
      max_tokens: 200,
    });
    tracker.track(MODEL, completion.usage, Date.now() - start);

    const summary = completion.choices[0].message.content || '';
    return [
      { role: 'assistant', content: `[Earlier conversation summary: ${summary}]` },
      ...toKeep,
    ];
  } catch (err) {
    console.error('Compression failed (fail-open):', err.message);
    return messages; // Fail open — keep full history
  }
}

export { chat };
