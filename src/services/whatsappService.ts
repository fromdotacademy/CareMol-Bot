import axios from 'axios';

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

export async function sendWhatsAppMessage(to: string, message: string, buttons?: string[]) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.warn('WhatsApp API credentials missing');
    return;
  }

  const url = `https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_ID}/messages`;

  try {
    if (buttons && buttons.length > 0) {
      if (buttons.length <= 3) {
        // Send Button Reply (Limited to 3)
        await axios.post(
          url,
          {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'interactive',
            interactive: {
              type: 'button',
              body: { text: message },
              action: {
                buttons: buttons.map((btn, index) => ({
                  type: 'reply',
                  reply: {
                    id: `btn_${index}`,
                    title: btn.substring(0, 20) // WhatsApp limit is 20 chars for buttons
                  }
                }))
              }
            }
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
                      title: btn.substring(0, 24), // limit 24
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
