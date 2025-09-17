const css = `
:root {
  --bg: #0b0f14;
  --card: #141a22;
  --muted: #8aa0b2;
  --text: #e7eef6;
  --accent: #79ffa1;
  --accent2: #84b6ff;
  --warning: #ffc66d;
  --danger: #ff8080;
  --shadow: 0 10px 30px rgba(0,0,0,.35);
}

* {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}

h1, h2 {
  margin: 0 0 .5rem 0;
}

h1 { font-size: 1.5rem; }
h2 { font-size: 1.05rem; color: var(--accent2); }

header, footer {
  padding: 1rem;
  text-align: center;
}

main {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1rem;
  display: grid;
  gap: 1rem;
}

.card {
  background: var(--card);
  border-radius: 16px;
  padding: 1rem;
  box-shadow: var(--shadow);
}

.row {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.column { display: grid; gap: .5rem; }

.file {
  display: grid;
  gap: .25rem;
  background: #0c1117;
  padding: .75rem;
  border-radius: 12px;
  border: 1px solid #1e2732;
}

.file input { width: 100%; }

button, select, input[type="file"], input[type="text"] {
  font: inherit;
  color: var(--text);
  background: #1b2531;
  border: 1px solid #2a3645;
  border-radius: 12px;
  padding: .6rem .8rem;
}

button {
  cursor: pointer;
  border-radius: 999px;
  font-weight: 600;
}

button:hover { background: #203141; }
button:disabled { opacity: .5; cursor: not-allowed; }

.cam-buttons { display: flex; gap: .5rem; flex-wrap: wrap; }

.hint { color: var(--muted); font-size: .9rem; }

.status { margin-top: .5rem; color: var(--warning); }
.status.ok { color: var(--accent); }
.status.err { color: var(--danger); }

.viewer {
  position: relative;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  aspect-ratio: 4 / 3;
  background: #0c1117;
  border: 1px dashed #223044;
  border-radius: 12px;
  overflow: hidden;
}

#video, #canvas {
  width: 100%;
  height: 100%;
  display: block;
}
#video.hide { display: none; }

.counts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: .5rem;
  margin-top: 1rem;
}

.counts .pill {
  background: #0c1117;
  border: 1px solid #243244;
  border-radius: 999px;
  padding: .5rem .8rem;
  text-align: center;
  font-weight: 700;
}

.history {
  display: grid;
  gap: .5rem;
  margin-top: 1rem;
}

.history .item {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: .5rem;
  align-items: center;
  background: #0c1117;
  border: 1px solid #243244;
  border-radius: 12px;
  padding: .5rem;
}

.history img {
  width: 120px;
  height: 90px;
  object-fit: cover;
  border-radius: 8px;
}

@media (hover: none) and (pointer: coarse) {
  button, select, input { font-size: 16px; } /* avoid iOS zoom */
  .viewer { max-width: 100%; }
}
`;

const styleEl = document.createElement("style");
styleEl.textContent = css;
document.head.appendChild(styleEl);
