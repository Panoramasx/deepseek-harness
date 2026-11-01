# @deepseek-ai/dsh-image-generation

English | [中文](README.zh.md)

## Summary

Conversation image generation through OpenAI Images or Volcengine Ark Seedream. The `image_generate` tool reads the configured provider and key from the Harness credential store, generates one PNG, and returns it as a durable attachment in the conversation.

## Use this package

Open **Settings > Plugins > Image generation**, choose a provider, enter the model and API key, and save. Then ask the model for an image; it calls `image_generate` and inserts the PNG into the transcript. The key is never returned to the browser or written to logs.

## Model Experience

`image_generate` accepts a prompt and an optional aspect ratio and returns the generated image plus a short generation summary. The tool is only useful after an API key is configured; without one it tells the model to direct the user to Settings instead of asking for a key in conversation.

## Configuration

The provider settings are stored as a credential record owned by `image-generation/config`. The Client tab is registered into `settings.plugins.tab`; the Host registers the authenticated `/api/image-generation/config` route.

## Known limitations

Only OpenAI Images and Seedream generation endpoints are supported. Generated images are PNG attachments; writing a workspace PNG for Office documents is not part of this version.
