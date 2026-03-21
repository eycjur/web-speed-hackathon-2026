import { promises as fs } from "fs";
import path from "path";

import { Router } from "express";
import { fileTypeFromBuffer } from "file-type";
import httpErrors from "http-errors";
import { v4 as uuidv4 } from "uuid";

import { UPLOAD_PATH } from "@web-speed-hackathon-2026/server/src/paths";
import { Sound } from "@web-speed-hackathon-2026/server/src/models";
import {
  convertSoundToMp3AndPcm,
  MediaConversionError,
} from "@web-speed-hackathon-2026/server/src/utils/convert_media";
import { extractMetadataFromSound } from "@web-speed-hackathon-2026/server/src/utils/extract_metadata_from_sound";
import { calculateWaveform } from "@web-speed-hackathon-2026/server/src/utils/sound_waveform";

// 変換した音声の拡張子
const EXTENSION = "mp3";
const UNKNOWN_ARTIST = "Unknown Artist";
const UNKNOWN_TITLE = "Unknown Title";

export const soundRouter = Router();

soundRouter.post("/sounds", async (req, res) => {
  if (req.session.userId === undefined) {
    throw new httpErrors.Unauthorized();
  }
  if (Buffer.isBuffer(req.body) === false) {
    throw new httpErrors.BadRequest();
  }

  const type = await fileTypeFromBuffer(req.body);
  if (type === undefined || !type.mime.startsWith("audio/")) {
    throw new httpErrors.BadRequest("Invalid file type");
  }

  const soundId = uuidv4();
  const metadata = await extractMetadataFromSound(req.body);
  const artist = metadata.artist ?? UNKNOWN_ARTIST;
  const title = metadata.title ?? UNKNOWN_TITLE;
  const { mp3: converted, pcm } = await convertSoundToMp3AndPcm(req.body, { artist, title }).catch((error: unknown) => {
    if (error instanceof MediaConversionError) {
      throw new httpErrors.BadRequest("Invalid file type");
    }
    throw error;
  });

  const filePath = path.resolve(UPLOAD_PATH, `./sounds/${soundId}.${EXTENSION}`);
  await fs.mkdir(path.resolve(UPLOAD_PATH, "sounds"), { recursive: true });
  await fs.writeFile(filePath, converted);

  await Sound.create({
    artist,
    id: soundId,
    title,
    waveform: [],
  });

  const payload = { artist, id: soundId, title, waveform: [] };

  res
    .status(200)
    .type("application/json")
    .send(payload);

  setImmediate(() => {
    void (async () => {
      try {
        const waveform = calculateWaveform(pcm);
        await Sound.update({ waveform }, { where: { id: soundId } });
      } catch (error) {
        console.error("Failed to persist sound waveform", error);
      }
    })();
  });
});
