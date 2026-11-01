# @deepseek-ai/dsh-image-generation

[English](README.md) | 中文

## 摘要

通过 OpenAI Images 或火山方舟 Seedream 在对话中生成图片。`image_generate` 工具从 Harness 凭据服务读取提供方与 Key，生成一张 PNG，并作为持久附件返回对话。

## 使用方式

打开 **设置 > 插件 > 图像生成**，选择提供方、填写模型与 API Key 并保存。之后让模型生成图片，它会调用 `image_generate` 并把 PNG 插入对话。Key 不会返回浏览器，也不会写入日志。

## Model Experience

`image_generate` 接收 prompt 与可选宽高比，返回生成的图片和简短生成摘要。未配置 API Key 时，工具会提示模型引导用户去设置页，而不是在对话中索要 Key。

## 配置

提供方设置保存在 `image-generation/config` 凭据记录中；Client 标签页注册到 `settings.plugins.tab`，Host 注册需要鉴权的 `/api/image-generation/config` 路由。

## 已知限制

当前仅支持 OpenAI Images 与 Seedream 生成端点。生成的图片以 PNG 附件形式提供；暂不写入 Office 文档所需的 workspace PNG。
