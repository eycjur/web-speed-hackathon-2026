import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { Sequelize } from "sequelize";

import { initModels, Sound } from "@web-speed-hackathon-2026/server/src/models";
import { DATABASE_PATH } from "@web-speed-hackathon-2026/server/src/paths";
import type { SoundSeed } from "@web-speed-hackathon-2026/server/src/types/seed";

let _sequelize: Sequelize | null = null;
let _seedWaveforms: Map<string, number[]> | null = null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOUND_SEED_PATH = path.resolve(__dirname, "../seeds/sounds.jsonl");

async function createRuntimeIndexes(sequelize: Sequelize) {
  await sequelize.query(
    "CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation_created_at ON DirectMessages (conversationId, createdAt DESC)",
  );
  await sequelize.query(
    "CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation_is_read_sender ON DirectMessages (conversationId, isRead, senderId)",
  );
  await sequelize.query(
    "CREATE INDEX IF NOT EXISTS idx_dm_conversations_initiator_id ON DirectMessageConversations (initiatorId)",
  );
  await sequelize.query(
    "CREATE INDEX IF NOT EXISTS idx_dm_conversations_member_id ON DirectMessageConversations (memberId)",
  );
}

async function ensureSoundWaveformColumn(sequelize: Sequelize) {
  const columns = (await sequelize.query("PRAGMA table_info('Sounds')", {
    type: "SELECT",
  })) as Array<{ name?: string }>;

  if (columns.some((column) => column.name === "waveform")) {
    return;
  }

  await sequelize.query("ALTER TABLE Sounds ADD COLUMN waveform TEXT NOT NULL DEFAULT '[]'");
}

async function getSeedWaveforms() {
  if (_seedWaveforms != null) {
    return _seedWaveforms;
  }

  const content = await fs.readFile(SOUND_SEED_PATH, "utf8");
  const waveforms = new Map<string, number[]>();

  for (const line of content.split("\n")) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0) {
      continue;
    }

    const sound = JSON.parse(trimmedLine) as SoundSeed;
    if (Array.isArray(sound.waveform) && sound.waveform.length > 0) {
      waveforms.set(sound.id, sound.waveform);
    }
  }

  _seedWaveforms = waveforms;
  return waveforms;
}

async function backfillSoundWaveforms() {
  const seedWaveforms = await getSeedWaveforms();
  const sounds = await Sound.findAll({
    attributes: ["id", "waveform"],
  });

  for (const sound of sounds) {
    const waveform = sound.get("waveform") as unknown;
    if (Array.isArray(waveform) && waveform.length > 0) {
      continue;
    }

    const seedWaveform = seedWaveforms.get(sound.id);
    if (seedWaveform == null || seedWaveform.length === 0) {
      continue;
    }

    sound.waveform = seedWaveform;
    await sound.save({ fields: ["waveform"] });
  }
}

export async function initializeSequelize() {
  const prevSequelize = _sequelize;
  _sequelize = null;
  await prevSequelize?.close();

  const TEMP_PATH = path.resolve(
    await fs.mkdtemp(path.resolve(os.tmpdir(), "./wsh-")),
    "./database.sqlite",
  );
  await fs.copyFile(DATABASE_PATH, TEMP_PATH);

  _sequelize = new Sequelize({
    dialect: "sqlite",
    logging: false,
    storage: TEMP_PATH,
  });
  initModels(_sequelize);
  await ensureSoundWaveformColumn(_sequelize);
  await backfillSoundWaveforms();
  await createRuntimeIndexes(_sequelize);
}

export function getSequelize() {
  if (_sequelize == null) {
    throw new Error("Sequelize is not initialized");
  }

  return _sequelize;
}
