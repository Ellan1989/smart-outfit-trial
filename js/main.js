/**
 * main.js —— 入口：路由、AI 设置面板、全局函数、初始化
 *
 * 复用自 travel-footprint-contest/main.js 的：
 *   - switchTab 路由
 *   - toast 全局提示
 *   - openAISettings/closeAISettings/onPresetChange/saveAISettings AI 配置面板
 * 新增：PWA Service Worker 注册、Store 异步加载、激活前置校验（Phase 3 接入）。
 */

/** tab 切换 */
function switchTab(screen){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + screen);
  if(el) el.classList.add('active');
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector(`.tab-item[data-screen="${screen}"]`);
  if(tab) tab.classList.add('active');
  // 进入各页时刷新
  if(screen === 'closet') PageCloset.render();
  if(screen === 'outfit') PageOutfit.render();
  if(screen === 'me') PageMe.render();
}

/** Toast（复用相册） */
let toastTimer;
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/** HTML 转义（防 XSS，复用相册约定） */
function escapeHtml(s){
  if(s == null) return '';
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/** ===== AI 设置面板（复用相册逻辑） ===== */
function openAISettings(){
  const saved = AI_CONFIG._loadSaved();
  const presetId = saved.presetId || AI_CONFIG.ACTIVE_PRESET;
  document.getElementById('ai-preset').value = presetId;
  onPresetChange();
  document.getElementById('ai-key').value = saved.apiKey || '';
  if(presetId === 'custom'){
    document.getElementById('ai-custom-base').value = saved.apiBase || '';
    document.getElementById('ai-custom-model').value = saved.model || '';
  }
  document.getElementById('ai-mask').classList.add('show');
  document.getElementById('ai-panel').classList.add('show');
}
function closeAISettings(){
  document.getElementById('ai-mask').classList.remove('show');
  document.getElementById('ai-panel').classList.remove('show');
}
function onPresetChange(){
  const id = document.getElementById('ai-preset').value;
  const preset = AI_CONFIG.PRESETS.find(p => p.id === id);
  document.getElementById('ai-custom-fields').style.display = (id === 'custom') ? 'block' : 'none';
  document.getElementById('ai-key-hint').textContent = preset ? preset.keyHint : '';
  const linkEl = document.getElementById('ai-getkey-link');
  if(preset && preset.getKeyUrl && id !== 'custom'){
    linkEl.innerHTML = `<a href="${preset.getKeyUrl}" target="_blank" style="font-size:12px;color:#e07856">前往获取 API Key →</a>`;
  } else {
    linkEl.innerHTML = '';
  }
}
function saveAISettings(){
  const presetId = document.getElementById('ai-preset').value;
  const preset = AI_CONFIG.PRESETS.find(p => p.id === presetId);
  const apiKey = document.getElementById('ai-key').value.trim();
  if(!apiKey){ toast('请输入 API Key'); return; }
  const opts = { presetId, apiKey };
  if(presetId === 'custom'){
    opts.apiBase = document.getElementById('ai-custom-base').value.trim();
    opts.model = document.getElementById('ai-custom-model').value.trim();
    if(!opts.apiBase || !opts.model){ toast('请填写接口地址和模型名'); return; }
  } else if(preset){
    opts.apiBase = preset.apiBase;
    opts.model = preset.model;
  }
  AI_CONFIG.save(opts);
  const statusEl = document.getElementById('ai-status-brief');
  if(statusEl){
    statusEl.textContent = '已配置';
    statusEl.style.color = '#34c759';
  }
  toast('✓ AI 配置已保存');
  closeAISettings();

  // 配完 API 后，检查有没有"待识别"的衣物，提示用户批量识别
  const clothes = Store.get('clothes') || [];
  const pendingCount = clothes.filter(c => c.tagged === false || !c.category || c.category === '待识别').length;
  if(pendingCount > 0){
    setTimeout(() => {
      if(confirm(`检测到 ${pendingCount} 件衣物还未 AI 识别。\n是否现在批量识别？\n（这会让 AI 重新分析这些衣物的类别、颜色、风格）`)){
        PageCloset.retagAllPending();
      }
    }, 600);
  }
}
function clearAISettings(){
  AI_CONFIG.clear();
  document.getElementById('ai-key').value = '';
  const statusEl = document.getElementById('ai-status-brief');
  if(statusEl){
    statusEl.textContent = '未配置';
    statusEl.style.color = '#999';
  }
  toast('已清除 AI 配置');
}

/** 展开/折叠 API 配置教程 */
function toggleGuide(){
  const steps = document.getElementById('guide-steps');
  const arrow = document.getElementById('guide-arrow');
  const isOpen = steps.style.display !== 'none';
  steps.style.display = isOpen ? 'none' : 'block';
  arrow.classList.toggle('open', !isOpen);
}

/** ===== 激活授权（读 EDITION 配置区分试用版/商用版）===== */
// 试用版 EDITION.licenseRequired = false，直接跳过激活
// 商用版 EDITION.licenseRequired = true，需激活码

/** 应用版本标识：试用版显示徽章、调整标题 */
function applyEdition(){
  if(typeof EDITION === 'undefined') return;
  // 试用版徽章
  const badge = document.getElementById('edition-badge');
  if(EDITION.mode === 'trial' && badge){
    badge.style.display = 'block';
  }
  // 调整文档标题
  document.title = EDITION.name + (EDITION.mode === 'trial' ? ' · 试用版' : '');
}

/** 显示激活遮罩 */
function showLicenseMask(){
  document.getElementById('license-mask').classList.add('show');
}
function hideLicenseMask(){
  document.getElementById('license-mask').classList.remove('show');
}

/** 激活按钮 */
async function doActivate(){
  const code = document.getElementById('license-code').value.trim();
  const errEl = document.getElementById('license-error');
  const btn = document.querySelector('.lic-btn');
  if(!code){ errEl.textContent = '请输入激活码'; return; }
  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = '激活中...';
  const r = await License.activate(code);
  btn.disabled = false;
  btn.textContent = '激活并开始使用';
  if(r.ok){
    hideLicenseMask();
    toast('✓ 激活成功，欢迎使用');
  } else {
    errEl.textContent = r.error || '激活失败';
  }
}

/** 初始化 */
document.addEventListener('DOMContentLoaded', async () => {
  // 0. 版本标识：试用版显示徽章 + 调整 title
  applyEdition();

  // 1. 注册 Service Worker（PWA）
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW 注册失败', e));
  }

  // 2. 从 IndexedDB 加载数据
  await Store.load();

  // 3. 渲染各页
  PageCloset.render();
  PageOutfit.render();
  PageMe.render();

  // 4. 激活授权校验（读 EDITION 配置：商用版要激活，试用版跳过）
  if(EDITION.licenseRequired){
    const activated = await License.init();
    if(!License.isAuthorized()){
      showLicenseMask();  // 未激活或失效，显示激活遮罩
    }
  }

  // 5. 衣物上传 input（两个：相册 + 拍照）
  // 用 label 关联触发，change 事件里处理文件 + 关菜单
  const albumInput = document.getElementById('cloth-file-input');
  const cameraInput = document.getElementById('cloth-camera-input');
  function onPicked(e){
    // 先关菜单（文件选择器已关闭，此时改 DOM 安全）
    const mask = document.getElementById('add-source-mask');
    const sheet = document.getElementById('add-source-sheet');
    if(mask) mask.classList.remove('show');
    if(sheet) sheet.classList.remove('show');
    // 处理文件
    PageCloset.handleFiles(e.target.files);
    e.target.value = '';  // 允许重复选同一文件
  }
  if(albumInput) albumInput.addEventListener('change', onPicked);
  if(cameraInput) cameraInput.addEventListener('change', onPicked);

  // 6. 数据变化时自动刷新当前页
  Store.on('change:clothes', () => {
    if(document.getElementById('screen-closet').classList.contains('active')) PageCloset.render();
  });
  Store.on('change:outfits', () => {
    if(document.getElementById('screen-outfit').classList.contains('active')) PageOutfit.renderHistory();
  });
});
