import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify, parseArgs } from "node:util";
import { tmpdir } from "node:os";
import MacOCR from "@cherrystudio/mac-system-ocr";

const execFileAsync = promisify(execFile);

/**
 * VobSubDecoder - A class for processing VobSub (IDX/SUB) subtitle files
 *
 * This class handles the complete workflow of extracting text from VobSub subtitle files:
 * 1. Parse IDX files for timing and metadata information
 * 2. Use FFmpeg to extract subtitle frames as PNG images
 * 3. Apply OCR (Optical Character Recognition) to convert images to text
 * 4. Generate properly formatted SRT subtitle files
 *
 * @class VobSubDecoder
 */
class VobSubDecoder {
  /**
   * Initialize a new VobSubDecoder instance
   *
   * @constructor
   */
  constructor() {
    /** @type {Object} Metadata from the IDX file including video dimensions */
    this.metadata = {};
    /** @type {Array} Array of subtitle entries with timing and position information */
    this.subtitles = [];
    /** @type {Array} Color palette extracted from the IDX file */
    this.palette = [];
    /** @type {boolean} Whether to enable verbose logging */
    this.verbose = false;
  }

  /**
   * Parse the IDX file to extract metadata and timing information
   *
   * This method reads and parses a VobSub IDX file to extract:
   * - Video dimensions (width x height)
   * - Color palette information
   * - Language settings
   * - Subtitle timing entries with timestamps and file positions
   *
   * @param {string} idxPath - Path to the IDX file to parse
   * @returns {Promise<VobSubDecoder>} Returns this instance for method chaining
   * @throws {Error} If the IDX file cannot be read or parsed
   */
  async parseIdx(idxPath) {
    if (this.verbose) console.log("Reading IDX file...");
    const content = await fs.readFile(idxPath, "utf-8");
    const lines = content.split("\n");

    let currentLanguage = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith("#") || !trimmed) continue;

      // Parse size
      if (trimmed.startsWith("size:")) {
        const [width, height] = trimmed.split(": ")[1].split("x").map(Number);
        this.metadata.size = { width, height };
        if (this.verbose) console.log(`Video size: ${width}x${height}`);
      }

      // Parse palette
      else if (trimmed.startsWith("palette:")) {
        const colors = trimmed.split(": ")[1].split(", ");
        this.palette = colors.map((color) => parseInt(color, 16));
        if (this.verbose) console.log(`Palette: ${this.palette.length} colors`);
      }

      // Parse language info
      else if (trimmed.startsWith("id:")) {
        const parts = trimmed.split(", ");
        currentLanguage = {
          id: parts[0].split(": ")[1],
          index: parseInt(parts[1].split(": ")[1]),
        };
        if (this.verbose) console.log(`Language: ${currentLanguage.id}`);
      }

      // Parse timestamps
      else if (trimmed.startsWith("timestamp:")) {
        const [timestampPart, fileposPart] = trimmed.split(", ");
        const timestamp = timestampPart.split(": ")[1];
        const filepos = parseInt(fileposPart.split(": ")[1], 16);

        this.subtitles.push({
          timestamp: this.parseTimestamp(timestamp),
          filepos: filepos,
          language: currentLanguage,
        });
      }
    }

    console.log(`Parsed ${this.subtitles.length} subtitle entries`);
    return this;
  }

  /**
   * Parse VobSub timestamp format (HH:MM:SS:mmm) and convert to milliseconds
   *
   * VobSub uses a specific timestamp format where the last component represents
   * frame numbers rather than milliseconds. This method converts it to standard
   * milliseconds for easier SRT generation.
   *
   * @param {string} timestamp - Timestamp string in format "HH:MM:SS:mmm"
   * @returns {number} Time in milliseconds
   */
  parseTimestamp(timestamp) {
    const [hours, minutes, seconds, milliseconds] = timestamp
      .split(":")
      .map(Number);
    return (
      hours * 3600000 + minutes * 60000 + seconds * 1000 + milliseconds * 40
    ); // 40ms per frame
  }

  /**
   * Format timestamp for SRT format (HH:MM:SS,mmm)
   *
   * Convert milliseconds to the standard SRT timestamp format with comma
   * separator for milliseconds (as required by SRT specification).
   *
   * @param {number} ms - Time in milliseconds
   * @returns {string} Formatted timestamp string "HH:MM:SS,mmm"
   */
  formatSrtTimestamp(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = ms % 1000;

    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")},${milliseconds.toString().padStart(3, "0")}`;
  }

  /**
   * Clean up common OCR mistakes and filter problematic characters
   *
   * This method applies various text cleaning operations to improve OCR accuracy:
   * - Replace common misidentified characters (/, \, | → I)
   * - Convert special characters to their ASCII equivalents
   * - Remove unwanted characters while preserving punctuation
   * - Normalize whitespace
   *
   * @param {string} text - Raw OCR text to clean
   * @returns {string} Cleaned and normalized text
   */
  cleanOcrText(text) {
    if (!text) return text;

    // Character replacements for common OCR mistakes
    const replacements = {
      "/": "I",
      "\\": "I",
      "|": "I",
      "~": "-",
      "°": "o",
      "¢": "c",
      "£": "E",
      "¥": "Y",
      "§": "S",
      "©": "O",
      "®": "R",
      "±": "+",
      "²": "2",
      "³": "3",
      "¹": "1",
      "¼": "1/4",
      "½": "1/2",
      "¾": "3/4",
      À: "A",
      Á: "A",
      Â: "A",
      Ã: "A",
      Ä: "A",
      Å: "A",
      È: "E",
      É: "E",
      Ê: "E",
      Ë: "E",
      Ì: "I",
      Í: "I",
      Î: "I",
      Ï: "I",
      Ò: "O",
      Ó: "O",
      Ô: "O",
      Õ: "O",
      Ö: "O",
      Ù: "U",
      Ú: "U",
      Û: "U",
      Ü: "U",
    };

    let cleanedText = text;

    // Apply character replacements
    for (const [bad, good] of Object.entries(replacements)) {
      // Escape special regex characters
      const escapedBad = bad.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      cleanedText = cleanedText.replace(new RegExp(escapedBad, "g"), good);
    }

    // Remove or replace other problematic characters
    cleanedText = cleanedText
      .replace(/[^\w\s.,!?;:()\-"']/g, "") // Keep only basic characters
      .replace(/\s+/g, " ") // Collapse multiple spaces
      .trim();

    return cleanedText;
  }

  /**
   * Wrap long lines to fit subtitle display constraints
   *
   * This method intelligently wraps subtitle text to ensure good readability:
   * - Wraps lines longer than maxLength characters
   * - Breaks at word boundaries when possible
   * - Limits to maximum 2 lines per subtitle
   * - Handles long words with hyphenation
   *
   * @param {string} text - Text to wrap
   * @param {number} [maxLength=42] - Maximum characters per line
   * @returns {string} Wrapped text with newlines
   */
  wrapSubtitleText(text, maxLength = 42) {
    if (!text || text.length <= maxLength) return text;

    const words = text.split(" ");
    const lines = [];
    let currentLine = "";

    for (const word of words) {
      // If adding this word would exceed the limit
      if (currentLine.length + word.length + 1 > maxLength) {
        // If we have a current line, save it and start a new one
        if (currentLine.length > 0) {
          lines.push(currentLine.trim());
          currentLine = word;
        } else {
          // Word itself is longer than maxLength, force break it
          if (word.length > maxLength) {
            lines.push(word.substring(0, maxLength - 1) + "-");
            currentLine = word.substring(maxLength - 1);
          } else {
            currentLine = word;
          }
        }
      } else {
        // Add word to current line
        if (currentLine.length > 0) {
          currentLine += " " + word;
        } else {
          currentLine = word;
        }
      }
    }

    // Don't forget the last line
    if (currentLine.length > 0) {
      lines.push(currentLine.trim());
    }

    // Limit to maximum 2 lines for subtitles
    if (lines.length > 2) {
      const firstLine = lines[0];
      const remainingText = lines.slice(1).join(" ");
      return (
        firstLine +
        "\n" +
        this.wrapSubtitleText(remainingText, maxLength).split("\n")[0]
      );
    }

    return lines.join("\n");
  }

  /**
   * Extract actual subtitle frames using FFmpeg
   *
   * This method uses FFmpeg to extract subtitle bitmap frames from VobSub files:
   * - Creates a temporary directory for frame storage
   * - Uses FFmpeg overlay filter to render subtitles on black background
   * - Extracts frames as PNG images with proper timing
   * - Maps extracted frames to subtitle timing information
   *
   * @param {string} idxPath - Path to the IDX file
   * @param {string} subPath - Path to the SUB file
   * @param {string} tempDir - Temporary directory for frame storage
   * @returns {Promise<Array>} Array of subtitle objects with image paths
   * @throws {Error} If FFmpeg extraction fails
   */
  async extractSubtitleFrames(idxPath, subPath, tempDir) {
    if (this.verbose) console.log("Extracting subtitle frames using FFmpeg...");
    const frameDir = path.join(tempDir, "frames");
    await fs.mkdir(frameDir, { recursive: true });

    // Get video dimensions from metadata
    const { width, height } = this.metadata.size || { width: 720, height: 480 };

    // Build FFmpeg command to extract subtitle frames
    const framePattern = path.join(frameDir, "subtitle_frame_%04d.png");

    // Use execFile for better argument handling instead of shell command
    const ffmpegArgs = [
      "-f",
      "lavfi",
      "-i",
      `color=black:size=${width}x${height}:duration=1`,
      "-i",
      idxPath,
      "-i",
      subPath,
      "-filter_complex",
      `[1:s:0]scale=${width}:${height}[sub];[0:v][sub]overlay`,
      "-fps_mode",
      "vfr",
      "-y", // Overwrite existing files
      framePattern,
    ];

    try {
      if (this.verbose) console.log(`Running: ffmpeg ${ffmpegArgs.join(" ")}`);
      const { stderr } = await execFileAsync("ffmpeg", ffmpegArgs);

      if (stderr && !stderr.includes("muxing overhead")) {
        if (this.verbose) console.warn("FFmpeg warnings:", stderr);
      }

      // Find all generated frame files
      const frameFiles = await fs.readdir(frameDir);
      const pngFiles = frameFiles
        .filter((file) => file.endsWith(".png"))
        .sort()
        .map((file) => path.join(frameDir, file));

      if (this.verbose)
        console.log(`Extracted ${pngFiles.length} subtitle frames`);

      // Map frames to subtitle timing information
      const subtitlesWithImages = [];
      for (
        let i = 0;
        i < Math.min(pngFiles.length, this.subtitles.length);
        i++
      ) {
        const subtitle = this.subtitles[i];
        const imagePath = pngFiles[i];

        // Verify the image file exists and has content
        try {
          const stats = await fs.stat(imagePath);
          if (stats.size > 0) {
            subtitlesWithImages.push({
              ...subtitle,
              imagePath,
              frameIndex: i + 1,
            });
          }
        } catch (error) {
          console.warn(`Skipping frame ${imagePath}: ${error.message}`);
        }
      }

      if (this.verbose)
        console.log(
          `Successfully processed ${subtitlesWithImages.length} subtitle frames`,
        );
      return subtitlesWithImages;
    } catch (error) {
      console.error("FFmpeg extraction failed:", error.message);
      throw new Error(`Failed to extract subtitle frames: ${error.message}`);
    }
  }

  /**
   * Process subtitles with Mac System OCR using batch processing
   *
   * This method performs OCR on all extracted subtitle frames using MacOCR:
   * - Uses batch processing for optimal performance
   * - Applies text cleaning and character correction
   * - Wraps long lines for subtitle display
   * - Creates SRT entries with proper timing
   *
   * @param {Array} subtitlesWithImages - Array of subtitle objects with image paths
   * @returns {Promise<Array>} Array of SRT entry objects
   * @throws {Error} If batch OCR processing fails
   */
  async processSubtitlesWithOCR(subtitlesWithImages) {
    console.log("Starting batch OCR processing...");
    const srtEntries = [];

    // Extract all image paths for batch processing
    const imagePaths = subtitlesWithImages.map(
      (subtitle) => subtitle.imagePath,
    );

    if (this.verbose)
      console.log(
        `Processing ${imagePaths.length} frames with MacOCR batch processing...`,
      );

    try {
      // Use MacOCR batch processing for all images at once
      const ocrResults = await MacOCR.recognizeBatchFromPath(imagePaths, {
        maxThreads: 4, // Limit threads to avoid overwhelming the system
        batchSize: 50, // Process in batches of 50 internally
        ocrOptions: {
          recognitionLevel: MacOCR.RECOGNITION_LEVEL_FAST, // Use fast recognition for speed
          minConfidence: 0.3, // Lower confidence threshold to capture more text
        },
      });

      if (this.verbose)
        console.log(`OCR batch processing completed. Processing results...`);

      // Process results and create SRT entries
      for (let i = 0; i < subtitlesWithImages.length; i++) {
        const subtitle = subtitlesWithImages[i];
        const nextSubtitle = subtitlesWithImages[i + 1];
        const ocrResult = ocrResults[i];

        try {
          let text = ocrResult?.text || "";

          // Clean up OCR text and apply character fixes
          text = this.cleanOcrText(text);

          // Check if OCR found meaningful text after cleaning
          if (!text || text.trim().length < 2) {
            if (this.verbose)
              console.log(
                `  No text detected in frame ${subtitle.frameIndex || i + 1}`,
              );
            continue;
          }

          // Wrap long lines
          const wrappedText = this.wrapSubtitleText(text.trim());

          if (this.verbose)
            console.log(
              `  Frame ${subtitle.frameIndex || i + 1}: "${wrappedText.replace(/\n/g, " | ")}"`,
            );

          const startTime = subtitle.timestamp;
          const endTime = nextSubtitle
            ? nextSubtitle.timestamp
            : startTime + 3000; // 3 second default

          srtEntries.push({
            index: srtEntries.length + 1,
            startTime,
            endTime,
            text: wrappedText,
          });
        } catch (error) {
          console.warn(
            `Processing failed for subtitle frame ${subtitle.frameIndex || i + 1}:`,
            error.message,
          );
        }
      }
    } catch (error) {
      console.error("Batch OCR processing failed:", error.message);
      throw new Error(`Failed to process subtitles with OCR: ${error.message}`);
    }

    if (this.verbose)
      console.log(
        `Completed batch OCR processing of ${subtitlesWithImages.length} frames`,
      );
    return srtEntries;
  }

  /**
   * Generate SRT file from processed subtitle entries
   *
   * Creates a properly formatted SRT subtitle file with:
   * - Sequential numbering for each subtitle
   * - Proper timestamp formatting (HH:MM:SS,mmm --> HH:MM:SS,mmm)
   * - Text content with line wrapping
   * - Blank lines between entries as per SRT specification
   *
   * @param {Array} srtEntries - Array of processed subtitle entries
   * @param {string} outputPath - Path where the SRT file will be saved
   * @returns {Promise<void>}
   * @throws {Error} If file writing fails
   */
  async generateSRT(srtEntries, outputPath) {
    const srtContent = srtEntries
      .map((entry) => {
        return [
          entry.index,
          `${this.formatSrtTimestamp(entry.startTime)} --> ${this.formatSrtTimestamp(entry.endTime)}`,
          entry.text,
          "",
        ].join("\n");
      })
      .join("\n");

    await fs.writeFile(outputPath, srtContent, "utf-8");
    if (this.verbose) console.log(`Generated SRT file: ${outputPath}`);
  }
}

/**
 * Parse and validate command line arguments
 *
 * @returns {Object} Parsed arguments object
 */
function parseCliArgs() {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        input: {
          type: "string",
          short: "i",
          description: "Path to the input IDX file",
        },
        output: {
          type: "string",
          short: "o",
          description: "Path for the output SRT file",
        },
        verbose: {
          type: "boolean",
          short: "v",
          description: "Enable verbose logging",
          default: false,
        },
        help: {
          type: "boolean",
          short: "h",
          description: "Show help information",
          default: false,
        },
      },
      allowPositional: false,
    });

    return values;
  } catch (error) {
    console.error(`Error parsing arguments: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Display help information
 */
function showHelp() {
  console.log("VobSub to SRT Decoder");
  console.log("=====================");
  console.log("");
  console.log(
    "Convert VobSub (IDX/SUB) subtitle files to SRT format using FFmpeg and OCR",
  );
  console.log("");
  console.log("Usage:");
  console.log("  node index.js -i <input.idx> -o <output.srt> [options]");
  console.log("");
  console.log("Options:");
  console.log("  -i, --input <file>   Path to the input IDX file (required)");
  console.log("  -o, --output <file>  Path for the output SRT file (required)");
  console.log("  -v, --verbose        Enable verbose logging");
  console.log("  -h, --help           Show this help message");
  console.log("");
  console.log("Requirements:");
  console.log("  - FFmpeg must be installed and available in PATH");
  console.log("  - Mac System OCR (macOS only)");
  console.log("");
  console.log("Features:");
  console.log("  1. Parses IDX files for timing and metadata");
  console.log("  2. Uses FFmpeg to extract subtitle bitmap frames");
  console.log("  3. Applies OCR to convert images to text");
  console.log("  4. Generates properly formatted SRT files");
  console.log("  5. Includes text cleaning and line wrapping");
}

/**
 * Main CLI function
 *
 * Orchestrates the complete VobSub to SRT conversion process:
 * 1. Parse command line arguments
 * 2. Validate input files
 * 3. Create temporary directory for processing
 * 4. Extract subtitle frames using FFmpeg
 * 5. Process frames with OCR
 * 6. Generate SRT output file
 * 7. Clean up temporary files
 */
async function main() {
  const args = parseCliArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  // gate run running in non-macos
  if (process.platform !== "darwin") {
    console.error("Error: This tool is only supported on macOS");
    process.exit(1);
  }

  if (!args.input || !args.output) {
    console.error(
      "Error: Both input (-i) and output (-o) arguments are required",
    );
    console.error("");
    showHelp();
    process.exit(1);
  }

  // Set up verbose logging
  const verbose = args.verbose;
  const idxPath = args.input;
  const outputPath = args.output;

  if (verbose) {
    console.log("VobSub to SRT Decoder");
    console.log("=====================");
    console.log(`Input IDX file: ${idxPath}`);
    console.log(`Output SRT file: ${outputPath}`);
    console.log(`Verbose logging: enabled`);
    console.log("");
  }

  // Create temporary directory for processing
  let tempDir;

  try {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "vobsub-"));
    if (verbose) console.log(`Created temporary directory: ${tempDir}`);

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    // Check if IDX file exists
    try {
      await fs.access(idxPath);
    } catch (error) {
      console.error(`Cannot access IDX file: ${error.message}`);
      process.exit(1);
    }

    // Determine SUB file path (should be alongside IDX file)
    const subPath = idxPath.replace(/\.idx$/i, ".sub");

    // Check if both IDX and SUB files exist
    try {
      await fs.access(subPath);
    } catch (_error) {
      console.error(`Cannot access SUB file: ${subPath}`);
      console.error("SUB file must be in the same directory as IDX file");
      process.exit(1);
    }

    if (verbose) {
      console.log(`SUB file: ${subPath}`);
      console.log(`Temporary directory: ${tempDir}`);
      console.log("");
    }

    // Initialize decoder
    const decoder = new VobSubDecoder();
    decoder.verbose = verbose;

    // Parse IDX file for timing information
    await decoder.parseIdx(idxPath);

    if (decoder.subtitles.length === 0) {
      console.error("No subtitle timing entries found in IDX file");
      process.exit(1);
    }

    // Extract actual subtitle frames using FFmpeg
    const subtitlesWithImages = await decoder.extractSubtitleFrames(
      idxPath,
      subPath,
      tempDir,
    );

    if (subtitlesWithImages.length === 0) {
      console.error("No subtitle images could be created");
      process.exit(1);
    }

    // Process with Mac System OCR
    if (verbose) console.log("\nStarting Mac System OCR processing...");
    const srtEntries =
      await decoder.processSubtitlesWithOCR(subtitlesWithImages);

    if (srtEntries.length === 0) {
      console.error("No text could be extracted from subtitles");
      process.exit(1);
    }

    // Generate SRT file
    await decoder.generateSRT(srtEntries, outputPath);

    console.log(`\n✅ Conversion complete!`);
    if (verbose) {
      console.log(`📊 Statistics:`);
      console.log(
        `   - Parsed ${decoder.subtitles.length} timing entries from IDX`,
      );
      console.log(
        `   - Extracted ${subtitlesWithImages.length} subtitle frames using FFmpeg`,
      );
      console.log(`   - Generated ${srtEntries.length} SRT entries via OCR`);
      console.log(`📁 SRT Output: ${outputPath}`);
    }
  } catch (error) {
    console.error("\nError during processing:", error.message);
    if (verbose || process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    // Clean up temporary directory
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        if (verbose) console.log(`Cleaned up temporary directory: ${tempDir}`);
      } catch (cleanupError) {
        if (verbose)
          console.warn(
            `Failed to clean up temporary directory: ${cleanupError.message}`,
          );
      }
    }
  }
}

// Run the main function
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
