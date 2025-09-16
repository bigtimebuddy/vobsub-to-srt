export interface VobSubDecoderOptions {
  verbose?: boolean;
  idxFile: string;
  subFile: string;
}

export type TimelineEntry = Omit<SrtEntry, "text">;
export interface SrtEntry extends TimelineEntry {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
}

export class VobSubDecoder {
  /**
   * Create a new VobSub decoder instance
   * @param options Options for the VobSub decoder
   */
  constructor(options: VobSubDecoderOptions);

  /**
   * Parse the IDX file to extract metadata and timing information.
   * @returns Promise<this>
   */
  parse(): Promise<this>;

  /**
   * Process subtitle frames with OCR and return SRT entries.
   * @param options Object containing tempDir and quality options
   * @returns Promise<SrtEntry[]>
   */
  processFrames(options: {
    tempDir: string;
    quality?: "fast" | "accurate";
  }): Promise<SrtEntry[]>;

  /**
   * Generate SRT file from processed subtitle entries.
   * @param srtEntries Array of processed subtitle entries
   * @param outputPath Path where the SRT file will be saved
   * @returns Promise<void>
   */
  generate(srtEntries: SrtEntry[], outputPath: string): Promise<void>;
}
