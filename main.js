/*************************************************
 * Teach & Classify — main.js (clickable class chips)
 * - End user: add classes → collect samples (camera/upload) → Train → Analyze.
 * - Live, in-browser transfer learning on top of a local feature extractor.
 * - Dev-only knobs live in CONFIG. No expert params shown in HTML.
 * - Results saved to IndexedDB: {timestamp, project, source, topk, counts, previewDataUrl}
 **************************************************/
const CONFIG = {

  MODEL_VERSION: 'MobileNet v1 0.25-224 (Layers)',
  
  // Files (repo root, no subfolders)
  TFJS_PATH: './tf.min.js',
  TEACH_FE_URL: './model.json',   //  you downloaded

  // Requirements shown to end users (messages only)
  MIN_CLASSES: 2,
  MIN_SAMPLES_PER_CLASS: 1,

  // Training hyperparameters (DEV ONLY)
  INPUT_SIZE: 224,
  EPOCHS: 8,
  BATCH: 16,
  LEARNING_RATE: 1e-3,
  HEAD_UNITS: 256,
  DROPOUT: 0.2,
  AUGMENT: true,    // simple random horizontal flip
  TOPK: 3,

  // Approximate "count by grid" (classification-based)
  COUNT_BY_GRID: true,
  GRID_CELLS: 6,     // N (N x N tiles)
  GRID_CONF: 0.6,    // min probability per tile to count

  // Drawing
  CANVAS_FONT: '14px system-ui, sans-serif',
  BOX_COLOR: '#84b6ff',
  BOX_FILL: 'rgba(132,182,255,.15)',
  LABEL_BG: '#84b6ff',
  LABEL_FG: '#0b0f14',

  // Storage (results + teach model metadata)
  DB_NAME: 'teach-classify-db',
  DB_VERSION: 1,
  STORE_RESULTS: 'results',
  STORE_MODEL_META: 'teach-meta',
  TEACH_SAVE_KEY: 'indexeddb://teach-classifier'
};

/*** State ***/
let fe = null;          // full feature extractor model
let trunk = null;       // truncated feature extractor → embeddings
let clf = null;         // classifier head (trained in-browser)
let trained = false;

let projectName = 'MyProject';
let classNames = [];    // ['apple','banana',...]
let activeClass = null;
let samples = {};       // { className: { tensors: tf.Tensor4D[], count: number } }

function $(q){ return document.querySelector(q); }
const els = {
  status: $('#status'),
  projName: $('#proj-name'),
  classInput: $('#class-input'),
  addClass: $('#add-class'),
  clearClasses: $('#clear-classes'),
  classList: $('#class-list'),
  sampleFiles: $('#sample-files'),
  sampleStats: $('#sample-stats'),
  startCam: $('#start-cam'),
  stopCam: $('#stop-cam'),
  capture: $('#capture'),
  train: $('#train'),
  saveModel: $('#save-model'),
  loadModel: $('#load-model'),
  clearSaved: $('#clear-saved'),
  exportModel: $('#export-model'),
  imageInput: $('#image-input'),
  analyzePhoto: $('#analyze-photo'),
  analyzeFrame: $('#analyze-frame'),
  video: $('#video'),
  canvas: $('#canvas'),
  predictions: $('#predictions'),
  historyWrap: $('#history'),
  historyRefresh: $('#history-refresh'),
  historyClear: $('#history-clear')
};
const ctx = els.canvas.getContext('2d');

/*** IndexedDB (results only; model weights saved via tf.io IndexedDB) ***/
let db;
function openDB(){
  return new Promise((resolve, reject)=>{
    const r = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
    r.onupgradeneeded = ()=>{
      const db = r.result;
      if(!db.objectStoreNames.contains(CONFIG.STORE_RESULTS))
        db.createObjectStore(CONFIG.STORE_RESULTS, { keyPath:'id', autoIncrement:true });
      if(!db.objectStoreNames.contains(CONFIG.STORE_MODEL_META))
        db.createObjectStore(CONFIG.STORE_MODEL_META, { keyPath:'key' });
    };
    r.onsuccess = ()=> resolve(r.result);
    r.onerror = ()=> reject(r.error);
  });
}
async function saveResult(rec){
  const tx = db.transaction(CONFIG.STORE_RESULTS,'readwrite');
  tx.objectStore(CONFIG.STORE_RESULTS).add(rec);
  return new Promise((res,rej)=>{ tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); });
}
async function listResults(){
  return new Promise((res,rej)=>{
    const out=[];
    const tx = db.transaction(CONFIG.STORE_RESULTS,'readonly');
    tx.objectStore(CONFIG.STORE_RESULTS).openCursor(null,'prev').onsuccess=(e)=>{
      const c=e.target.result; if(!c) return;
      out.push(c.value); c.continue();
    };
    tx.oncomplete=()=>res(out);
    tx.onerror=()=>rej(tx.error);
  });
}
async function clearResults(){
  const tx = db.transaction(CONFIG.STORE_RESULTS,'readwrite');
  tx.objectStore(CONFIG.STORE_RESULTS).clear();
  return new Promise((res,rej)=>{ tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); });
}

/*** UI helpers ***/
function setStatus(text, ok=false, err=false){
  els.status.textContent = text;
  els.status.classList.toggle('ok', ok);
  els.status.classList.toggle('err', err);
}
function fitCanvasTo(el){
  const r = el.getBoundingClientRect();
  els.canvas.width = Math.max(1, Math.floor(r.width));
  els.canvas.height = Math.max(1, Math.floor(r.height));
}
function drawImage(el){
  fitCanvasTo(el);
  ctx.clearRect(0,0,els.canvas.width,els.canvas.height);
  ctx.drawImage(el, 0, 0, els.canvas.width, els.canvas.height);
}
function totalSampleCount(){
  return classNames.reduce((n,c)=> n + (samples[c]?.count||0), 0);
}
function classesMissingSamples(){
  return classNames.filter(c => (samples[c]?.count||0) < CONFIG.MIN_SAMPLES_PER_CLASS);
}
function requirementsMessage(){
  const msgs=[];
  if(classNames.length < CONFIG.MIN_CLASSES){
    msgs.push(`add at least ${CONFIG.MIN_CLASSES} classes (currently ${classNames.length}).`);
  }
  const missing = classesMissingSamples();
  if(missing.length){
    msgs.push(`each class needs ≥${CONFIG.MIN_SAMPLES_PER_CLASS} sample(s); missing for: ${missing.join(', ')}.`);
  }
  return msgs.length ? ('To train: ' + msgs.join(' ')) : 'Ready to train.';
}
function refreshButtons(){
  const ready = classNames.length >= CONFIG.MIN_CLASSES &&
                classesMissingSamples().length === 0 &&
                totalSampleCount() > 0 &&
                !!trunk;
  els.train.disabled = !ready;

  els.saveModel.disabled = !trained;
  els.exportModel.disabled = !trained;

  els.analyzePhoto.disabled = !trained || !clf;
  els.analyzeFrame.disabled = !trained || !clf || !stream;

  els.capture.disabled = !(stream && activeClass);
}
// clickable chip list
els.classList.addEventListener('click', (e)=>{
  const chip = e.target.closest('[data-class]');
  if(!chip) return;
  activeClass = chip.dataset.class;
  setStatus(`Active class: ${activeClass}`, true);
  renderClassChips();
  refreshButtons();
});
function renderClassChips(){
  if(classNames.length){
    const chips = classNames.map(n => `
      <button type="button"
              class="chip ${n===activeClass?'active':''}"
              data-class="${n}">${n}</button>
    `).join(' ');
    els.classList.innerHTML = `Classes (active → capture/upload): ${chips}`;
  }else{
    els.classList.innerHTML = 'No classes yet.';
  }
  els.sampleStats.textContent = `${totalSampleCount()} samples`;

  const msg = requirementsMessage();
  setStatus(msg, msg === 'Ready to train.', msg !== 'Ready to train.');
  refreshButtons();
}

/*** Feature extractor → trunk (embeddings) ***/
async function loadFE(){
  setStatus('Loading feature extractor…');
  try{
    fe = await tf.loadGraphModel(CONFIG.TEACH_FE_URL).catch(()=>tf.loadLayersModel(CONFIG.TEACH_FE_URL));

    if(fe instanceof tf.LayersModel){
      // Prefer an internal embedding (pre-softmax) for better transfer:
      const tryLayers = ['reshape_1','global_average_pooling2d_1'];
      let out = null;
      for(const name of tryLayers){
        try{ out = fe.getLayer(name).output; break; }catch(_){}
      }
      if(!out) out = fe.outputs[0];             // fallback
      trunk = tf.model({inputs: fe.inputs, outputs: out});
    }else{
      // Graph model: use its output as embedding
      trunk = fe;
    }

    setStatus('Feature extractor ready.', true);
  }catch(err){
    console.error(err);
    setStatus('Failed to load feature extractor (check model.json + shard files).', false, true);
  }
}

/*** Classes & samples ***/
els.projName.addEventListener('input', ()=>{
  projectName = els.projName.value.trim() || 'MyProject';
});
els.addClass.addEventListener('click', ()=>{
  const name = els.classInput.value.trim();
  if(!name) return;
  if(!classNames.includes(name)){
    classNames.push(name);
    samples[name] = {tensors:[], count:0};
  }
  activeClass = name;
  els.classInput.value = '';
  renderClassChips();
});
els.clearClasses.addEventListener('click', ()=>{
  classNames = [];
  Object.values(samples).forEach(s=> s.tensors.forEach(t=> t.dispose()));
  samples = {};
  activeClass = null;
  trained = false;
  clf?.dispose?.(); clf=null;
  renderClassChips();
});
els.sampleFiles.addEventListener('change', async ()=>{
  if(!activeClass){ setStatus('Click a class chip to make it active first.', false, true); els.sampleFiles.value=''; return; }
  const files = Array.from(els.sampleFiles.files||[]);
  if(!files.length) return;
  let added = 0;
  for(const f of files){
    const img = await fileToImage(f);
    const t = toInputTensor(img);
    pushSample(activeClass, t);
    added++;
  }
  els.sampleFiles.value=''; // allow re-uploading same filenames
  setStatus(`Added ${added} image(s) to "${activeClass}".`);
  renderClassChips();
});

function pushSample(cls, t4){
  samples[cls] = samples[cls] || {tensors:[], count:0};
  samples[cls].tensors.push(t4);
  samples[cls].count++;
}
function toInputTensor(src){
  return tf.tidy(()=>{
    let t = tf.browser.fromPixels(src).toFloat();
    t = tf.image.resizeBilinear(t, [CONFIG.INPUT_SIZE, CONFIG.INPUT_SIZE]);
    if(CONFIG.AUGMENT && Math.random() < 0.5) t = t.reverse(1);
    return t.expandDims(0); // [1,H,W,3]
  });
}
function fromCanvasCropXYWH(x,y,w,h){
  return tf.tidy(()=>{
    let t = tf.browser.fromPixels(els.canvas).toFloat()
      .slice([y,x,0],[Math.max(1,h), Math.max(1,w), 3]);
    t = tf.image.resizeBilinear(t, [CONFIG.INPUT_SIZE, CONFIG.INPUT_SIZE]);
    return t.expandDims(0);
  });
}

/*** Train — build & fit a small head on top of trunk embeddings ***/
els.train.addEventListener('click', async ()=>{
  if(!trunk){ setStatus('Feature extractor not ready.', false, true); return; }
  const req = requirementsMessage();
  if(req !== 'Ready to train.'){ setStatus(req, false, true); return; }

  const xsArr=[], ysArr=[];
  classNames.forEach((c, idx)=>{
    const s = samples[c]?.tensors || [];
    s.forEach(t => { xsArr.push(t); ysArr.push(idx); });
  });

  const xs = tf.concat(xsArr);             // [N,H,W,3]
  const ys = tf.tensor1d(ysArr,'int32');
  const ysOH = tf.oneHot(ys, classNames.length);

  setStatus('Extracting features…');
  let emb = trunk.predict(xs);             // e.g., [N,1,1,256] or [N,1000]
  if(Array.isArray(emb)) emb = emb[0];
  const flat = tf.layers.flatten().apply(emb); // [N,D]

  clf?.dispose?.();
  clf = tf.sequential({
    layers: [
      tf.layers.dense({units: CONFIG.HEAD_UNITS, activation:'relu', inputShape:[flat.shape[1]]}),
      tf.layers.dropout({rate: CONFIG.DROPOUT}),
      tf.layers.dense({units: classNames.length, activation:'softmax'})
    ]
  });
  const opt = tf.train.adam(CONFIG.LEARNING_RATE);
  clf.compile({optimizer: opt, loss:'categoricalCrossentropy', metrics:['accuracy']});

  setStatus('Training…');
  await clf.fit(flat, ysOH, {epochs: CONFIG.EPOCHS, batchSize: CONFIG.BATCH, shuffle:true});

  xsArr.forEach(t=> t.dispose());
  xs.dispose(); ys.dispose(); ysOH.dispose();
  if(emb.dispose) emb.dispose();
  if(flat.dispose) flat.dispose();

  trained = true;
  setStatus(`Trained ✓ (${classNames.length} classes).`, true);
  refreshButtons();
});

/*** Save / Load / Export ***/
els.saveModel.addEventListener('click', async ()=>{
  if(!clf) return;
  await clf.save(CONFIG.TEACH_SAVE_KEY);
  await putMeta('project', projectName);
  await putMeta('classes', classNames);
  setStatus('Saved teachable model to IndexedDB.', true);
  refreshButtons();
});
els.loadModel.addEventListener('click', async ()=>{
  try{
    clf = await tf.loadLayersModel(CONFIG.TEACH_SAVE_KEY);
    projectName = (await getMeta('project')) || 'MyProject';
    classNames = (await getMeta('classes')) || [];
    els.projName.value = projectName;
    trained = true;
    setStatus('Loaded teachable model from IndexedDB.', true);
    renderClassChips();
    refreshButtons();
  }catch(e){
    setStatus('No saved teachable model found.', false, true);
  }
});
els.clearSaved.addEventListener('click', async ()=>{
  try{
    await tf.io.removeModel(CONFIG.TEACH_SAVE_KEY);
    await delMeta('project'); await delMeta('classes');
    setStatus('Cleared saved teachable model.', true);
  }catch(e){
    setStatus('Could not clear saved model.', false, true);
  }
  refreshButtons();
});
els.exportModel.addEventListener('click', async ()=>{
  if(!clf) return;
  await clf.save('downloads://' + (projectName || 'TeachableModel'));
  const meta = new Blob([JSON.stringify({project: projectName, classes: classNames}, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(meta);
  a.download = (projectName||'TeachableModel') + '.metadata.json'; a.click();
});

/*** key→value meta helpers (for project + classes) ***/
async function putMeta(key, value){
  const tx = db.transaction(CONFIG.STORE_MODEL_META,'readwrite');
  tx.objectStore(CONFIG.STORE_MODEL_META).put({key,value});
  return new Promise((res,rej)=>{ tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); });
}
async function getMeta(key){
  return new Promise((res,rej)=>{
    const tx = db.transaction(CONFIG.STORE_MODEL_META,'readonly');
    const req = tx.objectStore(CONFIG.STORE_MODEL_META).get(key);
    req.onsuccess = ()=> res(req.result?.value);
    req.onerror = ()=> rej(req.error);
  });
}
async function delMeta(key){
  const tx = db.transaction(CONFIG.STORE_MODEL_META,'readwrite');
  tx.objectStore(CONFIG.STORE_MODEL_META).delete(key);
  return new Promise((res,rej)=>{ tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); });
}

/*** Analyze ***/
els.analyzePhoto.addEventListener('click', async ()=>{
  if(!trained || !clf){ setStatus(requirementsMessage(), false, true); return; }
  const f = els.imageInput.files?.[0];
  if(!f){ setStatus('Choose a photo first.', false, true); return; }
  const img = await fileToImage(f);
  await analyze(img, 'photo:' + f.name);
});
els.analyzeFrame.addEventListener('click', async ()=>{
  if(!trained || !clf || !stream) return;
  await analyze(els.video, 'camera');
});

async function analyze(srcEl, source){
  drawImage(srcEl);

  const topk = await topKFromCanvas(CONFIG.TOPK);
  let counts = null;
  if(CONFIG.COUNT_BY_GRID){
    counts = await gridCount(CONFIG.GRID_CELLS, CONFIG.GRID_CONF);
  }

  renderPredictions(topk, counts);

  const previewDataUrl = els.canvas.toDataURL('image/jpeg', 0.6);
  await saveResult({
    timestamp: new Date().toISOString(),
    project: projectName,
    source,
    topk,
    counts,
    previewDataUrl
  });
  await refreshHistory();
}

async function topKFromCanvas(k){
  return tf.tidy(()=>{
    let t = tf.browser.fromPixels(els.canvas).toFloat();
    t = tf.image.resizeBilinear(t, [CONFIG.INPUT_SIZE, CONFIG.INPUT_SIZE]).expandDims(0);

    let e = trunk.predict(t);
    if (Array.isArray(e)) e = e[0];
    const flat = tf.layers.flatten().apply(e);

    // Final layer already has 'softmax', so outputs are probs
    const probs = clf.predict(flat);  // shape [1, numClasses]
    const numClasses = probs.shape[probs.shape.length - 1];
    const kk = Math.max(1, Math.min(k, numClasses));

    const { values, indices } = tf.topk(probs, kk);
    const vs = Array.from(values.dataSync());
    const is = Array.from(indices.dataSync());

    const out = is.map((idx, i) => ({
      className: classNames[idx] || String(idx),
      prob: vs[i]
    }));

    [t,e,flat,probs,values,indices].forEach(x => x?.dispose?.());
    return out;
  });
}


async function gridCount(grid, conf){
  return tf.tidy(()=>{
    const W=els.canvas.width, H=els.canvas.height;
    const cellW = Math.floor(W/grid), cellH = Math.floor(H/grid);
    const dets=[];
    for(let gy=0; gy<grid; gy++){
      for(let gx=0; gx<grid; gx++){
        const xmin = gx*cellW, ymin = gy*cellH, w = cellW, h = cellH;
        const crop = fromCanvasCropXYWH(xmin,ymin,w,h);
        let e = trunk.predict(crop);
        if(Array.isArray(e)) e = e[0];
        const flat = tf.layers.flatten().apply(e);
        const logits = clf.predict(flat);
        const probs = logits.softmax();
        const {values, indices} = tf.topk(probs, 1);
        const score = values.dataSync()[0];
        const idx = indices.dataSync()[0];
        const name = classNames[idx] || String(idx);
        [crop,e,flat,logits,probs,values,indices].forEach(x=> x?.dispose?.());
        if(score >= conf){
          dets.push({ box:[ymin,xmin,ymin+h,xmin+w], score, className:name });
        }
      }
    }
    // draw tiles we counted
    ctx.lineWidth = 2;
    ctx.font = CONFIG.CANVAS_FONT;
    dets.forEach(d=>{
      const [ymin,xmin,ymax,xmax] = d.box;
      ctx.strokeStyle = CONFIG.BOX_COLOR;
      ctx.fillStyle = CONFIG.BOX_FILL;
      ctx.beginPath(); ctx.rect(xmin,ymin,xmax-xmin,ymax-ymin); ctx.stroke(); ctx.fill();
      const label = `${d.className} ${(d.score*100).toFixed(0)}%`;
      const pad=4, w=ctx.measureText(label).width;
      ctx.fillStyle = CONFIG.LABEL_BG; ctx.fillRect(xmin, Math.max(0,ymin-18), w+pad*2, 18);
      ctx.fillStyle = CONFIG.LABEL_FG; ctx.fillText(label, xmin+pad, Math.max(12,ymin-6));
    });
    const counts = {};
    dets.forEach(d=> counts[d.className] = (counts[d.className]||0)+1);
    return counts;
  });
}

function renderPredictions(topk, counts){
  els.predictions.innerHTML = '';
  if(topk?.length){
    const best = document.createElement('div');
    best.className = 'pill';
    best.textContent = `Top: ${topk[0].className} (${(topk[0].prob*100).toFixed(1)}%)`;
    els.predictions.appendChild(best);
    topk.slice(1).forEach(p=>{
      const pill = document.createElement('div');
      pill.className='pill';
      pill.textContent = `${p.className} (${(p.prob*100).toFixed(1)}%)`;
      els.predictions.appendChild(pill);
    });
  }
  if(counts && Object.keys(counts).length){
    const sep = document.createElement('div'); sep.className='pill'; sep.textContent='Estimated counts:';
    els.predictions.appendChild(sep);
    Object.entries(counts).forEach(([k,v])=>{
      const pill = document.createElement('div'); pill.className='pill'; pill.textContent = `${k}: ${v}`;
      els.predictions.appendChild(pill);
    });
  }
}

/*** Camera ***/
let stream = null;
els.startCam.addEventListener('click', async ()=>{
  try{
    if(stream) stopCam();
    stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' }, audio:false });
    els.video.srcObject = stream;
    els.video.classList.remove('hide');
    els.stopCam.disabled = true;
    els.video.onplaying = ()=>{ els.stopCam.disabled=false; fitCanvasTo(els.video); };
    setStatus('Camera started.', true);
  }catch(e){
    console.error(e);
    setStatus('Camera error (permission/device).', false, true);
  }
  refreshButtons();
});
els.stopCam.addEventListener('click', ()=>{
  stopCam(); setStatus('Camera stopped.');
  refreshButtons();
});
els.capture.addEventListener('click', ()=>{
  if(!stream || !activeClass) return;
  const t = toInputTensor(els.video);
  pushSample(activeClass, t);
  setStatus(`Captured 1 frame to "${activeClass}".`);
  renderClassChips();
});
function stopCam(){
  if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; }
  els.video.classList.add('hide');
}

/*** Photo util ***/
function fileToImage(file){
  return new Promise((resolve,reject)=>{
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=>{ URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

/*** History ***/
async function refreshHistory(){
  const rows = await listResults();
  els.historyWrap.innerHTML = '';
  if(rows.length===0){ els.historyWrap.innerHTML = '<div class="hint">No results yet.</div>'; return; }
  rows.forEach(r=>{
    const item = document.createElement('div'); item.className='item';
    const img = document.createElement('img'); img.src = r.previewDataUrl;
    const meta = document.createElement('div');
    const top = r.topk?.map(p=> `${p.className} ${(p.prob*100).toFixed(0)}%`).join(' · ') || '';
    const counts = r.counts && Object.keys(r.counts).length
      ? (' | ' + Object.entries(r.counts).map(([k,v])=>`${k}:${v}`).join(' · '))
      : '';
    meta.innerHTML = `<div><strong>${new Date(r.timestamp).toLocaleString()}</strong> — <code>${r.project}</code> — <em>${r.source}</em></div>
                      <div>${top}${counts}</div>`;
    item.appendChild(img); item.appendChild(meta);
    els.historyWrap.appendChild(item);
  });
}
els.historyRefresh.addEventListener('click', refreshHistory);
els.historyClear.addEventListener('click', async ()=>{ await clearResults(); await refreshHistory(); });

/*** Init ***/
(async function init(){
  db = await openDB();

  // Disable actions until ready
  els.analyzePhoto.disabled = true;
  els.analyzeFrame.disabled = true;
  els.train.disabled = true;
  els.saveModel.disabled = true;
  els.exportModel.disabled = true;
  els.capture.disabled = true;

  await loadFE();
  projectName = (els.projName.value = 'MyProject');
  renderClassChips();
  setStatus('Ready to teach.', true);
})();

