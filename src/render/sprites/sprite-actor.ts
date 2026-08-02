import { Sprite } from 'pixi.js';
import type { CharacterSpriteSet, SpriteAnimState } from './types';

export class SpriteActor {
  readonly sprite: Sprite;
  private readonly set: CharacterSpriteSet;
  private state: SpriteAnimState = 'idle';
  private frameIndex = 0;
  private frameTime = 0;

  constructor(set: CharacterSpriteSet) {
    this.set = set;
    this.sprite = new Sprite(set.animations.idle.frames[0]);
    this.sprite.anchor.set(0.5, 1);
  }

  /** Pixel height on screen (matches procedural unit height). */
  setPixelHeight(h: number) {
    const scale = h / this.set.frameHeight;
    this.sprite.scale.set(scale);
  }

  get pixelHeight(): number {
    return this.set.frameHeight * Math.abs(this.sprite.scale.y);
  }

  setState(state: SpriteAnimState, swing = 0) {
    if (state === 'attack') {
      this.state = 'attack';
      this.applyAttackFrame(swing);
      return;
    }

    if (this.state !== state) {
      this.state = state;
      this.frameIndex = 0;
      this.frameTime = 0;
    }
  }

  advance(dt: number, swing = 0) {
    if (this.state === 'attack') {
      this.applyAttackFrame(swing);
      return;
    }

    const anim = this.set.animations[this.state];
    this.frameTime += dt;
    const frameDuration = 1 / anim.meta.fps;
    while (this.frameTime >= frameDuration) {
      this.frameTime -= frameDuration;
      this.frameIndex = (this.frameIndex + 1) % anim.frames.length;
    }
    this.sprite.texture = anim.frames[this.frameIndex];
  }

  private applyAttackFrame(swing: number) {
    const anim = this.set.animations.attack;
    const progress = Math.max(0, Math.min(1, 1 - swing));
    const idx = Math.min(anim.frames.length - 1, Math.floor(progress * anim.frames.length));
    this.sprite.texture = anim.frames[idx];
  }
}
