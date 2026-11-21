# muShenzhen 2026 脚本与参考

白底黑字、按原稿顺序呈现的脚本网站。脚本来自用户提供的《muShenzhen 2026 - 脚本 (1).docx》，保留完整正文。

访客直接阅读脚本、播放参考影片。编辑者点击「编辑参考」，输入单独交付的口令，即可上传图片、视频和音频，添加链接或文字，在任意段落后放置参考。桌面端可拖动到其他段落、自由调整宽度；同一段落中的参考可前后排序、并排展示。手机端顺序显示，也可通过编辑选择段落位置。点击「发布更新」后跨设备共享。

GitHub Pages 从 main 的 docs 目录发布页面；Sites Worker 和 R2 提供共享存储。public 是页面源文件，worker 是服务端，npm run build 同步 docs 并生成 dist/server/index.js。环境变量 EDITOR_KEY 是编辑口令，绝不存入仓库。口令持有人可编辑，任何获得浏览链接的人都可查看；noindex 并非访问控制。

单文件上限 90 MB，推荐 MP4/H.264、WebM、JPG、PNG、WebP。更大文件使用链接，YouTube、Vimeo、Bilibili 常见链接支持内嵌，但播放效果受来源平台和访问网络影响。MOV 是否可播取决于编码。删除参考后原上传文件留在存储中，避免误删，需单独维护清理。

共享保存使用 R2 ETag 防止覆盖另一位编辑的新版本。版本冲突时当前修改保留并导出 JSON 备份，需手动合并，暂未提供自动导入。未发布编辑仅存在当前页面，关闭页面前有提醒。

```
npm test
npm run build
npm run dev
```

手机入口 https://mushenzhen-script.pages.dev 从同一域名加载脚本和媒体。Cloudflare Pages 转发共享请求到现有 Sites 存储。GitHub 入口优先使用手机入口读取数据，失败时自动重试原服务。更新手机入口时，先运行 npm run build，再执行 wrangler pages deploy dist/pages --project-name mushenzhen-script --branch main。

本地预览为内存存储，重启即清空，与生产隔离；本地口令 local-preview-only。Sites 源代码与构建包通过插件 source workflow 推送、保存、部署；GitHub Pages 更新需构建并推送 main。
