/**
 * page-me.js —— 我的页（统计 + AI 配置入口 + 数据管理）
 *
 * 复用相册的 profile-header + setting-group 组件结构。
 * AI 配置走 openAISettings()（在 main.js 里，复用相册逻辑）。
 */
const PageMe = (function(){

  function render(){
    const el = document.getElementById('me-content');
    if(!el) return;
    const clothes = Store.get('clothes') || [];
    const outfits = Store.get('outfits') || [];
    const aiConfigured = AI_CONFIG.hasKey();

    el.innerHTML = `
      <div class="profile-header">
        <div class="avatar">搭</div>
        <div>
          <div class="uname">智能穿搭</div>
          <div class="uid">让 AI 帮你搭出每天的精彩</div>
        </div>
      </div>

      <div class="profile-mini-stat">
        <div class="pms-item">
          <div class="n">${clothes.length}</div>
          <div class="l">衣物</div>
        </div>
        <div class="pms-item">
          <div class="n">${outfits.length}</div>
          <div class="l">搭配</div>
        </div>
        <div class="pms-item">
          <div class="n">${new Set(clothes.map(c=>c.category)).size}</div>
          <div class="l">类别</div>
        </div>
      </div>

      <div class="setting-list">
        <div class="setting-group">
          <div class="setting-row" onclick="openAISettings()">
            <div class="left">
              <div class="sicon" style="background:#fef0e7">🤖</div>
              <div>AI 配置</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span id="ai-status-brief" style="font-size:12px;color:${aiConfigured?'#34c759':'#999'}">${aiConfigured?'已配置':'未配置'}</span>
              <span class="arrow">›</span>
            </div>
          </div>
          <div class="setting-row" onclick="PageMe.testAI()">
            <div class="left">
              <div class="sicon" style="background:#e8f0fe">⚡</div>
              <div>测试 AI 连通性</div>
            </div>
            <span class="arrow">›</span>
          </div>
        </div>

        <div class="setting-group">
          <div class="setting-row" onclick="PageMe.exportData()">
            <div class="left">
              <div class="sicon" style="background:#e6f4ea">📤</div>
              <div>导出我的数据</div>
            </div>
            <span class="arrow">›</span>
          </div>
          <div class="setting-row" onclick="PageMe.confirmClear()">
            <div class="left">
              <div class="sicon" style="background:#f0f0f2">🗑️</div>
              <div>清空全部数据</div>
            </div>
            <span class="arrow">›</span>
          </div>
        </div>

        <div class="privacy-banner">
          <div class="pb-icon">🔒</div>
          <div class="pb-text">
            <b>隐私保护</b>
            你的衣物照片和 API Key 全部存在本机浏览器，不上传任何服务器。
          </div>
        </div>

        <div style="text-align:center;padding:10px 0 30px;font-size:11px;color:#bbb">
          ${(typeof EDITION!=='undefined'?EDITION.name:'智能穿搭')} · v${(typeof EDITION!=='undefined'?EDITION.version:'1.0')}${(typeof EDITION!=='undefined'&&EDITION.mode==='trial')?' · 试用版':''}<br>
          AI 由智谱 GLM 提供
        </div>
      </div>
    `;
  }

  /** 测试 AI 连通性（调一次极简对话） */
  async function testAI(){
    if(!AI_CONFIG.hasKey()){ toast('请先配置 API Key'); return; }
    toast('正在测试...');
    const r = await AI.generateLook(
      [{id:'test',category:'测试',color:'',style:'',season:'',occasion:''}],
      {season:'秋季',weather:'晴',style:'不限',purpose:'测试'},
      null
    );
    if(r.ok) toast('✓ AI 连通正常');
    else toast('✗ ' + r.error);
  }

  /** 导出数据（JSON） */
  async function exportData(){
    const clothes = Store.get('clothes') || [];
    const outfits = Store.get('outfits') || [];
    const data = { clothes, outfits, exportedAt: Date.now() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart-outfit-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('✓ 已导出');
  }

  async function confirmClear(){
    if(!confirm('确定清空全部衣物和搭配记录？此操作不可恢复。')) return;
    await DB.clothes.clear();
    await DB.outfits.clear();
    await Store.load();
    render();
    PageCloset.render();
    PageOutfit.render();
    toast('已清空全部数据');
  }

  return { render, testAI, exportData, confirmClear };
})();
