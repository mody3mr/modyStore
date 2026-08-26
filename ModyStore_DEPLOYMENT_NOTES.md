# ModyStore — deployment notes for the production patch

## 1) Dashboard files
Replace:
- `index.html`
- `app.js`
- `style.css`
- `login.html`

Also place `firebase-messaging-sw.js` and `favicon.svg` at the same public root as `index.html`.

## 2) Login persistence
Firebase Auth is now configured with `browserLocalPersistence`, so closing the browser does not force another login. Logging out still clears the session.

## 3) Permissions
The permissions matrix now treats:
- View
- Create
- Edit
- Toggle/Activate
- Delete
as separate permissions for products and the other modules.

Important: Firebase Realtime Database security rules should also enforce these permissions server-side. Hiding buttons is not a security boundary.

## 4) Manual orders
Orders can be created from the Orders tab with:
- customer data
- source (WhatsApp, website, social, phone, etc.)
- payment method
- products / quantities
- shipping
- discount
- notes

The order is saved in `orders/{id}` with `manual: true` and `source`.

## 5) Barcode / scanner
The waybill now uses a stable scan code (`orderId` first, then secret code/display ID) and CODE128 without horizontal stretching. The scanner explicitly supports common 1D barcode formats plus QR.

Camera access requires HTTPS (or localhost).

## 6) Timed offers
Products now store:
- `offerStartAt`
- `offerEndAt`
- `offerDuration`
- `offerUnit`

The dashboard expires offers locally every 30 seconds, and the optional Firebase scheduled function expires them server-side every 5 minutes.

## 7) Mobile push notifications
For real background notifications, deploy the `functions` folder and set the public Firebase Web Push VAPID key in Dashboard → Settings → Mobile Notifications.

The dashboard stores FCM device tokens in `pushTokens`.

For iPhone/iPad, web push requires a supported Safari/PWA setup; installing the site to the Home Screen is recommended.

## 8) Paymob
The dashboard now has a Paymob configuration card. It stores only:
- enabled
- public key
- integration ID
- backend checkout endpoint
- webhook endpoint

Do NOT put Paymob Secret Key or HMAC Secret in frontend code or Realtime Database.

The actual payment flow must be server-side:
1. Backend creates a Paymob Intention.
2. Backend returns/redirects to the Paymob checkout.
3. Paymob calls the webhook.
4. Backend verifies HMAC and marks the order paid.

See Paymob's current developer wizard/docs for the exact regional checkout endpoint and webhook requirements.



## 9) Paymob backend functions included
`functions/index.js` now includes:
- `createPaymobCheckout` — creates a Paymob Intention using the server-side Secret Key and returns a Unified Checkout URL.
- `paymobWebhook` — verifies the Paymob transaction callback with SHA-512 HMAC and updates the matching Firebase order.
- `notifyNewOrder` — sends background push notifications.
- `expireProductOffers` — server-side offer expiry.

Set Firebase Functions secrets before deployment:

```bash
firebase functions:secrets:set PAYMOB_SECRET_KEY
firebase functions:secrets:set PAYMOB_HMAC_SECRET
firebase functions:secrets:set PAYMOB_PUBLIC_KEY
firebase functions:secrets:set PAYMOB_INTEGRATION_ID_CARD
firebase functions:secrets:set PAYMOB_BASE_URL
firebase functions:secrets:set PAYMOB_WEBHOOK_URL
firebase functions:secrets:set PAYMOB_REDIRECT_URL
```

For Egypt, the current Paymob base URL is `https://accept.paymob.com`. The current Paymob flow uses `POST /v1/intention/` and then Unified Checkout; the Secret Key stays server-side and the webhook/HMAC is the source of truth.

After deploying, put the `createPaymobCheckout` URL in Dashboard → Settings → Paymob → Checkout Endpoint, and the `paymobWebhook` URL in Webhook Endpoint.
