// ModyStore — secure WhatsApp confirmation bridge (example)
// Mount this Express router from your existing Node/Express backend.
// Keep META_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in server environment variables.
// The storefront posts order data here immediately after a customer completes an order.

const express = require('express');
const router = express.Router();

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0';
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const TEMPLATE_NAME = process.env.WHATSAPP_ORDER_CONFIRM_TEMPLATE || 'order_confirmation';
const TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'ar';
const PUBLIC_WEBHOOK_BASE = process.env.PUBLIC_WEBHOOK_BASE || '';

function normalizePhone(v='') {
  let p = String(v).replace(/\D/g,'');
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('0')) p = '20' + p.slice(1);
  return p;
}

router.post('/order-confirmation', async (req, res) => {
  try {
    if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) return res.status(500).json({error:'WhatsApp credentials are not configured on the backend.'});
    const body = req.body || {};
    const orderDbId = body.orderDbId;
    const orderId = body.orderId;
    const phone = normalizePhone(body.phone || body.customer?.phone);
    if (!orderDbId || !orderId || !phone) return res.status(400).json({error:'orderDbId, orderId and phone are required.'});

    const graphUrl = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;
    const components = [
      { type:'body', parameters:[
        {type:'text',parameter_name:'customer_name',text:String(body.customer?.name||'عميل')},
        {type:'text',parameter_name:'order_id',text:String(orderId)},
        {type:'text',parameter_name:'items',text:(body.items||[]).map(i=>`${i.name} x${i.qty}`).join('، ') || 'لا توجد منتجات'},
        {type:'text',parameter_name:'total',text:`${Math.round(Number(body.total||0))} ج.م`}
      ]},
      { type:'button', sub_type:'quick_reply', index:'0', parameters:[{type:'payload',payload:`confirm_order:${orderDbId}`}] },
      { type:'button', sub_type:'quick_reply', index:'1', parameters:[{type:'payload',payload:`cancel_order:${orderDbId}`}] }
    ];

    const response = await fetch(graphUrl, {
      method:'POST',
      headers:{'Authorization':`Bearer ${ACCESS_TOKEN}`,'Content-Type':'application/json'},
      body:JSON.stringify({messaging_product:'whatsapp',to:phone,type:'template',template:{name:TEMPLATE_NAME,language:{code:TEMPLATE_LANG},components}})
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json({ok:true,messageId:data.messages?.[0]?.id || null});
  } catch (e) {
    console.error(e);
    res.status(500).json({error:e.message || 'WhatsApp send failed'});
  }
});

// Your existing Firebase Admin / database code should write the webhook result to:
// whatsappConfirmations/{orderDbId} = {
//   status: 'confirmed' | 'cancelled',
//   orderDbId,
//   updatedAt: Date.now(),
//   messageId: '...'
// }
// The dashboard listens to that path in realtime.

module.exports = router;
