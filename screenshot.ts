#!/usr/bin/env bun
import puppeteer, { Page } from 'puppeteer';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath.path);

// Mobile viewport configuration (iPhone 12 Pro)
const MOBILE_VIEWPORT = {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

// Video recording duration (15 seconds)
const VIDEO_DURATION_MS = 15000;
// Scroll interval (reduced for more activity)
const SCROLL_INTERVAL_MS = 12;
// Scroll amount per interval (pixels)
const SCROLL_AMOUNT = 1;

interface ScreenshotOptions {
  urls: string[];
  outputDir: string;
  recordVideo?: boolean;
}

async function scrollPage(page: Page, durationMs: number): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < durationMs) {
    // Check if we can still scroll
    const canScroll = await page.evaluate(() => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = document.documentElement.clientHeight;
      return scrollTop + clientHeight < scrollHeight;
    });
    
    if (canScroll) {
      await page.evaluate((scrollAmount: number) => {
        window.scrollBy(0, scrollAmount);
      }, SCROLL_AMOUNT);
    }
    
    // Always wait for the interval to maintain consistent timing and video duration
    await new Promise(resolve => setTimeout(resolve, SCROLL_INTERVAL_MS));
  }
}

async function recordVideo(page: Page, filepath: string): Promise<void> {
  // Validate the filepath ends with .mp4
  if (!filepath.endsWith('.mp4')) {
    throw new Error('Video filepath must end with .mp4');
  }
  
  console.log(`🎬 Starting video recording (${VIDEO_DURATION_MS / 1000}s scroll)...`);
  
  // Record as webm first (Puppeteer's native format)
  const tempWebmPath = filepath.replace('.mp4', '.webm');
  const recorder = await page.screencast({ 
    path: tempWebmPath as `${string}.webm`
  });
  
  // Scroll down for the duration
  await scrollPage(page, VIDEO_DURATION_MS);
  
  // Stop recording
  await recorder.stop();
  
  console.log(`🔄 Converting webm to mp4...`);
  
  // Convert webm to mp4 using fluent-ffmpeg
  return new Promise((resolve, reject) => {
    ffmpeg(tempWebmPath)
      .outputOptions([
        '-c:v libx264',
        '-preset fast',
        '-crf 22'
      ])
      .output(filepath)
      .on('end', () => {
        // Success - remove temporary webm file
        try {
          unlinkSync(tempWebmPath);
        } catch (e) {
          // Ignore cleanup errors
        }
        console.log(`✅ Video saved: ${filepath}`);
        resolve();
      })
      .on('error', (err) => {
        console.error(`❌ Failed to convert video:`, err.message);
        console.error(`Keeping webm file: ${tempWebmPath}`);
        reject(err);
      })
      .run();
  });
}

async function takeScreenshots({ urls, outputDir, recordVideo: shouldRecordVideo }: ScreenshotOptions) {
  // Create output directory if it doesn't exist
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Launch browser
  console.log('🚀 Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    
    // Set mobile viewport
    await page.setViewport(MOBILE_VIEWPORT);
    
    // Set user agent to mobile
    await page.setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1'
    );

    for (const url of urls) {
      try {
        console.log(`📸 Taking screenshot of: ${url}`);
        
        // Navigate to URL
        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });

        // Generate filename from URL
        const urlObj = new URL(url);
        const timestamp = Date.now();
        const screenshotFilename = `${urlObj.hostname.replace(/\./g, '_')}_${timestamp}.png`;
        const screenshotFilepath = join(outputDir, screenshotFilename);

        // Take screenshot (viewport only)
        await page.screenshot({
          path: screenshotFilepath,
          type: 'png',
          fullPage: false, // Only capture viewport
        });

        console.log(`✅ Screenshot saved: ${screenshotFilepath}`);

        // Record video if enabled
        if (shouldRecordVideo) {
          // Scroll back to top before recording
          await page.evaluate(() => window.scrollTo(0, 0));
          await new Promise(resolve => setTimeout(resolve, 500)); // Wait for scroll to complete
          
          const videoFilename = `${urlObj.hostname.replace(/\./g, '_')}_${timestamp}.mp4`;
          const videoFilepath = join(outputDir, videoFilename);
          await recordVideo(page, videoFilepath);
        }
      } catch (error) {
        console.error(`❌ Error processing ${url}:`, error);
      }
    }
  } finally {
    await browser.close();
    console.log('🔒 Browser closed');
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
📱 Mobile Screenshot CLI

Usage:
  bun run screenshot.ts <url1> [url2] [url3] ...
  bun run screenshot.ts --urls <url1> <url2> <url3> ...
  bun run screenshot.ts --file <urls-file.txt>

Options:
  --output, -o <dir>    Output directory (default: ./screenshots)
  --file, -f <file>     Read URLs from file (one per line)
  --video, -v           Record 15s video with scroll down animation
  --help, -h            Show this help message

Examples:
  bun run screenshot.ts https://example.com
  bun run screenshot.ts https://example.com https://google.com
  bun run screenshot.ts -o ./output https://example.com
  bun run screenshot.ts -f urls.txt
  bun run screenshot.ts -v https://example.com
`);
    process.exit(0);
  }

  let urls: string[] = [];
  let outputDir = './screenshots';
  let recordVideo = false;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--output' || arg === '-o') {
      if (i + 1 >= args.length) {
        console.error('❌ Error: --output requires a directory path');
        process.exit(1);
      }
      const nextArg = args[++i];
      if (!nextArg) {
        console.error('❌ Error: --output requires a directory path');
        process.exit(1);
      }
      outputDir = nextArg;
    } else if (arg === '--file' || arg === '-f') {
      if (i + 1 >= args.length) {
        console.error('❌ Error: --file requires a filename');
        process.exit(1);
      }
      const filename = args[++i];
      if (!filename) {
        console.error('❌ Error: --file requires a filename');
        process.exit(1);
      }
      const fs = await import('fs/promises');
      const content = await fs.readFile(filename, 'utf-8');
      const fileUrls = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
      urls.push(...fileUrls);
    } else if (arg === '--video' || arg === '-v') {
      recordVideo = true;
    } else if (arg === '--urls') {
      // Collect remaining args as URLs
      urls.push(...args.slice(i + 1));
      break;
    } else if (arg && (arg.startsWith('http://') || arg.startsWith('https://'))) {
      urls.push(arg);
    }
  }

  if (urls.length === 0) {
    console.error('❌ Error: No URLs provided');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  console.log(`📋 URLs to screenshot: ${urls.length}`);
  console.log(`📁 Output directory: ${outputDir}`);
  if (recordVideo) {
    console.log(`🎬 Video recording: enabled (15s scroll)`);
  }
  console.log('');

  await takeScreenshots({ urls, outputDir, recordVideo });
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
