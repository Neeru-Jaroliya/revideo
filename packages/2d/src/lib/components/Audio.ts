import {DependencyContext, PlaybackState} from '@revideo/core';
import {computed, nodeName} from '../decorators';
import type {MediaProps} from './Media';
import {Media} from './Media';

@nodeName('Audio')
export class Audio extends Media {
  private static readonly pool: Record<string, HTMLAudioElement> = {};

  public constructor(props: MediaProps) {
    super(props);
  }

  protected mediaElement(): HTMLAudioElement {
    return this.audio();
  }

  protected seekedMedia(): HTMLAudioElement {
    return this.seekedAudio();
  }

  protected fastSeekedMedia(): HTMLAudioElement {
    return this.fastSeekedAudio();
  }

  @computed()
  protected audio(): HTMLAudioElement {
    const src = this.src();
    const key = `${this.key}/${src}`;
    let audio = Audio.pool[key];
    if (!audio) {
      audio = document.createElement('audio');
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      audio.src = src;

      // Add iOS compatibility attributes
      if (this.isIOS()) {
        audio.muted = true; // Initially mute for autoplay on iOS
        audio.setAttribute('playsinline', 'true');
        audio.setAttribute('webkit-playsinline', 'true');
        audio.setAttribute('x5-playsinline', 'true');
        
        // Unmute on first play
        audio.addEventListener('play', () => {
          audio.muted = false;
        }, { once: true }); // Use once to prevent multiple unmutes
      }
     
      Audio.pool[key] = audio;
    }

    // Ensure audio is ready before returning
    if (audio.readyState < 1) {
      DependencyContext.collectPromise(
        new Promise<void>(resolve => {
          const onLoadedMetadata = () => {
            audio.removeEventListener('loadedmetadata', onLoadedMetadata);
            resolve();
          };
          audio.addEventListener('loadedmetadata', onLoadedMetadata);
        }),
      );
    }

    return audio;
  }

  @computed()
  protected seekedAudio(): HTMLAudioElement {
    const audio = this.audio();

    audio.addEventListener('ended', () => {
      this.pause();
    });

    if (!(this.time() < audio.duration)) {
      this.pause();
      return audio;
    }

    const time = this.clampTime(this.time());
    audio.playbackRate = this.playbackRate();

    if (!audio.paused) {
      audio.pause();
    }

    audio.currentTime = time;
    return audio;
  }

  @computed()
  protected fastSeekedAudio(): HTMLAudioElement {
    const audio = this.audio();
    const time = this.clampTime(this.time());

    audio.playbackRate = this.playbackRate();

    const playing =
      this.playing() && time < audio.duration && audio.playbackRate > 0;
    
    // Handle play/pause state
    if (playing) {
      if (audio.paused) {
        if (this.isIOS()) {
          audio.muted = false;
        }
        DependencyContext.collectPromise(audio.play());
      }
    } else {
      if (!audio.paused) {
        audio.pause();
      }
    }

    // Only seek if we're significantly out of sync
    if (Math.abs(audio.currentTime - time) > 0.5) {
      audio.currentTime = time;
    }

    return audio;
  }

  protected override setCurrentTime(value: number) {
    const media = this.mediaElement();
    if (media.readyState < 2) return;

    media.currentTime = value;
    this.lastTime = value;
  }

  protected override async draw(context: CanvasRenderingContext2D) {
    const playbackState = this.view().playbackState();

    playbackState === PlaybackState.Playing ||
    playbackState === PlaybackState.Presenting
      ? this.fastSeekedAudio()
      : this.seekedAudio();

    context.save();
    context.restore();

    await this.drawChildren(context);
  }
}
