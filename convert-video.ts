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
  quality?: number; // CRF value (0-51, lower is better quality)
}

async function convertToMp4({
  inputFiles,
  outputDir,
  keepOriginal = false,
  quality = 22,
}: ConvertOptions): Promise<void> {
  for (const inputPath of inputFiles) {
    if (!existsSync(inputPath)) {
      console.error(`❌ File not found: ${inputPath}`);
      continue;
    }

    const ext = extname(inputPath);
    if (!['.webm', '.avi', '.mov', '.mkv', '.flv'].includes(ext.toLowerCase())) {
      console.log(`⏭️  Skipping non-video file: ${inputPath}`);
      continue;
    }

    try {
      console.log(`🔄 Converting: ${inputPath}`);

      // Determine output path
      const baseNameWithoutExt = basename(inputPath, ext);
      const outputFilename = `${baseNameWithoutExt}.mp4`;
      const outputPath = outputDir
        ? join(outputDir, outputFilename)
        : inputPath.replace(ext, '.mp4');

      // Convert video
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .outputOptions([
            '-c:v libx264',
            '-preset fast',
            `-crf ${quality}`,
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
🎬 Video Converter CLI

Converts video files (webm, avi, mov, mkv, flv) to MP4 format.

Usage:
  bun run convert-video.ts <file1> [file2] [file3] ...
  bun run convert-video.ts --pattern "*.webm"
  bun run convert-video.ts --dir <directory>

Options:
  --output, -o <dir>       Output directory (default: same as input)
  --pattern, -p <pattern>  Glob pattern to match files (e.g., "*.webm")
  --dir, -d <directory>    Convert all videos in directory
  --keep, -k               Keep original files after conversion
  --quality, -q <value>    Quality (CRF: 0-51, default: 22, lower is better)
  --help, -h               Show this help message

Examples:
  bun run convert-video.ts video.webm
  bun run convert-video.ts video1.webm video2.webm
  bun run convert-video.ts -p "screenshots/*.webm"
  bun run convert-video.ts -d ./screenshots --keep
  bun run convert-video.ts video.webm -q 18 -o ./converted
`);
    process.exit(0);
  }

  let inputFiles: string[] = [];
  let outputDir: string | undefined;
  let keepOriginal = false;
  let quality = 22;

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
      const glob = new Glob('**/*.{webm,avi,mov,mkv,flv}');
      for await (const file of glob.scan(dir)) {
        inputFiles.push(join(dir, file));
      }
    } else if (arg === '--keep' || arg === '-k') {
      keepOriginal = true;
    } else if (arg === '--quality' || arg === '-q') {
      if (i + 1 >= args.length) {
        console.error('❌ Error: --quality requires a numeric value (0-51)');
        process.exit(1);
      }
      const qualityStr = args[++i];
      if (!qualityStr) {
        console.error('❌ Error: --quality requires a numeric value (0-51)');
        process.exit(1);
      }
      quality = parseInt(qualityStr, 10);
      if (isNaN(quality) || quality < 0 || quality > 51) {
        console.error('❌ Error: quality must be a number between 0 and 51');
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

  await convertToMp4({ inputFiles, outputDir, keepOriginal, quality });

  console.log('\n✨ All conversions completed!');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
