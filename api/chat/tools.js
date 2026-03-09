import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { createLead, markLeadEmailSent } from './db.js';

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

async function captureLead({ name, email, phone, interest }, conversationId) {
  if (!name || name.trim().length === 0) {
    return { error: 'Name is required to capture a lead.' };
  }
  if (!email && !phone) {
    return { error: 'At least one contact method (email or phone) is required.' };
  }

  const sanitized = {
    name: name.trim().slice(0, 200),
    email: email ? email.trim().slice(0, 200) : null,
    phone: phone ? phone.trim().slice(0, 50) : null,
    interest: interest ? interest.trim().slice(0, 500) : null,
  };

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

export { TOOL_SCHEMAS, executeTool };
