import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { tmpdir } from "node:os";
import { VobSubDecoder } from "./VobSubDecoder.js";

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
        quality: {
          type: "string",
          short: "q",
          description: "OCR quality level: 'fast' or 'accurate'",
          default: "fast",
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
  console.log(
    "  -q, --quality <level> OCR quality: 'fast' or 'accurate' (default: accurate)",
  );
  console.log("  -h, --help           Show this help message");
  console.log("");
  console.log("Requirements:");
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

  // Validate quality argument
  if (args.quality && !["fast", "accurate"].includes(args.quality)) {
    console.error(
      `Error: Invalid quality level '${args.quality}'. Must be 'fast' or 'accurate'`,
    );
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
    const decoder = new VobSubDecoder({ verbose });

    // Parse IDX file for timing information
    await decoder.parseIdx(idxPath);

    if (decoder.subtitles.length === 0) {
      console.error("No subtitle timing entries found in IDX file");
      process.exit(1);
    }

    // Extract actual subtitle frames using FFmpeg
    const frames = await decoder.extractFrames(idxPath, subPath, tempDir);

    if (frames.length === 0) {
      console.error("No subtitle images could be created");
      process.exit(1);
    }

    // Process with Mac System OCR
    if (verbose)
      console.log(
        `\nStarting Mac System OCR processing (${args.quality} quality)...`,
      );
    const srtEntries = await decoder.processFrames(frames, args.quality);

    if (srtEntries.length === 0) {
      console.error("No text could be extracted from subtitles");
      process.exit(1);
    }

    // Generate SRT file
    await decoder.generate(srtEntries, outputPath);

    console.log(`\n✅ Conversion complete!`);
    if (verbose) {
      console.log(`📊 Statistics:`);
      console.log(
        `   - Parsed ${decoder.subtitles.length} timing entries from IDX`,
      );
      console.log(
        `   - Extracted ${frames.length} subtitle frames using FFmpeg`,
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
