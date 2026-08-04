/**
 * ai.js —— AI 能力封装（打标签 / 智能搭配 / 穿搭海报）
 *
 * 复用自 travel-footprint-contest/ai.js 的 chat() 核心（含所有工程要点），
 * 新增穿搭场景的三个业务方法。
 *
 * 工程要点（照搬相册）：
 *   - 配置与调用解耦：本文件只通过 AI_CONFIG.getConfigByTask(task) 拿配置
 *   - 流式/非流式统一在 chat() 里处理（传 onChunk 走流式）
 *   - SSE 流式 buffer 机制（split('\n') + pop() 保留不完整段）
 *   - AbortController 超时
 *   - 统一返回 { ok, text, error }
 */
const AI = (function(){

  /** 判断某类任务是否可用 */
  function isAvailable(task){
    const cfg = AI_CONFIG.getConfigByTask(task);
    return !!(cfg && cfg.apiKey);
  }

  /**
   * 统一文本/视觉对话入口（OpenAI 兼容协议）
   * @param {Array} messages OpenAI 兼容 messages 数组（视觉模型可在 content 里塞 image_url）
   * @param {Function} onChunk 可选，流式回调（接收累计全文）
   * @param {string} task 'chat' | 'vision'
   */
  async function chat(messages, onChunk, task = 'chat'){
    const cfg = AI_CONFIG.getConfigByTask(task);
    if(!cfg || !cfg.apiKey) return { ok:false, error:'AI 未配置（请先在"我的"里填写 API Key）' };

    const useStream = !!onChunk;
    const body = {
      model: cfg.model,
      messages,
      temperature: task === 'vision' ? 0.2 : 0.8,  // 识别要稳定，搭配要有创造性
      stream: useStream,
    };

    let url, headers;
    if(cfg.mode === 'direct'){
      url = cfg.apiBase.replace(/\/$/, '') + '/chat/completions';
      headers = { 'Content-Type':'application/json', 'Authorization':'Bearer ' + cfg.apiKey };
    } else {
      url = cfg.proxyUrl;
      headers = { 'Content-Type':'application/json' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_CONFIG.TIMEOUT);

    try {
      const resp = await fetch(url, {
        method: 'POST', headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if(!resp.ok){
        const txt = await resp.text().catch(()=>'');
        return { ok:false, error:`请求失败(${resp.status}): ${txt.slice(0,120)}` };
      }

      // 流式
      if(useStream && resp.body){
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let full = '', buffer = '';
        while(true){
          const { done, value } = await reader.read();
          if(done) break;
          buffer += decoder.decode(value, { stream:true });
          const lines = buffer.split('\n');
          buffer = lines.pop();           // 最后一段可能不完整，留到下次
          for(const line of lines){
            const t = line.trim();
            if(!t.startsWith('data:')) continue;
            const data = t.slice(5).trim();
            if(data === '[DONE]') continue;
            try {
              const json = JSON.parse(data);
              const delta = json.choices?.[0]?.delta?.content || '';
              if(delta){ full += delta; onChunk(full); }
            } catch(e){ /* 跳过不完整块 */ }
          }
        }
        return { ok:true, text: full };
      }

      // 非流式
      const json = await resp.json();
      const text = json.choices?.[0]?.message?.content || '';
      return { ok:true, text };
    } catch(e){
      clearTimeout(timer);
      if(e.name === 'AbortError') return { ok:false, error:'请求超时，请重试' };
      return { ok:false, error:'网络错误：' + (e.message || e) };
    }
  }

  /**
   * 新增：生图（CogView，走 /images/generations，不复用 chat）
   * @param {string} prompt 生图提示词
   * @param {string} size 尺寸，如 '1024x1024'（CogView-3-Flash 默认）
   */
  async function generateImage(prompt, size = '1024x1024'){
    const cfg = AI_CONFIG.getConfigByTask('image');
    if(!cfg || !cfg.apiKey) return { ok:false, error:'AI 未配置（生图模型）' };

    const url = cfg.apiBase.replace(/\/$/, '') + '/images/generations';
    const headers = {
      'Content-Type':'application/json',
      'Authorization':'Bearer ' + cfg.apiKey
    };
    const body = JSON.stringify({ model: cfg.model, prompt, size });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_CONFIG.TIMEOUT);

    try {
      const resp = await fetch(url, { method:'POST', headers, body, signal: controller.signal });
      clearTimeout(timer);
      if(!resp.ok){
        const txt = await resp.text().catch(()=>'');
        return { ok:false, error:`生图失败(${resp.status}): ${txt.slice(0,120)}` };
      }
      const json = await resp.json();
      const imgUrl = json.data?.[0]?.url || '';
      if(!imgUrl) return { ok:false, error:'生图返回为空' };
      return { ok:true, url: imgUrl };
    } catch(e){
      clearTimeout(timer);
      if(e.name === 'AbortError') return { ok:false, error:'生图超时，请重试' };
      return { ok:false, error:'生图网络错误：' + (e.message || e) };
    }
  }

  // ============ 业务方法 ============

  /**
   * 功能1：打标签 —— 分析衣物图，返回结构化属性
   * @param {string} base64Img base64 dataURL
   * @returns {Promise<{ok, tags, error}>} tags = {category,color,season,occasion,style,brand,desc}
   */
  async function analyzeCloth(base64Img){
    const messages = [{
      role: 'user',
      content: [
        { type: 'text', text:
          '你是服装属性识别专家。请分析图片中的这件衣服，严格按以下JSON格式输出（只输出JSON，不要任何其他文字、不要markdown代码块）：\n' +
          '{"category":"类别(如:上衣/外套/裤装/裙装/鞋/包/配饰)","color":"主色调(如:米白/藏蓝/卡其)","season":"适用季节(如:春秋/夏季/冬季/四季)","occasion":"适用场合(如:通勤/休闲/正式/约会/运动)","style":"风格(如:商务休闲/极简/街头/复古)","brand":"品牌(看不清填未知)","desc":"一句话描述"}'
        },
        { type: 'image_url', image_url: { url: base64Img } }
      ]
    }];
    const r = await chat(messages, null, 'vision');
    if(!r.ok) return { ok:false, error:r.error };
    // 尝试从返回里提取 JSON（模型可能带 ```json 包裹）
    let tags = null;
    try {
      const cleaned = r.text.replace(/```json|```/g, '').trim();
      tags = JSON.parse(cleaned);
    } catch(e){
      // 兜底：尝试找第一个 { 到最后一个 }
      const m = r.text.match(/\{[\s\S]*\}/);
      if(m){ try { tags = JSON.parse(m[0]); } catch(e2){} }
    }
    if(!tags) return { ok:false, error:'AI返回格式异常：' + r.text.slice(0,80) };
    return { ok:true, tags };
  }

  /**
   * 功能2：智能搭配 —— 从用户衣橱里选品，流式输出搭配建议
   * @param {Array} wardrobe 衣橱摘要 [{id,category,color,style,season,occasion}]
   * @param {Object} condition {season, weather, style, purpose}
   * @param {Function} onChunk 流式回调（累计全文）
   */
  async function generateLook(wardrobe, condition, onChunk){
    // 构造衣橱清单文本（带 id，方便后续定位）
    const list = wardrobe.map(c =>
      `#${c.id} [${c.category||'未知'}] ${c.color||''} ${c.style||''} (${c.season||''}/${c.occasion||''})`
    ).join('\n');
    const userText =
      `我的衣橱清单（每件前面的 #id 是编号）：\n${list}\n\n` +
      `今天的情况：季节${condition.season||'未知'}，天气${condition.weather||'未知'}，想要风格「${condition.style||'不限'}」，目的「${condition.purpose||'日常'}」。\n\n` +
      `请从我的衣橱里挑选单品组成一套完整搭配。严格按以下JSON格式输出（只输出JSON）：\n` +
      `{"picks":[{"id":"#编号","role":"角色(如:上装/下装/外套/鞋/配饰)"}],"reason":"为什么这样搭（讲色彩/层次/TPO，80-150字）"}`;

    const messages = [
      { role:'system', content:'你是资深穿搭顾问。规则：1)只能从用户提供的衣橱清单里选品，用#编号引用；2)遵循色彩搭配原则（同色系/对比色/三色法则）；3)遵循TPO原则（时间地点场合）；4)考虑季节和天气；5)优先组合出层次感。' },
      { role:'user', content: userText }
    ];
    const r = await chat(messages, onChunk, 'chat');
    if(!r.ok) return r;
    // 解析最终 JSON（流式 onChunk 已展示过程文本，这里只解析最终结构）
    let look = null;
    try {
      const cleaned = r.text.replace(/```json|```/g, '').trim();
      look = JSON.parse(cleaned);
    } catch(e){
      const m = r.text.match(/\{[\s\S]*\}/);
      if(m){ try { look = JSON.parse(m[0]); } catch(e2){} }
    }
    if(!look) return { ok:true, text:r.text, look:null };  // 解析失败也返回原文，前端可展示
    return { ok:true, text:r.text, look };
  }

  /**
   * 功能3：穿搭海报 —— 用 CogView 生成时尚大片风格海报
   * @param {Object} look 搭配结果（picks + reason）
   * @param {Object} condition 搭配条件
   */
  async function generatePoster(look, condition){
    const desc = (look.picks||[]).map(p => p.role).join('、');
    const reason = look.reason || '';
    const prompt =
      `时尚杂志大片风格摄影，高级感，柔和自然光，干净简洁的纯色背景。` +
      `一个气质模特穿着${desc}的搭配，${reason}。` +
      `风格定位：${condition.style||'时尚休闲'}，整体色调和谐，质感细腻，杂志封面构图，全身照。`;
    return generateImage(prompt, '1024x1024');
  }

  return { isAvailable, analyzeCloth, generateLook, generatePoster, generateImage };
})();
