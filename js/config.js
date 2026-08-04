/**
 * config.js —— AI 配置中心
 *
 * 复用自 travel-footprint-contest，按穿搭场景扩展。
 * 安全设计：API Key 不写死在代码里，由用户在前端设置界面输入，
 *           存储在浏览器 localStorage（仅本机），不上传、不进代码仓库。
 *
 * 关键扩展（相对于相册）：新增 task 字段区分 'vision' | 'chat' | 'image'，
 * 因为打标签走 /chat/completions（视觉模型）、生图走 /images/generations。
 */
const AI_CONFIG = {
  // ===== 模式 =====
  // 'direct' = 前端直连（Key 从 localStorage 读取）
  // 'proxy'  = 走后端代理（对外发布用，Key 藏在代理后端）
  MODE: 'direct',

  // ===== 当前选择的预设（key 对应 AI_PRESETS 里的 id）=====
  ACTIVE_PRESET: 'glm',

  // ===== 预置模型配置（用户可在设置界面选）=====
  // task 说明：'chat'=文本对话 / 'vision'=视觉(走chat接口,传图) / 'image'=生图(走images接口)
  PRESETS: [
    {
      id: 'glm',
      name: '智谱 · GLM-4.6（文本，搭配推荐）',
      apiBase: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4.6',
      task: 'chat',
      getKeyUrl: 'https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys',
      keyHint: '在智谱开放平台 → API Keys 创建，有免费额度'
    },
    {
      id: 'glm-vision',
      name: '智谱 · GLM-4V（视觉，打标签）',
      apiBase: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4v',
      task: 'vision',
      getKeyUrl: 'https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys',
      keyHint: '与 GLM-4.6 同一个 API Key，打标签走此模型'
    },
    {
      id: 'cogview',
      name: '智谱 · CogView-3-Flash（生图，穿搭海报）',
      apiBase: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'cogview-3-flash',
      task: 'image',
      getKeyUrl: 'https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys',
      keyHint: '与 GLM 同一个 API Key，生成穿搭海报走此模型'
    },
    {
      id: 'custom',
      name: '自定义（OpenAI 兼容接口）',
      apiBase: '',
      model: '',
      task: 'chat',
      getKeyUrl: '',
      keyHint: '填入兼容 OpenAI 格式的接口地址和模型名（仅支持文本对话类）'
    },
  ],

  // ===== 后端代理模式（对外发布用，本方案默认直连）=====
  PROXY_URL: '',  // 如 'https://your-worker.workers.dev/ai'

  // ===== 通用参数 =====
  TIMEOUT: 60000,   // 视觉/生图较慢，提到 60 秒（相册是 30 秒）
  MAX_RETRY: 1,

  // ===== 运行时读取（动态拼接，供 ai.js 使用）=====
  /** 当前生效的配置（从 localStorage 读取用户输入） */
  getRuntimeConfig(){
    const saved = this._loadSaved();
    const preset = this.PRESETS.find(p => p.id === (saved.presetId || this.ACTIVE_PRESET)) || this.PRESETS[0];
    return {
      mode: this.MODE,
      apiBase: saved.apiBase || preset.apiBase,
      model: saved.model || preset.model,
      task: preset.task || saved.task || 'chat',
      apiKey: saved.apiKey || '',
      proxyUrl: this.PROXY_URL,
    };
  },
  /** 按任务类型读取配置：自动找到对应 task 的预设（共享同一个 apiKey） */
  getConfigByTask(task){
    const saved = this._loadSaved();
    const apiKey = saved.apiKey || '';
    if(!apiKey) return null;
    // 优先用用户保存的 presetId 对应的 apiBase（兼容自定义）
    const basePreset = this.PRESETS.find(p => p.id === (saved.presetId || this.ACTIVE_PRESET));
    const apiBase = saved.apiBase || (basePreset && basePreset.apiBase) || '';
    // 找到该 task 对应的预设模型名（智谱三模型共用 apiBase 和 apiKey）
    const taskPreset = this.PRESETS.find(p => p.task === task && p.id !== 'custom');
    return {
      mode: this.MODE,
      apiBase: apiBase,
      model: taskPreset ? taskPreset.model : (saved.model || ''),
      task,
      apiKey,
      proxyUrl: this.PROXY_URL,
    };
  },
  /** 用户输入的 Key 是否已配置 */
  hasKey(){
    return !!(this._loadSaved().apiKey);
  },
  /** 保存用户设置到 localStorage */
  save(opts){
    try { localStorage.setItem('outfit_ai_config', JSON.stringify(opts)); }
    catch(e){ console.warn('保存AI配置失败', e); }
  },
  /** 清除用户设置 */
  clear(){
    try { localStorage.removeItem('outfit_ai_config'); } catch(e){}
  },
  _loadSaved(){
    try { return JSON.parse(localStorage.getItem('outfit_ai_config') || '{}'); }
    catch(e){ return {}; }
  }
};
