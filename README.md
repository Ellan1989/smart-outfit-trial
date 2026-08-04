# 智能穿搭 PWA · 部署与运营指南

让 AI 帮你搭出每天的精彩。上传衣服照片 AI 自动打标签，根据天气/风格/目的智能生成今日穿搭，一键生成时尚海报。

## 功能

- 👗 **AI 自动打标签**：拍照/上传衣物，GLM-4V 自动识别类别、颜色、风格、季节、场合
- ✨ **智能穿搭推荐**：根据温度、天气、风格、出行目的，从你的衣橱里智能选品搭配
- 🎨 **穿搭海报生成**：CogView 生成时尚杂志大片风格的海报
- 🔒 **隐私优先**：衣物照片、API Key 全部存在用户本机，不上传服务器
- 📱 **PWA 全平台**：安卓、iOS 通用，可"添加到主屏幕"像 App 一样使用

## 技术栈

- 原生 JS + IIFE 模块（无框架、无构建，零依赖部署）
- IndexedDB 本地持久化（衣物/搭配记录）
- PWA（manifest + Service Worker，离线可用）
- 智谱 GLM-4V（视觉打标签）+ GLM-4.6（搭配推荐）+ CogView（生图）
- Cloudflare Workers + D1（激活授权后端，零成本）

---

## 一、用户使用流程（你的买家）

1. 打开你给的网址（或解压 ZIP）
2. 首次进入，输入激活码（随 ZIP 附赠）
3. 在"我的"页配置智谱 API Key（去 https://open.bigmodel.cn 免费注册获取）
4. 在衣橱页添加衣物（拍照/上传），AI 自动打标签
5. 在穿搭页选条件，AI 推荐今日穿搭
6. 一键生成穿搭海报
7. 安卓/iOS 浏览器"添加到主屏幕"，变成本地 App

---

## 二、部署（你的操作）

### 步骤 1：部署激活授权后端（Cloudflare Worker）

1. 注册 Cloudflare 账号（免费）
2. 安装 Wrangler CLI：`npm i -g wrangler`
3. 登录：`wrangler login`
4. 创建 D1 数据库：
   ```bash
   wrangler d1 create smart-outfit-db
   # 把输出的 database_id 填入 worker/wrangler.toml
   ```
5. 执行建表：
   ```bash
   cd worker
   wrangler d1 execute smart-outfit-db --file=./schema.sql
   ```
6. 设置密钥（交互式输入，不要写进代码）：
   ```bash
   wrangler secret put JWT_SECRET     # 输入一串随机字符串
   wrangler secret put ADMIN_TOKEN    # 输入管理令牌（你自己用）
   ```
7. 部署：
   ```bash
   wrangler deploy
   # 输出形如 https://smart-outfit-license.你的子域.workers.dev
   ```
8. 把这个地址填入 `js/license.js` 顶部的 `API_BASE`

### 步骤 2：生成卡密（卖货用）

```bash
# 批量生成 50 个永久卡密（每码绑1台设备）
curl -X POST https://smart-outfit-license.你的子域.workers.dev/admin/gen \
  -H "X-Admin-Token: 你的管理令牌" \
  -H "Content-Type: application/json" \
  -d '{"count":50,"type":"lifetime","maxDevices":1,"note":"首批代理"}'
```
返回形如 `{"ok":true,"codes":["SO-ABCD-EFGH-JKLM",...]}`。把这些卡密随 ZIP 卖给用户。

吊销某卡密（用户退款等）：
```bash
curl -X POST .../admin/revoke \
  -H "X-Admin-Token: ..." \
  -d '{"code":"SO-ABCD-EFGH-JKLM"}'
```

### 步骤 3：部署前端 PWA

**方式 A：Cloudflare Pages（推荐，和 Worker 同账号）**
1. 登录 Cloudflare Dashboard → Pages → 创建项目 → 直接上传
2. 把整个 `smart-outfit` 目录拖进去（**不要包含 worker/ 文件夹**）
3. 部署后得到 `https://smart-outfit.pages.dev`

**方式 B：GitHub Pages**
1. 新建仓库，把前端文件推上去
2. Settings → Pages → Source 选 main 分支
3. 得到 `https://你的用户名.github.io/仓库名`

### 步骤 4：打包交付 ZIP

交付物里放：
```
智能穿搭Pro_v1.0.zip
├── 打开网址.txt          # 写你的 Pages/GitHub Pages 网址
├── 激活码.txt            # 一码一zip，或批量附卡密清单
└── 使用说明.pdf          # 图文教程（如何配Key、如何添加主屏）
```

> 注：ZIP 是"包装盒"，真正用的是网址 + 激活码。安卓用户也可直接访问网址"添加主屏"，无需 ZIP。

---

## 三、本地开发与调试

```bash
# 启动本地静态服务器
cd smart-outfit
python3 -m http.server 8765
# 浏览器打开 http://localhost:8765/index.html

# 调试时跳过激活：编辑 js/main.js，把 LICENSE_REQUIRED 改为 false
# 生产部署务必改回 true
```

---

## 四、成本

| 项目 | 费用 |
|------|------|
| 前端托管（Cloudflare Pages / GitHub Pages） | 免费 |
| Worker 授权后端（10万次请求/天） | 免费（百人级够用） |
| D1 数据库（5GB） | 免费 |
| 智谱 API | 用户自配，你零成本 |
| 自定义域名（可选） | ¥30-70/年 |
| **你的总成本** | **接近 0** |

---

## 五、目录结构

```
smart-outfit/
├── index.html              单页应用入口
├── manifest.json           PWA 清单
├── sw.js                   Service Worker
├── css/style.css           样式
├── js/
│   ├── config.js           AI 配置（智谱三模型预设）
│   ├── ai.js               AI 调用（打标签/搭配/海报）
│   ├── store.js            数据中枢（内存+IndexedDB）
│   ├── db.js               IndexedDB 封装
│   ├── image-utils.js      图片处理（压缩/HEIC转换）
│   ├── license.js          激活授权（指纹/心跳/宽限）
│   ├── page-closet.js      衣橱页
│   ├── page-outfit.js      穿搭页
│   ├── page-me.js          我的页
│   └── main.js             入口路由
├── lib/                    第三方库（本地内置）
│   ├── heic2any.min.js     HEIC 转 JPG
│   └── fingerprint.min.js  设备指纹（MIT）
├── assets/icons/           PWA 图标
└── worker/                 激活授权后端（单独部署）
    ├── wrangler.toml
    ├── schema.sql
    └── src/
        ├── index.js        Worker 主逻辑
        └── jwt.js          JWT 签发验证
```

---

## 六、防传播机制

| 层级 | 机制 | 作用 |
|------|------|------|
| 第1层 | 激活码 + 设备指纹绑定 | 一码绑 N 台设备（默认1），转给别人用不了 |
| 第2层 | 在线心跳 + 吊销 | 退款/违规可远程吊销；6小时心跳一次 |
| 第3层 | 离线宽限7天 | 弱网/临时离线不误锁，超7天才锁 |
| 第4层 | JWT 签名 | token 绑设备指纹，拷到别的设备无效 |
| 第5层 | 核心 AI 在云端 | 用户即使破解前端，AI 推理仍走他自己的 Key |

---

## 七、后续可扩展（Phase 2）

- [ ] 精确虚拟试穿（接入通义万相/可灵，用户额外配 Key）
- [ ] 天气 API 自动获取（和风天气免费版）
- [ ] iOS 推送通知（"今天降温，该穿这件"）
- [ ] 穿搭日历（记录每天穿了什么）
- [ ] 衣橱统计仪表盘（利用率、配色分布）
