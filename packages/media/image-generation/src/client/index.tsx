/** Settings > Plugins > Image generation form. @module @deepseek-ai/dsh-image-generation/client */

import type { Context } from '@deepseek-ai/cordis'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useState } from 'react'
import { de, en, es, fr, ja, NS, pt, ru, zh } from './locales.js'

const CONFIG_PATH = '/api/image-generation/config'

interface ConfigView {
  provider: 'openai' | 'seedream'
  model: string
  baseUrl: string
  keyConfigured: boolean
}

const inputStyle = {
  width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l1)',
  background: 'var(--dsw-alias-bg-primary)', color: 'var(--dsw-alias-label-primary)', font: 'inherit',
} as const

function imageSettings({ t }: PropsLocale<typeof NS>) {
  const [config, setConfig] = useState<ConfigView>({ provider: 'openai', model: 'gpt-image-1', baseUrl: '', keyConfigured: false })
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    let live = true
    void fetch(CONFIG_PATH, { headers: { accept: 'application/json' } }).then(async (response) => {
      const value = await response.json() as ConfigView & { error?: string }
      if (!live) return
      if (!response.ok) throw new Error(value.error ?? t('loadFailed'))
      setConfig({ provider: value.provider, model: value.model, baseUrl: value.baseUrl, keyConfigured: value.keyConfigured })
    }).catch((failure: unknown) => { if (live) setError(failure instanceof Error ? failure.message : t('loadFailed')) })
    return () => { live = false }
  }, [t])

  const save = (): void => {
    setBusy(true); setError(undefined); setMessage(undefined)
    void fetch(CONFIG_PATH, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: config.provider, model: config.model, baseUrl: config.baseUrl, ...key.trim() === '' ? {} : { key } }),
    }).then(async (response) => {
      const value = await response.json() as ConfigView & { error?: string }
      if (!response.ok) throw new Error(value.error ?? t('saveFailed'))
      setConfig({ provider: value.provider, model: value.model, baseUrl: value.baseUrl, keyConfigured: value.keyConfigured })
      setKey(''); setMessage(t('saved'))
    }).catch((failure: unknown) => { setError(failure instanceof Error ? failure.message : t('saveFailed')) })
      .finally(() => { setBusy(false) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '560px', padding: '4px 2px' }}>
      <div>
        <div style={{ fontSize: '15px', fontWeight: 600, lineHeight: '22px' }}>{t('title')}</div>
        <div style={{ fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' }}>{t('description')}</div>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
        <span>{t('provider')}</span>
        <select value={config.provider} onChange={(event) => { setConfig({ ...config, provider: event.target.value as ConfigView['provider'] }) }} style={inputStyle}>
          <option value="openai">{t('openai')}</option>
          <option value="seedream">{t('seedream')}</option>
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
        <span>{t('model')}</span>
        <input value={config.model} onChange={(event) => { setConfig({ ...config, model: event.target.value }) }} style={inputStyle} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
        <span>{t('baseUrl')}</span>
        <input value={config.baseUrl} placeholder={config.provider === 'openai' ? 'https://api.openai.com/v1' : 'https://ark.cn-beijing.volces.com/api/v3'} onChange={(event) => { setConfig({ ...config, baseUrl: event.target.value }) }} style={inputStyle} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
        <span>{t('apiKey')}</span>
        <input type="password" value={key} placeholder={config.keyConfigured ? t('keySaved') : ''} onChange={(event) => { setKey(event.target.value) }} style={inputStyle} autoComplete="off" />
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Button variant="primary" disabled={busy} onClick={save}>{busy ? t('saving') : t('save')}</Button>
        {message !== undefined && <span role="status" style={{ fontSize: '12px', color: 'var(--dsw-alias-state-success-primary)' }}>{message}</span>}
        {error !== undefined && <span role="alert" style={{ fontSize: '12px', color: 'var(--dsw-alias-state-error-primary)' }}>{error}</span>}
      </div>
    </div>
  )
}

/** Client services required by the settings tab. */
export const inject = ['slots', 'locale']

/** Register the settings tab and its dictionaries. */
export function apply(ctx: Context): void {
  try {
    ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'image-generation: dictionaries')
    const t = ctx.locale.bind(NS)
    ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
      name: 'settings.plugins.tab', id: 'image-generation', label: () => t('tab'), locale: NS,
    }, imageSettings))
  } catch (error) {
    console.error('image-generation client: failed to register', error)
    throw error
  }
}
