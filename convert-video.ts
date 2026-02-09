#!/usr/bin/env bun
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { existsSync, unlinkSync } from 'fs';
import { basename, extname, join } from 'path';
import { Glob } from 'bun';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath.path);

interface ConvertOptions {
  inputFiles: string[];
  outputDir?: string;
  keepOriginal?: boolean;
  quality?: number; // CRF value (15-35, lower is better quality)
}

async function convertToWebM({
  inputFiles,
  outputDir,
  keepOriginal = true,
  quality = 30,
}: ConvertOptions): Promise<void> {
  for (const inputPath of inputFiles) {
    if (!existsSync(inputPath)) {
      console.error(`❌ File not found: ${inputPath}`);
      continue;
    }

    const ext = extname(inputPath);
    if (!['.mp4', '.avi', '.mov', '.mkv', '.flv', '.webm'].includes(ext.toLowerCase())) {
      console.log(`⏭️  Skipping non-video file: ${inputPath}`);
      continue;
    }

    try {
      console.log(`🔄 Converting: ${inputPath}`);

      // Determine output path
      const baseNameWithoutExt = basename(inputPath, ext);
      let outputFilename: string;
      let outputPath: string;
      
      if (ext.toLowerCase() === '.webm' && !outputDir) {
        // If input is already webm and no output dir specified, add -optimized suffix
        outputFilename = `${baseNameWithoutExt}-optimized.webm`;
        outputPath = inputPath.replace(basename(inputPath), outputFilename);
      } else {
        outputFilename = `${baseNameWithoutExt}.webm`;
        outputPath = outputDir
          ? join(outputDir, outputFilename)
          : inputPath.replace(ext, '.webm');
      }

      // Convert video
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .outputOptions([
            '-c:v libvpx-vp9', // VP9 codec for WebM
            '-crf ' + quality, // Quality (15-35, lower is better)
            '-b:v 0', // Variable bitrate
            '-row-mt 1', // Row-based multithreading
            '-c:a libopus', // Opus audio codec
            '-b:a 128k', // Audio bitrate
            '-deadline good', // Encoding speed/quality tradeoff
            '-cpu-used 2', // Speed preset (0-5, higher is faster)
          ])
          .output(outputPath)
          .on('progress', (progress) => {
            if (progress.percent) {
              process.stdout.write(`\r   Progress: ${progress.percent.toFixed(1)}%`);
            }
          })
          .on('end', () => {
            process.stdout.write('\r');
            console.log(`✅ Converted: ${outputPath}`);

            // Remove original file if requested
            if (!keepOriginal) {
              try {
                unlinkSync(inputPath);
                console.log(`🗑️  Removed original: ${inputPath}`);
              } catch (err) {
                console.error(`⚠️  Could not remove original file: ${err}`);
              }
            }

            resolve();
          })
          .on('error', (err) => {
            process.stdout.write('\r');
            console.error(`❌ Conversion failed: ${err.message}`);
            reject(err);
          })
          .run();
      });
    } catch (error) {
      console.error(`❌ Error processing ${inputPath}:`, error);
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
🎬 Video to WebM Converter CLI

Converts and optimizes video files (mp4, avi, mov, mkv, flv, webm) to WebM format.

Usage:
  bun run convert-video.ts <file1> [file2] [file3] ...
  bun run convert-video.ts --pattern "*.mp4"
  bun run convert-video.ts --dir <directory>

Options:
  --output, -o <dir>       Output directory (default: same as input)
  --pattern, -p <pattern>  Glob pattern to match files (e.g., "*.mp4")
  --dir, -d <directory>    Convert all videos in directory
  --keep, -k               Keep original files (default: yes)
  --remove, -r             Remove original files after conversion
  --quality, -q <value>    Quality (CRF: 15-35, default: 30, lower is better)
  --help, -h               Show this help message

Examples:
  bun run convert-video.ts video.mp4
  bun run convert-video.ts video1.mp4 video2.avi
  bun run convert-video.ts -p "screenshots/*.mp4"
  bun run convert-video.ts -d ./screenshots
  bun run convert-video.ts video.mp4 -q 25 -o ./converted --remove
`);
    process.exit(0);
  }

  let inputFiles: string[] = [];
  let outputDir: string | undefined;
  let keepOriginal = true;
  let quality = 30;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--output' || arg === '-o') {
      if (i + 1 >= args.length) {
        console.error('❌ Error: --output requires a directory path');
        process.exit(1);
      }
      outputDir = args[++i];
    } else if (arg === '--pattern' || arg === '-p') {
      if (i + 1 >= args.length) {
        console.error('❌ Error: --pattern requires a glob pattern');
        process.exit(1);
      }
      const pattern = args[++i];
      if (!pattern) {
        console.error('❌ Error: --pattern requires a glob pattern');
        process.exit(1);
      }
      const glob = new Glob(pattern);
      for await (const file of glob.scan('.')) {
        inputFiles.push(file);
      }
    } else if (arg === '--dir' || arg === '-d') {
      if (i + 1 >= args.length) {
        console.error('❌ Error: --dir requires a directory path');
        process.exit(1);
      }
      const dir = args[++i];
      if (!dir) {
        console.error('❌ Error: --dir requires a directory path');
        process.exit(1);
      }
      const glob = new Glob('**/*.{mp4,avi,mov,mkv,flv,webm}');
      for await (const file of glob.scan(dir)) {
        inputFiles.push(join(dir, file));
      }
    } else if (arg === '--keep' || arg === '-k') {
      keepOriginal = true;
    } else if (arg === '--remove' || arg === '-r') {
      keepOriginal = false;
    } else if (arg === '--quality' || arg === '-q') {
      if (i + 1 >= args.length) {
        console.error('❌ Error: --quality requires a numeric value (15-35)');
        process.exit(1);
      }
      const qualityStr = args[++i];
      if (!qualityStr) {
        console.error('❌ Error: --quality requires a numeric value (15-35)');
        process.exit(1);
      }
      quality = parseInt(qualityStr, 10);
      if (isNaN(quality) || quality < 15 || quality > 35) {
        console.error('❌ Error: quality must be a number between 15 and 35 for WebM');
        process.exit(1);
      }
    } else if (arg && !arg.startsWith('-')) {
      inputFiles.push(arg);
    }
  }

  if (inputFiles.length === 0) {
    console.error('❌ Error: No input files provided');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  console.log(`📋 Files to convert: ${inputFiles.length}`);
  if (outputDir) {
    console.log(`📁 Output directory: ${outputDir}`);
  }
  console.log(`🎯 Quality (CRF): ${quality}`);
  console.log(`🗑️  Keep originals: ${keepOriginal ? 'yes' : 'no'}`);
  console.log('');

  await convertToWebM({ inputFiles, outputDir, keepOriginal, quality });

  console.log('\n✨ All conversions completed!');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
