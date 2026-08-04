/**
 * image-utils.js —— 本地图片处理工具
 *
 * 复用自 travel-footprint-contest/exif-import.js 的 drawThumb 模板（含所有工程亮点）。
 * 调整：相册 maxW=240（地图缩略图），穿搭给视觉模型识别需要更高 → 默认 768。
 *
 * 工程亮点（务必保留）：
 *   1. URL.createObjectURL / revokeObjectURL 配对，避免内存泄漏
 *   2. settled 标志位 + 超时兜底，防止图片解码卡死 Promise
 *   3. 空白像素检测（alpha=0），过滤损坏图
 *   4. dataUrl.length 兜底校验
 *   5. HEIC 转换异步且可能失败，单独处理
 */
const ImageUtils = (function(){

  function isHeic(file){
    const n = (file.name || '').toLowerCase();
    const t = (file.type || '').toLowerCase();
    return n.endsWith('.heic') || n.endsWith('.heif') || t === 'image/heic' || t === 'image/heif';
  }

  /**
   * 把 File/Blob 转成指定宽度的 JPEG base64 dataURL
   * @param {File|Blob} file 图片文件
   * @param {number} maxW 最大宽度（默认 768，给视觉模型识别用）
   * @param {number} quality JPEG 质量 0-1（默认 0.85）
   * @returns {Promise<string|null>} base64 dataURL，失败返回 null
   */
  async function fileToBase64(file, maxW = 768, quality = 0.85){
    let sourceBlob = file;
    if(isHeic(file)){
      if(typeof heic2any === 'undefined'){ return null; }
      try {
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
        sourceBlob = Array.isArray(converted) ? converted[0] : converted;
      } catch(e){ return null; }
    }
    return drawThumb(sourceBlob, maxW, quality);
  }

  function drawThumb(blob, maxW, quality){
    return new Promise(resolve => {
      let settled = false;
      const done = (v) => { if(!settled){ settled = true; resolve(v); } };
      const timer = setTimeout(() => done(null), 20000);   // 20 秒超时兜底
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        clearTimeout(timer);
        try {
          if(!img.width || !img.height){ URL.revokeObjectURL(url); done(null); return; }
          const scale = Math.min(1, maxW / img.width);
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          // 空白检测：中心像素 alpha=0 视为坏图
          try {
            const px = ctx.getImageData(Math.floor(w/2), Math.floor(h/2), 1, 1).data;
            if(px[3] === 0){ URL.revokeObjectURL(url); done(null); return; }
          } catch(e){ /* tainted 继续 */ }
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          URL.revokeObjectURL(url);
          done(dataUrl.length > 500 ? dataUrl : null);
        } catch(e){ URL.revokeObjectURL(url); done(null); }
      };
      img.onerror = () => { clearTimeout(timer); URL.revokeObjectURL(url); done(null); };
      img.src = url;
    });
  }

  return { fileToBase64, isHeic };
})();
