import { CHARACTER_EXPORTS } from './character-registry';
import { getAnimationMeta, getCharacterExportMeta, getPngUrl, resPathToRel } from './asset-paths';
import type { CharacterSpriteSet, SpriteAnimState, SpriteCookAnimationMeta } from './types';

const STATE_KEYS: Record<SpriteAnimState, string[]> = {
  idle: ['IdleDown', 'Idle', 'IdleUp', 'IdleRight'],
  walk: ['WalkDown', 'Walk', 'WalkUp', 'WalkRight'],
  attack: ['Attack'],
};

function pickAnimationPath(
  exportMeta: ReturnType<typeof getCharacterExportMeta>,
  state: SpriteAnimState,
): string | undefined {
  const directional = exportMeta.directionalAnimations;
  const generic = exportMeta.animations;
  for (const key of STATE_KEYS[state]) {
    const path = directional?.[key] ?? generic?.[key];
    if (path) return path;
  }
  return undefined;
}

export function resolveAnimationMetas(characterId: string): Record<SpriteAnimState, SpriteCookAnimationMeta> {
  const exportFolder = CHARACTER_EXPORTS[characterId];
  if (!exportFolder) throw new Error(`Unknown sprite character: ${characterId}`);

  const exportMeta = getCharacterExportMeta(characterId);
  const metas = {} as Record<SpriteAnimState, SpriteCookAnimationMeta>;

  for (const state of ['idle', 'walk', 'attack'] as const) {
    const resPath = pickAnimationPath(exportMeta, state);
    if (!resPath) throw new Error(`Missing ${state} animation for ${characterId}`);
    const relJson = resPathToRel(resPath, exportFolder);
    metas[state] = getAnimationMeta(relJson);
  }

  return metas;
}

export function resolvePngUrl(meta: SpriteCookAnimationMeta, exportFolder: string): string {
  return getPngUrl(resPathToRel(meta.texture_path, exportFolder));
}

export function metaToCharacterSet(
  characterId: string,
  metas: Record<SpriteAnimState, SpriteCookAnimationMeta>,
  frameTextures: Record<SpriteAnimState, import('pixi.js').Texture[]>,
): CharacterSpriteSet {
  const idle = metas.idle;
  return {
    id: characterId,
    frameWidth: idle.frame_width,
    frameHeight: idle.frame_height,
    animations: {
      idle: { meta: metas.idle, frames: frameTextures.idle },
      walk: { meta: metas.walk, frames: frameTextures.walk },
      attack: { meta: metas.attack, frames: frameTextures.attack },
    },
  };
}
