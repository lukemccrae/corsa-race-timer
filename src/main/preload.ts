// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  AddRaceMatCrossingInput,
  CreateRaceInput,
  CsvImportPayload,
  RaceEntryRow,
  RaceMatCrossing,
  RaceSummary,
  SeedRaceCrossingsInput,
  SeedRaceCrossingsResult,
  UpdateRaceInput,
} from '../types/races';
import { IPC_CHANNELS } from '../shared/raceIpc';

export type Channels = 'ipc-example';

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
  },
  races: {
    addRaceMatCrossing(input: AddRaceMatCrossingInput) {
      return ipcRenderer.invoke(
        IPC_CHANNELS.addRaceMatCrossing,
        input,
      ) as Promise<RaceMatCrossing>;
    },
    createRace(input?: CreateRaceInput) {
      return ipcRenderer.invoke(
        IPC_CHANNELS.createRace,
        input,
      ) as Promise<RaceSummary>;
    },
    importCsvRows(payload: CsvImportPayload) {
      return ipcRenderer.invoke(
        IPC_CHANNELS.importCsvRows,
        payload,
      ) as Promise<RaceSummary>;
    },
    listRaces() {
      return ipcRenderer.invoke(IPC_CHANNELS.listRaces) as Promise<RaceSummary[]>;
    },
    listRaceMatCrossings(raceId: string) {
      return ipcRenderer.invoke(
        IPC_CHANNELS.listRaceMatCrossings,
        raceId,
      ) as Promise<RaceMatCrossing[]>;
    },
    listRaceRows(raceId: string) {
      return ipcRenderer.invoke(
        IPC_CHANNELS.listRaceRows,
        raceId,
      ) as Promise<RaceEntryRow[]>;
    },
    seedRaceCrossings(input: SeedRaceCrossingsInput) {
      return ipcRenderer.invoke(
        IPC_CHANNELS.seedRaceCrossings,
        input,
      ) as Promise<SeedRaceCrossingsResult>;
    },
    updateRace(input: UpdateRaceInput) {
      return ipcRenderer.invoke(
        IPC_CHANNELS.updateRace,
        input,
      ) as Promise<RaceSummary>;
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
