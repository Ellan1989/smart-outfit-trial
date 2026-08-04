/**
 * store.js —— 全局数据中枢
 *
 * 改造自 travel-footprint-contest 的 store.js。
 * 核心改动：相册是纯内存（刷新即清），穿搭 App 必须持久化。
 * 保留 on/notify 发布订阅接口让页面层无感，内部读写 IndexedDB。
 *
 * 数据生命周期：
 *   启动 → DB.getAll → 加载到内存 state → notify('ready')
 *   写入 → 更新内存 + 异步写 DB → notify('change:xxx')
 */
const Store = (function(){
  const state = {
    clothes: [],      // 衣物列表 [{id,thumb,category,color,season,occasion,style,brand,note,createdAt}]
    outfits: [],      // 搭配记录 [{id,clothIds,condition,picks,reason,posterUrl,createdAt}]
    loaded: false     // 是否已从 DB 加载
  };
  const listeners = {};

  /** 启动时从 IndexedDB 加载全部数据到内存 */
  async function load(){
    try {
      const [clothes, outfits] = await Promise.all([DB.clothes.getAll(), DB.outfits.getAll()]);
      // 按 createdAt 倒序（新的在前）
      state.clothes = (clothes || []).sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
      state.outfits = (outfits || []).sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
      state.loaded = true;
      Store.notify('ready');
    } catch(e){
      console.error('Store.load 失败', e);
      state.loaded = true;
      Store.notify('ready');
    }
  }

  return {
    /** 同步读内存（页面层用法不变：Store.get('clothes')） */
    get: (key) => state[key],
    getAll: () => state,

    /** ===== 衣物 ===== */
    async addCloth(item){
      state.clothes.unshift(item);
      await DB.clothes.add(item);
      Store.notify('change:clothes');
    },
    async updateCloth(item){
      const i = state.clothes.findIndex(c => c.id === item.id);
      if(i >= 0) state.clothes[i] = item;
      await DB.clothes.update(item);
      Store.notify('change:clothes');
    },
    async removeCloth(id){
      state.clothes = state.clothes.filter(c => c.id !== id);
      await DB.clothes.remove(id);
      Store.notify('change:clothes');
    },
    getCloth(id){ return state.clothes.find(c => c.id === id); },

    /** ===== 搭配记录 ===== */
    async addOutfit(item){
      state.outfits.unshift(item);
      await DB.outfits.add(item);
      Store.notify('change:outfits');
    },
    async removeOutfit(id){
      state.outfits = state.outfits.filter(o => o.id !== id);
      await DB.outfits.remove(id);
      Store.notify('change:outfits');
    },

    /** 统计：各类别数量 */
    clothStats(){
      const by = {};
      state.clothes.forEach(c => {
        const k = c.category || '其他';
        by[k] = (by[k] || 0) + 1;
      });
      return by;
    },

    /** 发布订阅（与相册接口一致） */
    on: (event, fn) => { (listeners[event] = listeners[event] || []).push(fn); },
    notify: (event) => { (listeners[event] || []).forEach(fn => { try{ fn(state); }catch(e){ console.warn('listener error', e); } }); },

    load,
    get isLoaded(){ return state.loaded; }
  };
})();
