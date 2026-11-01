/** Filesystem ownership for the Electron-managed desktop installation. */

import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** Stable desktop installation paths under the shared Harness home. */
export interface DesktopPaths {
  readonly profile: string
  /** Isolated official-core profile used by Safe Mode; basename stays `desktop` for profile gating. */
  readonly safeModeProfile: string
  readonly lock: string
}

/**
 * Resolve every Electron-owned path without changing the shared data roots.
 * @param dshHome - Harness home shared with npm-installed dsh.
 * @param profileName - Desktop profile directory name (`desktop`, `desktop-work`, …).
 * @returns immutable desktop path set.
 */
export function resolveDesktopPaths(dshHome: string = resolveDshHome(), profileName = 'desktop'): DesktopPaths {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(profileName)) throw new Error(`desktop: invalid profile name ${JSON.stringify(profileName)}`)
  const profile = join(dshHome, 'profiles', profileName)
  return {
    profile,
    // The safe profile's basename stays `desktop` so desktop-gated rows still mount.
    safeModeProfile: join(dshHome, 'profiles', `${profileName}-safe`, 'desktop'),
    lock: join(profile, 'lock'),
  }
}
