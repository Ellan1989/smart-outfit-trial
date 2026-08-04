/**
 * db.js —— IndexedDB 持久化封装层
 *
 * 这是 travel-footprint-contest 没有而本方案必须新增的部分。
 * 相册的数据刷新即清（纯内存 Store），但穿搭 App 的衣橱必须持久化——
 * 用户每次打开都应看到自己录入的衣物。
 *
 * Promise 化封装，三个对象仓库：
 *   clothes  衣物：{id, thumb(base64), category, color, season, occasion, style, brand, note, createdAt}
 *   outfits  搭配记录：{id, clothIds[], condition{season,weather,style,purpose}, picks[], reason, posterUrl, createdAt}
 *   meta     元数据 key-value：激活状态、设置等
 */
const DB = (function(){
  const DB_NAME = 'smart-outfit-db';
  const DB_VERSION = 1;
  let _db = null;

  /** 打开数据库（单例） */
  function open(){
    if(_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if(!db.objectStoreNames.contains('clothes')){
          const s = db.createObjectStore('clothes', { keyPath:'id' });
          s.createIndex('category', 'category', { unique:false });
          s.createIndex('createdAt', 'createdAt', { unique:false });
        }
        if(!db.objectStoreNames.contains('outfits')){
          const s = db.createObjectStore('outfits', { keyPath:'id' });
          s.createIndex('createdAt', 'createdAt', { unique:false });
        }
        if(!db.objectStoreNames.contains('meta')){
          db.createObjectStore('meta', { keyPath:'key' });
        }
      };
      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /** 通用事务执行器 */
  function tx(storeName, mode, fn){
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      const store = t.objectStore(storeName);
      let result;
      try { result = fn(store); } catch(e){ reject(e); return; }
      t.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
      // request 类返回值兜底
      if(result && typeof result.onsuccess !== 'undefined'){
        result.onsuccess = (e) => { if(e.target.result !== undefined) { /* 等 oncomplete */ } };
      }
    }));
  }

  /** 包一层 request，返回 promise（用于 get/getAll/count） */
  function reqProm(req){
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ===== clothes（衣物）=====
  const clothes = {
    async add(item){
      const db = await open();
      return new Promise((resolve, reject) => {
        const t = db.transaction('clothes', 'readwrite');
        t.objectStore('clothes').put(item);
        t.oncomplete = () => resolve(item);
        t.onerror = () => reject(t.error);
      });
    },
    async update(item){ return clothes.add(item); },  // put 兼增改
    async get(id){
      const db = await open();
      return reqProm(db.transaction('clothes','readonly').objectStore('clothes').get(id));
    },
    async getAll(){
      const db = await open();
      return reqProm(db.transaction('clothes','readonly').objectStore('clothes').getAll());
    },
    async remove(id){
      const db = await open();
      return new Promise((resolve, reject) => {
        const t = db.transaction('clothes', 'readwrite');
        t.objectStore('clothes').delete(id);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
    },
    async clear(){
      const db = await open();
      return new Promise((resolve, reject) => {
        const t = db.transaction('clothes', 'readwrite');
        t.objectStore('clothes').clear();
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
    },
    async count(){
      const db = await open();
      return reqProm(db.transaction('clothes','readonly').objectStore('clothes').count());
    }
  };

  // ===== outfits（搭配记录）=====
  const outfits = {
    async add(item){
      const db = await open();
      return new Promise((resolve, reject) => {
        const t = db.transaction('outfits', 'readwrite');
        t.objectStore('outfits').put(item);
        t.oncomplete = () => resolve(item);
        t.onerror = () => reject(t.error);
      });
    },
    async getAll(){
      const db = await open();
      return reqProm(db.transaction('outfits','readonly').objectStore('outfits').getAll());
    },
    async remove(id){
      const db = await open();
      return new Promise((resolve, reject) => {
        const t = db.transaction('outfits', 'readwrite');
        t.objectStore('outfits').delete(id);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
    },
    async clear(){
      const db = await open();
      return new Promise((resolve, reject) => {
        const t = db.transaction('outfits', 'readwrite');
        t.objectStore('outfits').clear();
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
    }
  };

  // ===== meta（元数据 key-value）=====
  const meta = {
    async set(key, value){
      const db = await open();
      return new Promise((resolve, reject) => {
        const t = db.transaction('meta', 'readwrite');
        t.objectStore('meta').put({ key, value });
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
    },
    async get(key){
      const db = await open();
      const r = await reqProm(db.transaction('meta','readonly').objectStore('meta').get(key));
      return r ? r.value : null;
    },
    async remove(key){
      const db = await open();
      return new Promise((resolve, reject) => {
        const t = db.transaction('meta', 'readwrite');
        t.objectStore('meta').delete(key);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
    }
  };

  return { open, clothes, outfits, meta };
})();
