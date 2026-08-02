import type { Texture } from 'pixi.js';

export type SpriteAnimState = 'idle' | 'walk' | 'attack';

export interface SpriteCookAnimationMeta {
  version: number;
  asset_kind?: string;
  texture_path: string;
  sprite_frames_path?: string;
  animation_name: string;
  frame_width: number;
  frame_height: number;
  frame_count: number;
  fps: number;
  recognized_state?: string;
}

export interface CharacterExportMeta {
  version: number;
  sourceCharacterName?: string;
  perspective?: string;
  controllerMode?: string;
  sprite_frames_path?: string;
  animations?: Record<string, string>;
  directionalAnimations?: Record<string, string>;
}

export interface LoadedAnimation {
  meta: SpriteCookAnimationMeta;
  frames: Texture[];
}

export interface CharacterSpriteSet {
  id: string;
  frameWidth: number;
  frameHeight: number;
  animations: Record<SpriteAnimState, LoadedAnimation>;
}
