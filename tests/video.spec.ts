import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const VIDEOS = [
  { file: 'media/takadai_15s_1080x1920.mp4', duration: 15 },
  { file: 'media/takadai_30s_1080x1920.mp4', duration: 30 },
];

for (const v of VIDEOS) {
  test.describe(`動画 ${v.file}`, () => {
    test.skip(!existsSync(v.file), 'video not generated yet (npm run video)');

    test('1080x1920 / H.264 / AAC / 長さ', () => {
      const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate:format=duration', '-of', 'json', v.file]).toString();
      const j = JSON.parse(out);
      const video = j.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
      const audio = j.streams.find((s: { codec_type: string }) => s.codec_type === 'audio');
      expect(video.codec_name).toBe('h264');
      expect(video.width).toBe(1080);
      expect(video.height).toBe(1920);
      expect(video.r_frame_rate).toBe('30/1');
      expect(audio?.codec_name).toBe('aac');
      expect(Math.abs(Number(j.format.duration) - v.duration)).toBeLessThan(0.2);
    });

    test('最後まで正常にデコードできる', () => {
      const err = execFileSync('ffmpeg', ['-v', 'error', '-i', v.file, '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
      expect(err.trim()).toBe('');
    });

    test('ブラウザの<video>で再生できる', async ({ page }, info) => {
      await page.route('**/__video.mp4', (route) => route.fulfill({ status: 200, contentType: 'video/mp4', body: readFileSync(v.file) }));
      await page.goto('/');
      const can = await page.evaluate(() => document.createElement('video').canPlayType('video/mp4; codecs="avc1.640029, mp4a.40.2"'));
      if (!can) {
        info.annotations.push({ type: 'note', description: 'This Chromium build has no H.264 decoder; playback verified via ffmpeg decode instead.' });
        test.skip(true, 'no H.264 in this Chromium build');
      }
      const r = await page.evaluate(async () => {
        const el = document.createElement('video');
        el.muted = true;
        el.src = '/__video.mp4';
        document.body.appendChild(el);
        await el.play();
        await new Promise((res) => setTimeout(res, 1500));
        return { t: el.currentTime, w: el.videoWidth, h: el.videoHeight, d: el.duration };
      });
      expect(r.w).toBe(1080);
      expect(r.h).toBe(1920);
      expect(r.t).toBeGreaterThan(0.5);
    });
  });
}
