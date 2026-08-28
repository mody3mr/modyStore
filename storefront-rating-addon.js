/* ModyStore Storefront Rating Add-on
 * Load this module on the CUSTOMER storefront page.
 * It renders product stars from products/{productId}.ratingAverage/ratingCount.
 * Product cards should contain: <div data-product-id="FIREBASE_PRODUCT_ID"></div>
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBzXZ-olKlD76cCw5dtp8IU1qZMSKSTi1g",
  authDomain: "modytech-850c2.firebaseapp.com",
  projectId: "modytech-850c2",
  storageBucket: "modytech-850c2.firebasestorage.app",
  messagingSenderId: "909293461306",
  appId: "1:909293461306:web:48e5492107ad32ceec7a03"
};

const app = initializeApp(firebaseConfig, 'ModyStoreStorefrontRating');
const db = getDatabase(app);

function esc(v='') { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function stars(value) {
  const n = Math.min(5, Math.max(0, Number(value) || 0));
  const full = Math.round(n);
  return '★'.repeat(full) + '☆'.repeat(5-full);
}

export function attachProductRating(mount, productId) {
  if (!mount || !productId) return () => {};
  mount.classList.add('mody-product-rating');
  const unsubscribe = onValue(ref(db, `products/${productId}`), snap => {
    const p = snap.exists() ? snap.val() : {};
    const avg = Number(p.ratingAverage || 0);
    const count = Number(p.ratingCount || 0);
    mount.innerHTML = `<span class="mody-rating-stars" aria-label="${esc(avg.toFixed(1))} من 5">${stars(avg)}</span><span class="mody-rating-value">${avg ? avg.toFixed(1) : '0.0'}</span><span class="mody-rating-count">(${count} تقييم)</span>`;
  });
  return unsubscribe;
}

export function autoAttachProductRatings(root=document) {
  root.querySelectorAll('[data-product-id]').forEach(card => {
    if (card.dataset.modyRatingAttached === '1') return;
    const productId = card.dataset.productId;
    if (!productId) return;
    let mount = card.querySelector('.mody-product-rating');
    if (!mount) { mount = document.createElement('div'); mount.className='mody-product-rating'; card.appendChild(mount); }
    card.dataset.modyRatingAttached = '1';
    attachProductRating(mount, productId);
  });
}

window.ModyStoreProductRating = { attachProductRating, autoAttachProductRatings };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => autoAttachProductRatings());
else autoAttachProductRatings();
