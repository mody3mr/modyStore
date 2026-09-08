// ModyStore WhatsApp Cloud API bridge.
// Secrets stay on the backend. The dashboard only calls /whatsapp/order-confirmation.

const crypto = require('crypto');
const express = require('express');

function normalizePhone(value = '') {
  let phone = String(value).replace(/\D/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (phone.startsWith('0')) phone = `20${phone.slice(1)}`;
  return phone;
}

function createWhatsAppRouter({ db }) {
  const router = express.Router();
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0';
  const accessToken = process.env.META_ACCESS_TOKEN || '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const templateName = process.env.WHATSAPP_ORDER_CONFIRM_TEMPLATE || 'order_confirmation';
  const templateLanguage = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'ar';
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || '';
  const appSecret = process.env.META_APP_SECRET || '';
  const skipSignature = process.env.WHATSAPP_SKIP_SIGNATURE === 'true';

  async function sendTemplate(body) {
    const phone = normalizePhone(body.phone || body.customer?.phone);
    const orderDbId = String(body.orderDbId || '').trim();
    const orderId = String(body.orderId || '').trim();
    if (!accessToken || !phoneNumberId) throw new Error('WhatsApp credentials are not configured on the backend.');
    if (!orderDbId || !orderId || !phone) throw new Error('orderDbId, orderId and phone are required.');

    const graphUrl = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;
    const components = [
      { type: 'body', parameters: [
        { type: 'text', parameter_name: 'customer_name', text: String(body.customer?.name || 'عميل') },
        { type: 'text', parameter_name: 'order_id', text: orderId },
        { type: 'text', parameter_name: 'items', text: (body.items || []).map(i => `${i.name} x${i.qty}`).join('، ') || 'لا توجد منتجات' },
        { type: 'text', parameter_name: 'total', text: `${Math.round(Number(body.total || 0))} ج.م` }
      ] },
      { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: `confirm_order:${orderDbId}` }] },
      { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: `cancel_order:${orderDbId}` }] }
    ];
    const response = await fetch(graphUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: phone, type: 'template',
        template: { name: templateName, language: { code: templateLanguage }, components }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error?.message || `WhatsApp API returned ${response.status}`);
      error.status = response.status;
      error.details = data;
      throw error;
    }
    return { ok: true, messageId: data.messages?.[0]?.id || null };
  }

  function validSignature(req) {
    if (skipSignature) return true;
    if (!appSecret) return false;
    const received = String(req.get('x-hub-signature-256') || '');
    if (!received.startsWith('sha256=')) return false;
    const expected = crypto.createHmac('sha256', appSecret)
      .update(req.rawBody || Buffer.from(JSON.stringify(req.body || {})))
      .digest('hex');
    const a = Buffer.from(received.slice(7), 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  function extractAction(body) {
    for (const entry of (body?.entry || [])) {
      for (const change of (entry.changes || [])) {
        for (const message of (change.value?.messages || [])) {
          const reply = message.interactive?.button_reply || message.button || {};
          const raw = String(reply.id || reply.payload || '').trim();
          const match = raw.match(/^(confirm_order|cancel_order):([^:]+)$/i);
          if (match) return {
            action: match[1].toLowerCase() === 'confirm_order' ? 'confirmed' : 'cancelled',
            orderDbId: match[2],
            from: normalizePhone(message.from || '')
          };
        }
      }
    }
    return null;
  }

  async function restoreStockOnce(orderRef, order) {
    if (!order?.stockDeducted || order.stockRestored === true) return false;
    const claim = await orderRef.child('stockRestoreInProgress').transaction(current => current === true ? undefined : true);
    if (!claim.committed) return false;
    try {
      for (const item of order.items || []) {
        const result = await db.ref(`products/${item.id}/stock`).transaction(current => (Number(current) || 0) + Number(item.qty || 0));
        if (!result.committed) throw new Error(`تعذر إعادة مخزون المنتج: ${item.name || item.id}`);
      }
      await orderRef.update({ stockRestored: true, stockRestoredAt: Date.now(), stockRestoreInProgress: null });
      return true;
    } catch (error) {
      await orderRef.child('stockRestoreInProgress').remove().catch(() => {});
      throw error;
    }
  }

  router.post('/order-confirmation', async (req, res) => {
    try {
      res.json(await sendTemplate(req.body || {}));
    } catch (error) {
      console.error('WhatsApp send failed:', error.details || error.message);
      res.status(error.status || 500).json({ error: error.message || 'WhatsApp send failed' });
    }
  });

  // Meta calls this URL once while the webhook is being configured.
  router.get('/webhook', (req, res) => {
    if (!verifyToken || req.query['hub.verify_token'] !== verifyToken) return res.sendStatus(403);
    return res.status(200).send(String(req.query['hub.challenge'] || ''));
  });

  router.post('/webhook', async (req, res) => {
    if (!validSignature(req)) return res.sendStatus(401);
    const action = extractAction(req.body || {});
    if (!action) return res.sendStatus(200);
    try {
      const orderRef = db.ref(`orders/${action.orderDbId}`);
      const snapshot = await orderRef.once('value');
      if (!snapshot.exists()) return res.sendStatus(200);
      const order = snapshot.val() || {};
      const expectedPhone = normalizePhone(order.customer?.phone);
      if (action.from && expectedPhone && action.from !== expectedPhone) return res.sendStatus(403);
      if (order.customerConfirmation?.status === action.action) return res.sendStatus(200);

      const now = Date.now();
      const confirmation = { ...(order.customerConfirmation || {}), status: action.action, orderDbId: action.orderDbId, updatedAt: now };
      const updates = {
        [`orders/${action.orderDbId}/customerConfirmation`]: confirmation,
        [`whatsappConfirmations/${action.orderDbId}`]: { status: action.action, orderDbId: action.orderDbId, updatedAt: now }
      };
      if (action.action === 'confirmed' && !['ملغي', 'مرتجع'].includes(order.status)) updates[`orders/${action.orderDbId}/status`] = 'جاري التجهيز';
      if (action.action === 'cancelled') {
        await restoreStockOnce(orderRef, order);
        updates[`orders/${action.orderDbId}/status`] = 'ملغي';
        updates[`orders/${action.orderDbId}/cancelledAt`] = now;
        updates[`orders/${action.orderDbId}/cancelReason`] = 'تم الإلغاء من العميل عبر WhatsApp';
      }
      await db.ref().update(updates);
      return res.sendStatus(200);
    } catch (error) {
      console.error('WhatsApp webhook failed:', error);
      return res.sendStatus(500);
    }
  });

  return router;
}

module.exports = createWhatsAppRouter;
