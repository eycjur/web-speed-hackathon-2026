import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface SoundMetadata {
  artist?: string;
  title?: string;
}

const RIFF_CHUNK_HEADER_SIZE = 8;
const LIST_TYPE_SIZE = 4;

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  return Buffer.from(bytes.subarray(start, start + length)).toString("ascii");
}

function readUint32LE(bytes: Uint8Array, start: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(start, true);
}

async function withTempDir<T>(fn: (dirPath: string) => Promise<T>): Promise<T> {
  const dirPath = await fs.mkdtemp(path.join(tmpdir(), "cax-meta-"));
  try {
    return await fn(dirPath);
  } finally {
    await fs.rm(dirPath, { force: true, recursive: true });
  }
}

// WAVのRIFF INFOチャンクはShift-JIS（Windows由来）のことがある。
// UTF-8として不正なバイト列であれば Shift-JIS にフォールバックする。
function decodeWithFallback(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("shift_jis").decode(bytes);
  }
}

function parseFFmetadata(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split("\n")) {
    if (line.startsWith(";") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key && value) result[key] = value;
  }
  return result;
}

function parseRiffInfoMetadata(data: Uint8Array): SoundMetadata {
  if (data.byteLength < 12 || readAscii(data, 0, 4) !== "RIFF" || readAscii(data, 8, 4) !== "WAVE") {
    return {};
  }

  const metadata: SoundMetadata = {};
  let offset = 12;

  while (offset + RIFF_CHUNK_HEADER_SIZE <= data.byteLength) {
    const chunkId = readAscii(data, offset, 4);
    const chunkSize = readUint32LE(data, offset + 4);
    const chunkDataStart = offset + RIFF_CHUNK_HEADER_SIZE;
    const chunkDataEnd = chunkDataStart + chunkSize;

    if (chunkDataEnd > data.byteLength) {
      break;
    }

    if (chunkId === "LIST" && chunkSize >= LIST_TYPE_SIZE && readAscii(data, chunkDataStart, 4) === "INFO") {
      let infoOffset = chunkDataStart + LIST_TYPE_SIZE;

      while (infoOffset + RIFF_CHUNK_HEADER_SIZE <= chunkDataEnd) {
        const infoId = readAscii(data, infoOffset, 4);
        const infoSize = readUint32LE(data, infoOffset + 4);
        const infoDataStart = infoOffset + RIFF_CHUNK_HEADER_SIZE;
        const infoDataEnd = infoDataStart + infoSize;

        if (infoDataEnd > chunkDataEnd) {
          break;
        }

        const valueBytes = data.subarray(infoDataStart, infoDataEnd);
        const nulIndex = valueBytes.indexOf(0);
        const decoded = decodeWithFallback(
          nulIndex >= 0 ? valueBytes.subarray(0, nulIndex) : valueBytes,
        ).trim();

        if (decoded !== "") {
          if (infoId === "IART") {
            metadata.artist = decoded;
          } else if (infoId === "INAM") {
            metadata.title = decoded;
          }
        }

        infoOffset = infoDataEnd + (infoSize % 2);
      }
    }

    offset = chunkDataEnd + (chunkSize % 2);
  }

  return metadata;
}

export async function extractMetadataFromSound(data: Buffer): Promise<SoundMetadata> {
  const riffMetadata = parseRiffInfoMetadata(data);
  if (riffMetadata.artist != null && riffMetadata.title != null) {
    return riffMetadata;
  }

  try {
    const ffmpegMetadata = await withTempDir(async (dirPath) => {
      const inputPath = path.join(dirPath, "input");
      const metaPath = path.join(dirPath, "meta.txt");

      await fs.writeFile(inputPath, data);

      // ffmpegでffmetadata形式としてメタデータをファイルに書き出す
      await execFileAsync("ffmpeg", ["-y", "-i", inputPath, "-f", "ffmetadata", metaPath]);

      const rawBytes = await fs.readFile(metaPath);
      const text = decodeWithFallback(rawBytes);
      const meta = parseFFmetadata(text);

      return {
        artist: meta["artist"] || undefined,
        title: meta["title"] || undefined,
      };
    });

    return {
      artist: riffMetadata.artist ?? ffmpegMetadata.artist,
      title: riffMetadata.title ?? ffmpegMetadata.title,
    };
  } catch {
    return riffMetadata;
  }
}
