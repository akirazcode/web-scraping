#!/usr/bin/env bun
import puppeteer from 'puppeteer';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Mobile viewport configuration (iPhone 12 Pro)
const MOBILE_VIEWPORT = {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

interface ScreenshotOptions {
  urls: string[];
  outputDir: string;
}

async function takeScreenshots({ urls, outputDir }: ScreenshotOptions) {
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
        const filename = `${urlObj.hostname.replace(/\./g, '_')}_${Date.now()}.png`;
        const filepath = join(outputDir, filename);

        // Take screenshot (viewport only)
        await page.screenshot({
          path: filepath,
          type: 'png',
          fullPage: false, // Only capture viewport
        });

        console.log(`✅ Screenshot saved: ${filepath}`);
      } catch (error) {
        console.error(`❌ Error taking screenshot of ${url}:`, error);
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
  --help, -h            Show this help message

Examples:
  bun run screenshot.ts https://example.com
  bun run screenshot.ts https://example.com https://google.com
  bun run screenshot.ts -o ./output https://example.com
  bun run screenshot.ts -f urls.txt
`);
    process.exit(0);
  }

  let urls: string[] = [];
  let outputDir = './screenshots';

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
  console.log('');

  await takeScreenshots({ urls, outputDir });
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
