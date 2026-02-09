#!/usr/bin/env bun
import sharp from 'sharp';
import { existsSync, unlinkSync } from 'fs';
import { basename, extname, join } from 'path';
import { Glob } from 'bun';

interface ConvertOptions {
  inputFiles: string[];
  outputDir?: string;
  keepOriginal?: boolean;
  quality?: number; // 0-100
  maxWidth?: number;
  maxHeight?: number;
}

async function convertToWebP({
  inputFiles,
  outputDir,
  keepOriginal = true,
  quality = 80,
  maxWidth,
  maxHeight,
}: ConvertOptions): Promise<void> {
  for (const inputPath of inputFiles) {
    if (!existsSync(inputPath)) {
      console.error(`❌ File not found: ${inputPath}`);
      continue;
    }

    const ext = extname(inputPath).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.gif', '.tiff', '.tif', '.bmp', '.webp'].includes(ext)) {
      console.log(`⏭️  Skipping non-image file: ${inputPath}`);
      continue;
    }

    try {
      console.log(`🔄 Converting: ${inputPath}`);

      // Determine output path
      const baseNameWithoutExt = basename(inputPath, ext);
      let outputFilename: string;
      let outputPath: string;
      
      if (ext.toLowerCase() === '.webp' && !outputDir) {
        // If input is already webp and no output dir specified, add -optimized suffix
        outputFilename = `${baseNameWithoutExt}-optimized.webp`;
        outputPath = inputPath.replace(basename(inputPath), outputFilename);
      } else {
        outputFilename = `${baseNameWithoutExt}.webp`;
        outputPath = outputDir
          ? join(outputDir, outputFilename)
          : inputPath.replace(ext, '.webp');
      }

      // Load image
      let image = sharp(inputPath);

      // Get image metadata
      const metadata = await image.metadata();
      const originalSize = (await Bun.file(inputPath).arrayBuffer()).byteLength;

      // Resize if dimensions are specified
      if (maxWidth || maxHeight) {
        image = image.resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      // Convert to WebP
      await image
        .webp({
          quality,
          effort: 6, // Compression effort (0-6, higher is slower but better)
        })
        .toFile(outputPath);

      // Get output file size
      const outputSize = (await Bun.file(outputPath).arrayBuffer()).byteLength;
      const savings = ((1 - outputSize / originalSize) * 100).toFixed(1);
      const sizeMB = (outputSize / 1024 / 1024).toFixed(2);

      console.log(`✅ Converted: ${outputPath}`);
      console.log(`   Size: ${sizeMB}MB (${savings}% reduction)`);
      if (maxWidth || maxHeight) {
        console.log(`   Original: ${metadata.width}x${metadata.height}`);
      }

      // Remove original file if requested
      if (!keepOriginal && ext !== '.webp') {
        try {
          unlinkSync(inputPath);
          console.log(`🗑️  Removed original: ${inputPath}`);
        } catch (err) {
          console.error(`⚠️  Could not remove original file: ${err}`);
        }
      }
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
🖼️  Image to WebP Converter CLI

Converts images (png, jpg, jpeg, gif, tiff, bmp) to optimized WebP format.

Usage:
  bun run convert-image.ts <file1> [file2] [file3] ...
  bun run convert-image.ts --pattern "*.png"
  bun run convert-image.ts --dir <directory>

Options:
  --output, -o <dir>       Output directory (default: same as input)
  --pattern, -p <pattern>  Glob pattern to match files (e.g., "*.png")
  --dir, -d <directory>    Convert all images in directory
  --keep, -k               Keep original files (default: yes)
  --remove, -r             Remove original files after conversion
  --quality, -q <value>    Quality (0-100, default: 80)
  --width, -w <pixels>     Max width (maintains aspect ratio)
  --height, -h <pixels>    Max height (maintains aspect ratio)
  --help                   Show this help message

Examples:
  bun run convert-image.ts image.png
  bun run convert-image.ts image1.jpg image2.png
  bun run convert-image.ts -p "screenshots/*.png"
  bun run convert-image.ts -d ./screenshots
  bun run convert-image.ts image.jpg -q 90 -w 1920 --remove
  bun run convert-image.ts -p "*.png" -w 1200 -o ./optimized
`);
    process.exit(0);
  }

  let inputFiles: string[] = [];
  let outputDir: string | undefined;
  let keepOriginal = true;
  let quality = 80;
  let maxWidth: number | undefined;
  let maxHeight: number | undefined;

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
      const glob = new Glob('**/*.{png,jpg,jpeg,gif,tiff,tif,bmp}');
      for await (const file of glob.scan(dir)) {
        inputFiles.push(join(dir, file));
      }
    } else if (arg === '--keep' || arg === '-k') {
      keepOriginal = true;
    } else if (arg === '--remove' || arg === '-r') {
      keepOriginal = false;
    } else if (arg === '--quality' || arg === '-q') {
      if (i + 1 >= args.length) {
        console.error('❌ Error: --quality requires a numeric value (0-100)');
        process.exit(1);
      }
      const qualityStr = args[++i];
      if (!qualityStr) {
        console.error('❌ Error: --quality requires a numeric value (0-100)');
        process.exit(1);
      }
      quality = parseInt(qualityStr, 10);
      if (isNaN(quality) || quality < 0 || quality > 100) {
        console.error('❌ Error: quality must be a number between 0 and 100');
        process.exit(1);
      }
    } else if (arg === '--width' || arg === '-w') {
      if (i + 1 >= args.length) {
        console.error('❌ Error: --width requires a numeric value');
        process.exit(1);
      }
      const widthStr = args[++i];
      if (!widthStr) {
        console.error('❌ Error: --width requires a numeric value');
        process.exit(1);
      }
      maxWidth = parseInt(widthStr, 10);
      if (isNaN(maxWidth) || maxWidth <= 0) {
        console.error('❌ Error: width must be a positive number');
        process.exit(1);
      }
    } else if (arg === '--height') {
      if (i + 1 >= args.length) {
        console.error('❌ Error: --height requires a numeric value');
        process.exit(1);
      }
      const heightStr = args[++i];
      if (!heightStr) {
        console.error('❌ Error: --height requires a numeric value');
        process.exit(1);
      }
      maxHeight = parseInt(heightStr, 10);
      if (isNaN(maxHeight) || maxHeight <= 0) {
        console.error('❌ Error: height must be a positive number');
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
  console.log(`🎯 Quality: ${quality}`);
  if (maxWidth || maxHeight) {
    console.log(`📐 Max dimensions: ${maxWidth || '∞'}x${maxHeight || '∞'}`);
  }
  console.log(`🗑️  Keep originals: ${keepOriginal ? 'yes' : 'no'}`);
  console.log('');

  await convertToWebP({ inputFiles, outputDir, keepOriginal, quality, maxWidth, maxHeight });

  console.log('\n✨ All conversions completed!');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
