export type RaceSummary = {
  id: string;
  name: string;
  createdAt: string;
  rowCount: number;
  headers: string[];
  startTime: string | null;
  timingLocations: string[];
  timingDevices: RaceTimingDevice[];
  timingEntries: RaceTimingEntry[];
};

export type CreateRaceInput = {
  name?: string;
};

export type CsvImportPayload = {
  raceId: string;
  headers: string[];
  rows: Array<Record<string, string>>;
};

export type RaceTimingDevice = {
  id: string;
  name: string;
  code: string;
};

export type RaceTimingEntry = {
  id: string;
  deviceId: string;
  mileNumber: number | null;
  description: string;
};

export type UpdateRaceInput = {
  raceId: string;
  name?: string;
  startTime?: string | null;
  timingLocations?: string[];
  timingDevices?: RaceTimingDevice[];
  timingEntries?: RaceTimingEntry[];
};

export type RaceEntryRow = Record<string, string>;