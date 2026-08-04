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
    const grid = clothes.map(c => `
      <div class="cloth-card" onclick="PageCloset.openDetail('${c.id}')">
        <div class="cloth-thumb" style="background-image:url('${c.thumb||''}')">
          ${c.thumb ? '' : '<span>📷</span>'}
        </div>
        <div class="cloth-info">
          <div class="cloth-cat">${escapeHtml(c.category||'未分类')}</div>
          <div class="cloth-meta">${escapeHtml(c.color||'')} · ${escapeHtml(c.style||'')}</div>
        </div>
        <div class="cloth-del" onclick="event.stopPropagation(); PageCloset.confirmDelete('${c.id}')">🗑️</div>
      </div>
    `).join('');

    el.innerHTML = `
      <div class="closet-stats">${statChips}</div>
      <div class="cloth-grid">${grid}</div>
      <div style="height:30px"></div>
    `;
  }

  /** 触发添加衣物（选/拍照） */
  function addCloth(){
    const input = document.getElementById('cloth-file-input');
    if(input) input.click();
  }

  /** 处理选中的文件 → 打标签 → 入库 */
  async function handleFiles(files){
    if(!files || !files.length) return;
    if(!AI.isAvailable('vision')){
      toast('请先在"我的"页配置智谱 API Key');
      return;
    }
    const fileArr = Array.from(files);
    const mask = document.getElementById('tagging-mask');
    const status = document.getElementById('tagging-status');
    if(mask) mask.classList.add('show');

    for(let i = 0; i < fileArr.length; i++){
      const file = fileArr[i];
      if(status) status.textContent = `正在识别 ${i+1}/${fileArr.length}：${file.name||''}`;
      try {
        // 1. 压成 base64（给视觉模型）
        const base64 = await ImageUtils.fileToBase64(file, 768, 0.85);
        if(!base64){ toast(`${file.name||'图片'} 处理失败`); continue; }

        // 2. 调 GLM-4V 打标签（三态：加载→结果/错误）
        if(status) status.textContent = `AI 分析中 ${i+1}/${fileArr.length}...`;
        const r = await AI.analyzeCloth(base64);
        if(!r.ok){ toast(`识别失败：${r.error}`); continue; }

        // 3. 入库
        const item = {
          id: 'c' + Date.now() + Math.random().toString(36).slice(2,6),
          thumb: base64,
          category: r.tags.category || '其他',
          color: r.tags.color || '',
          season: r.tags.season || '',
          occasion: r.tags.occasion || '',
          style: r.tags.style || '',
          brand: r.tags.brand || '',
          desc: r.tags.desc || '',
          note: '',
          createdAt: Date.now()
        };
        await Store.addCloth(item);
      } catch(e){
        console.error(e);
        toast(`${file.name||'图片'} 出错：${e.message||e}`);
      }
    }

    if(mask) mask.classList.remove('show');
    toast(`✓ 已添加 ${fileArr.length} 件衣物`);
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
      body.innerHTML = `
        <div class="detail-cloth-img" style="background-image:url('${c.thumb||''}')"></div>
        <div style="padding:16px 0">
          <div style="font-size:13px;color:#999;margin-bottom:8px">AI 识别属性</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">${tags || '<span class="tag">暂无标签</span>'}</div>
          ${c.brand ? `<div style="font-size:13px;color:#666;margin-bottom:6px">品牌：${escapeHtml(c.brand)}</div>` : ''}
          ${c.desc ? `<div style="font-size:13px;color:#666;line-height:1.6;margin-bottom:6px">${escapeHtml(c.desc)}</div>` : ''}
          <div style="font-size:11px;color:#bbb;margin-top:20px">添加于 ${new Date(c.createdAt).toLocaleString('zh-CN')}</div>
        </div>`;
    }
    document.getElementById('drawer-mask').classList.add('show');
    document.getElementById('photo-drawer').classList.add('show');
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

  return { render, addCloth, handleFiles, openDetail, confirmDelete, closeDrawer };
})();
