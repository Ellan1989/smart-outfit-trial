/**
 * page-outfit.js —— 今日穿搭页（选条件 → AI 智能搭配 → 生成海报）
 *
 * 复用相册的流式三态 UI 模式（加载点动画 → 流式渲染 → 完成/错误带重试按钮）。
 * 复用 AI.generateLook（GLM-4.6 流式）和 AI.generatePoster（CogView 生图）。
 */
const PageOutfit = (function(){

  // 当前选择的条件（持久化到 localStorage 方便下次回填）
  function getCondition(){
    try {
      return JSON.parse(localStorage.getItem('outfit_condition') || '{}');
    } catch(e){ return {}; }
  }
  function saveCondition(c){
    try { localStorage.setItem('outfit_condition', JSON.stringify(c)); } catch(e){}
  }

  /** 渲染穿搭页 */
  function render(){
    const el = document.getElementById('outfit-content');
    if(!el) return;
    const clothes = Store.get('clothes') || [];
    const c = getCondition();

    const styleOpts = ['不限','商务休闲','极简通勤','温柔约会','街头潮流','复古文艺','运动活力'];
    const purposeOpts = ['日常','上班','商务接洽','约会','聚会','旅行','运动'];

    el.innerHTML = `
      <div class="nav-header">
        <div>
          <h1>今日穿搭</h1>
          <div class="sub">AI 从你的衣橱里挑一套</div>
        </div>
      </div>
      <div class="content" style="flex:1">
        ${clothes.length === 0 ? `
          <div class="empty-state">
            <div class="es-icon">👔</div>
            <div class="es-title">先去衣橱添加几件衣服</div>
            <div class="es-sub">AI 需要根据你的衣物来推荐搭配<br>至少添加 3 件不同类别的衣物效果更好</div>
          </div>
        ` : `
          <div class="cond-card">
            <div class="cond-row">
              <div class="cond-label">🌱 季节</div>
              <select id="cond-season" class="cond-input">
                ${['春季','夏季','秋季','冬季'].map(s =>
                  `<option value="${s}" ${c.season===s?'selected':''}>${s}</option>`).join('')}
              </select>
            </div>
            <div class="cond-row">
              <div class="cond-label">🌤️ 天气</div>
              <select id="cond-weather" class="cond-input">
                ${['晴','多云','阴','小雨','大雨','雪'].map(w =>
                  `<option value="${w}" ${c.weather===w?'selected':''}>${w}</option>`).join('')}
              </select>
            </div>
            <div class="cond-row">
              <div class="cond-label">✨ 风格</div>
              <select id="cond-style" class="cond-input">
                ${styleOpts.map(s =>
                  `<option value="${s}" ${c.style===s?'selected':''}>${s}</option>`).join('')}
              </select>
            </div>
            <div class="cond-row">
              <div class="cond-label">🎯 目的</div>
              <select id="cond-purpose" class="cond-input">
                ${purposeOpts.map(p =>
                  `<option value="${p}" ${c.purpose===p?'selected':''}>${p}</option>`).join('')}
              </select>
            </div>
          </div>

          <div style="padding:0 20px">
            <button class="ai-btn" onclick="PageOutfit.generate()">
              <span>🤖 让 AI 帮我搭一套</span>
            </button>
          </div>

          <div id="look-result" style="padding:16px 20px 0"></div>

          <div class="section-title" style="margin-top:10px">
            <h2>历史搭配</h2>
          </div>
          <div id="look-history" style="padding:0 20px 20px"></div>
        `}
      </div>
    `;

    renderHistory();
  }

  /** 生成搭配 */
  async function generate(){
    if(!AI.isAvailable('chat')){
      toast('请先在"我的"页配置智谱 API Key'); return;
    }
    const allClothes = Store.get('clothes') || [];
    // 过滤掉"待识别"的衣物——没标签的衣服参与搭配会让 AI 结果混乱
    const clothes = allClothes.filter(c => c.tagged !== false && c.category && c.category !== '待识别');
    if(clothes.length === 0){
      toast('衣橱里还没有已识别的衣物\n请先在衣橱页让 AI 识别衣物'); return;
    }
    if(clothes.length < 3){
      toast(`已识别的衣物只有 ${clothes.length} 件，至少需要 3 件才能搭配\n（可在衣橱页点衣物→重新识别）`); return;
    }

    const condition = {
      season: document.getElementById('cond-season').value,
      weather: document.getElementById('cond-weather').value,
      style: document.getElementById('cond-style').value,
      purpose: document.getElementById('cond-purpose').value,
    };
    saveCondition(condition);

    const area = document.getElementById('look-result');
    // 状态1：加载态
    area.innerHTML = '<div class="ai-loading"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div><span>AI 正在从你的衣橱里挑选...</span></div>';

    // 状态2：流式渲染
    const r = await AI.generateLook(clothes, condition, (text) => {
      area.innerHTML = `<div class="ai-output streaming">${escapeHtml(text)}</div>`;
    });

    // 状态3：完成/错误
    if(!r.ok){
      area.innerHTML = `<div class="ai-error">⚠️ ${escapeHtml(r.error)}<br>
        <button class="ai-btn" style="margin-top:10px" onclick="PageOutfit.generate()">重试</button></div>`;
      return;
    }

    if(!r.look){
      area.innerHTML = `<div class="ai-output">${escapeHtml(r.text)}</div>
        <div class="ai-error">AI 返回格式异常，请重试</div>`;
      return;
    }

    // 渲染结构化搭配结果
    renderLook(area, r.look, condition);
  }

  /** 渲染结构化搭配 + 生成海报按钮 */
  function renderLook(area, look, condition){
    const clothes = Store.get('clothes') || [];
    const picks = (look.picks || []).map(p => {
      // p.id 可能是 "#c123" 或 "c123"，统一处理
      const cid = (p.id || '').replace('#','');
      const cloth = clothes.find(c => c.id === cid);
      const thumb = cloth ? cloth.thumb : '';
      return `
        <div class="pick-item">
          <div class="pick-thumb" style="background-image:url('${thumb||''}')">${thumb?'':'<span>📷</span>'}</div>
          <div class="pick-body">
            <div class="pick-role">${escapeHtml(p.role||'')}</div>
            <div class="pick-desc">${cloth ? escapeHtml(cloth.color||'')+' '+escapeHtml(cloth.category||'') : escapeHtml(p.id||'')}</div>
          </div>
        </div>`;
    }).join('');

    area.innerHTML = `
      <div class="look-card">
        <div class="look-picks">${picks}</div>
        <div class="look-reason">${escapeHtml(look.reason || '')}</div>
        <button class="ai-btn poster-btn" onclick="PageOutfit.generatePoster()">
          <span>🎨 生成穿搭海报</span>
        </button>
        <div id="poster-area" style="margin-top:12px"></div>
        <button class="save-look-btn" onclick="PageOutfit.saveLook()">💾 保存这套搭配</button>
      </div>`;

    // 暂存当前 look 供生成海报/保存使用
    PageOutfit._currentLook = look;
    PageOutfit._currentCondition = condition;
  }

  /** 生成穿搭海报（CogView） */
  async function generatePoster(){
    const look = PageOutfit._currentLook;
    const condition = PageOutfit._currentCondition;
    if(!look) return;
    if(!AI.isAvailable('image')){
      toast('生图模型未配置'); return;
    }
    const area = document.getElementById('poster-area');
    area.innerHTML = '<div class="ai-loading"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div><span>AI 正在生成时尚海报...</span></div>';

    const r = await AI.generatePoster(look, condition);
    if(!r.ok){
      area.innerHTML = `<div class="ai-error">⚠️ ${escapeHtml(r.error)}<br>
        <button class="ai-btn" style="margin-top:10px" onclick="PageOutfit.generatePoster()">重试</button></div>`;
      return;
    }
    area.innerHTML = `
      <div class="poster-wrap">
        <img src="${r.url}" class="poster-img" alt="穿搭海报">
        <a href="${r.url}" download="outfit-poster.jpg" class="poster-dl">⬇️ 保存海报</a>
      </div>`;
    PageOutfit._currentPosterUrl = r.url;
  }

  /** 保存这套搭配到历史 */
  async function saveLook(){
    const look = PageOutfit._currentLook;
    const condition = PageOutfit._currentCondition;
    if(!look) return;
    const clothIds = (look.picks||[]).map(p => (p.id||'').replace('#',''));
    const item = {
      id: 'o' + Date.now(),
      clothIds,
      condition,
      picks: look.picks,
      reason: look.reason,
      posterUrl: PageOutfit._currentPosterUrl || '',
      createdAt: Date.now()
    };
    await Store.addOutfit(item);
    toast('✓ 已保存到历史搭配');
    renderHistory();
  }

  /** 渲染历史搭配 */
  function renderHistory(){
    const el = document.getElementById('look-history');
    if(!el) return;
    const outfits = Store.get('outfits') || [];
    if(outfits.length === 0){
      el.innerHTML = '<div class="empty-hint">还没有保存的搭配</div>';
      return;
    }
    el.innerHTML = outfits.slice(0, 10).map(o => {
      const d = new Date(o.createdAt);
      const cond = o.condition || {};
      const cover = o.posterUrl || ((o.picks||[]).map(p=>{
        const c = Store.getCloth((p.id||'').replace('#',''));
        return c ? c.thumb : '';
      }).filter(Boolean)[0]) || '';
      return `
        <div class="history-card">
          <div class="history-cover" style="background-image:url('${cover||''}')">${cover?'':'<span>👗</span>'}</div>
          <div class="history-body">
            <div class="history-cond">${escapeHtml(cond.season||'')} · ${escapeHtml(cond.style||'')} · ${escapeHtml(cond.purpose||'')}</div>
            <div class="history-date">${d.getMonth()+1}月${d.getDate()}日</div>
          </div>
          ${o.posterUrl ? `<div class="history-poster-badge">海报</div>` : ''}
          <div class="history-del" onclick="event.stopPropagation(); PageOutfit.deleteHistory('${o.id}')">🗑️</div>
        </div>`;
    }).join('');
  }

  async function deleteHistory(id){
    if(confirm('删除这条搭配记录？')){
      await Store.removeOutfit(id);
      renderHistory();
      toast('已删除');
    }
  }

  return { render, generate, generatePoster, saveLook, deleteHistory, renderHistory };
})();
