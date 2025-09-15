export interface VobSubDecoderOptions {
  verbose?: boolean;
  idxFile: string;
  subFile: string;
}

export interface SubtitleFrame {
  imagePath: string;
  timestamp: number;
  frameIndex?: number;
}

export interface SrtEntry {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
}

export class VobSubDecoder {
  constructor(options?: VobSubDecoderOptions);

  /**
   * Parse the IDX file to extract metadata and timing information.
   * @returns Promise<this>
   */
  parse(): Promise<this>;

  /**
   * Extract actual subtitle frames using FFmpeg.
   * @param tempDir Temporary directory for frame storage
   * @returns Promise<SubtitleFrame[]>
   */
  extractFrames(tempDir: string): Promise<SubtitleFrame[]>;

  /**
   * Process subtitle frames with OCR and return SRT entries.
   * @param frames Array of subtitle frames
   * @param quality OCR quality: 'fast' or 'accurate'
   * @returns Promise<SrtEntry[]>
   */
  processFrames(
    frames: SubtitleFrame[],
    quality?: "fast" | "accurate",
  ): Promise<SrtEntry[]>;

  /**
   * Generate SRT file from processed subtitle entries.
   * @param srtEntries Array of processed subtitle entries
   * @param outputPath Path where the SRT file will be saved
   * @returns Promise<void>
   */
  generate(srtEntries: SrtEntry[], outputPath: string): Promise<void>;
}
