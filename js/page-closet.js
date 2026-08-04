/**
 * page-closet.js —— 衣橱页（上传衣服 → AI 打标签 → 列表展示）
 *
 * 复用相册的组件模式：Toast 提示、空状态、卡片、流式三态 UI（这里是非流式三态）。
 * 复用 ImageUtils.fileToBase64 把上传的衣物图压成 base64（给 GLM-4V 用）。
 */
const PageCloset = (function(){

  /** 渲染衣橱列表 */
  function render(){
    const el = document.getElementById('closet-content');
    if(!el) return;
    const clothes = Store.get('clothes') || [];

    if(clothes.length === 0){
      el.innerHTML = `
        <div class="empty-state">
          <div class="es-icon">👗</div>
          <div class="es-title">衣橱还是空的</div>
          <div class="es-sub">点击下方"添加衣物"，拍照或上传衣服<br>AI 会自动识别类别、颜色、风格</div>
        </div>`;
      return;
    }

    // 统计条
    const stats = Store.clothStats();
    const statChips = Object.entries(stats).map(([k,v]) =>
      `<span class="tag orange">${escapeHtml(k)} ${v}</span>`
    ).join('');

    // 网格列表
    const grid = clothes.map(c => {
      const isPending = c.tagged === false || !c.category || c.category === '待识别';
      return `
      <div class="cloth-card" onclick="PageCloset.openDetail('${c.id}')">
        <div class="cloth-thumb" style="background-image:url('${c.thumb||''}')">
          ${c.thumb ? '' : '<span>📷</span>'}
          ${isPending ? '<span class="cloth-badge">待识别</span>' : ''}
        </div>
        <div class="cloth-info">
          <div class="cloth-cat">${escapeHtml(c.category||'未分类')}</div>
          <div class="cloth-meta">${isPending ? '<span style="color:#e07856">点此让 AI 识别</span>' : escapeHtml(c.color||'') + ' · ' + escapeHtml(c.style||'')}</div>
        </div>
        <div class="cloth-del" onclick="event.stopPropagation(); PageCloset.confirmDelete('${c.id}')">🗑️</div>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div class="closet-stats">${statChips}</div>
      <div class="cloth-grid">${grid}</div>
      <div style="height:30px"></div>
    `;
  }

  /** 触发添加衣物：弹出选择菜单（拍照/相册） */
  function addCloth(){
    document.getElementById('add-source-mask').classList.add('show');
    document.getElementById('add-source-sheet').classList.add('show');
  }

  /** 从相册选择 —— 关键：input.click() 必须在用户手势同步栈内，不能有前置 DOM 改动 */
  function chooseFromAlbum(){
    // 先关菜单（异步，不阻塞 input.click）
    closeAddSource();
    // 直接同步触发 input（保持在用户手势栈内）
    const input = document.getElementById('cloth-file-input');
    if(input) input.click();
  }

  /** 拍照 —— 同上，保持用户手势栈 */
  function chooseFromCamera(){
    closeAddSource();
    const input = document.getElementById('cloth-camera-input');
    if(input) input.click();
  }

  function closeAddSource(){
    document.getElementById('add-source-mask').classList.remove('show');
    document.getElementById('add-source-sheet').classList.remove('show');
  }

  /** 处理选中的文件 → 打标签 → 入库 */
  async function handleFiles(files){
    if(!files || !files.length) return;
    const fileArr = Array.from(files);
    const mask = document.getElementById('tagging-mask');
    const status = document.getElementById('tagging-status');
    const aiReady = AI.isAvailable('vision');
    if(mask) mask.classList.add('show');

    let successCount = 0, failCount = 0;
    for(let i = 0; i < fileArr.length; i++){
      const file = fileArr[i];
      if(status) status.textContent = `处理 ${i+1}/${fileArr.length}：${file.name||''}`;
      try {
        // 1. 先把照片转成 base64（这一步不需要 AI，本地完成）
        const base64 = await ImageUtils.fileToBase64(file, 768, 0.85);
        if(!base64){ toast(`${file.name||'图片'} 处理失败`); failCount++; continue; }

        // 2. 【关键改动】先入库（照片立即出现在衣橱），AI 标签待会再补
        const item = {
          id: 'c' + Date.now() + Math.random().toString(36).slice(2,6),
          thumb: base64,
          category: '待识别',
          color: '', season: '', occasion: '', style: '', brand: '', desc: '',
          tagged: false,   // 标记：AI 还没打过标签
          note: '',
          createdAt: Date.now()
        };
        await Store.addCloth(item);
        successCount++;
        render();  // 立即刷新衣橱，让用户看到照片

        // 3. AI 打标签（可选增强，失败不影响已存的照片）
        if(aiReady){
          if(status) status.textContent = `AI 识别中 ${i+1}/${fileArr.length}...`;
          const r = await AI.analyzeCloth(base64);
          if(r.ok && r.tags){
            item.category = r.tags.category || '其他';
            item.color = r.tags.color || '';
            item.season = r.tags.season || '';
            item.occasion = r.tags.occasion || '';
            item.style = r.tags.style || '';
            item.brand = r.tags.brand || '';
            item.desc = r.tags.desc || '';
            item.tagged = true;
            await Store.updateCloth(item);
            render();
          }
          // AI 失败：照片已存，只是没标签，不报错
        }
      } catch(e){
        console.error(e);
        toast(`${file.name||'图片'} 出错：${e.message||e}`);
      }
    }

    if(mask) mask.classList.remove('show');
    // 提示文案区分：有没有配 AI
    if(successCount > 0){
      if(aiReady){
        toast(`✓ 已添加 ${successCount} 件衣物并完成 AI 识别`);
      } else {
        toast(`✓ 已添加 ${successCount} 件衣物（配置 AI 后可自动识别属性）`);
      }
    } else if(failCount > 0){
      toast(`⚠️ ${failCount} 张图片处理失败`);
    }
    render();
  }

  /** 单品详情（底部抽屉） */
  function openDetail(id){
    const c = Store.getCloth(id);
    if(!c) return;
    const body = document.getElementById('drawer-body');
    const drawerTitle = document.getElementById('drawer-title');
    const drawerSub = document.getElementById('drawer-sub');
    if(drawerTitle) drawerTitle.textContent = c.category || '衣物';
    if(drawerSub) drawerSub.textContent = c.color ? `${c.color} · ${c.style||''}` : '详情';

    const tags = [
      c.season && `<span class="tag blue">${escapeHtml(c.season)}</span>`,
      c.occasion && `<span class="tag green">${escapeHtml(c.occasion)}</span>`,
      c.style && `<span class="tag orange">${escapeHtml(c.style)}</span>`,
    ].filter(Boolean).join('');

    if(body){
      const isTagged = c.tagged !== false && c.category && c.category !== '待识别';
      body.innerHTML = `
        <div class="detail-cloth-img" style="background-image:url('${c.thumb||''}')"></div>
        <div style="padding:16px 0">
          <div style="font-size:13px;color:#999;margin-bottom:8px">AI 识别属性 ${isTagged ? '' : '<span style="color:#e07856">（待识别）</span>'}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">${tags || '<span class="tag">暂无标签</span>'}</div>
          ${c.brand && c.brand !== '未知' ? `<div style="font-size:13px;color:#666;margin-bottom:6px">品牌：${escapeHtml(c.brand)}</div>` : ''}
          ${c.desc ? `<div style="font-size:13px;color:#666;line-height:1.6;margin-bottom:6px">${escapeHtml(c.desc)}</div>` : ''}
          <button class="retag-btn" onclick="PageCloset.retagOne('${c.id}')">🤖 ${isTagged ? '重新识别' : 'AI 识别此衣物'}</button>
          <div style="font-size:11px;color:#bbb;margin-top:16px">添加于 ${new Date(c.createdAt).toLocaleString('zh-CN')}</div>
        </div>`;
    }
    document.getElementById('drawer-mask').classList.add('show');
    document.getElementById('photo-drawer').classList.add('show');
  }

  /** 单件衣物重新 AI 识别 */
  async function retagOne(id){
    const c = Store.getCloth(id);
    if(!c) return;
    if(!AI.isAvailable('vision')){
      toast('请先配置智谱 API Key'); return;
    }
    if(!c.thumb){ toast('该衣物无图片，无法识别'); return; }
    toast('AI 识别中...');
    const r = await AI.analyzeCloth(c.thumb);
    if(!r.ok){ toast('识别失败：' + r.error); return; }
    c.category = r.tags.category || '其他';
    c.color = r.tags.color || '';
    c.season = r.tags.season || '';
    c.occasion = r.tags.occasion || '';
    c.style = r.tags.style || '';
    c.brand = r.tags.brand || '';
    c.desc = r.tags.desc || '';
    c.tagged = true;
    await Store.updateCloth(c);
    toast('✓ 已更新识别结果');
    // 刷新详情页内容
    openDetail(id);
    render();
  }

  /** 批量重新识别所有"待识别"的衣物（配完 API 后调用） */
  async function retagAllPending(){
    const clothes = Store.get('clothes') || [];
    const pending = clothes.filter(c => c.tagged === false || !c.category || c.category === '待识别');
    if(pending.length === 0){
      toast('没有需要识别的衣物');
      return;
    }
    if(!AI.isAvailable('vision')){
      toast('请先配置智谱 API Key'); return;
    }
    const mask = document.getElementById('tagging-mask');
    const status = document.getElementById('tagging-status');
    if(mask) mask.classList.add('show');
    let ok = 0;
    for(let i = 0; i < pending.length; i++){
      const c = pending[i];
      if(status) status.textContent = `批量识别 ${i+1}/${pending.length}...`;
      if(!c.thumb) continue;
      const r = await AI.analyzeCloth(c.thumb);
      if(r.ok && r.tags){
        c.category = r.tags.category || '其他';
        c.color = r.tags.color || '';
        c.season = r.tags.season || '';
        c.occasion = r.tags.occasion || '';
        c.style = r.tags.style || '';
        c.brand = r.tags.brand || '';
        c.desc = r.tags.desc || '';
        c.tagged = true;
        await Store.updateCloth(c);
        ok++;
      }
    }
    if(mask) mask.classList.remove('show');
    toast(`✓ 已识别 ${ok}/${pending.length} 件衣物`);
    render();
  }

  function confirmDelete(id){
    const c = Store.getCloth(id);
    if(!c) return;
    if(confirm(`确定删除这件「${c.category||'衣物'}」吗？`)){
      Store.removeCloth(id).then(() => { render(); toast('已删除'); });
    }
  }

  function closeDrawer(){
    document.getElementById('drawer-mask').classList.remove('show');
    document.getElementById('photo-drawer').classList.remove('show');
  }

  return { render, addCloth, chooseFromAlbum, chooseFromCamera, closeAddSource, handleFiles, openDetail, confirmDelete, closeDrawer, retagOne, retagAllPending };
})();

// 挂全局别名，供 HTML onclick="chooseFromAlbum()" 等调用
// （IIFE 内部的函数默认不暴露到全局作用域）
window.chooseFromAlbum = function(){ PageCloset.chooseFromAlbum(); };
window.chooseFromCamera = function(){ PageCloset.chooseFromCamera(); };
window.closeAddSource = function(){ PageCloset.closeAddSource(); };
window.retagAllPending = function(){ PageCloset.retagAllPending(); };
