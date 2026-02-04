# web-scraping

CLI script in TypeScript to take mobile screenshots of websites using Puppeteer and Bun.

## Features

- 📱 Mobile viewport screenshots (iPhone 12 Pro simulation)
- 🎯 Viewport-only capture (initial screen, not full page)
- 🚀 Runs with Bun runtime
- 📝 Multiple input methods (command line, file)
- 🎨 Customizable output directory

## Prerequisites

- [Bun](https://bun.sh) runtime installed
- Node.js dependencies (installed automatically)

## Installation

```bash
# Clone the repository
git clone https://github.com/akirazcode/web-scraping.git
cd web-scraping

# Install dependencies
npm install
# or
bun install
```

## Usage

### Basic Usage

Take screenshot of a single website:
```bash
bun run screenshot.ts https://example.com
```

### Multiple URLs

Screenshot multiple websites:
```bash
bun run screenshot.ts https://example.com https://github.com https://google.com
```

### From File

Create a text file with URLs (one per line):
```bash
# urls.txt
https://example.com
https://github.com
https://google.com
```

Then run:
```bash
bun run screenshot.ts --file urls.txt
```

### Custom Output Directory

Specify where screenshots should be saved:
```bash
bun run screenshot.ts -o ./my-screenshots https://example.com
```

### NPM Script

You can also use the npm script:
```bash
npm run screenshot -- https://example.com
```

## Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--output` | `-o` | Output directory | `./screenshots` |
| `--file` | `-f` | Read URLs from file | - |
| `--help` | `-h` | Show help message | - |

## Mobile Viewport Configuration

The script simulates an iPhone 12 Pro with:
- Width: 390px
- Height: 844px
- Device Scale Factor: 3x
- Touch support enabled
- Mobile user agent

## Output

Screenshots are saved as PNG files with the following naming format:
```
<hostname>_<timestamp>.png
```

Example: `example_com_1706999999999.png`

## Examples

```bash
# Single URL
bun run screenshot.ts https://example.com

# Multiple URLs
bun run screenshot.ts https://example.com https://github.com

# From file with custom output
bun run screenshot.ts -f urls.txt -o ./output

# Using the example file
bun run screenshot.ts -f urls-example.txt
```

## Error Handling

The script continues execution even if individual URLs fail. Errors are logged to the console but don't stop the entire process.

## License

MIT

