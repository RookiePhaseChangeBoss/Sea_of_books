# Sea_of_books

书洋，离线书库。识别并阅读 EPUB、MOBI、AZW3，把书收进自己的目录，记住读到哪儿，并把划线写进 Markdown。

界面默认暗色。侧栏可以换成明亮，或跟随系统。

## 开发

```bash
npm install
npm run icons
npm run samples
npm test
npm run dev
```

`samples/` 里有一本自制的《夜读手册》，EPUB 和 MOBI 各一份，可以拖进窗口。

## 打包

```bash
npm run dist
```

产物在 `release/`：

- `书洋-0.1.0-win-x64-setup.exe`：安装版，可选安装目录，并注册 epub / mobi / azw / azw3
- `书洋-0.1.0-win-x64-portable.exe`：便携版，双击即用

只要其中一种时：

```bash
npm run dist:setup
npm run dist:portable
```

## 书放在哪儿

- 安装版：`%APPDATA%\书洋\library`
- 便携版：exe 旁边的 `书库`。如果旁边已经有以前的 `CodexLibrary`，会继续用那个目录
- 侧栏「更改位置」可以换成别的文件夹。选定之后会扫描一遍里面的 EPUB、MOBI、AZW3，把还没收进书库的复制进去

每本书是 `books/<id>/book.epub`（或 `.mobi` / `.azw3`）。进度写在 `index.json`。侧栏可以打开这个文件夹。

拖进窗口、菜单「收入书库」，或在资源管理器里双击已关联的电子书，都会先识别格式再复制进书库。原来的文件不会被改动。

## 笔记

每本书一份 `notes/<id>.md`。划线和批注写在「划线」一节，手写内容放在文末「手记」。再次划线时会重写划线一节，手记原样保留。侧栏可以分别关掉划线和手记的时间；关掉之后 Markdown 里只留文字。

阅读时选中文字，点「划线」或「批注」。笔记页可以改批注、跳回原文，或用系统编辑器打开 Markdown。

## 主题与版式

暗色、明亮、跟随系统存在书库的 `settings.json`，便携版会跟着 exe 一起走。阅读页可以改字号、行距、翻页或滚动、单栏或双栏。

## 打不开的文件

带 DRM 的 Kindle 文件会被拒绝。损坏的包会在打开时说明原因。PDF 不在这三种格式里。

## 致谢

排版使用 [foliate-js](https://github.com/johnfactotum/foliate-js)（MIT）。压缩使用 fflate（MIT），EPUB 的 zip 读取使用 zip.js（BSD-3-Clause）。
