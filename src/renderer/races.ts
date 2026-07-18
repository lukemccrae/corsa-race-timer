import type {
  CreateRaceInput,
  CsvImportPayload,
  RaceEntryRow,
  RaceSummary,
  UpdateRaceInput,
} from '../types/races';

const SELECTED_RACE_STORAGE_KEY = 'corsa-race-timer.selected-race-id';

type ParsedCsv = {
  headers: string[];
  rows: Array<Record<string, string>>;
};

function getRaceBridge() {
  return window.electron?.races;
}

function requireRaceBridge() {
  const raceBridge = getRaceBridge();

  if (!raceBridge) {
    throw new Error('Race storage bridge is not available.');
  }

  return raceBridge;
}

function parseCsv(text: string): ParsedCsv {
  const normalizedText = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentField = '';
  let currentRow: string[] = [];
  let insideQuotes = false;

  const pushField = () => {
    currentRow.push(currentField);
    currentField = '';
  };

  const pushRow = () => {
    const hasContent = currentRow.some((value) => value.trim().length > 0);
    if (hasContent) {
      rows.push(currentRow);
    }
    currentRow = [];
  };

  for (let index = 0; index < normalizedText.length; index += 1) {
    const character = normalizedText[index];
    const nextCharacter = normalizedText[index + 1];

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        currentField += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (character === ',' && !insideQuotes) {
      pushField();
      continue;
    }

    if ((character === '\n' || character === '\r') && !insideQuotes) {
      pushField();
      pushRow();
      if (character === '\r' && nextCharacter === '\n') {
        index += 1;
      }
      continue;
    }

    currentField += character;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    pushField();
    pushRow();
  }

  if (rows.length === 0) {
    throw new Error('CSV file is empty.');
  }

  const headers = rows[0].map((header) => header.trim());

  if (headers.some((header) => header.length === 0)) {
    throw new Error('CSV file contains an empty header.');
  }

  const records = rows.slice(1).map((values) => {
    return headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = values[index] ?? '';
      return record;
    }, {});
  });

  return {
    headers,
    rows: records,
  };
}

export function readRaceSummaries() {
  return [] as RaceSummary[];
}

export function readSelectedRaceId() {
  return window.localStorage.getItem(SELECTED_RACE_STORAGE_KEY);
}

export function writeSelectedRaceId(raceId: string | null) {
  if (!raceId) {
    window.localStorage.removeItem(SELECTED_RACE_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(SELECTED_RACE_STORAGE_KEY, raceId);
}

export async function listRaceSummaries() {
  const raceBridge = requireRaceBridge();
  const races = await raceBridge.listRaces();
  return races;
}

export async function createRaceSummary(input?: CreateRaceInput) {
  const raceBridge = requireRaceBridge();
  const race = await raceBridge.createRace(input);

  return race;
}

export async function listRaceRows(raceId: string) {
  const raceBridge = requireRaceBridge();
  return raceBridge.listRaceRows(raceId);
}

export async function importRaceCsv(raceId: string, fileText: string) {
  const parsedCsv = parseCsv(fileText);
  const raceBridge = requireRaceBridge();

  const payload: CsvImportPayload = {
    raceId,
    headers: parsedCsv.headers,
    rows: parsedCsv.rows,
  };

  const updatedRace = await raceBridge.importCsvRows(payload);

  return {
    race: updatedRace,
    importedRowCount: parsedCsv.rows.length,
  };
}

export async function updateRaceSummary(input: UpdateRaceInput) {
  const raceBridge = requireRaceBridge();
  return raceBridge.updateRace(input);
}