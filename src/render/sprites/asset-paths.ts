import type { CharacterExportMeta, SpriteCookAnimationMeta } from './types';
import { CHARACTER_EXPORTS } from './character-registry';

/** Vite-resolved JSON contents keyed by `ExportFolder/SpriteCook/...` */
const spriteCookJson = import.meta.glob(
  '../../assets/characters_sprites/*/SpriteCook/**/*.spritecook.json',
  { eager: true, import: 'default' },
) as Record<string, unknown>;

/** Vite-resolved PNG URLs keyed by `ExportFolder/SpriteCook/assets/...` */
const spriteCookPng = import.meta.glob<string>(
  '../../assets/characters_sprites/*/SpriteCook/assets/*.png',
  { eager: true, query: '?url', import: 'default' },
);

function relKey(fullPath: string): string | undefined {
  const marker = '/characters_sprites/';
  const idx = fullPath.indexOf(marker);
  if (idx < 0) return undefined;
  return fullPath.slice(idx + marker.length);
}

const jsonByRel = new Map<string, unknown>();
for (const [path, data] of Object.entries(spriteCookJson)) {
  const key = relKey(path);
  if (key) jsonByRel.set(key, data);
}

const pngByRel = new Map<string, string>();
for (const [path, url] of Object.entries(spriteCookPng)) {
  const key = relKey(path);
  if (key) pngByRel.set(key, url);
}

export function getCharacterExportMeta(characterId: string): CharacterExportMeta {
  const folder = CHARACTER_EXPORTS[characterId];
  if (!folder) throw new Error(`Unknown sprite character: ${characterId}`);
  const key = `${folder}/SpriteCook/character_export.spritecook.json`;
  const meta = jsonByRel.get(key);
  if (!meta) throw new Error(`Missing character export JSON for ${characterId} (${key})`);
  return meta as CharacterExportMeta;
}

export function getAnimationMeta(relativeJsonPath: string): SpriteCookAnimationMeta {
  const meta = jsonByRel.get(relativeJsonPath);
  if (!meta) throw new Error(`Missing animation JSON: ${relativeJsonPath}`);
  return meta as SpriteCookAnimationMeta;
}

/** Converts Godot `res://SpriteCook/...` to a key in our asset maps. */
export function resPathToRel(resPath: string, exportFolder: string): string {
  const rel = resPath.replace(/^res:\/\//, '');
  return `${exportFolder}/${rel}`;
}

export function getPngUrl(relativePngPath: string): string {
  const url = pngByRel.get(relativePngPath);
  if (!url) throw new Error(`Missing sprite PNG: ${relativePngPath}`);
  return url;
}
