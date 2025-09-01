// app.js
// =======================
// เวอร์ชันนี้: แก้จากโค้ดเดิมที่ใช้ Firebase -> เปลี่ยนมาใช้ localStorage
// - เก็บ data ใน localStorage (keys: error_codes, stock_parts)
// - โหลดรูปจากโฟลเดอร์ images/ โดย "เดาชื่อไฟล์" ตามชื่อรุ่น/ชื่ออะไหล่
// - ถ้าไม่พบรูป แสดง placeholder images/no-image.png
// - มีฟังก์ชัน export/import JSON เหมือนเดิม
// - แก้ UI rendering ให้รองรับการตั้งชื่อไฟล์บนคอม (ตามที่คุณขอ)
// =======================

// ---------- Constants ----------
const ERROR_COL = "error_codes";   // localStorage key
const STOCK_COL = "stock_parts";   // localStorage key
const PLACEHOLDER_IMG = "images/no-image.png"; // วางไฟล์ placeholder ใน images/
const IMAGE_FOLDER = "images"; // โฟลเดอร์ที่ผู้ใช้วางไฟล์รูปไว้

// ---------- Helpers ----------
function escapeHtml(str) { return String(str||"").replace(/[&<>"']/g, s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[s])); }
function uuid() { return Math.random().toString(36).substring(2,10) + Date.now(); }

// sanitize -> เอาเว้นวรรค, สัญลักษณ์ออก ให้เป็นชื่อไฟล์ที่นิยมนำมาใช้
function sanitizeFilename(s) {
  if(!s) return "";
  return String(s).trim().toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w\-_.]/g, ""); // keep alnum, underscore, dash, dot
}

// Build candidate filename bases for an error item
function generateCandidatesForError(item) {
  // ลำดับความสำคัญ: model, brand_model, errorCode, brand-model
  const parts = [];
  const brand = sanitizeFilename(item.brand||"");
  const model = sanitizeFilename(item.model||"");
  const code = sanitizeFilename(item.errorCode||"");
  if(model) parts.push(model);
  if(brand && model) parts.push(`${brand}_${model}`, `${brand}-${model}`);
  if(code) parts.push(code);
  // variants with suffixes (1..3)
  const expanded = [];
  for (const p of parts) {
    expanded.push(p);
    expanded.push(`${p}_1`);
    expanded.push(`${p}_2`);
  }
  return Array.from(new Set(expanded));
}

// Build candidate filename bases for a stock item
function generateCandidatesForStock(item) {
  const parts = [];
  const name = sanitizeFilename(item.partName||"");
  const model = sanitizeFilename(item.forModel||"");
  const brand = sanitizeFilename(item.partBrand||"");
  if(name) parts.push(name);
  if(name && model) parts.push(`${name}_${model}`, `${name}-${model}`);
  if(brand && name) parts.push(`${brand}_${name}`, `${brand}-${name}`);
  // suffixes
  const expanded = [];
  for (const p of parts) {
    expanded.push(p);
    expanded.push(`${p}_1`);
    expanded.push(`${p}_2`);
  }
  return Array.from(new Set(expanded));
}

// Given a base (no extension), produce full candidate URLs with common extensions
function makeImageCandidatesFromBases(bases) {
  const exts = ['.jpg','.jpeg','.png','.webp'];
  const list = [];
  for (const b of bases) {
    for (const e of exts) {
      list.push(`${IMAGE_FOLDER}/${b}${e}`);
    }
  }
  return list;
}

// create <img> element that will try candidates in order then fallback to placeholder
function createImgWithFallback(candidates, altText) {
  const img = document.createElement('img');
  img.className = "thumb";
  img.alt = altText || "";
  let idx = 0;
  // try next candidate
  function tryNext() {
    if (idx >= candidates.length) {
      img.src = PLACEHOLDER_IMG;
      return;
    }
    img.src = candidates[idx++];
  }
  img.addEventListener('error', function onErr(){
    // ถ้าขึ้น error -> ลองตัวถัดไป
    // remove listener? keep
    tryNext();
  });
  // start
  tryNext();
  return img;
}

// ---------- localStorage CRUD (แทน Firestore) ----------

// load array from LS (return array of objects)
function loadCol(col) {
  try {
    return JSON.parse(localStorage.getItem(col) || "[]");
  } catch (e) {
    return [];
  }
}
function saveCol(col, arr) {
  localStorage.setItem(col, JSON.stringify(arr));
  // notify listeners if any
  if (col === ERROR_COL) errorListeners.forEach(cb=>cb(loadCol(ERROR_COL)));
  if (col === STOCK_COL) stockListeners.forEach(cb=>cb(loadCol(STOCK_COL)));
}

async function getAll(col) { return loadCol(col); }
async function addDoc(col, data) {
  const arr = loadCol(col);
  const id = uuid();
  const rec = {...data, id};
  arr.push(rec);
  saveCol(col, arr);
  return id;
}
async function updateDoc(col, id, data) {
  const arr = loadCol(col);
  const idx = arr.findIndex(x=>x.id===id);
  if(idx === -1) return;
  arr[idx] = {...arr[idx], ...data};
  saveCol(col, arr);
}
async function deleteDoc(col, id) {
  let arr = loadCol(col);
  arr = arr.filter(x=>x.id!==id);
  saveCol(col, arr);
}

// simple listener system to emulate onSnapshot
const errorListeners = [];
const stockListeners = [];
function listenLocal(col, onChange) {
  if(col === ERROR_COL) { errorListeners.push(onChange); onChange(loadCol(ERROR_COL)); return ()=>{}; }
  if(col === STOCK_COL) { stockListeners.push(onChange); onChange(loadCol(STOCK_COL)); return ()=>{}; }
  return ()=>{};
}

// ---------- App State & init listeners ----------
let errorData = [];
let stockData = [];
listenLocal(ERROR_COL, arr => { errorData = arr; errorSearchHandler(); });
listenLocal(STOCK_COL, arr => { stockData = arr; stockSearchHandler(); });

// ---------- UI: Tabs ----------
const tabError = document.getElementById('tab-error');
const tabStock = document.getElementById('tab-stock');
const sectionError = document.getElementById('section-error');
const sectionStock = document.getElementById('section-stock');
tabError.onclick = function(){
  tabError.classList.add('active'); tabStock.classList.remove('active');
  sectionError.style.display='block'; sectionStock.style.display='none';
};
tabStock.onclick = function(){
  tabStock.classList.add('active'); tabError.classList.remove('active');
  sectionStock.style.display='block'; sectionError.style.display='none';
};

// ---------- Search & Suggestion: Error ----------
const searchErrorInput = document.getElementById('searchError');
const searchErrorFilter = document.getElementById('searchErrorFilter');
const errorSuggestBox = document.getElementById('errorSuggest');

function errorSearchHandler() {
  const val = searchErrorInput.value.trim().toLowerCase();
  const field = searchErrorFilter.value;
  let uniq = new Set();
  let suggests = [];
  if(val) {
    errorData.forEach(e=>{
      let v = (e[field]||"").toLowerCase();
      if(v && v.includes(val)) uniq.add(e[field]);
    });
    suggests = Array.from(uniq);
    // If exactly one match and matches input -> render directly
    if (suggests.length === 1 && suggests[0].toLowerCase() === val) {
      renderErrorListByField(field, val);
      errorSuggestBox.style.display = "none";
      return;
    }
    errorSuggestBox.innerHTML = suggests.map(s=>`<div class="suggest-item">${escapeHtml(s)}</div>`).join('');
    errorSuggestBox.style.display = suggests.length ? "block" : "none";
    document.getElementById('errorList').innerHTML = "";
  } else {
    errorSuggestBox.style.display = "none";
    document.getElementById('errorList').innerHTML = "";
  }
}
searchErrorInput.oninput = errorSearchHandler;
searchErrorFilter.onchange = function() {
  searchErrorInput.value = "";
  errorSuggestBox.style.display = "none";
  document.getElementById('errorList').innerHTML = "";
};
searchErrorInput.onfocus = errorSearchHandler;
searchErrorInput.onblur = function(){
  setTimeout(()=>{ errorSuggestBox.style.display = "none"; }, 150);
};
errorSuggestBox.onclick = function(e){
  const txt = e.target.innerText;
  searchErrorInput.value = txt;
  renderErrorListByField(searchErrorFilter.value, txt.toLowerCase());
  errorSuggestBox.style.display = "none";
};
document.getElementById('clearErrorBtn').onclick = function() {
  searchErrorInput.value = "";
  errorSuggestBox.style.display = "none";
  document.getElementById('errorList').innerHTML = "";
};
document.getElementById('searchErrorBtn').onclick = errorSearchHandler;

// ---------- Search & Suggestion: Stock ----------
const searchStockInput = document.getElementById('searchStock');
const searchStockFilter = document.getElementById('searchStockFilter');
const stockSuggestBox = document.getElementById('stockSuggest');

function stockSearchHandler() {
  const val = searchStockInput.value.trim().toLowerCase();
  const field = searchStockFilter.value;
  let uniq = new Set();
  let suggests = [];
  if(val) {
    stockData.forEach(e=>{
      let v = (e[field]||"").toLowerCase();
      if(v && v.includes(val)) uniq.add(e[field]);
    });
    suggests = Array.from(uniq);
    if (suggests.length === 1 && suggests[0].toLowerCase() === val) {
      renderStockListByField(field, val);
      stockSuggestBox.style.display = "none";
      return;
    }
    stockSuggestBox.innerHTML = suggests.map(s=>`<div class="suggest-item">${escapeHtml(s)}</div>`).join('');
    stockSuggestBox.style.display = suggests.length ? "block" : "none";
    document.getElementById('stockList').innerHTML = "";
  } else {
    stockSuggestBox.style.display = "none";
    document.getElementById('stockList').innerHTML = "";
  }
}
searchStockInput.oninput = stockSearchHandler;
searchStockFilter.onchange = function() {
  searchStockInput.value = "";
  stockSuggestBox.style.display = "none";
  document.getElementById('stockList').innerHTML = "";
};
searchStockInput.onfocus = stockSearchHandler;
searchStockInput.onblur = function(){
  setTimeout(()=>{ stockSuggestBox.style.display = "none"; }, 150);
};
stockSuggestBox.onclick = function(e){
  const txt = e.target.innerText;
  searchStockInput.value = txt;
  renderStockListByField(searchStockFilter.value, txt.toLowerCase());
  stockSuggestBox.style.display = "none";
};
document.getElementById('clearStockBtn').onclick = function() {
  searchStockInput.value = "";
  stockSuggestBox.style.display = "none";
  document.getElementById('stockList').innerHTML = "";
};
document.getElementById('searchStockBtn').onclick = stockSearchHandler;

// ---------- Render functions ----------

// Render error list by exact field value
function renderErrorListByField(field, valLower) {
  const list = errorData.filter(e => ((e[field]||"").toLowerCase() === valLower));
  const container = document.getElementById('errorList');
  container.innerHTML = "";
  if(!list.length) {
    container.innerHTML = "<div class='empty-state'><i class='bi bi-database-x'></i><div>ไม่พบข้อมูล</div></div>";
    return;
  }
  // For each item, create card DOM so we can attach image fallback behavior
  list.forEach(item => {
    const card = document.createElement('div'); card.className = 'card';
    // left: thumbnail
    const thumbWrapper = document.createElement('div');
    // decide image candidates
    if (Array.isArray(item.images) && item.images.length) {
      // use provided URLs first (assumed in images/ or absolute)
      const img = document.createElement('img');
      img.className = 'thumb';
      img.src = item.images[0];
      img.onerror = () => { img.src = PLACEHOLDER_IMG; };
      img.alt = `${item.brand} ${item.model}`;
      img.tabIndex = 0;
      img.onclick = ()=> showImgViewer(item.images.length?item.images:[img.src], 0);
      thumbWrapper.appendChild(img);
    } else {
      const bases = generateCandidatesForError(item);
      const candidates = makeImageCandidatesFromBases(bases);
      const img = createImgWithFallback(candidates, `${item.brand} ${item.model}`);
      img.onclick = ()=> showImgViewer([img.src], 0);
      thumbWrapper.appendChild(img);
    }
    card.appendChild(thumbWrapper);

    // right: content
    const content = document.createElement('div');
    content.style.flex = "1";
    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div class="card-title">${escapeHtml(item.brand||'')} <span class="badge">${escapeHtml(item.model||'')}</span></div>
          <span class="badge badge-type">${escapeHtml(item.type||'')}</span>
        </div>
        <div>
          <button class="btn btn-warning btn-sm" data-id="${item.id}" data-action="edit-error"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-danger btn-sm" data-id="${item.id}" data-action="del-error"><i class="bi bi-trash"></i></button>
        </div>
      </div>
      <div style="margin-top:6px;"><span class="badge badge-error">Error: ${escapeHtml(item.errorCode||"")}</span></div>
      <div style="margin-top:6px;"><b>อะไหล่ที่เสีย:</b> ${escapeHtml(item.parts||'-')}</div>
      <div style="margin-top:4px;"><b>สิ่งที่ควรเช็ค:</b> ${escapeHtml(item.checkList||'-')}</div>
      <div style="margin-top:4px;"><b>วิธีแก้ไข:</b> ${escapeHtml(item.solution||'-')}</div>
    `;
    card.appendChild(content);
    container.appendChild(card);
  });

  // attach delegated handlers for edit/delete
  container.querySelectorAll('[data-action="edit-error"]').forEach(btn=>{
    btn.onclick = (e)=> {
      const id = e.currentTarget.getAttribute('data-id');
      const item = errorData.find(x=>x.id===id);
      showErrorModal(item);
    };
  });
  container.querySelectorAll('[data-action="del-error"]').forEach(btn=>{
    btn.onclick = async (e)=> {
      const id = e.currentTarget.getAttribute('data-id');
      if(!confirm("ต้องการลบข้อมูลนี้ใช่หรือไม่?")) return;
      await deleteDoc(ERROR_COL, id);
      // update in-memory & UI
      errorData = loadCol(ERROR_COL);
      errorSearchHandler();
    };
  });
}

// Render stock list
function renderStockListByField(field, valLower) {
  const list = stockData.filter(e => ((e[field]||"").toLowerCase() === valLower));
  const container = document.getElementById('stockList');
  container.innerHTML = "";
  if(!list.length) {
    container.innerHTML = "<div class='empty-state'><i class='bi bi-box'></i><div>ไม่พบข้อมูลอะไหล่</div></div>";
    return;
  }
  list.forEach(item=>{
    const card = document.createElement('div'); card.className='card';
    const thumbWrapper = document.createElement('div');
    if (Array.isArray(item.images) && item.images.length) {
      const img = document.createElement('img');
      img.className = 'thumb';
      img.src = item.images[0];
      img.onerror = () => { img.src = PLACEHOLDER_IMG; };
      img.onclick = ()=> showImgViewer(item.images.length?item.images:[img.src], 0);
      thumbWrapper.appendChild(img);
    } else {
      const bases = generateCandidatesForStock(item);
      const candidates = makeImageCandidatesFromBases(bases);
      const img = createImgWithFallback(candidates, `${item.partName}`);
      img.onclick = ()=> showImgViewer([img.src], 0);
      thumbWrapper.appendChild(img);
    }
    card.appendChild(thumbWrapper);

    const content = document.createElement('div'); content.style.flex="1";
    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div class="card-title">${escapeHtml(item.partName || "")} ${item.forModel?`<span class="badge">${escapeHtml(item.forModel)}</span>`:""}</div>
          <span class="badge badge-stock">${escapeHtml(item.partBrand||"-")}</span>
        </div>
        <div>
          <button class="btn btn-warning btn-sm" data-id="${item.id}" data-action="edit-stock"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-danger btn-sm" data-id="${item.id}" data-action="del-stock"><i class="bi bi-trash"></i></button>
        </div>
      </div>
      <div style="margin-top:6px;"><span class="badge badge-success">${escapeHtml(String(item.qty||0))} ชิ้น</span></div>
      ${item.partNote?`<div style="margin-top:6px;"><b>หมายเหตุ:</b> ${escapeHtml(item.partNote)}</div>`:""}
    `;
    card.appendChild(content);
    container.appendChild(card);
  });

  container.querySelectorAll('[data-action="edit-stock"]').forEach(btn=>{
    btn.onclick = (e)=> {
      const id = e.currentTarget.getAttribute('data-id');
      const item = stockData.find(x=>x.id===id);
      showStockModal(item);
    };
  });
  container.querySelectorAll('[data-action="del-stock"]').forEach(btn=>{
    btn.onclick = async (e)=> {
      const id = e.currentTarget.getAttribute('data-id');
      if(!confirm("ต้องการลบข้อมูลนี้ใช่หรือไม่?")) return;
      await deleteDoc(STOCK_COL, id);
      stockData = loadCol(STOCK_COL);
      stockSearchHandler();
    };
  });
}

// ---------- Modals for Error & Stock (ไม่มีการอัปโหลดรูปในเว็บนี้) ----------

const modal = document.getElementById('modal');
const modalContent = document.getElementById('modalContent');
modal.onclick = function(e){ if(e.target==modal) hideModal(); };
function hideModal(){ modal.style.display="none"; modalContent.innerHTML=""; }
window.addEventListener("keydown", function(e){
  if(modal.style.display==="flex" && e.key==="Escape") hideModal();
  if(document.getElementById('imgViewerBackdrop').classList.contains("active") && e.key==="Escape") closeImgViewer();
});

// Show Error modal (item can be null to add)
function showErrorModal(item=null) {
  // item may be object from data or null
  const isEdit = !!item;
  modalContent.innerHTML = `
    <button class="close" onclick="hideModal()" aria-label="ปิดหน้าต่าง">&times;</button>
    <h2 style="margin-bottom:14px;font-size:1.13em;">${isEdit?'แก้ไข':'เพิ่ม'} Error Code</h2>
    <form id="errorForm" autocomplete="off">
      <div class="input-group"><label>แบรนด์</label><input type="text" name="brand" required value="${isEdit?escapeHtml(item.brand):""}"></div>
      <div class="input-group"><label>ประเภทเครื่อง</label><input type="text" name="type" required value="${isEdit?escapeHtml(item.type):""}"></div>
      <div class="input-group"><label>หมายเลขรุ่น</label><input type="text" name="model" required value="${isEdit?escapeHtml(item.model):""}"></div>
      <div class="input-group"><label>Error Code</label><input type="text" name="errorCode" required value="${isEdit?escapeHtml(item.errorCode):""}"></div>
      <div class="input-group"><label>อะไหล่ที่เสีย</label><input type="text" name="parts" value="${isEdit?escapeHtml(item.parts):""}"></div>
      <div class="input-group"><label>สิ่งที่ควรเช็ค</label><textarea name="checkList">${isEdit?escapeHtml(item.checkList):""}</textarea></div>
      <div class="input-group"><label>วิธีแก้ไข</label><textarea name="solution">${isEdit?escapeHtml(item.solution):""}</textarea></div>

      <div class="input-group">
        <label>ชื่อไฟล์รูป (คั่นด้วยคอมม่า) — วางไฟล์ไว้ที่โฟลเดอร์ <code>images/</code></label>
        <input type="text" name="images" id="imagesInput" placeholder="เช่น model123.jpg หรือ model123_1.jpg, model123_2.png" value="${isEdit && item.images ? escapeHtml((item.images||[]).join(',')) : ''}">
        <div style="font-size:0.9em;color:#666;margin-top:6px;">หรือเว้นว่างไว้แล้วกด "ค้นหารูปอัตโนมัติ" เพื่อสืบค้นจากชื่อรุ่น/แบรนด์</div>
        <button type="button" id="autoFindErrorBtn" class="add-btn" style="margin-top:8px;">ค้นหารูปอัตโนมัติ</button>
      </div>

      <div style="display:flex;gap:8px;align-items:center;">
        <button type="submit" class="save-btn"><i class="bi bi-save"></i> ${isEdit?'บันทึกการแก้ไข':'บันทึกข้อมูล'}</button>
        <button type="button" onclick="hideModal()" class="btn btn-sm">ยกเลิก</button>
      </div>

      <div id="errorFormMsg" style="color:green;font-size:0.95em;margin-top:8px;"></div>
    </form>
  `;
  modal.style.display = "flex";

  document.getElementById('autoFindErrorBtn').onclick = async function(){
    const brand = modalContent.querySelector('input[name=brand]').value;
    const model = modalContent.querySelector('input[name=model]').value;
    const probeBases = generateCandidatesForError({brand, model, errorCode: ''});
    const candidates = makeImageCandidatesFromBases(probeBases);
    const found = await probeImages(candidates, 4); // find up to 4
    if(found.length) {
      document.getElementById('imagesInput').value = found.join(',');
      alert("พบรูป: " + found.join(', '));
    } else {
      alert("ไม่พบรูปตามชื่อที่ลองค้น (ดูว่าไฟล์อยู่ในโฟลเดอร์ images/ และตั้งชื่อให้ตรง)");
    }
  };

  document.getElementById('errorForm').onsubmit = async function(e) {
    e.preventDefault();
    const f = e.target;
    const rec = {
      brand: f.brand.value.trim(),
      type: f.type.value.trim(),
      model: f.model.value.trim(),
      errorCode: f.errorCode.value.trim(),
      parts: f.parts.value.trim(),
      checkList: f.checkList.value.trim(),
      solution: f.solution.value.trim(),
      images: []
    };
    // read images field if any
    const imagesText = document.getElementById('imagesInput').value.trim();
    if(imagesText) {
      // allow users to specify either full URL or filename; normalize to images/
      rec.images = imagesText.split(',').map(s=>s.trim()).filter(Boolean).map(fn=>{
        // if starts with http or / -> use as-is; else prefix with images/
        if (/^https?:\/\//i.test(fn) || fn.startsWith('/')) return fn;
        return `${IMAGE_FOLDER}/${fn}`;
      }).slice(0,8);
    } else {
      // auto-attempt to find images by candidate names (best-effort)
      const bases = generateCandidatesForError(rec);
      const candidates = makeImageCandidatesFromBases(bases);
      const found = await probeImages(candidates, 4);
      rec.images = found;
    }

    // validation
    if(!rec.brand || !rec.type || !rec.model || !rec.errorCode) { alert("กรอกข้อมูลที่จำเป็นให้ครบ!"); return; }

    if(isEdit) {
      await updateDoc(ERROR_COL, item.id, rec);
    } else {
      await addDoc(ERROR_COL, rec);
    }
    // refresh local data
    errorData = loadCol(ERROR_COL);
    hideModal();
    errorSearchHandler();
  };
}

// Show Stock modal
function showStockModal(item=null) {
  const isEdit = !!item;
  modalContent.innerHTML = `
    <button class="close" onclick="hideModal()" aria-label="ปิดหน้าต่าง">&times;</button>
    <h2 style="margin-bottom:14px;font-size:1.13em;">${isEdit?'แก้ไข':'เพิ่ม'} อะไหล่ในคลัง</h2>
    <form id="stockForm" autocomplete="off">
      <div class="input-group"><label>ชื่ออะไหล่</label><input type="text" name="partName" required value="${isEdit?escapeHtml(item.partName):""}"></div>
      <div class="input-group"><label>สำหรับรุ่น</label><input type="text" name="forModel" value="${isEdit?escapeHtml(item.forModel):""}"></div>
      <div class="input-group"><label>แบรนด์</label><input type="text" name="partBrand" value="${isEdit?escapeHtml(item.partBrand):""}"></div>
      <div class="input-group"><label>จำนวนในคลัง</label><input type="number" name="qty" min="0" required value="${isEdit?(item.qty||0):0}"></div>
      <div class="input-group"><label>หมายเหตุ</label><input type="text" name="partNote" value="${isEdit?escapeHtml(item.partNote):""}"></div>

      <div class="input-group">
        <label>ชื่อไฟล์รูป (คั่นด้วยคอมม่า) — วางไฟล์ไว้ที่โฟลเดอร์ <code>images/</code></label>
        <input type="text" name="images" id="stockImagesInput" placeholder="เช่น partx.jpg, partx_1.png" value="${isEdit && item.images ? escapeHtml((item.images||[]).join(',')) : ''}">
        <div style="font-size:0.9em;color:#666;margin-top:6px;">หรือเว้นว่างไว้แล้วกด "ค้นหารูปอัตโนมัติ" เพื่อสืบค้นจากชื่ออะไหล่/รุ่น</div>
        <button type="button" id="autoFindStockBtn" class="add-btn" style="margin-top:8px;">ค้นหารูปอัตโนมัติ</button>
      </div>

      <div style="display:flex;gap:8px;align-items:center;">
        <button type="submit" class="save-btn"><i class="bi bi-save"></i> ${isEdit?'บันทึกการแก้ไข':'บันทึกข้อมูล'}</button>
        <button type="button" onclick="hideModal()" class="btn btn-sm">ยกเลิก</button>
      </div>

      <div id="stockFormMsg" style="color:green;font-size:0.95em;margin-top:8px;"></div>
    </form>
  `;
  modal.style.display = "flex";

  document.getElementById('autoFindStockBtn').onclick = async function(){
    const partName = modalContent.querySelector('input[name=partName]').value;
    const forModel = modalContent.querySelector('input[name=forModel]').value;
    const probeBases = generateCandidatesForStock({partName, forModel, partBrand: ''});
    const candidates = makeImageCandidatesFromBases(probeBases);
    const found = await probeImages(candidates, 4);
    if(found.length) {
      document.getElementById('stockImagesInput').value = found.join(',');
      alert("พบรูป: " + found.join(', '));
    } else {
      alert("ไม่พบรูปตามชื่อที่ลองค้น (ดูว่าไฟล์อยู่ในโฟลเดอร์ images/ และตั้งชื่อให้ตรง)");
    }
  };

  document.getElementById('stockForm').onsubmit = async function(e){
    e.preventDefault();
    const f = e.target;
    const rec = {
      partName: f.partName.value.trim(),
      forModel: f.forModel.value.trim(),
      partBrand: f.partBrand.value.trim(),
      qty: parseInt(f.qty.value,10)||0,
      partNote: f.partNote.value.trim(),
      images: []
    };
    const imagesText = document.getElementById('stockImagesInput').value.trim();
    if(imagesText) {
      rec.images = imagesText.split(',').map(s=>s.trim()).filter(Boolean).map(fn=>{
        if (/^https?:\/\//i.test(fn) || fn.startsWith('/')) return fn;
        return `${IMAGE_FOLDER}/${fn}`;
      }).slice(0,8);
    } else {
      const bases = generateCandidatesForStock(rec);
      const candidates = makeImageCandidatesFromBases(bases);
      const found = await probeImages(candidates, 4);
      rec.images = found;
    }

    if(!rec.partName) { alert("กรอกชื่ออะไหล่!"); return; }
    if(isEdit) {
      await updateDoc(STOCK_COL, item.id, rec);
    } else {
      await addDoc(STOCK_COL, rec);
    }
    stockData = loadCol(STOCK_COL);
    hideModal();
    stockSearchHandler();
  };
}

// ---------- Image probing helper (ลองโหลดภาพแบบ async, คืน list ที่เจอ) ----------
// - รับ list ของ URL candidates (ordered) และจำนวนสูงสุดที่ต้องการคืน (limit)
function probeImages(candidates, limit=4) {
  return new Promise((resolve) => {
    const found = [];
    let idx = 0;
    function tryNext() {
      if(found.length >= limit || idx >= candidates.length) {
        resolve(found);
        return;
      }
      const url = candidates[idx++];
      const img = new Image();
      img.onload = function() {
        found.push(url);
        // continue searching until limit or exhausted
        tryNext();
      };
      img.onerror = function() {
        tryNext();
      };
      img.src = url + (url.indexOf('?')===-1 ? '?v=1' : '&v=1'); // cache-bust param not necessary but harmless
    }
    tryNext();
  });
}

// ---------- Image Viewer ----------
let imgViewerList = [];
let imgViewerIdx = 0;
function showImgViewer(list, idx) {
  imgViewerList = list;
  imgViewerIdx = idx || 0;
  setImgViewerImg();
  document.getElementById('imgViewerBackdrop').classList.add("active");
}
window.showImgViewer = showImgViewer;
function setImgViewerImg() {
  if(!imgViewerList.length) return;
  const img = document.getElementById('imgViewerImg');
  img.src = imgViewerList[imgViewerIdx];
  img.alt = "รูป "+(imgViewerIdx+1);
}
function closeImgViewer() {
  document.getElementById('imgViewerBackdrop').classList.remove("active");
}
document.getElementById('imgViewerClose').onclick = closeImgViewer;
document.getElementById('imgViewerBackdrop').onclick = function(e){ if(e.target==this) closeImgViewer(); };
document.getElementById('imgViewerPrev').onclick = function(){ imgViewerIdx = (imgViewerIdx-1+imgViewerList.length)%imgViewerList.length; setImgViewerImg(); };
document.getElementById('imgViewerNext').onclick = function(){ imgViewerIdx = (imgViewerIdx+1)%imgViewerList.length; setImgViewerImg(); };

// ---------- CRUD Buttons (Add / Edit / Delete) ----------
window.editError = function(id){
  const item = errorData.find(e=>e.id===id);
  showErrorModal(item);
};
window.delError = async function(id){
  if(!confirm("ต้องการลบข้อมูลนี้ใช่หรือไม่?")) return;
  await deleteDoc(ERROR_COL, id);
  errorData = loadCol(ERROR_COL);
  errorSearchHandler();
};
document.getElementById('addErrorBtn').onclick = ()=>showErrorModal();

window.editStock = function(id){
  const item = stockData.find(e=>e.id===id);
  showStockModal(item);
};
window.delStock = async function(id){
  if(!confirm("ต้องการลบข้อมูลนี้ใช่หรือไม่?")) return;
  await deleteDoc(STOCK_COL, id);
  stockData = loadCol(STOCK_COL);
  stockSearchHandler();
};
document.getElementById('addStockBtn').onclick = ()=>showStockModal();

// ---------- Export / Import (local JSON) ----------
document.getElementById('exportErrorBtn').onclick = async function() {
  const data = await getAll(ERROR_COL);
  const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = "error_data.json";
  a.click();
};
document.getElementById('importErrorBtn').onclick = function() {
  document.getElementById('importErrorInput').click();
};
document.getElementById('importErrorInput').onchange = function(e) {
  if (!e.target.files.length) return;
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = async function(evt) {
    try {
      const data = JSON.parse(evt.target.result);
      let arr = await getAll(ERROR_COL);
      let added = 0, duplicated = 0;
      for (const d of data) {
        if(arr.some(e=>e.errorCode === d.errorCode && e.brand === d.brand && e.model === d.model)) {
          duplicated++;
        } else {
          await addDoc(ERROR_COL, d);
          added++;
        }
      }
      alert(`นำเข้าเรียบร้อย: เพิ่ม ${added} รายการ, มีข้อมูลนี้อยู่แล้ว ${duplicated} รายการ`);
      errorData = loadCol(ERROR_COL);
      errorSearchHandler();
    } catch(e) { alert("ไฟล์ไม่ถูกต้อง"); }
  };
  reader.readAsText(file);
};

document.getElementById('exportStockBtn').onclick = async function() {
  const data = await getAll(STOCK_COL);
  const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = "stock_data.json";
  a.click();
};
document.getElementById('importStockBtn').onclick = function() {
  document.getElementById('importStockInput').click();
};
document.getElementById('importStockInput').onchange = function(e) {
  if (!e.target.files.length) return;
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = async function(evt) {
    try {
      const data = JSON.parse(evt.target.result);
      let arr = await getAll(STOCK_COL);
      let added = 0, duplicated = 0;
      for (const d of data) {
        if(arr.some(e=>e.partName === d.partName && e.forModel === d.forModel && e.partBrand === d.partBrand)) {
          duplicated++;
        } else {
          await addDoc(STOCK_COL, d);
          added++;
        }
      }
      alert(`นำเข้าเรียบร้อย: เพิ่ม ${added} รายการ, มีข้อมูลนี้อยู่แล้ว ${duplicated} รายการ`);
      stockData = loadCol(STOCK_COL);
      stockSearchHandler();
    } catch(e) { alert("ไฟล์ไม่ถูกต้อง"); } 
  }; 
  reader.readAsText(file); 
};

// ---------- INIT (Render initial state) ----------
window.onload = function() {
  // ensure localStorage keys exist
  if(!localStorage.getItem(ERROR_COL)) saveCol(ERROR_COL, []);
  if(!localStorage.getItem(STOCK_COL)) saveCol(STOCK_COL, []);
  // load into memory
  errorData = loadCol(ERROR_COL);
  stockData = loadCol(STOCK_COL);
  // empty search boxes
  searchErrorInput.value = "";
  searchStockInput.value = "";
  // initial UI empty lists
  document.getElementById('errorList').innerHTML = "";
  document.getElementById('stockList').innerHTML = "";
};

