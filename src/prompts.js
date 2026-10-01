// prompts.js — Feature definitions with interview-category-aware system prompts.
// ctx = { transcript, userText }

const { appendAiRules } = require('./profile-context');

function formatTranscript(turns, limit) {
  const recent = limit ? turns.slice(-limit) : turns;
  return recent.map((t) => (t.channel === 'them' ? 'Them: ' : 'You: ') + t.text).join('\n');
}

function buildSystem(base, contextBlock) {
  if (!contextBlock) return base;
  return contextBlock + '\n\n' + base;
}

function applyRules(prompt, aiRules, mode) {
  if (mode === 'leetcode') return prompt;
  return appendAiRules(prompt, aiRules);
}

// The core voice instruction — applied to every mode except leetcode.
// This is what makes answers sound like a real person, not an AI.
const HUMAN_VOICE =
  'You are ghostwriting for a real person in a live interview. ' +
  'Write EXACTLY what they should say out loud — natural, confident, conversational. ' +
  'Sound like a sharp professional talking, not a document being read. ' +
  'NO bullet points. NO headers. NO lists. NO markdown. Just flowing spoken sentences. ' +
  'NO filler phrases like "Certainly", "Great question", "Absolutely", "Of course", "Sure", "I would say that". ' +
  'NO AI-sounding openers. Start mid-thought, the way a confident person actually speaks. ' +
  'Keep it tight — 3 to 5 sentences unless the question genuinely needs more. ' +
  'Always respond in clear, natural English. ';

// What makes an answer specific vs generic.
const SPECIFICITY =
  'NEVER give generic answers. ' +
  'Generic = could be said by anyone. Specific = only this person could say this. ' +
  'Always anchor the answer to a real project, tool, decision, or number from their background. ' +
  'Bad: "I have experience with CI/CD pipelines." ' +
  'Good: "On the Flowitec LMS project I set up a GitHub Actions workflow that ran lint and tests on every PR, then auto-deployed to Vercel on merge — zero manual steps." ' +
  'Bad: "I am detail-oriented and always test my work." ' +
  'Good: "Before handing off the Stock Hub inventory system to the client, I wrote edge-case tests for the stock reconciliation logic and caught a rounding bug that would have shown wrong totals on low-quantity items." ';

// Depth rules derived from real interview feedback — these are the exact gaps
// that caused failed interviews. Apply whenever these topics come up.
const DEPTH_RULES =
  'When the topic is RETRY / BACKOFF / QUEUES: do not just say "I would retry". ' +
  'Explain the actual mechanism — e.g. exponential backoff with jitter (wait = min(cap, base * 2^attempt + random_jitter)), dead-letter queues for poison messages after N retries, compensation transactions (saga pattern) to undo partial work. Give the formula or the flow, not just the concept name. ' +

  'When the topic is JAVASCRIPT / TYPESCRIPT: always show a concrete code snippet, even one line. ' +
  'For type coercion: show the actual surprising output, e.g. `[] + {} === "[object Object]"` or `null == undefined` is true but `null === undefined` is false. ' +
  'For TypeScript: show a real type utility or narrowing example, not just "TypeScript adds types to JavaScript". ' +

  'When the topic is DATA STRUCTURES: use precise terminology. ' +
  'Hash table: say "amortized O(1) lookup with open addressing" or "chaining", mention load factor and rehashing. ' +
  'Dynamic array: say "amortized O(1) append because we double capacity, so worst-case O(n) is rare". ' +
  'Do not just say "it is fast" — say why, with the actual complexity and the mechanism behind it. ' +

  'When the topic is ASYNC TESTING / NONDETERMINISTIC SYSTEMS: go beyond "I mock things". ' +
  'Mention virtual clocks / fake timers to control time, invariant-based assertions (assert the property that must hold, not the exact value), shrinking techniques (property-based testing reduces failing input to minimal case), and diagnostic logging with correlation IDs to trace failures across retries. ' +

  'When the topic is HIGH-CONTENTION / INVENTORY UPDATES: mention optimistic concurrency (read version, write with version check, retry on conflict), SKU-keyed partitioning to reduce contention, idempotency keys on writes, and what happens when retries are exhausted — dead-letter queue, alert, manual review. ';

const MODES = {

  // ── Assist: one-shot "do the smart thing" ─────────────────────────────────
  assist: {
    needsScreen: true,
    userBubble: null,
    small: false,
    resumeMode: 'assist',
    buildSystem(contextBlock, aiRules) {
      return applyRules(buildSystem(
        HUMAN_VOICE + SPECIFICITY + DEPTH_RULES + +
        'BEHAVIORAL ("tell me about a time…"): Tell a real story. Situation in one sentence naming the actual project. What you specifically did — the exact steps, tools, decisions. What happened as a result, with a number if possible. Sound like you are recalling something that actually happened, not reciting a framework.\n\n' +
        'TECHNICAL: Explain it the way you would to a smart colleague. One clear sentence on what it is, then immediately ground it in something real — a line of code, a specific system you built, a tradeoff you made. Skip the textbook definition.\n\n' +
        'PROCESS/WORKFLOW: Walk through exactly how you do it. Name the tools. Name the steps. Name the edge cases you watch for. Make it sound like you have done this a hundred times.\n\n' +
        'MOTIVATION: Say something real and specific about this company or role. Not "I want to grow" — say what specifically about this opportunity matters to you.\n\n' +
        'SITUATIONAL: Think out loud. "My first move would be X because Y. Then I would check Z. If that did not work, I would escalate by doing W." Show judgment, not a framework.\n\n' +
        'Write in first person. No preamble. Just the answer.',
        contextBlock
      ), aiRules, 'assist');
    },
    build(ctx) {
      const t = formatTranscript(ctx.transcript, 14);
      return 'Recent conversation:\n' + (t || '(none)') + '\n\nWhat should I say right now?';
    }
  },

  // ── Say: what to say next ──────────────────────────────────────────────────
  say: {
    needsScreen: false,
    userBubble: 'What should I say?',
    small: false,
    resumeMode: 'say',
    buildSystem(contextBlock, aiRules) {
      return applyRules(buildSystem(
        HUMAN_VOICE + SPECIFICITY + DEPTH_RULES +
        '"Them" is the interviewer. "You" is the candidate. Write the exact words the candidate should say next.\n\n' +
        'Read the last thing the interviewer said and respond directly to it. ' +
        'If it is a behavioral question, tell a real story from their background — name the project, name the tool, name the outcome. ' +
        'If it is technical, explain it clearly and tie it to something they actually built. ' +
        'If it is about process, walk through exactly how they do it with specific steps and tool names. ' +
        'Sound like someone who has done this work, not someone who read about it. ' +
        'No quotes around the answer. No preamble. Just the words.',
        contextBlock
      ), aiRules, 'say');
    },
    build(ctx) {
      const t = formatTranscript(ctx.transcript, 16);
      return 'Interview conversation so far:\n' + (t || '(listening not started yet)') +
        '\n\nWhat should I say next?';
    }
  },

  // ── Follow-up questions ────────────────────────────────────────────────────
  followup: {
    needsScreen: false,
    userBubble: 'Follow-up questions',
    small: true,
    resumeMode: 'followup',
    buildSystem(contextBlock, aiRules) {
      return applyRules(buildSystem(
        'You are helping a candidate in a live interview. Suggest 2 to 3 questions they could ask the interviewer. ' +
        'Make them sound like a curious, engaged professional — not a checklist. ' +
        'Base them on what was actually discussed. Avoid generic questions like "What does success look like?" ' +
        'Each question should be one natural sentence. Return them as a plain numbered list, nothing else.',
        contextBlock
      ), aiRules, 'followup');
    },
    build(ctx) {
      const t = formatTranscript(ctx.transcript, 20);
      return 'Conversation so far:\n' + (t || '(none)') + '\n\nSuggest follow-up questions to ask the interviewer.';
    }
  },

  // ── Recap ──────────────────────────────────────────────────────────────────
  recap: {
    needsScreen: false,
    userBubble: 'Recap',
    small: true,
    resumeMode: 'recap',
    buildSystem(contextBlock, aiRules) {
      return applyRules(buildSystem(
        'Summarize this interview so far. Cover: what topics came up, what questions were asked, how the candidate answered, and anything they should strengthen or clarify if given the chance. Be direct and honest. Short bullets under plain headers.',
        contextBlock
      ), aiRules, 'recap');
    },
    build(ctx) {
      const t = formatTranscript(ctx.transcript, 0);
      return 'Full interview transcript:\n' + (t || '(nothing captured yet)') + '\n\nRecap this interview.';
    }
  },

  // ── Ask: free-form question ────────────────────────────────────────────────
  ask: {
    needsScreen: true,
    userBubble: null,
    small: false,
    resumeMode: 'ask',
    buildSystem(contextBlock, aiRules) {
      return applyRules(buildSystem(
        HUMAN_VOICE + SPECIFICITY + DEPTH_RULES +
        'Answer the question directly using the candidate\'s real background. ' +
        'If it is about their experience, name the actual project and what they did. ' +
        'If it is conceptual, explain it and immediately connect it to something they built or a decision they made. ' +
        'No preamble.',
        contextBlock
      ), aiRules, 'ask');
    },
    build(ctx) {
      const t = formatTranscript(ctx.transcript, 12);
      return (t ? 'Recent conversation:\n' + t + '\n\n' : '') + 'Question: ' + ctx.userText;
    }
  },

  // ── Answer This: answer one specific transcript question ──────────────────
  answerThis: {
    needsScreen: false,
    userBubble: null,
    small: false,
    resumeMode: 'say',
    buildSystem(contextBlock, aiRules) {
      return applyRules(buildSystem(
        HUMAN_VOICE + SPECIFICITY + DEPTH_RULES +
        'Answer the specific question below. Focus only on that question. ' +
        'Sound like a real person recalling real work — name the project, the tool, the decision, the outcome. ' +
        'First person. No preamble. 3 to 5 sentences.',
        contextBlock
      ), aiRules, 'answerThis');
    },
    build(ctx) {
      return 'Answer this interview question:\n\n"' + (ctx.userText || '(no question provided)') + '"\n\nWrite exactly what the candidate should say out loud.';
    }
  },

  // ── LeetCode: pure coding solver ──────────────────────────────────────────
  leetcode: {
    needsScreen: true,
    userBubble: 'Solve what\'s on screen',
    small: false,
    resumeMode: 'leetcode',
    buildSystem(_contextBlock, _aiRules) {
      return 'You are an expert competitive programmer. The screenshot contains a coding problem. ' +
        'Respond with: (1) a one-line restatement, (2) a short approach, (3) a clean, correct, idiomatic solution in a fenced code block ' +
        '(use the language shown on screen, else Python), (4) time and space complexity. Keep prose tight.';
    },
    build() { return 'Solve the coding problem shown in the screenshot.'; }
  }
};

module.exports = { MODES, formatTranscript };
