import { Assets, Rectangle, Texture } from 'pixi.js';
import { CHARACTER_EXPORTS } from './character-registry';
import { metaToCharacterSet, resolveAnimationMetas, resolvePngUrl } from './spritecook-parser';
import type { CharacterSpriteSet, SpriteAnimState, SpriteCookAnimationMeta } from './types';

const cache = new Map<string, CharacterSpriteSet>();
const loading = new Map<string, Promise<CharacterSpriteSet>>();

async function loadAnimationFrames(
  meta: SpriteCookAnimationMeta,
  exportFolder: string,
): Promise<Texture[]> {
  const pngUrl = resolvePngUrl(meta, exportFolder);
  const base = await Assets.load<Texture>(pngUrl);
  base.source.scaleMode = 'nearest';

  const frames: Texture[] = [];
  for (let i = 0; i < meta.frame_count; i++) {
    frames.push(
      new Texture({
        source: base.source,
        frame: new Rectangle(i * meta.frame_width, 0, meta.frame_width, meta.frame_height),
      }),
    );
  }
  return frames;
}

async function loadCharacterSpriteSet(characterId: string): Promise<CharacterSpriteSet> {
  const exportFolder = CHARACTER_EXPORTS[characterId];
  if (!exportFolder) throw new Error(`Unknown sprite character: ${characterId}`);

  const metas = resolveAnimationMetas(characterId);
  const frameTextures = {} as Record<SpriteAnimState, Texture[]>;

  for (const state of ['idle', 'walk', 'attack'] as const) {
    frameTextures[state] = await loadAnimationFrames(metas[state], exportFolder);
  }

  return metaToCharacterSet(characterId, metas, frameTextures);
}

export function getCharacterSpriteSet(characterId: string): CharacterSpriteSet | undefined {
  return cache.get(characterId);
}

export function isCharacterLoaded(characterId: string): boolean {
  return cache.has(characterId);
}

export async function loadCharacterSprites(characterIds: string[]): Promise<void> {
  await Promise.all(characterIds.map((id) => loadCharacterSprite(id)));
}

export async function loadCharacterSprite(characterId: string): Promise<CharacterSpriteSet> {
  const cached = cache.get(characterId);
  if (cached) return cached;

  let pending = loading.get(characterId);
  if (!pending) {
    pending = loadCharacterSpriteSet(characterId).then((set) => {
      cache.set(characterId, set);
      loading.delete(characterId);
      return set;
    });
    loading.set(characterId, pending);
  }
  return pending;
}

/** First idle frame texture for card thumbnails. */
export function getCharacterIdleFrame(characterId: string): Texture | undefined {
  return cache.get(characterId)?.animations.idle.frames[0];
}
