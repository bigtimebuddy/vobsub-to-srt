# VobSub to SRT Converter

Convert VobSub (IDX/SUB) subtitle files to SRT format using FFmpeg and Mac System OCR. This approach has some benefits over [vobsub2srt](https://github.com/ruediger/VobSub2SRT) and [vobsubocr](https://github.com/elizagamedev/vobsubocr) in that Mac System OCR is generally more fast, accurate and built-in.

## Overview

This tool provides a complete solution for converting VobSub bitmap subtitles (commonly found on DVDs) to text-based SRT subtitle files. It handles the entire workflow:

1. **Parse IDX files** for timing and metadata information
2. **Extract subtitle frames** as PNG images using FFmpeg
3. **Apply OCR** (Optical Character Recognition) to convert images to text
4. **Generate SRT files** with proper formatting and timing

## Features

- 🎯 **Accurate Conversion**: Uses Mac System OCR for high-quality text recognition
- ⚡ **Batch Processing**: Efficient batch OCR processing for optimal performance
- 🧹 **Text Cleaning**: Automatic correction of common OCR mistakes and character replacements
- 📏 **Smart Wrapping**: Intelligent line wrapping for subtitle display constraints
- 🔧 **CLI Interface**: Easy-to-use command line tool
- 📊 **Verbose Logging**: Detailed progress reporting and statistics

## Requirements

- **macOS**: This tool uses Mac System OCR and only runs on macOS
- **Node.js**: Version 22.0.0 or higher

## Installation

### Global Installation (Recommended)

```bash
npm install -g vobsub-to-srt
```

After global installation, you can use the `vobsub-to-srt` command anywhere:

```bash
vobsub-to-srt -i input.idx -o output.srt
```

### Local Installation

```bash
npm install vobsub-to-srt
```

Then run using npx:

```bash
npx vobsub-to-srt -i input.idx -o output.srt
```

## Usage

### Basic Usage

```bash
vobsub-to-srt -i path/to/subtitles.idx -o path/to/output.srt
```

### With Verbose Logging

```bash
vobsub-to-srt -i subtitles.idx -o subtitles.srt -v
```

### Command Line Options

| Option      | Short | Description                  | Required |
| ----------- | ----- | ---------------------------- | -------- |
| `--input`   | `-i`  | Path to the input IDX file   | ✅ Yes   |
| `--output`  | `-o`  | Path for the output SRT file | ✅ Yes   |
| `--verbose` | `-v`  | Enable verbose logging       | ❌ No    |
| `--help`    | `-h`  | Show help information        | ❌ No    |

### Example Output

```
VobSub to SRT Decoder
=====================
Input IDX file: /path/to/movie.idx
Output SRT file: /path/to/movie.srt
Verbose logging: enabled

Reading IDX file...
Video size: 720x480
Palette: 16 colors
Language: en
Parsed 342 subtitle entries
Extracting subtitle frames using FFmpeg...
Extracted 342 subtitle frames
Starting batch OCR processing...
Processing 342 frames with MacOCR batch processing...
OCR batch processing completed. Processing results...

✅ Conversion complete!
📊 Statistics:
   - Parsed 342 timing entries from IDX
   - Extracted 342 subtitle frames using FFmpeg
   - Generated 338 SRT entries via OCR
📁 SRT Output: /path/to/movie.srt
```

## File Requirements

Your VobSub files should include both:

- **IDX file**: Contains timing information and metadata
- **SUB file**: Contains the actual subtitle bitmap data

The SUB file must be in the same directory as the IDX file and have the same filename (e.g., `movie.idx` and `movie.sub`).

## How It Works

### 1. IDX File Parsing

- Extracts video dimensions, color palette, and language information
- Parses subtitle timing entries with precise timestamps
- Maps file positions for subtitle data

### 2. Frame Extraction

- Uses FFmpeg to render subtitle bitmaps as PNG images
- Creates temporary frames with proper scaling and positioning
- Handles various subtitle formats and encodings

### 3. OCR Processing

- Applies Mac System OCR with optimized settings for subtitle text
- Processes frames in batches for maximum efficiency
- Uses fast recognition with confidence thresholds

### 4. Text Processing

- Cleans common OCR mistakes and character misidentifications
- Applies intelligent line wrapping for subtitle display
- Formats timing according to SRT specification

### 5. SRT Generation

- Creates properly formatted SRT files with sequential numbering
- Ensures correct timestamp formatting (`HH:MM:SS,mmm`)
- Handles subtitle duration and overlap resolution

## Programming Interface

You can also use this package programmatically:

```javascript
import VobSubDecoder from "@bigtimebuddy/vobsub-to-srt";

const decoder = new VobSubDecoder();
decoder.verbose = true;

// Parse IDX file
await decoder.parseIdx("subtitles.idx");

// Extract frames to temporary directory
const subtitlesWithImages = await decoder.extractSubtitleFrames(
  "subtitles.idx",
  "subtitles.sub",
  "/tmp/frames",
);

// Process with OCR
const srtEntries = await decoder.processSubtitlesWithOCR(subtitlesWithImages);

// Generate SRT file
await decoder.generateSRT(srtEntries, "output.srt");
```

## Troubleshooting

### Common Issues

**"Cannot access SUB file"**

- Ensure both IDX and SUB files are present
- Verify files have the same base name (e.g., `movie.idx` and `movie.sub`)
- Check file permissions

**"No text could be extracted"**

- The subtitle images may be too low quality for OCR
- Try with verbose mode (`-v`) to see processing details
- Ensure subtitles contain text (not just graphics)

**"This tool is only supported on macOS"**

- This limitation exists because the tool uses Mac System OCR
- Alternative OCR solutions could be implemented for other platforms

## Development

### Running from Source

```bash
git clone https://github.com/bigtimebuddy/vobsub-to-srt.git
cd vobsub-to-srt
npm install
npm test
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## Repository

https://github.com/bigtimebuddy/vobsub-to-srt
