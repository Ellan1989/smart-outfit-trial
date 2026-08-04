/**
 * license.js —— 激活授权前端
 *
 * 防传播核心：设备指纹绑定 + 在线心跳 + 离线宽限。
 *
 * 流程：
 *   1. 启动采集设备指纹（FingerprintJS 3.x，MIT 免费）
 *   2. 读本地激活凭证（token + activatedAt），无则要求用户输入卡密激活
 *   3. 激活：调 Worker /activate，校验卡密 + 绑指纹 + 拿 token
 *   4. 心跳：启动时 + 每6小时调 /heartbeat，验 token + 指纹 + 吊销状态
 *   5. 离线宽限：心跳失败不立即锁，记录 lastOk，超过 GRACE_DAYS(7) 才锁
 *
 * 存储位置：localStorage 'outfit_license' = { token, code, activatedAt, lastOk }
 */
const License = (function(){

  // ===== 配置（读 EDITION 区分版本）=====
  // 商用版：EDITION.licenseApiBase 填实际 Worker 地址
  // 试用版：EDITION.licenseApiBase 为空，激活/心跳函数直接返回成功
  const API_BASE = (typeof EDITION !== 'undefined' && EDITION.licenseApiBase) || '';
  const GRACE_DAYS = (typeof EDITION !== 'undefined' && EDITION.graceDays) || 7;
  const HEARTBEAT_INTERVAL = 6*3600*1000;  // 心跳间隔：6小时
  const STORAGE_KEY = 'outfit_license';

  let _fingerprint = null;

  /** 采集设备指纹（缓存） */
  async function getFingerprint(){
    if(_fingerprint) return _fingerprint;
    if(typeof FingerprintJS === 'undefined'){
      console.warn('FingerprintJS 未加载，降级为随机ID');
      _fingerprint = 'fallback-' + randomId();
      return _fingerprint;
    }
    try {
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      _fingerprint = result.visitorId || ('fallback-' + randomId());
    } catch(e){
      console.warn('指纹采集失败', e);
      _fingerprint = 'fallback-' + randomId();
    }
    return _fingerprint;
  }

  function randomId(){
    return Date.now().toString(36) + Math.random().toString(36).slice(2,10);
  }

  /** 读本地凭证 */
  function loadLicense(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
    catch(e){ return null; }
  }
  function saveLicense(data){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch(e){}
  }
  function clearLicense(){
    try { localStorage.removeItem(STORAGE_KEY); } catch(e){}
  }

  /** 是否已激活（有 token） */
  function isActivated(){
    return !!loadLicense();
  }

  /**
   * 检查当前是否"有效授权"
   * 试用版（无 API_BASE）：永远返回 true
   * 商用版：有 token + 未超离线宽限期
   */
  function isAuthorized(){
    // 试用版：无需激活，直接放行
    if(!API_BASE) return true;
    const lic = loadLicense();
    if(!lic || !lic.token) return false;
    const lastOk = lic.lastOk || lic.activatedAt || 0;
    const graceMs = GRACE_DAYS * 24 * 3600 * 1000;
    return (Date.now() - lastOk) < graceMs;
  }

  /** 激活 */
  async function activate(code){
    // 试用版：无需真正激活
    if(!API_BASE){
      return { ok:true, cardType:'trial', message:'试用版无需激活' };
    }
    const fp = await getFingerprint();
    try {
      const resp = await fetch(API_BASE + '/activate', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ code: code.trim(), fingerprint: fp }),
      });
      const data = await resp.json();
      if(!data.ok){
        return { ok:false, error: data.error || '激活失败' };
      }
      const now = Date.now();
      saveLicense({
        token: data.token,
        code: code.trim(),
        cardType: data.cardType,
        activatedAt: data.activatedAt || now,
        lastOk: now,
      });
      startHeartbeat();
      return { ok:true, cardType: data.cardType };
    } catch(e){
      return { ok:false, error:'网络错误，请检查网络后重试：' + (e.message||e) };
    }
  }

  /** 心跳 */
  async function heartbeat(){
    const lic = loadLicense();
    if(!lic || !lic.token) return;
    const fp = await getFingerprint();
    try {
      const resp = await fetch(API_BASE + '/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + lic.token },
        body: JSON.stringify({ fingerprint: fp }),
      });
      const data = await resp.json();
      if(data.ok){
        // 续签 token + 更新 lastOk
        saveLicense({ ...lic, token: data.token || lic.token, lastOk: Date.now() });
      } else {
        // 心跳失败：若是吊销/过期，立即失效；网络问题则靠宽限
        if(resp.status === 403){
          clearLicense();
        }
        // 401(token过期) 走宽限，不立即清
      }
    } catch(e){
      // 网络错误，靠宽限期
      console.warn('心跳网络错误', e);
    }
  }

  let _heartbeatTimer = null;
  function startHeartbeat(){
    if(_heartbeatTimer) clearInterval(_heartbeatTimer);
    // 立即一次 + 定时
    heartbeat();
    _heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL);
  }

  /** 初始化：启动时调用。返回是否已激活 */
  async function init(){
    if(isActivated()){
      startHeartbeat();
      return true;
    }
    return false;
  }

  /** 锁定核心功能（未激活/失效时调用，由 UI 决定怎么锁） */
  function lockDown(){
    // 钩子，由 main.js 接入：禁用 AI 按钮等
  }

  return {
    getFingerprint, isActivated, isAuthorized,
    activate, heartbeat, init, clearLicense,
    loadLicense,
    setApiBase(url){ /* 部署后改 API_BASE 的方法 */ Object.defineProperty(this,'API_BASE',{value:url}); }
  };
})();
