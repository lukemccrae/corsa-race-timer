import path from 'path';
import { app, ipcMain } from 'electron';
import { DatabaseSync } from 'node:sqlite';
import { IPC_CHANNELS } from '../shared/raceIpc';
import type {
  AddRaceMatCrossingInput,
  CreateRaceInput,
  CsvImportPayload,
  RaceEntryRow,
  RaceMatCrossing,
  SeedRaceCrossingsInput,
  SeedRaceCrossingsResult,
  RaceTimingDevice,
  RaceTimingEntry,
  RaceSummary,
  UpdateRaceInput,
} from '../types/races';

type RaceRow = {
  id: string;
  name: string;
  created_at: string;
  row_count: number;
  headers_json: string;
  start_time: string | null;
  timing_locations_json: string;
  timing_devices_json: string;
  timing_entries_json: string;
};

let database: DatabaseSync | null = null;

function getDatabasePath() {
  return path.join(app.getPath('userData'), 'corsa-race-timer.sqlite');
}

function getDatabase() {
  if (database) {
    return database;
  }

  database = new DatabaseSync(getDatabasePath());
  database.exec('PRAGMA foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS races (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      headers_json TEXT NOT NULL DEFAULT '[]',
      start_time TEXT,
      timing_locations_json TEXT NOT NULL DEFAULT '[]',
      timing_devices_json TEXT NOT NULL DEFAULT '[]',
      timing_entries_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS race_entries (
      id TEXT PRIMARY KEY,
      race_id TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      data_json TEXT NOT NULL,
      FOREIGN KEY (race_id) REFERENCES races(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS Crossings (
      id TEXT PRIMARY KEY,
      race_id TEXT NOT NULL,
      bib TEXT NOT NULL DEFAULT '',
      age TEXT NOT NULL DEFAULT '',
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT '',
      crossing_time TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      race_distance TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (race_id) REFERENCES races(id) ON DELETE CASCADE
    );
  `);

  const nextCrossingCount = (
    database.prepare('SELECT COUNT(*) as count FROM Crossings').get() as { count: number }
  ).count;

  const legacyTable = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'race_mat_crossings'")
    .get() as { name: string } | undefined;

  if (legacyTable && nextCrossingCount === 0) {
    const legacyColumns = database
      .prepare('PRAGMA table_info(race_mat_crossings)')
      .all() as Array<{ name: string }>;
    const legacyColumnNames = new Set(
      legacyColumns.map((column) => column.name),
    );
    const crossingTimeColumn = legacyColumnNames.has('crossed_at')
      ? 'crossed_at'
      : legacyColumnNames.has('crossing_time')
        ? 'crossing_time'
        : null;

    if (crossingTimeColumn) {
      database.exec(`
        INSERT INTO Crossings (
          id, race_id, bib, crossing_time
        )
        SELECT id, race_id, bib, ${crossingTimeColumn}
        FROM race_mat_crossings
        WHERE NOT EXISTS (
          SELECT 1 FROM Crossings WHERE Crossings.id = race_mat_crossings.id
        )
      `);
    }
  }

  const tableInfo = database
    .prepare('PRAGMA table_info(races)')
    .all() as Array<{ name: string }>;
  const columnNames = new Set(tableInfo.map((column) => column.name));

  if (!columnNames.has('start_time')) {
    database.exec('ALTER TABLE races ADD COLUMN start_time TEXT');
  }

  if (!columnNames.has('timing_locations_json')) {
    database.exec(
      "ALTER TABLE races ADD COLUMN timing_locations_json TEXT NOT NULL DEFAULT '[]'",
    );
  }

  if (!columnNames.has('timing_devices_json')) {
    database.exec(
      "ALTER TABLE races ADD COLUMN timing_devices_json TEXT NOT NULL DEFAULT '[]'",
    );
  }

  if (!columnNames.has('timing_entries_json')) {
    database.exec(
      "ALTER TABLE races ADD COLUMN timing_entries_json TEXT NOT NULL DEFAULT '[]'",
    );
  }

  return database;
}

function mapRaceRow(row: RaceRow): RaceSummary {
  const parsedTimingDevices = JSON.parse(
    row.timing_devices_json ?? '[]',
  ) as RaceTimingDevice[];
  const parsedTimingEntries = JSON.parse(
    row.timing_entries_json ?? '[]',
  ) as RaceTimingEntry[];

  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    rowCount: row.row_count,
    headers: JSON.parse(row.headers_json) as string[],
    startTime: row.start_time,
    timingLocations: JSON.parse(row.timing_locations_json) as string[],
    timingDevices: parsedTimingDevices,
    timingEntries: parsedTimingEntries,
  };
}

function buildRaceName(createdAt: string) {
  return `Race ${new Date(createdAt).toLocaleString()}`;
}

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function findValue(row: Record<string, string>, matcher: RegExp) {
  const key = Object.keys(row).find((candidate) => matcher.test(candidate));
  return key ? String(row[key] ?? '').trim() : '';
}

export function listRaces(): RaceSummary[] {
  const statement = getDatabase().prepare(`
    SELECT id, name, created_at, row_count, headers_json, start_time,
      timing_locations_json, timing_devices_json, timing_entries_json
    FROM races
    ORDER BY datetime(created_at) DESC, created_at DESC
  `);

  return (statement.all() as RaceRow[]).map(mapRaceRow);
}

export function createRace(input?: CreateRaceInput): RaceSummary {
  const createdAt = new Date().toISOString();
  const race = {
    id: createId('race'),
    name: input?.name?.trim() || buildRaceName(createdAt),
    createdAt,
    rowCount: 0,
    headers: [] as string[],
    startTime: null,
    timingLocations: [] as string[],
    timingDevices: [] as RaceTimingDevice[],
    timingEntries: [] as RaceTimingEntry[],
  };

  const statement = getDatabase().prepare(`
    INSERT INTO races (
      id,
      name,
      created_at,
      row_count,
      headers_json,
      start_time,
      timing_locations_json,
      timing_devices_json,
      timing_entries_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  statement.run(
    race.id,
    race.name,
    race.createdAt,
    race.rowCount,
    JSON.stringify(race.headers),
    race.startTime,
    JSON.stringify(race.timingLocations),
    JSON.stringify(race.timingDevices),
    JSON.stringify(race.timingEntries),
  );

  return race;
}

export function importRaceCsvRows(payload: CsvImportPayload): RaceSummary {
  const db = getDatabase();
  const raceStatement = db.prepare(`
    SELECT id, name, created_at, row_count, headers_json, start_time,
      timing_locations_json, timing_devices_json, timing_entries_json
    FROM races
    WHERE id = ?
  `);

  const existingRace = raceStatement.get(payload.raceId) as RaceRow | undefined;

  if (!existingRace) {
    throw new Error('Race not found.');
  }

  const deleteEntries = db.prepare('DELETE FROM race_entries WHERE race_id = ?');
  const insertEntry = db.prepare(`
    INSERT INTO race_entries (id, race_id, imported_at, data_json)
    VALUES (?, ?, ?, ?)
  `);
  const updateRace = db.prepare(`
    UPDATE races
    SET row_count = ?, headers_json = ?
    WHERE id = ?
  `);

  const importedAt = new Date().toISOString();
  try {
    db.exec('BEGIN IMMEDIATE');

    deleteEntries.run(payload.raceId);

    payload.rows.forEach((row, index) => {
      insertEntry.run(
        `${payload.raceId}_entry_${index + 1}`,
        payload.raceId,
        importedAt,
        JSON.stringify(row),
      );
    });

    updateRace.run(
      payload.rows.length,
      JSON.stringify(payload.headers),
      payload.raceId,
    );
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback failures and rethrow the original error.
    }

    throw error;
  }

  return {
    id: existingRace.id,
    name: existingRace.name,
    createdAt: existingRace.created_at,
    rowCount: payload.rows.length,
    headers: payload.headers,
    startTime: existingRace.start_time,
    timingLocations: JSON.parse(existingRace.timing_locations_json) as string[],
    timingDevices: JSON.parse(existingRace.timing_devices_json ?? '[]') as RaceTimingDevice[],
    timingEntries: JSON.parse(existingRace.timing_entries_json ?? '[]') as RaceTimingEntry[],
  };
}

export function updateRace(input: UpdateRaceInput): RaceSummary {
  const db = getDatabase();
  const raceStatement = db.prepare(`
    SELECT id, name, created_at, row_count, headers_json, start_time,
      timing_locations_json, timing_devices_json, timing_entries_json
    FROM races
    WHERE id = ?
  `);
  const existingRace = raceStatement.get(input.raceId) as RaceRow | undefined;

  if (!existingRace) {
    throw new Error('Race not found.');
  }

  const nextName =
    input.name !== undefined ? input.name.trim() || existingRace.name : existingRace.name;
  const nextStartTime =
    input.startTime !== undefined ? input.startTime : existingRace.start_time;
  const nextTimingLocations =
    input.timingLocations !== undefined
      ? input.timingLocations.map((location) => location.trim()).filter(Boolean)
      : (JSON.parse(existingRace.timing_locations_json) as string[]);
  const nextTimingDevices =
    input.timingDevices !== undefined
      ? input.timingDevices
      : (JSON.parse(existingRace.timing_devices_json ?? '[]') as RaceTimingDevice[]);
  const nextTimingEntries =
    input.timingEntries !== undefined
      ? input.timingEntries
      : (JSON.parse(existingRace.timing_entries_json ?? '[]') as RaceTimingEntry[]);

  const updateStatement = db.prepare(`
    UPDATE races
    SET name = ?, start_time = ?, timing_locations_json = ?, timing_devices_json = ?, timing_entries_json = ?
    WHERE id = ?
  `);

  updateStatement.run(
    nextName,
    nextStartTime,
    JSON.stringify(nextTimingLocations),
    JSON.stringify(nextTimingDevices),
    JSON.stringify(nextTimingEntries),
    input.raceId,
  );

  return {
    id: existingRace.id,
    name: nextName,
    createdAt: existingRace.created_at,
    rowCount: existingRace.row_count,
    headers: JSON.parse(existingRace.headers_json) as string[],
    startTime: nextStartTime,
    timingLocations: nextTimingLocations,
    timingDevices: nextTimingDevices,
    timingEntries: nextTimingEntries,
  };
}

export function listRaceRows(raceId: string): RaceEntryRow[] {
  const statement = getDatabase().prepare(`
    SELECT data_json
    FROM race_entries
    WHERE race_id = ?
    ORDER BY CAST(substr(id, instr(id, '_entry_') + 7) AS INTEGER) ASC
  `);

  const rows = statement.all(raceId) as Array<{ data_json: string }>;

  return rows.map(({ data_json }) => JSON.parse(data_json) as RaceEntryRow);
}

export function listRaceMatCrossings(raceId: string): RaceMatCrossing[] {
  const statement = getDatabase().prepare(`
    SELECT id, race_id, bib, age, first_name, last_name, gender,
      crossing_time, city, state, country, race_distance
    FROM Crossings
    WHERE race_id = ?
    ORDER BY datetime(crossing_time) DESC, crossing_time DESC
  `);

  const rows = statement.all(raceId) as Array<{
    id: string;
    race_id: string;
    bib: string;
    age: string;
    first_name: string;
    last_name: string;
    gender: string;
    crossing_time: string;
    city: string;
    state: string;
    country: string;
    race_distance: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    raceId: row.race_id,
    bib: row.bib,
    age: row.age,
    firstName: row.first_name,
    lastName: row.last_name,
    gender: row.gender,
    crossingTime: row.crossing_time,
    city: row.city,
    state: row.state,
    country: row.country,
    raceDistance: row.race_distance,
  }));
}

export function addRaceMatCrossing(input: AddRaceMatCrossingInput): RaceMatCrossing {
  const raceStatement = getDatabase().prepare(
    'SELECT id FROM races WHERE id = ?',
  );
  const existingRace = raceStatement.get(input.raceId) as { id: string } | undefined;

  if (!existingRace) {
    throw new Error('Race not found.');
  }

  const crossing: RaceMatCrossing = {
    id: createId('mat_crossing'),
    raceId: input.raceId,
    bib: input.bib?.trim() ?? '',
    age: input.age?.trim() ?? '',
    firstName: input.firstName?.trim() ?? '',
    lastName: input.lastName?.trim() ?? '',
    gender: input.gender?.trim() ?? '',
    crossingTime: input.crossingTime ?? new Date().toISOString(),
    city: input.city?.trim() ?? '',
    state: input.state?.trim() ?? '',
    country: input.country?.trim() ?? '',
    raceDistance: input.raceDistance?.trim() ?? '',
  };

  const insertStatement = getDatabase().prepare(`
    INSERT INTO Crossings (
      id, race_id, bib, age, first_name, last_name,
      gender, crossing_time, city, state, country, race_distance
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertStatement.run(
    crossing.id,
    crossing.raceId,
    crossing.bib,
    crossing.age,
    crossing.firstName,
    crossing.lastName,
    crossing.gender,
    crossing.crossingTime,
    crossing.city,
    crossing.state,
    crossing.country,
    crossing.raceDistance,
  );

  return crossing;
}

export function seedRaceCrossings(
  input: SeedRaceCrossingsInput,
): SeedRaceCrossingsResult {
  const db = getDatabase();
  const race = db
    .prepare('SELECT id, start_time FROM races WHERE id = ?')
    .get(input.raceId) as { id: string; start_time: string | null } | undefined;

  if (!race) {
    throw new Error('Race not found.');
  }

  const existingCrossings = db
    .prepare('SELECT COUNT(*) as count FROM Crossings WHERE race_id = ?')
    .get(input.raceId) as { count: number };

  if (existingCrossings.count > 0) {
    return { seededCount: 0 };
  }

  const rawRows = db.prepare(`
    SELECT data_json
    FROM race_entries
    WHERE race_id = ?
    ORDER BY CAST(substr(id, instr(id, '_entry_') + 7) AS INTEGER) ASC
  `).all(input.raceId) as Array<{ data_json: string }>;

  const limit = Math.max(1, Math.min(input.limit ?? 25, 200));
  const rows = rawRows.slice(0, limit).map(({ data_json }) =>
    JSON.parse(data_json) as Record<string, string>,
  );

  if (rows.length === 0) {
    return { seededCount: 0 };
  }

  const baseTime = race.start_time
    ? new Date(race.start_time)
    : new Date();
  if (Number.isNaN(baseTime.getTime())) {
    baseTime.setTime(Date.now());
  }

  const insertCrossing = db.prepare(`
    INSERT INTO Crossings (
      id, race_id, bib, age, first_name, last_name,
      gender, crossing_time, city, state, country, race_distance
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let seededCount = 0;

  try {
    db.exec('BEGIN IMMEDIATE');

    rows.forEach((row, index) => {
      const crossingTime = new Date(
        baseTime.getTime() + (45 * 60 + index * 35) * 1000,
      ).toISOString();
      const firstName = findValue(row, /first\s*name|fname/i);
      const lastName = findValue(row, /last\s*name|lname|surname/i);

      insertCrossing.run(
        createId('mat_crossing'),
        input.raceId,
        findValue(row, /bib|race\s*#|race\s*number|runner\s*#/i),
        findValue(row, /age/i),
        firstName,
        lastName,
        findValue(row, /gender|sex/i),
        crossingTime,
        findValue(row, /city|town/i),
        findValue(row, /state|province|region/i),
        findValue(row, /country|nation/i),
        findValue(row, /race\s*distance|distance|event\s*distance|dist/i),
      );

      seededCount += 1;
    });

    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback failures and rethrow the original error.
    }
    throw error;
  }

  return { seededCount };
}

export function registerRaceHandlers() {
  ipcMain.handle(
    IPC_CHANNELS.addRaceMatCrossing,
    (_event, input: AddRaceMatCrossingInput) => addRaceMatCrossing(input),
  );
  ipcMain.handle(IPC_CHANNELS.listRaces, () => listRaces());
  ipcMain.handle(IPC_CHANNELS.createRace, (_event, input?: CreateRaceInput) =>
    createRace(input),
  );
  ipcMain.handle(IPC_CHANNELS.listRaceMatCrossings, (_event, raceId: string) =>
    listRaceMatCrossings(raceId),
  );
  ipcMain.handle(IPC_CHANNELS.listRaceRows, (_event, raceId: string) =>
    listRaceRows(raceId),
  );
  ipcMain.handle(
    IPC_CHANNELS.seedRaceCrossings,
    (_event, input: SeedRaceCrossingsInput) => seedRaceCrossings(input),
  );
  ipcMain.handle(
    IPC_CHANNELS.importCsvRows,
    (_event, payload: CsvImportPayload) => importRaceCsvRows(payload),
  );
  ipcMain.handle(IPC_CHANNELS.updateRace, (_event, input: UpdateRaceInput) =>
    updateRace(input),
  );
}