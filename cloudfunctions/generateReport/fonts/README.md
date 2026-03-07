# 中文字体文件

为了让 PDF 正确显示中文，请将以下任意一个中文字体文件放入此目录：

## 推荐字体（任选其一）

1. **NotoSansSC-Regular.ttf** (推荐)
   - 下载地址: https://fonts.google.com/noto/specimen/Noto+Sans+SC
   - 文件大小约 8-10MB

2. **SourceHanSansSC-Regular.ttf**
   - 思源黑体简体中文
   - 下载地址: https://github.com/adobe-fonts/source-han-sans/releases

3. **simhei.ttf**
   - Windows 系统自带黑体
   - 可从 C:\Windows\Fonts\simhei.ttf 复制

## 使用说明

1. 下载上述任意一个字体文件
2. 重命名为对应的文件名（如 NotoSansSC-Regular.ttf）
3. 放入此 fonts 目录
4. 重新上传云函数

## 注意事项

- 字体文件会增加云函数包的大小
- 确保字体文件的许可证允许嵌入使用
- 如果不添加字体文件，PDF 中的中文将无法正常显示，但英文仍可正常使用
