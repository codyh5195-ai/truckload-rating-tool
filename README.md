# Truckload Rating Tool

A customer-facing freight quoting app that pulls live spot-market rates from the **DAT RateView API**, applies a 25% brokerage margin, and displays the all-in customer quote. The raw DAT rate is never exposed to the browser.

---

## Project Structure

```
truckload-rating-tool/
├── client/                  # React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.jsx / .css
│   │   │   ├── QuoteForm.jsx / .css
│   │   │   └── QuoteResult.jsx / .css
│   │   ├── App.jsx / .css
│   │   ├── index.css
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── server/                  # Node.js / Express backend
│   ├── routes/
│   │   └── rate.js          # POST /api/rate/quote
│   ├── services/
│   │   └── datApi.js        # DAT OAuth + RateView integration
│   ├── server.js
│   └── package.json
│
└── README.md
```

---

## Quick Start (VS Code)

### 1 — Install dependencies

Open two terminals in VS Code (`Ctrl + \`` → split terminal).

**Terminal 1 — Server**
```bash
cd server
npm install
```

**Terminal 2 — Client**
```bash
cd client
npm install
```

---

### 2 — Configure environment variables

**Server**
```bash
cd server
copy .env.example .env   # Windows
# or: cp .env.example .env  (Mac/Linux)
```

Open `server/.env` and set:

| Variable | Description |
|---|---|
| `DAT_USE_MOCK` | `true` = use demo rates (no credentials needed); `false` = live DAT API |
| `DAT_CLIENT_ID` | Your DAT API client ID |
| `DAT_CLIENT_SECRET` | Your DAT API client secret |
| `PORT` | Server port (default `5000`) |

**Client** — no changes needed for local development (Vite proxies `/api` to the server automatically).

---

### 3 — Run the app

**Terminal 1 — Start the server**
```bash
cd server
npm run dev
```
You should see: `Server running on http://localhost:5000`

**Terminal 2 — Start the React app**
```bash
cd client
npm run dev
```
You should see: `Local: http://localhost:5173`

Open **http://localhost:5173** in your browser.

---

## DAT RateView API Integration

The integration lives in `server/services/datApi.js`.

**Authentication flow:**
1. POST to `https://identity.dat.com/access/oauth/token` with your `client_id` and `client_secret` (OAuth 2.0 client credentials).
2. The returned bearer token is cached in memory and refreshed automatically before expiry.

**Rate request:**
- Endpoint: `POST https://api.dat.com/rate-view/v3/spot-rates/summary`
- Sends origin ZIP, destination ZIP, equipment type, and a 7-day shipment date window.
- Parses `rateUsd.average` (total) and `rateMileUsd.average` from the response.

**Markup:**
- Applied in `server/routes/rate.js` — `customerQuote = Math.round(datRate * 1.25)`
- The raw DAT rate is never included in the API response sent to the browser.

**Mock mode:**
- Set `DAT_USE_MOCK=true` in `server/.env` to generate realistic demo rates without credentials.
- The UI shows a "Demo Rate" badge when mock mode is active.

---

## Customization

| What | Where |
|---|---|
| Company name / logo | `client/src/components/Header.jsx` |
| Phone number | `client/src/components/Header.jsx` |
| Booking CTA email | `client/src/components/QuoteResult.jsx` |
| Brokerage margin | `server/routes/rate.js` → `MARKUP` constant |
| Brand colors | `client/src/index.css` → CSS custom properties |

---

## Deploying Online

### Frontend (Vercel / Netlify — recommended)
1. `cd client && npm run build` — outputs to `client/dist/`
2. Deploy `dist/` to Vercel or Netlify.
3. Set `VITE_API_BASE_URL` to your backend URL in the hosting dashboard.

### Backend (Railway / Render / Fly.io)
1. Deploy the `server/` folder.
2. Set all environment variables (`DAT_CLIENT_ID`, `DAT_CLIENT_SECRET`, `DAT_USE_MOCK=false`, `FRONTEND_URL`) in the hosting dashboard.
3. Update `FRONTEND_URL` to your deployed frontend URL so CORS works correctly.

---

## Getting DAT API Access

1. Visit [developer.dat.com](https://developer.dat.com) and sign in with your DAT account.
2. Create an application under **API Access** to receive your `client_id` and `client_secret`.
3. Ensure your subscription includes **RateView** data.
4. Add the credentials to `server/.env` and set `DAT_USE_MOCK=false`.
