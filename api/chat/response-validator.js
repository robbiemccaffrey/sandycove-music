const VALID_PRICES = [30, 40, 50, 270, 330, 400];
// Savings amounts mentioned in package deals (save €30, save €70, save €100)
const VALID_SAVINGS = [30, 70, 100];

const SAFE_FALLBACK =
  "I'd be happy to help! For detailed information, feel free to give us a call on 086 872 9764 or use the contact form on our website.";

// Layer 1: Cross-reference checks (deterministic)
function layer1CrossReference(response, toolResults) {
  const issues = [];

  // Check tool result consistency
  for (const result of toolResults) {
    if (result.name === 'capture_lead') {
      if (result.output?.error && /confirmed|booked|saved.*details/i.test(response)) {
        issues.push('Claims lead was captured but tool returned an error.');
      }
      if (result.output?.captured && !/touch|contact|reach|follow up|noted|got/i.test(response)) {
        issues.push('Lead was captured but response does not acknowledge it.');
      }
    }
  }

  // Price verification: extract euro amounts and check against valid prices
  const priceMatches = response.match(/€\s*(\d+(?:\.\d{2})?)/g);
  if (priceMatches) {
    for (const match of priceMatches) {
      const amount = parseFloat(match.replace(/€\s*/, ''));
      // Allow half-price amounts for the 50% first lesson offer
      const halfPrices = VALID_PRICES.map((p) => p / 2);
      if (!VALID_PRICES.includes(amount) && !halfPrices.includes(amount) && !VALID_SAVINGS.includes(amount)) {
        issues.push(`Invalid price mentioned: ${match}. Not in our price list.`);
      }
    }
  }

  // Instrument check: flag instruments we don't offer
  const otherInstruments = /\b(guitar|violin|drums|singing|voice|flute|saxophone|cello|trumpet)\b/i;
  const instrMatch = response.match(otherInstruments);
  if (instrMatch) {
    // Only flag if it sounds like we offer it (not negated)
    const context = response.toLowerCase();
    const instrument = instrMatch[1].toLowerCase();
    const offeringPatterns = [
      new RegExp(`(?<!don'?t |not |doesn'?t |won'?t |cannot |can'?t )offer ${instrument}`),
      new RegExp(`(?<!don'?t |not |doesn'?t |won'?t |cannot |can'?t )teach ${instrument}`),
      new RegExp(`(?<!no )${instrument} lessons`),
      new RegExp(`(?<!no )${instrument} tuition`),
    ];
    for (const pattern of offeringPatterns) {
      if (pattern.test(context)) {
        issues.push(`Mentions offering ${instrument} — we only teach piano.`);
        break;
      }
    }
  }

  return issues;
}

// Layer 2: Guardrail patterns (regex)
function layer2Guardrails(response) {
  const issues = [];

  // Character breaks — AI identity reveals
  const characterBreaks = [
    /i'?m an ai\b/i,
    /language model/i,
    /virtual assistant/i,
    /\bchatbot\b/i,
    /artificial intelligence/i,
    /i'?m a bot\b/i,
    /as an ai\b/i,
    /i'?m not a real/i,
    /i'?m not actually/i,
    /i don'?t have feelings/i,
    /i was (created|made|built|trained) by/i,
    /\bopenai\b/i,
    /\bgpt\b/i,
    /\bclaude\b/i,
  ];
  for (const pattern of characterBreaks) {
    if (pattern.test(response)) {
      issues.push(`Character break detected: matches ${pattern}`);
      break;
    }
  }

  // System prompt leaks
  const promptLeaks = [
    /CRITICAL RULES/i,
    /TOOL_SCHEMAS/i,
    /SYSTEM_PROMPT/i,
    /\bcapture_lead\b/,
    /NON-NEGOTIABLE/i,
    /BRAND VOICE/i,
  ];
  for (const pattern of promptLeaks) {
    if (pattern.test(response)) {
      issues.push(`System prompt leak: matches ${pattern}`);
      break;
    }
  }

  // Raw JSON from tool results
  if (/\{"(?:captured|error)":/i.test(response)) {
    issues.push('Raw tool JSON exposed in response.');
  }

  // Off-topic content indicators
  if (/```[\s\S]{20,}```/.test(response)) {
    issues.push('Code block detected in response.');
  }
  if (/^(ingredients|recipe|instructions):/im.test(response)) {
    issues.push('Off-topic content (recipe/instructions) detected.');
  }

  // Dollar signs instead of euro
  if (/\$\d/.test(response)) {
    issues.push('Dollar sign detected — should use EUR (€).');
  }

  return issues;
}

function validateResponse(response, toolResults = []) {
  const l1Issues = layer1CrossReference(response, toolResults);
  const l2Issues = layer2Guardrails(response);
  const allIssues = [...l1Issues, ...l2Issues];

  return {
    valid: allIssues.length === 0,
    issues: allIssues,
  };
}

function buildCorrectionPrompt(issues) {
  return (
    'Your previous response had issues that need correcting. ' +
    'Please rewrite your response addressing these problems:\n' +
    issues.map((i) => `- ${i}`).join('\n') +
    '\n\nRemember: You are a member of the Sandycove School of Music team. ' +
    'Only quote our exact prices. Only discuss piano lessons. ' +
    'Never reveal you are an AI.'
  );
}

export { validateResponse, buildCorrectionPrompt, SAFE_FALLBACK, VALID_PRICES, VALID_SAVINGS };
