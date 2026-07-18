// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  CreateRaceInput,
  CsvImportPayload,
  RaceEntryRow,
  RaceSummary,
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
    listRaceRows(raceId: string) {
      return ipcRenderer.invoke(
        IPC_CHANNELS.listRaceRows,
        raceId,
      ) as Promise<RaceEntryRow[]>;
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
