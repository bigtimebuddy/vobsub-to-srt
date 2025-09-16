import fs from "node:fs/promises";
import path from "node:path";
import { spawnPromise } from "./utils.js";
import MacOCR from "@cherrystudio/mac-system-ocr";
import ffmpegStatic from "ffmpeg-static";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

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
   * @param {Object} options - Options for the VobSubDecoder
   * @param {boolean} [options.verbose=false] - Whether to enable verbose logging
   * @param {string} options.idxFile - Path to the IDX file
   * @param {string} options.subFile - Path to the SUB file
   */
  constructor(options = {}) {
    /**
     * @type {Object} Metadata from the IDX file including video dimensions
     * @private
     */
    this.metadata = {};
    /**
     * @type {boolean} Whether to enable verbose logging
     * @private
     */
    this.verbose = options.verbose ?? false;
    /**
     * @type {string} Path to the IDX file
     * @private
     */
    this.idxFile = options.idxFile;
    /**
     * @type {string} Path to the SUB file
     * @private
     */
    this.subFile = options.subFile;
    /**
     * @type {Array} Timeline of subtitle entries
     * @private
     */
    this.timeline = [];
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
   * @returns {Promise<VobSubDecoder>} Returns this instance for method chaining
   * @throws {Error} If the IDX file cannot be read or parsed
   */
  async parse() {
    if (this.verbose) console.log("Reading IDX file...");
    const content = await fs.readFile(this.idxFile, "utf-8");
    const match = content.match(/size:\s*(\d+)x(\d+)/);
    if (match) {
      Object.assign(this.metadata, {
        width: parseInt(match[1]),
        height: parseInt(match[2]),
      });
      if (this.verbose) console.log(`Video size: ${match[1]}x${match[2]}`);
    }
    this.timeline = await this.parseTimeline();
    return this;
  }

  /**
   * Format timestamp for SRT format (HH:MM:SS,mmm)
   *
   * Convert milliseconds to the standard SRT timestamp format with comma
   * separator for milliseconds (as required by SRT specification).
   *
   * @private
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
   * @private
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
   * @private
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
   * Extract the timeline from the IDX file
   * @private
   * @returns {Promise<Array>} Array of timeline entries
   */
  async parseTimeline() {
    const ffmpegArgs = [
      "-i",
      this.idxFile,
      "-i",
      this.subFile,
      "-filter_complex",
      "[0:s:0]showinfo",
      "-f",
      "null",
      "-",
    ];
    // Parse frame information into a timeline, at this point
    // we don't know which subtitle each frame belongs to frame
    // so we compose a data timeline and a set of images
    const { stderr: showInfo } = await spawnPromise(ffmpegStatic, ffmpegArgs);
    const timeline = [];
    const lines = showInfo.split("\n");
    let textIndex = 0;
    for (const line of lines) {
      const match = line.match(
        /n:\s*\d+\s+.*pts_time:\s*(\d+\.?\d*)\s+.*checksum:([A-F0-9]+)/,
      );
      if (match) {
        const startTime = Math.round(parseFloat(match[1]) * 1000); // Convert to milliseconds
        const checksum = match[2];
        if (checksum !== "00000000") {
          timeline.push({
            index: textIndex,
            startTime,
            endTime: startTime + 3000,
          });
          textIndex++;
        } else if (timeline.length > 0) {
          timeline[textIndex - 1].endTime = startTime;
        }
      }
    }
    return timeline;
  }

  /**
   * Extract actual subtitle frames using FFmpeg
   *
   * This method uses FFmpeg to extract subtitle bitmap frames from VobSub files:
   * - Creates a temporary directory for frame storage
   * - Uses FFmpeg overlay filter to render subtitles on black background
   * - Extracts frames as PNG images
   *
   * @private
   * @param {string} subPath - Path to the SUB file
   * @param {string} tempDir - Temporary directory for frame storage
   * @returns {Promise<string[]>} Array of subtitle objects with image paths
   * @throws {Error} If FFmpeg extraction fails
   */
  async generateFrames(tempDir) {
    if (this.verbose) console.log("Extracting subtitle frames using FFmpeg...");
    const frameDir = path.join(tempDir, "frames");
    await fs.mkdir(frameDir, { recursive: true });
    const { width, height } = this.metadata;
    const framePattern = path.join(frameDir, "subtitle_frame_%04d.png");
    const ffmpegArgs = [
      "-f",
      "lavfi",
      "-i",
      `color=black:size=${width}x${height}:duration=1`,
      "-i",
      this.idxFile,
      "-i",
      this.subFile,
      "-filter_complex",
      `[1:s:0]scale=${width}:${height}[sub];[0:v][sub]overlay`,
      "-fps_mode",
      "vfr",
      "-y",
      framePattern,
    ];

    await execFileAsync(ffmpegStatic, ffmpegArgs);

    // Extract all the images from the frame directory
    const frames = (await fs.readdir(frameDir))
      .filter((file) => file.endsWith(".png"))
      .sort()
      .map((file) => path.join(frameDir, file));

    if (this.verbose) {
      console.log(`Extracted ${frames.length} subtitle frames with timestamps`);
    }

    return frames;
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
   * @param {Array} images - Array of subtitle objects with image paths
   * @returns {Promise<Array>} Array of SRT entry objects
   * @throws {Error} If batch OCR processing fails
   */
  async processFrames({ quality = "fast", tempDir }) {
    const frames = await this.generateFrames(tempDir);
    if (frames.length === 0) {
      throw new Error("No subtitle images could be created");
    }
    const { timeline } = this;

    console.log("Starting batch OCR processing...");

    if (this.verbose)
      console.log(
        `Processing ${frames.length} frames with MacOCR batch processing...`,
      );

    try {
      // Map quality level to MacOCR constants
      const recognitionLevel =
        quality === "fast"
          ? MacOCR.RECOGNITION_LEVEL_FAST
          : MacOCR.RECOGNITION_LEVEL_ACCURATE;

      // Use MacOCR batch processing for all images at once
      const ocrResults = await MacOCR.recognizeBatchFromPath(frames, {
        maxThreads: 4, // Limit threads to avoid overwhelming the system
        batchSize: 100, // Process in batches of 100 internally
        ocrOptions: {
          recognitionLevel,
          minConfidence: 0.5, // Lower confidence threshold to capture more text
        },
      });

      if (this.verbose)
        console.log(`OCR batch processing completed. Processing results...`);

      const cleanedTexts = ocrResults
        .map((ocrResult) => {
          const text = this.cleanOcrText(ocrResult?.text || "");
          return this.wrapSubtitleText(text.trim());
        })
        .filter((text) => text.length > 0);

      const srtEntries = timeline
        .map((entry, i) => {
          const text = cleanedTexts[i] ?? "";
          if (!text) {
            return null;
          }
          if (this.verbose)
            console.log(`  Frame ${i}: "${text.replace(/\n/g, " | ")}"`);
          return { ...entry, text };
        })
        .filter((entry) => entry !== null);

      if (this.verbose)
        console.log(
          `Completed batch OCR processing of ${frames.length} frames, generated ${srtEntries.length} subtitle entries`,
        );
      return srtEntries;
    } catch (error) {
      console.error("Batch OCR processing failed:", error.message, error.stack);
      throw new Error(`Failed to process subtitles with OCR: ${error.message}`);
    }
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
  async generate(srtEntries, outputPath) {
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

export { VobSubDecoder };
