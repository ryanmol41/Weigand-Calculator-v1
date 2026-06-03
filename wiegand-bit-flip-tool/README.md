# Wiegand Bit-Flip Tool

A small React + Vite web app that:

- Supports **26-bit H10301**, **34-bit H10306**, **35-bit Corporate 1000**, **37-bit H10302**, **37-bit H10304**, and **40-bit Casi-Rusco**.
- Accepts input as:
  - **Facility Code + Card Number**
  - **Full Frame** in **hex or decimal**
  - **Payload/Data Field** in **hex or decimal**
- Simulates **D0/D1 swapped** behavior by **inverting every bit** in the frame.
- Recomputes valid parity for **26-bit** and **34-bit** formats.
- Displays **Bits + Hex + Decimal** for original, flipped, and parity-recomputed frames.

---

## Local development

```bash
npm install
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`).

---

## Production build

```bash
npm run build
npm run preview
```

Preview usually runs at `http://localhost:4173`.

---

## Deploy on a local server

### Option 1 - Vite preview (fastest)
```bash
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```

### Option 2 - Static server with Python
```bash
npm run build
cd dist
python3 -m http.server 8080
```

Open `http://localhost:8080`

### Option 3 - Static server with Node
```bash
npm install -g serve
npm run build
serve -s dist -l 8080
```

---

## GitHub quick start

```bash
git init
git add .
git commit -m "Initial commit - Wiegand Bit-Flip Tool"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/wiegand-bit-flip-tool.git
git push -u origin main
```
