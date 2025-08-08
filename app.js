// --------- Firebase Config -----------
const firebaseConfig = {
  apiKey: "AIzaSyDBwvowdavTcrzBtjSOHphrkF9UB_SCCag",
  authDomain: "wtf-error.firebaseapp.com",
  projectId: "wtf-error",
  storageBucket: "wtf-error.firebasestorage.app",
  messagingSenderId: "329249521089",
  appId: "1:329249521089:web:50219f4e71b0ccd4a70340",
  measurementId: "G-M2F25S8WYK"
};
// !! เปลี่ยนค่าด้านบนให้ตรงกับของคุณ !!

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const ERROR_COL = "error_codes";
const STOCK_COL = "stock_parts";

// --------- Helper Functions -----------
function escape(str) { return String(str||"").replace(/[&<>"']/g, s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[s])); }
function uuid() { return Math.random().toString(36).substring(2,10) + Date.now(); }

// --------- Data CRUD from Firestore -----------
async function getAll(col) {
  const snap = await db.collection(col).get();
  return snap.docs.map(doc => ({...doc.data(), id: doc.id}));
}
async function addDoc(col, data) {
  const docRef = await db.collection(col).add(data);
  return docRef.id;
}
async function updateDoc(col, id, data) {
  await db.collection(col).doc(id).set(data, {merge: true});
}
async function deleteDoc(col, id) {
  await db.collection(col).doc(id).delete();
}

// --------- Realtime Sync -----------
function listenFirestore(col, onChange) {
  db.collection(col).onSnapshot(snap => {
    const arr = snap.docs.map(doc => ({...doc.data(), id: doc.id}));
    onChange(arr);
  });
}

// --------- Render & UI Logic ---------
// ------ Error Section ------
let errorData = [];
listenFirestore(ERROR_COL, arr => {
  errorData = arr;
  errorSearchHandler();
});
// ------ Stock Section ------
let stockData = [];
listenFirestore(STOCK_COL, arr => {
  stockData = arr;
  stockSearchHandler();
});

// ----------- UI Navigation -----------
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
// --------- Smart Search + Suggestion: Error Section ---------
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
    if (suggests.length === 1 && suggests[0].toLowerCase() === val) {
      renderErrorListByField(field, val);
      errorSuggestBox.style.display = "none";
      return;
    }
    errorSuggestBox.innerHTML = suggests.map(s=>`<div class="suggest-item">${s}</div>`).join('');
    errorSuggestBox.style.display = suggests.length ? "block" : "none";
    document.getElementById('errorList').innerHTML = "";
  } else {
    errorSuggestBox.style.display = "none";
    document.getElementById('errorList').innerHTML = "";
  }
}
function renderErrorListByField(field, val) {
  let list = errorData.filter(e => (e[field]||"").toLowerCase() === val);
  if(field === "brand") list = errorData.filter(e => (e.brand||"").toLowerCase() === val);
  if(field === "model") list = errorData.filter(e => (e.model||"").toLowerCase() === val);
  if(field === "errorCode") list = errorData.filter(e => (e.errorCode||"").toLowerCase() === val);
  if(!list.length) {
    document.getElementById('errorList').innerHTML = "<div class='empty-state'><i class='bi bi-database-x'></i><div>ไม่พบข้อมูล</div></div>";
    return;
  }
  document.getElementById('errorList').innerHTML = list.map(item=>`
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">${escape(item.brand)} <span class="badge">${escape(item.model)}</span></div>
          <span class="badge badge-type">${escape(item.type||"")}</span>
        </div>
        <div>
          <button class="btn btn-warning btn-sm" onclick="editError('${item.id}')"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-danger btn-sm" onclick="delError('${item.id}')"><i class="bi bi-trash"></i></button>
        </div>
      </div>
      <div><span class="badge badge-error">Error: ${escape(item.errorCode||"")}</span></div>
      ${item.images && item.images.length ? `
        <div class="thumbnail-container">
          ${item.images.map((img,i)=>`
            <img src="${img}" class="thumbnail" onclick="showImgViewer(${JSON.stringify(item.images).replace(/"/g,'&quot;')},${i})" alt="รูป${i+1}">
          `).join('')}
        </div>` : ""}
      <div style="margin-top:3px;"><b>อะไหล่ที่เสีย:</b> ${escape(item.parts||'-')}</div>
      <div style="margin-top:2px;"><b>สิ่งที่ควรเช็ค:</b> ${escape(item.checkList||'-')}</div>
      <div style="margin-top:2px;"><b>วิธีแก้ไข:</b> ${escape(item.solution||'-')}</div>
    </div>
  `).join('');
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

// --------- Smart Search + Suggestion: Stock Section ---------
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
    stockSuggestBox.innerHTML = suggests.map(s=>`<div class="suggest-item">${s}</div>`).join('');
    stockSuggestBox.style.display = suggests.length ? "block" : "none";
    document.getElementById('stockList').innerHTML = "";
  } else {
    stockSuggestBox.style.display = "none";
    document.getElementById('stockList').innerHTML = "";
  }
}
function renderStockListByField(field, val) {
  let list = stockData.filter(e => (e[field]||"").toLowerCase() === val);
  document.getElementById('stockList').innerHTML = list.length ? list.map(item=>`
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">${escape(item.partName)} ${item.forModel?`<span class="badge">${escape(item.forModel)}</span>`:""}</div>
          <span class="badge badge-stock">${escape(item.partBrand||"-")}</span>
        </div>
        <div>
          <button class="btn btn-warning btn-sm" onclick="editStock('${item.id}')"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-danger btn-sm" onclick="delStock('${item.id}')"><i class="bi bi-trash"></i></button>
        </div>
      </div>
      <div><span class="badge badge-success">${escape(item.qty)} ชิ้น</span></div>
      ${item.images && item.images.length ? `
        <div class="thumbnail-container">
          ${item.images.map((img,i)=>`
            <img src="${img}" class="thumbnail" onclick="showImgViewer(${JSON.stringify(item.images).replace(/"/g,'&quot;')},${i})" alt="รูป${i+1}">
          `).join('')}
        </div>` : ""}
      ${item.partNote?`<div style="margin-top:6px;"><b>หมายเหตุ:</b> ${escape(item.partNote)}</div>`:""}
    </div>
  `).join('') : "<div class='empty-state'><i class='bi bi-box'></i><div>ไม่พบข้อมูลอะไหล่</div></div>";
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

// --------- CRUD & Modal ---------
window.editError = function(id){
  const item = errorData.find(e=>e.id===id);
  showErrorModal(item);
};
window.delError = async function(id){
  if(!confirm("ต้องการลบข้อมูลนี้ใช่หรือไม่?")) return;
  await deleteDoc(ERROR_COL, id);
};
document.getElementById('addErrorBtn').onclick = ()=>showErrorModal();

window.editStock = function(id){
  const item = stockData.find(e=>e.id===id);
  showStockModal(item);
};
window.delStock = async function(id){
  if(!confirm("ต้องการลบข้อมูลนี้ใช่หรือไม่?")) return;
  await deleteDoc(STOCK_COL, id);
};
document.getElementById('addStockBtn').onclick = ()=>showStockModal();

const modal = document.getElementById('modal');
const modalContent = document.getElementById('modalContent');
modal.onclick = function(e){ if(e.target==modal) hideModal(); };
function hideModal(){ modal.style.display="none"; modalContent.innerHTML=""; }
window.addEventListener("keydown", function(e){
  if(modal.style.display==="flex" && e.key==="Escape") hideModal();
  if(document.getElementById('imgViewerBackdrop').classList.contains("active") && e.key==="Escape") closeImgViewer();
});
function showErrorModal(item=null) {
  modalContent.innerHTML = `
    <button class="close" onclick="hideModal()" aria-label="ปิดหน้าต่าง">&times;</button>
    <h2 style="margin-bottom:14px;font-size:1.13em;">${item?'แก้ไข':'เพิ่ม'} Error Code</h2>
    <form id="errorForm" autocomplete="off">
      <div class="input-group"><label>แบรนด์</label><input type="text" name="brand" required value="${item?escape(item.brand):""}"></div>
      <div class="input-group"><label>ประเภทเครื่อง</label><input type="text" name="type" required value="${item?escape(item.type):""}"></div>
      <div class="input-group"><label>หมายเลขรุ่น</label><input type="text" name="model" required value="${item?escape(item.model):""}"></div>
      <div class="input-group"><label>Error Code</label><input type="text" name="errorCode" required value="${item?escape(item.errorCode):""}"></div>
      <div class="input-group"><label>อะไหล่ที่เสีย</label><input type="text" name="parts" value="${item?escape(item.parts):""}"></div>
      <div class="input-group"><label>สิ่งที่ควรเช็ค</label><textarea name="checkList">${item?escape(item.checkList):""}</textarea></div>
      <div class="input-group"><label>วิธีแก้ไข</label><textarea name="solution">${item?escape(item.solution):""}</textarea></div>
      <div class="input-group">
        <label>รูปภาพ (สูงสุด 8 รูป)</label>
        <input type="file" id="imageUpload" accept="image/*" multiple>
        <div class="thumb-list" id="thumbList"></div>
      </div>
      <button type="submit" class="save-btn"><i class="bi bi-save"></i> ${item?'บันทึกการแก้ไข':'บันทึกข้อมูล'}</button>
    </form>
  `;
  modal.style.display = "flex";
  let imageFiles = item && item.images?item.images.slice():[];
  renderModalThumbs();
  function renderModalThumbs(){
    const thumbList = document.getElementById('thumbList');
    thumbList.innerHTML = imageFiles.map((img,i)=>`
      <div class="thumb-wrapper">
        <img class="thumb-img" src="${img}" alt="รูป${i+1}" tabindex="0" onclick="showImgViewer(${JSON.stringify(imageFiles).replace(/"/g,'&quot;')},${i})">
        <button class="thumb-del-btn" onclick="delImg(${i})" title="ลบรูปนี้">&times;</button>
      </div>
    `).join('');
    window.delImg = function(idx){ imageFiles.splice(idx,1); renderModalThumbs(); }
  }
  document.getElementById('imageUpload').onchange = function(e){
    let files = Array.from(e.target.files);
    let remain = 8-imageFiles.length;
    files.slice(0,remain).forEach(file=>{
      let reader = new FileReader();
      reader.onload = evt=>{ imageFiles.push(evt.target.result); renderModalThumbs(); };
      reader.readAsDataURL(file);
    });
    setTimeout(()=>{ e.target.value=""; },200);
  };
  document.getElementById('errorForm').onsubmit = async function(e){
    e.preventDefault();
    let f = e.target;
    let rec = {
      brand: f.brand.value.trim(),
      type: f.type.value.trim(),
      model: f.model.value.trim(),
      errorCode: f.errorCode.value.trim(),
      parts: f.parts.value.trim(),
      checkList: f.checkList.value.trim(),
      solution: f.solution.value.trim(),
      images: imageFiles.slice()
    };
    if(!rec.brand || !rec.type || !rec.model || !rec.errorCode) { alert("กรอกข้อมูลที่จำเป็นให้ครบ!"); return; }
    if(item) await updateDoc(ERROR_COL, item.id, rec);
    else await addDoc(ERROR_COL, rec);
    hideModal();
  };
}
function showStockModal(item=null) {
  modalContent.innerHTML = `
    <button class="close" onclick="hideModal()" aria-label="ปิดหน้าต่าง">&times;</button>
    <h2 style="margin-bottom:14px;font-size:1.13em;">${item?'แก้ไข':'เพิ่ม'} อะไหล่ในคลัง</h2>
    <form id="stockForm" autocomplete="off">
      <div class="input-group"><label>ชื่ออะไหล่</label><input type="text" name="partName" required value="${item?escape(item.partName):""}"></div>
      <div class="input-group"><label>สำหรับรุ่น</label><input type="text" name="forModel" value="${item?escape(item.forModel):""}"></div>
      <div class="input-group"><label>แบรนด์</label><input type="text" name="partBrand" value="${item?escape(item.partBrand):""}"></div>
      <div class="input-group"><label>จำนวนในคลัง</label><input type="number" name="qty" min="0" required value="${item?(item.qty||0):0}"></div>
      <div class="input-group"><label>หมายเหตุ</label><input type="text" name="partNote" value="${item?escape(item.partNote):""}"></div>
      <div class="input-group">
        <label>รูปภาพอะไหล่ (สูงสุด 8 รูป)</label>
        <input type="file" id="imageUpload" accept="image/*" multiple>
        <div class="thumb-list" id="thumbList"></div>
      </div>
      <button type="submit" class="save-btn"><i class="bi bi-save"></i> ${item?'บันทึกการแก้ไข':'บันทึกข้อมูล'}</button>
    </form>
  `;
  modal.style.display = "flex";
  let imageFiles = (item && item.images) ? item.images.slice() : [];
  renderModalThumbs();
  function renderModalThumbs(){
    const thumbList = document.getElementById('thumbList');
    thumbList.innerHTML = imageFiles.map((img,i)=>`
      <div class="thumb-wrapper">
        <img class="thumb-img" src="${img}" alt="รูป${i+1}" tabindex="0" onclick="showImgViewer(${JSON.stringify(imageFiles).replace(/"/g,'&quot;')},${i})">
        <button class="thumb-del-btn" onclick="delImg(${i})" title="ลบรูปนี้">&times;</button>
      </div>
    `).join('');
    window.delImg = function(idx){ imageFiles.splice(idx,1); renderModalThumbs(); }
  }
  document.getElementById('imageUpload').onchange = function(e){
    let files = Array.from(e.target.files);
    let remain = 8-imageFiles.length;
    files.slice(0,remain).forEach(file=>{
      let reader = new FileReader();
      reader.onload = evt=>{ imageFiles.push(evt.target.result); renderModalThumbs(); };
      reader.readAsDataURL(file);
    });
    setTimeout(()=>{ e.target.value=""; },200);
  };
  document.getElementById('stockForm').onsubmit = async function(e){
    e.preventDefault();
    let f = e.target;
    let rec = {
      partName: f.partName.value.trim(),
      forModel: f.forModel.value.trim(),
      partBrand: f.partBrand.value.trim(),
      qty: parseInt(f.qty.value,10)||0,
      partNote: f.partNote.value.trim(),
      images: imageFiles.slice()
    };
    if(!rec.partName) { alert("กรอกชื่ออะไหล่!"); return; }
    if(item) await updateDoc(STOCK_COL, item.id, rec);
    else await addDoc(STOCK_COL, rec);
    hideModal();
  };
}

// --------- Image Viewer ----------
let imgViewerList = [];
let imgViewerIdx = 0;
function showImgViewer(list, idx) {
  imgViewerList = list; imgViewerIdx = idx;
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

// --------- Export/Import (Cloud) ---------
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
      if (duplicated > 0) {
        alert(`นำเข้าเรียบร้อย: เพิ่ม ${added} รายการ, มีข้อมูลนี้อยู่แล้ว ${duplicated} รายการ`);
      } else {
        alert(`นำเข้าเรียบร้อย: เพิ่ม ${added} รายการ`);
      }
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
      if (duplicated > 0) {
        alert(`นำเข้าเรียบร้อย: เพิ่ม ${added} รายการ, มีข้อมูลนี้อยู่แล้ว ${duplicated} รายการ`);
      } else {
        alert(`นำเข้าเรียบร้อย: เพิ่ม ${added} รายการ`);
      }
    } catch(e) { alert("ไฟล์ไม่ถูกต้อง"); }
  };
  reader.readAsText(file);
};
// --------- INIT ----------
window.onload = function() {
  searchErrorInput.value = "";
  searchStockInput.value = "";
  document.getElementById('errorList').innerHTML = "";
  document.getElementById('stockList').innerHTML = "";
};
