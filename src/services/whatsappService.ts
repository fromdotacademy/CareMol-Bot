import axios from 'axios';

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

// Meta counts both grapheme clusters (what the user sees) and code units inconsistently
// across surfaces, so we measure both and enforce the tighter bound.
const GRAPHEME_SEGMENTER = typeof Intl !== 'undefined' && (Intl as any).Segmenter
  ? new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' })
  : null;

function graphemeLength(s: string): number {
  if (!GRAPHEME_SEGMENTER) return s.length;
  let n = 0;
  for (const _ of GRAPHEME_SEGMENTER.segment(s)) n++;
  return n;
}

function assertLabelFits(label: string, limit: number, context: string): string {
  const graphemes = graphemeLength(label);
  const units = label.length;
  if (graphemes > limit || units > limit) {
    const msg = `[WhatsApp] Label exceeds ${limit}-char limit (${graphemes} graphemes / ${units} UTF-16 units) in ${context}: "${label}"`;
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(msg);
    }
    console.error(msg);
    // Truncate by graphemes if possible to avoid splitting a combining mark.
    if (GRAPHEME_SEGMENTER) {
      const parts: string[] = [];
      for (const seg of GRAPHEME_SEGMENTER.segment(label)) {
        if (parts.length >= limit) break;
        parts.push(seg.segment);
      }
      return parts.join('');
    }
    return label.substring(0, limit);
  }
  return label;
}

export async function sendWhatsAppMessage(to: string, message: string, buttons?: string[], imageUrl?: string) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.warn('WhatsApp API credentials missing');
    return;
  }

  const url = `https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_ID}/messages`;

  try {
    if (buttons && buttons.length > 0) {
      if (buttons.length <= 3) {
        // Send Button Reply (Limited to 3), optionally with an image header
        const interactive: Record<string, unknown> = {
          type: 'button',
          body: { text: message },
          action: {
            buttons: buttons.map((btn, index) => ({
              type: 'reply',
              reply: {
                id: `btn_${index}`,
                title: assertLabelFits(btn, 20, `reply button #${index}`)
              }
            }))
          }
        };
        if (imageUrl) {
          interactive.header = { type: 'image', image: { link: imageUrl } };
        }
        await axios.post(
          url,
          {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'interactive',
            interactive,
          },
          { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
        );
      } else {
        // Send List Message (Up to 10)
        await axios.post(
          url,
          {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'interactive',
            interactive: {
              type: 'list',
              header: { type: 'text', text: 'Menu' },
              body: { text: message },
              footer: { text: 'Select an option' },
              action: {
                button: 'Options',
                sections: [
                  {
                    title: 'Choices',
                    rows: buttons.slice(0, 10).map((btn, index) => ({
                      id: `row_${index}`,
                      title: assertLabelFits(btn, 24, `list row #${index}`),
                      description: ''
                    }))
                  }
                ]
              }
            }
          },
          { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
        );
      }
    } else {
      // Regular Text Message
      await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: { body: message }
        },
        { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
      );
    }
  } catch (error: any) {
    console.error('Error sending WhatsApp message:', error.response?.data || error.message);
  }
}
