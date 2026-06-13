# PDF 中文字体（期刊衬线风格）

PDF 报告使用思源宋体（Noto Serif SC，SC 子集 OTF）渲染中西文，与 Excel/Word 的
Times New Roman + 宋体期刊三线表风格统一。需要以下两个文件：

1. **NotoSerifSC-Regular.otf** — 正文
2. **NotoSerifSC-Bold.otf** — 表题 / 节标题 / 链路余量等强调值

下载地址（googlefonts/noto-cjk 仓库 SC 子集）：

- https://raw.githubusercontent.com/googlefonts/noto-cjk/main/Serif/SubsetOTF/SC/NotoSerifSC-Regular.otf
- https://raw.githubusercontent.com/googlefonts/noto-cjk/main/Serif/SubsetOTF/SC/NotoSerifSC-Bold.otf

## 注意事项

- 两个文件各约 11MB，会计入云函数包大小，修改后需重新上传部署云函数
- 缺失 Regular 时回退 pdfkit 内置 Times-Roman（中文无法显示）；缺失 Bold 时用 Regular 代替加粗
- SIL Open Font License，允许嵌入
