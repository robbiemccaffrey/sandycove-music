import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { createLead, countRecentLeads, markLeadEmailSent } from './db.js';

const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL || 'noreply@sandycoveschoolofmusic.com';
const SES_TO_EMAIL = process.env.SES_TO_EMAIL || 'info@sandycoveschoolofmusic.com';
const AWS_REGION = process.env.AWS_REGION || 'eu-west-1';

const ses = new SESClient({ region: AWS_REGION });

const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'capture_lead',
      description:
        'Capture a prospective student lead when they provide their name and at least one contact method (email or phone). Only call this when the visitor has voluntarily shared this information.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: "The visitor's name",
          },
          email: {
            type: 'string',
            description: "The visitor's email address (optional if phone provided)",
          },
          phone: {
            type: 'string',
            description: "The visitor's phone number (optional if email provided)",
          },
          interest: {
            type: 'string',
            description:
              'Brief description of what the visitor is interested in (e.g., "adult beginner lessons", "RIAM Grade 5 prep")',
          },
        },
        required: ['name'],
      },
    },
  },
];

async function executeTool(name, args, conversationId) {
  if (name === 'capture_lead') {
    return await captureLead(args, conversationId);
  }
  return { error: `Unknown tool: ${name}` };
}

const LEAD_RATE_LIMIT = 3;
const LEAD_RATE_WINDOW_MINUTES = 60;

function validatePhone(raw) {
  if (!raw) return { valid: false, error: 'No phone number provided.' };

  // Strip formatting characters
  const stripped = raw.replace(/[\s\-().]/g, '');

  // Reject if contains non-digit characters (except leading +)
  if (!/^\+?\d+$/.test(stripped)) {
    return { valid: false, error: 'Please provide a valid phone number.' };
  }

  const digits = stripped.replace(/^\+/, '');

  // Irish mobile: 08X XXXXXXX (10 digits starting with 08)
  if (/^08[3-9]\d{7}$/.test(stripped)) {
    const normalized = '+353 ' + stripped.slice(1, 3) + ' ' + stripped.slice(3, 6) + ' ' + stripped.slice(6);
    return { valid: true, normalized };
  }

  // Irish international: +3538X... or 003538X...
  const irishIntlMatch = stripped.match(/^(?:\+353|00353)(8[3-9]\d{7})$/);
  if (irishIntlMatch) {
    const num = irishIntlMatch[1];
    const normalized = '+353 ' + num.slice(0, 2) + ' ' + num.slice(2, 5) + ' ' + num.slice(5);
    return { valid: true, normalized };
  }

  // Irish landline (01, 02X, 04X, 05X, 06X, 07X, 09X) — reject
  if (/^0[1-79]/.test(stripped)) {
    return { valid: false, error: 'We need a mobile number rather than a landline. Irish mobile numbers start with 08 (e.g. 085, 086, 087).' };
  }

  // International with + prefix: E.164 (7-15 digits)
  if (stripped.startsWith('+') && digits.length >= 7 && digits.length <= 15) {
    return { valid: true, normalized: raw.trim() };
  }

  // Digits only, no + prefix, not Irish — likely missing country code
  if (digits.length >= 7 && digits.length <= 15) {
    return { valid: false, error: "That doesn't look like an Irish mobile number. Could you include the country code? For example, +44 for the UK or +1 for the US." };
  }

  return { valid: false, error: 'Please provide a valid phone number.' };
}

async function captureLead({ name, email, phone, interest }, conversationId) {
  // Rate limit: max 3 leads per conversation per hour
  const recentCount = countRecentLeads(conversationId, LEAD_RATE_WINDOW_MINUTES);
  if (recentCount >= LEAD_RATE_LIMIT) {
    return { error: "We already have your details — the team will be in touch soon!" };
  }

  if (!name || name.trim().length === 0) {
    return { error: 'Name is required to capture a lead.' };
  }
  if (!email && !phone) {
    return { error: 'At least one contact method (email or phone) is required.' };
  }

  const sanitized = {
    name: name.trim().slice(0, 200),
    email: email ? email.trim().slice(0, 200) : null,
    phone: null,
    interest: interest ? interest.trim().slice(0, 500) : null,
  };

  if (phone) {
    const phoneResult = validatePhone(phone);
    if (!phoneResult.valid) {
      return { error: phoneResult.error };
    }
    sanitized.phone = phoneResult.normalized;
  }

  if (sanitized.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitized.email)) {
    return { error: 'Invalid email format.' };
  }

  const leadId = createLead(
    conversationId,
    sanitized.name,
    sanitized.email,
    sanitized.phone,
    sanitized.interest
  );

  // Send notification email via SES
  const emailBody = [
    'New lead captured via chat widget:',
    '',
    `Name: ${sanitized.name}`,
    sanitized.email ? `Email: ${sanitized.email}` : null,
    sanitized.phone ? `Phone: ${sanitized.phone}` : null,
    sanitized.interest ? `Interest: ${sanitized.interest}` : null,
    '',
    `Conversation ID: ${conversationId}`,
  ]
    .filter((line) => line !== null)
    .join('\n');

  try {
    await ses.send(
      new SendEmailCommand({
        Source: SES_FROM_EMAIL,
        Destination: { ToAddresses: [SES_TO_EMAIL] },
        Message: {
          Subject: {
            Data: `New chat lead: ${sanitized.name.slice(0, 78)}`,
            Charset: 'UTF-8',
          },
          Body: { Text: { Data: emailBody, Charset: 'UTF-8' } },
        },
      })
    );
    markLeadEmailSent(leadId);
  } catch (err) {
    console.error('SES lead email error:', err.message);
    // Don't fail the tool call — lead is saved in DB regardless
  }

  return { captured: true, leadId };
}

export { TOOL_SCHEMAS, executeTool, validatePhone, LEAD_RATE_LIMIT, LEAD_RATE_WINDOW_MINUTES };
