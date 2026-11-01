/** Browser copy for the image generation settings tab. @module @deepseek-ai/dsh-image-generation/client/locales */

export const NS = 'image-generation'

/** Every image settings label; the first dictionary owns the key set. */

export const en = {
  tab: 'Image generation',
  title: 'Image generation',
  description: 'Configure the provider used by the image_generate tool. The API key is stored in the Harness credential store and never shown again.',
  provider: 'Provider',
  openai: 'OpenAI Images',
  seedream: 'Seedream (Volcengine Ark)',
  model: 'Model',
  baseUrl: 'API base URL (optional)',
  apiKey: 'API key',
  keySaved: 'A key is saved; leave blank to keep it.',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Settings saved.',
  loadFailed: 'Could not load image generation settings.',
  saveFailed: 'Could not save image generation settings.',
}

/** Every image settings label; the first dictionary owns the key set. */
export type ImageGenerationKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'image-generation': ImageGenerationKey
  }
}

export const zh: Record<ImageGenerationKey, string> = {
  tab: '图像生成',
  title: '图像生成',
  description: '配置 image_generate 工具使用的提供方。API Key 保存在 Harness 凭据服务中，之后不会再次显示。',
  provider: '提供方',
  openai: 'OpenAI Images',
  seedream: 'Seedream（火山方舟）',
  model: '模型',
  baseUrl: 'API 地址（可选）',
  apiKey: 'API Key',
  keySaved: '已保存 Key；留空表示保持不变。',
  save: '保存',
  saving: '保存中…',
  saved: '设置已保存。',
  loadFailed: '无法加载图像生成设置。',
  saveFailed: '无法保存图像生成设置。',
}

export const ja: Record<ImageGenerationKey, string> = {
  tab: '画像生成',
  title: '画像生成',
  description: 'image_generate ツールが使う提供元を設定します。API キーは Harness の資格情報ストアに保存され、再表示されません。',
  provider: '提供元',
  openai: 'OpenAI Images',
  seedream: 'Seedream（Volcengine Ark）',
  model: 'モデル',
  baseUrl: 'API ベース URL（任意）',
  apiKey: 'API キー',
  keySaved: 'キーは保存済みです。空欄なら変更しません。',
  save: '保存',
  saving: '保存中…',
  saved: '設定を保存しました。',
  loadFailed: '画像生成設定を読み込めませんでした。',
  saveFailed: '画像生成設定を保存できませんでした。',
}

export const es: Record<ImageGenerationKey, string> = {
  tab: 'Generación de imágenes',
  title: 'Generación de imágenes',
  description: 'Configura el proveedor que usa la herramienta image_generate. La clave API se guarda en el almacén de credenciales de Harness y no se vuelve a mostrar.',
  provider: 'Proveedor',
  openai: 'OpenAI Images',
  seedream: 'Seedream (Volcengine Ark)',
  model: 'Modelo',
  baseUrl: 'URL base de la API (opcional)',
  apiKey: 'Clave API',
  keySaved: 'Hay una clave guardada; déjalo vacío para conservarla.',
  save: 'Guardar',
  saving: 'Guardando…',
  saved: 'Ajustes guardados.',
  loadFailed: 'No se pudieron cargar los ajustes de generación de imágenes.',
  saveFailed: 'No se pudieron guardar los ajustes de generación de imágenes.',
}

export const fr: Record<ImageGenerationKey, string> = {
  tab: 'Génération d’images',
  title: 'Génération d’images',
  description: 'Configurez le fournisseur utilisé par l’outil image_generate. La clé API est conservée dans le magasin d’identifiants Harness et n’est plus affichée.',
  provider: 'Fournisseur',
  openai: 'OpenAI Images',
  seedream: 'Seedream (Volcengine Ark)',
  model: 'Modèle',
  baseUrl: 'URL de base de l’API (facultatif)',
  apiKey: 'Clé API',
  keySaved: 'Une clé est enregistrée ; laissez vide pour la conserver.',
  save: 'Enregistrer',
  saving: 'Enregistrement…',
  saved: 'Paramètres enregistrés.',
  loadFailed: 'Impossible de charger les paramètres de génération d’images.',
  saveFailed: 'Impossible d’enregistrer les paramètres de génération d’images.',
}

export const de: Record<ImageGenerationKey, string> = {
  tab: 'Bildgenerierung',
  title: 'Bildgenerierung',
  description: 'Konfiguriert den Anbieter für das Tool image_generate. Der API-Schlüssel liegt im Harness-Credential-Speicher und wird nicht erneut angezeigt.',
  provider: 'Anbieter',
  openai: 'OpenAI Images',
  seedream: 'Seedream (Volcengine Ark)',
  model: 'Modell',
  baseUrl: 'API-Basis-URL (optional)',
  apiKey: 'API-Schlüssel',
  keySaved: 'Ein Schlüssel ist gespeichert; leer lassen, um ihn zu behalten.',
  save: 'Speichern',
  saving: 'Speichern…',
  saved: 'Einstellungen gespeichert.',
  loadFailed: 'Bildgenerierungs-Einstellungen konnten nicht geladen werden.',
  saveFailed: 'Bildgenerierungs-Einstellungen konnten nicht gespeichert werden.',
}

export const ru: Record<ImageGenerationKey, string> = {
  tab: 'Генерация изображений',
  title: 'Генерация изображений',
  description: 'Настройте провайдера для инструмента image_generate. Ключ API хранится в хранилище учётных данных Harness и больше не показывается.',
  provider: 'Провайдер',
  openai: 'OpenAI Images',
  seedream: 'Seedream (Volcengine Ark)',
  model: 'Модель',
  baseUrl: 'Базовый URL API (необязательно)',
  apiKey: 'Ключ API',
  keySaved: 'Ключ сохранён; оставьте пустым, чтобы сохранить его.',
  save: 'Сохранить',
  saving: 'Сохранение…',
  saved: 'Настройки сохранены.',
  loadFailed: 'Не удалось загрузить настройки генерации изображений.',
  saveFailed: 'Не удалось сохранить настройки генерации изображений.',
}

export const pt: Record<ImageGenerationKey, string> = {
  tab: 'Geração de imagens',
  title: 'Geração de imagens',
  description: 'Configure o provedor usado pela ferramenta image_generate. A chave de API fica no armazenamento de credenciais do Harness e não é exibida novamente.',
  provider: 'Provedor',
  openai: 'OpenAI Images',
  seedream: 'Seedream (Volcengine Ark)',
  model: 'Modelo',
  baseUrl: 'URL base da API (opcional)',
  apiKey: 'Chave de API',
  keySaved: 'Há uma chave salva; deixe em branco para mantê-la.',
  save: 'Salvar',
  saving: 'Salvando…',
  saved: 'Configurações salvas.',
  loadFailed: 'Não foi possível carregar as configurações de geração de imagens.',
  saveFailed: 'Não foi possível salvar as configurações de geração de imagens.',
}
