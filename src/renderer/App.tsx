import { MemoryRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import corsaLogo from '../../assets/icons/corsa-logo.svg';
import './App.css';
import { AuthProvider, useAuth } from './AuthContext';
import {
  createRaceSummary,
  importRaceCsv,
  listRaceRows,
  listRaceSummaries,
  readRaceSummaries,
  readSelectedRaceId,
  updateRaceSummary,
  writeSelectedRaceId,
} from './races';
import SignIn from './SignIn';
import type {
  RaceEntryRow,
  RaceSummary,
  RaceTimingDevice,
  RaceTimingEntry,
} from '../types/races';

type RaceTab = 'entrants' | 'timing' | 'settings';

function toDateTimeLocalValue(value: string | null) {
  if (!value) {
    return '';
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
  const day = String(parsedDate.getDate()).padStart(2, '0');
  const hour = String(parsedDate.getHours()).padStart(2, '0');
  const minute = String(parsedDate.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function toIsoDateTime(value: string) {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString();
}

function createTimingDevice(): RaceTimingDevice {
  return {
    id: `timing_device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    code: '',
  };
}

function createTimingEntry(defaultDeviceId = ''): RaceTimingEntry {
  return {
    id: `timing_entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    deviceId: defaultDeviceId,
    mileNumber: null,
    description: '',
  };
}

function ProfileAvatar({
  photoUrl,
  username,
}: {
  photoUrl: string | null;
  username: string;
}) {
  if (photoUrl) {
    return <img className="profile-avatar" src={photoUrl} alt={username} />;
  }

  return <div className="profile-avatar profile-avatar-fallback">{username[0]?.toUpperCase() ?? 'U'}</div>;
}

function AppHeader() {
  const { user, profile, profileLoading, signOut } = useAuth();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  const username = profile?.username ?? user?.email ?? 'User';

  useEffect(() => {
    if (!isProfileMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const menuElement = profileMenuRef.current;
      const eventTarget = event.target as Node | null;

      if (!menuElement || !eventTarget || menuElement.contains(eventTarget)) {
        return;
      }

      setIsProfileMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsProfileMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isProfileMenuOpen]);

  return (
    <header className="app-banner">
      <div className="app-branding">
        <img className="app-logo" src={corsaLogo} alt="Corsa Race Timer" />
        <div>
          <h1 className="app-title">Corsa Race Timer</h1>
        </div>
      </div>

      <div className="banner-actions">
        <div className="profile-menu" ref={profileMenuRef}>
          <button
            className="banner-profile-toggle"
            type="button"
            onClick={() => setIsProfileMenuOpen((currentValue) => !currentValue)}
            aria-haspopup="menu"
            aria-expanded={isProfileMenuOpen}
          >
            <div className="banner-profile">
              <ProfileAvatar
                photoUrl={profile?.photoUrl ?? null}
                username={username}
              />
              <span>{profileLoading ? 'Loading...' : username}</span>
            </div>
            <span className="profile-menu-caret" aria-hidden>
              ▾
            </span>
          </button>

          {isProfileMenuOpen ? (
            <div className="profile-menu-popover" role="menu" aria-label="Profile menu">
              
              <button
                className="profile-menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  navigate('/races');
                }}
              >
                Races
              </button>
              <button
                className="profile-menu-item"
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  void signOut();
                }}
              >
                Sign Out
              </button>

            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function Home() {
  const [races, setRaces] = useState<RaceSummary[]>(() => readRaceSummaries());
  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(() =>
    readSelectedRaceId(),
  );
  const [activeTab, setActiveTab] = useState<RaceTab>('entrants');
  const [isRaceMenuOpen, setIsRaceMenuOpen] = useState(() => !readSelectedRaceId());
  const [isCreatingRace, setIsCreatingRace] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [isLoadingRaceRows, setIsLoadingRaceRows] = useState(false);
  const [isSavingRaceSettings, setIsSavingRaceSettings] = useState(false);
  const [isSavingTimingConfig, setIsSavingTimingConfig] = useState(false);
  const [selectedRaceRows, setSelectedRaceRows] = useState<RaceEntryRow[]>([]);
  const [settingsDraft, setSettingsDraft] = useState({
    name: '',
    startTime: '',
    timingLocations: '',
  });
  const [timingDevicesDraft, setTimingDevicesDraft] = useState<RaceTimingDevice[]>([]);
  const [timingEntriesDraft, setTimingEntriesDraft] = useState<RaceTimingEntry[]>([]);
  const [raceMessage, setRaceMessage] = useState<string | null>(null);
  const [raceError, setRaceError] = useState<string | null>(null);

  const selectedRace = useMemo(
    () => races.find((race) => race.id === selectedRaceId) ?? null,
    [races, selectedRaceId],
  );

  useEffect(() => {
    let isCancelled = false;

    const hydrateRaces = async () => {
      try {
        const nextRaces = await listRaceSummaries();
        if (!isCancelled) {
          setRaces(nextRaces);
          const nextSelectedRaceId = nextRaces.some(
            (race) => race.id === selectedRaceId,
          )
            ? selectedRaceId
            : nextRaces[0]?.id ?? null;

          if (nextSelectedRaceId !== selectedRaceId) {
            setSelectedRaceId(nextSelectedRaceId);
            writeSelectedRaceId(nextSelectedRaceId);
          }
        }
      } catch (error) {
        if (!isCancelled) {
          setRaceError(
            error instanceof Error
              ? error.message
              : 'Unable to load races right now.',
          );
        }
      }
    };

    hydrateRaces();

    return () => {
      isCancelled = true;
    };
  }, [selectedRaceId]);

  useEffect(() => {
    let isCancelled = false;

    const hydrateRaceRows = async () => {
      if (!selectedRaceId) {
        setSelectedRaceRows([]);
        return;
      }

      setIsLoadingRaceRows(true);

      try {
        const rows = await listRaceRows(selectedRaceId);
        if (!isCancelled) {
          setSelectedRaceRows(rows);
        }
      } catch (error) {
        if (!isCancelled) {
          setSelectedRaceRows([]);
          setRaceError(
            error instanceof Error
              ? error.message
              : 'Unable to load race runners right now.',
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingRaceRows(false);
        }
      }
    };

    hydrateRaceRows();

    return () => {
      isCancelled = true;
    };
  }, [selectedRaceId]);

  useEffect(() => {
    if (!selectedRace) {
      setSettingsDraft({
        name: '',
        startTime: '',
        timingLocations: '',
      });
      setTimingDevicesDraft([]);
      setTimingEntriesDraft([]);
      return;
    }

    setSettingsDraft({
      name: selectedRace.name,
      startTime: toDateTimeLocalValue(selectedRace.startTime),
      timingLocations: selectedRace.timingLocations.join('\n'),
    });
    setTimingDevicesDraft(selectedRace.timingDevices);
    setTimingEntriesDraft(selectedRace.timingEntries);
  }, [selectedRace]);

  const mergeUpdatedRace = (updatedRace: RaceSummary) => {
    setRaces((currentRaces) =>
      currentRaces.map((currentRace) =>
        currentRace.id === updatedRace.id ? updatedRace : currentRace,
      ),
    );
  };

  const handleSelectRace = (raceId: string) => {
    setSelectedRaceId(raceId);
    writeSelectedRaceId(raceId);
    setIsRaceMenuOpen(false);
    setActiveTab('entrants');
    setRaceMessage(null);
    setRaceError(null);
  };

  const handleCreateRace = async () => {
    setIsCreatingRace(true);
    setRaceError(null);
    setRaceMessage(null);

    try {
      const race = await createRaceSummary();
      setRaces((currentRaces) => [
        race,
        ...currentRaces.filter((currentRace) => currentRace.id !== race.id),
      ]);
      setSelectedRaceId(race.id);
      writeSelectedRaceId(race.id);
      setIsRaceMenuOpen(false);
      setActiveTab('entrants');
      setRaceMessage('New race created.');
    } catch (error) {
      setRaceError(
        error instanceof Error ? error.message : 'Unable to create a race.',
      );
    } finally {
      setIsCreatingRace(false);
    }
  };

  const handleImportCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';

    if (!selectedFile || !selectedRaceId) {
      return;
    }

    setIsImportingCsv(true);
    setRaceError(null);
    setRaceMessage(null);

    try {
      const fileText = await selectedFile.text();
      const { race, importedRowCount } = await importRaceCsv(
        selectedRaceId,
        fileText,
      );
      const raceRows = await listRaceRows(selectedRaceId);
      mergeUpdatedRace(race);
      setSelectedRaceRows(raceRows);
      setRaceMessage(`Imported ${importedRowCount} racers from ${selectedFile.name}.`);
    } catch (error) {
      setRaceError(
        error instanceof Error ? error.message : 'Unable to import CSV.',
      );
    } finally {
      setIsImportingCsv(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!selectedRaceId) {
      return;
    }

    setIsSavingRaceSettings(true);
    setRaceError(null);
    setRaceMessage(null);

    const timingLocations = settingsDraft.timingLocations
      .split(/\r?\n|,/)
      .map((location) => location.trim())
      .filter(Boolean);

    try {
      const updatedRace = await updateRaceSummary({
        raceId: selectedRaceId,
        name: settingsDraft.name,
        startTime: toIsoDateTime(settingsDraft.startTime),
        timingLocations,
      });

      mergeUpdatedRace(updatedRace);
      setRaceMessage('Race settings saved.');
    } catch (error) {
      setRaceError(
        error instanceof Error ? error.message : 'Unable to save race settings.',
      );
    } finally {
      setIsSavingRaceSettings(false);
    }
  };

  const handleTimingDeviceFieldChange = (
    timingDeviceId: string,
    field: 'name' | 'code',
    value: string,
  ) => {
    setTimingDevicesDraft((currentDevices) =>
      currentDevices.map((currentDevice) =>
        currentDevice.id === timingDeviceId
          ? { ...currentDevice, [field]: value }
          : currentDevice,
      ),
    );
  };

  const handleAddTimingDevice = () => {
    setTimingDevicesDraft((currentDevices) => [
      ...currentDevices,
      createTimingDevice(),
    ]);
  };

  const handleRemoveTimingDevice = (timingDeviceId: string) => {
    setTimingDevicesDraft((currentDevices) =>
      currentDevices.filter((currentDevice) => currentDevice.id !== timingDeviceId),
    );
    setTimingEntriesDraft((currentEntries) =>
      currentEntries.map((currentEntry) =>
        currentEntry.deviceId === timingDeviceId
          ? { ...currentEntry, deviceId: '' }
          : currentEntry,
      ),
    );
  };

  const handleTimingEntryFieldChange = (
    timingEntryId: string,
    field: 'deviceId' | 'description' | 'mileNumber',
    value: string,
  ) => {
    setTimingEntriesDraft((currentEntries) =>
      currentEntries.map((currentEntry) => {
        if (currentEntry.id !== timingEntryId) {
          return currentEntry;
        }

        if (field === 'mileNumber') {
          const nextMileNumber = value.trim().length === 0 ? null : Number(value);
          return {
            ...currentEntry,
            mileNumber: Number.isFinite(nextMileNumber) ? nextMileNumber : null,
          };
        }

        return { ...currentEntry, [field]: value };
      }),
    );
  };

  const handleAddTimingEntry = () => {
    const defaultDeviceId = timingDevicesDraft[0]?.id ?? '';
    setTimingEntriesDraft((currentEntries) => [
      ...currentEntries,
      createTimingEntry(defaultDeviceId),
    ]);
  };

  const handleRemoveTimingEntry = (timingEntryId: string) => {
    setTimingEntriesDraft((currentEntries) =>
      currentEntries.filter((currentEntry) => currentEntry.id !== timingEntryId),
    );
  };

  const handleSaveTimingConfig = async () => {
    if (!selectedRaceId) {
      return;
    }

    setIsSavingTimingConfig(true);
    setRaceError(null);
    setRaceMessage(null);

    const normalizedTimingDevices = timingDevicesDraft
      .map((timingDevice) => ({
        ...timingDevice,
        name: timingDevice.name.trim(),
        code: timingDevice.code.trim(),
      }))
      .filter((timingDevice) => timingDevice.name.length > 0);

    const deviceIds = new Set(
      normalizedTimingDevices.map((timingDevice) => timingDevice.id),
    );
    const normalizedTimingEntries = timingEntriesDraft
      .map((timingEntry) => ({
        ...timingEntry,
        deviceId: timingEntry.deviceId.trim(),
        description: timingEntry.description.trim(),
        mileNumber:
          timingEntry.mileNumber === null || Number.isFinite(timingEntry.mileNumber)
            ? timingEntry.mileNumber
            : null,
      }))
      .filter(
        (timingEntry) =>
          (timingEntry.deviceId.length > 0 && deviceIds.has(timingEntry.deviceId)) ||
          timingEntry.description.length > 0 ||
          timingEntry.mileNumber !== null,
      )
      .map((timingEntry) => ({
        ...timingEntry,
        deviceId: deviceIds.has(timingEntry.deviceId) ? timingEntry.deviceId : '',
      }));

    try {
      const updatedRace = await updateRaceSummary({
        raceId: selectedRaceId,
        timingDevices: normalizedTimingDevices,
        timingEntries: normalizedTimingEntries,
      });

      mergeUpdatedRace(updatedRace);
      setRaceMessage('Timing setup saved.');
    } catch (error) {
      setRaceError(
        error instanceof Error ? error.message : 'Unable to save timing setup.',
      );
    } finally {
      setIsSavingTimingConfig(false);
    }
  };

  const selectedRaceDate = selectedRace
    ? new Date(selectedRace.createdAt).toLocaleString()
    : null;
  const showRaceWorkspace = !selectedRace || isRaceMenuOpen;
  const activeTabTitle =
    activeTab === 'entrants'
      ? 'Entrants'
      : activeTab === 'timing'
        ? 'Timing'
        : 'Settings';
  const raceDetailContent = selectedRace ? (
    <>
      <div className="race-tabs" role="tablist" aria-label="Race detail tabs">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'entrants'}
          className={
            activeTab === 'entrants' ? 'race-tab-button race-tab-button-active' : 'race-tab-button'
          }
          onClick={() => setActiveTab('entrants')}
        >
          Entrants
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'timing'}
          className={
            activeTab === 'timing' ? 'race-tab-button race-tab-button-active' : 'race-tab-button'
          }
          onClick={() => setActiveTab('timing')}
        >
          Timing
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'settings'}
          className={
            activeTab === 'settings' ? 'race-tab-button race-tab-button-active' : 'race-tab-button'
          }
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </div>

      <div className="race-detail-header">
        <div>
          <p className="app-eyebrow">Selected race</p>
          <h4>{selectedRace.name}</h4>
          <p>
            {activeTabTitle} · Created {selectedRaceDate}
          </p>
        </div>
        <div className="race-detail-actions">
          {activeTab === 'entrants' ? (
            <label className="import-button">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleImportCsv}
                disabled={isImportingCsv}
              />
              {isImportingCsv ? 'Importing...' : 'Import CSV'}
            </label>
          ) : null}
        </div>
      </div>

      {activeTab === 'entrants' ? (
        isLoadingRaceRows ? (
          <p className="race-empty-state">Loading runners...</p>
        ) : selectedRace.headers.length > 0 ? (
          <div className="race-table-wrap">
            <table className="race-table">
              <thead>
                <tr>
                  {selectedRace.headers.map((header) => (
                    <th key={header} scope="col">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedRaceRows.length > 0 ? (
                  selectedRaceRows.map((runner, index) => (
                    <tr key={`${selectedRace.id}-row-${index + 1}`}>
                      {selectedRace.headers.map((header) => (
                        <td key={`${selectedRace.id}-row-${index + 1}-${header}`}>
                          {runner[header] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={selectedRace.headers.length} className="race-empty-cell">
                      No runner rows found for this race yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="race-empty-state">
            Import a CSV to persist racer rows and their source columns
            into the local race database.
          </p>
        )
      ) : null}

      {activeTab === 'timing' ? (
        <div className="time-race-panel">
          <div className="time-race-toolbar">
            <p className="race-empty-state">
              Define timing devices and where they record crossings. Reuse the same
              device for loop crossings and set mile plus a description per entry.
            </p>
          </div>

          <div className="timing-section-header">
            <h5>Timing Devices</h5>
            <button type="button" onClick={handleAddTimingDevice}>
              Add Device
            </button>
          </div>

          {timingDevicesDraft.length === 0 ? (
            <p className="race-empty-state">
              No timing devices yet. Add a device before creating entries.
            </p>
          ) : (
            <div className="race-table-wrap">
              <table className="race-table time-race-table">
                <thead>
                  <tr>
                    <th scope="col">Device Name</th>
                    <th scope="col">Device Code</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {timingDevicesDraft.map((timingDevice) => (
                    <tr key={timingDevice.id}>
                      <td>
                        <input
                          className="race-input"
                          type="text"
                          value={timingDevice.name}
                          placeholder="Finish Box"
                          onChange={(event) =>
                            handleTimingDeviceFieldChange(
                              timingDevice.id,
                              'name',
                              event.target.value,
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="race-input"
                          type="text"
                          value={timingDevice.code}
                          placeholder="BOX-001"
                          onChange={(event) =>
                            handleTimingDeviceFieldChange(
                              timingDevice.id,
                              'code',
                              event.target.value,
                            )
                          }
                        />
                      </td>
                      <td>
                        <button
                          className="danger-button"
                          type="button"
                          onClick={() => handleRemoveTimingDevice(timingDevice.id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="timing-section-header">
            <h5>Timing Entries</h5>
            <button type="button" onClick={handleAddTimingEntry}>
              Add Entry
            </button>
          </div>

          {timingEntriesDraft.length === 0 ? (
            <p className="race-empty-state">
              No entries yet. Add entries to define each crossing point.
            </p>
          ) : (
            <div className="race-table-wrap">
              <table className="race-table time-race-table">
                <thead>
                  <tr>
                    <th scope="col">Timing Device</th>
                    <th scope="col">Mile</th>
                    <th scope="col">Description</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {timingEntriesDraft.map((timingEntry) => (
                    <tr key={timingEntry.id}>
                      <td>
                        <select
                          className="race-input"
                          value={timingEntry.deviceId}
                          onChange={(event) =>
                            handleTimingEntryFieldChange(
                              timingEntry.id,
                              'deviceId',
                              event.target.value,
                            )
                          }
                        >
                          <option value="">Select device</option>
                          {timingDevicesDraft.map((timingDevice) => (
                            <option key={timingDevice.id} value={timingDevice.id}>
                              {timingDevice.name || timingDevice.code || 'Unnamed device'}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="race-input"
                          type="number"
                          min="0"
                          step="0.1"
                          value={timingEntry.mileNumber ?? ''}
                          placeholder="6.2"
                          onChange={(event) =>
                            handleTimingEntryFieldChange(
                              timingEntry.id,
                              'mileNumber',
                              event.target.value,
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="race-input"
                          type="text"
                          value={timingEntry.description}
                          placeholder="Loop crossing #2"
                          onChange={(event) =>
                            handleTimingEntryFieldChange(
                              timingEntry.id,
                              'description',
                              event.target.value,
                            )
                          }
                        />
                      </td>
                      <td>
                        <button
                          className="danger-button"
                          type="button"
                          onClick={() => handleRemoveTimingEntry(timingEntry.id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="panel-actions">
            <button
              type="button"
              onClick={handleSaveTimingConfig}
              disabled={isSavingTimingConfig}
            >
              {isSavingTimingConfig ? 'Saving...' : 'Save Timing Setup'}
            </button>
          </div>
        </div>
      ) : null}

      {activeTab === 'settings' ? (
        <div className="race-settings-panel">
          <label className="race-field">
            <span>Race name</span>
            <input
              className="race-input"
              type="text"
              value={settingsDraft.name}
              onChange={(event) =>
                setSettingsDraft((currentDraft) => ({
                  ...currentDraft,
                  name: event.target.value,
                }))
              }
            />
          </label>

          <label className="race-field">
            <span>Start time</span>
            <input
              className="race-input"
              type="datetime-local"
              value={settingsDraft.startTime}
              onChange={(event) =>
                setSettingsDraft((currentDraft) => ({
                  ...currentDraft,
                  startTime: event.target.value,
                }))
              }
            />
          </label>

          <label className="race-field">
            <span>Timing locations</span>
            <textarea
              className="race-input race-textarea"
              value={settingsDraft.timingLocations}
              placeholder={'One location per line (Start, Split 1, Finish)'}
              onChange={(event) =>
                setSettingsDraft((currentDraft) => ({
                  ...currentDraft,
                  timingLocations: event.target.value,
                }))
              }
            />
          </label>

          <div className="panel-actions">
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={isSavingRaceSettings}
            >
              {isSavingRaceSettings ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      ) : null}
    </>
  ) : (
    <p className="race-empty-state">
      Select a race or create a new one to begin importing racers.
    </p>
  );

  return (
    <div className="app-shell">
      <AppHeader />

      {raceError ? <p className="race-status race-error">{raceError}</p> : null}
      {raceMessage ? <p className="race-status race-success">{raceMessage}</p> : null}

      {showRaceWorkspace ? (
        <section className="race-workspace">
          <div className="race-workspace-header">
            <div>
              <p className="app-eyebrow">Race Workspace</p>
              <h3>Manage local races and imports</h3>
            </div>
            {selectedRace ? (
              <button
                type="button"
                onClick={() => setIsRaceMenuOpen((currentValue) => !currentValue)}
              >
                Hide race menu
              </button>
            ) : null}
          </div>

          <div className="race-layout">
            <aside className="race-list-panel">
              <div className="race-list-header">
                <h4>Your races</h4>
                <button
                  type="button"
                  onClick={handleCreateRace}
                  disabled={isCreatingRace}
                >
                  {isCreatingRace ? 'Creating...' : 'New Race'}
                </button>
              </div>

              {races.length === 0 ? (
                <p className="race-empty-state">
                  Create a race to persist it locally and start importing racer
                  CSV files.
                </p>
              ) : (
                <div className="race-list">
                  {races.map((race) => (
                    <button
                      key={race.id}
                      type="button"
                      className={
                        race.id === selectedRaceId
                          ? 'race-list-item race-list-item-active'
                          : 'race-list-item'
                      }
                      onClick={() => handleSelectRace(race.id)}
                    >
                      <strong>{race.name}</strong>
                      <span>{race.rowCount} imported racers</span>
                    </button>
                  ))}
                </div>
              )}
            </aside>

            <div className="race-detail-panel">{raceDetailContent}</div>
          </div>
        </section>
      ) : null}

      {selectedRace && !isRaceMenuOpen ? (
        <div className="race-detail-panel">{raceDetailContent}</div>
      ) : null}
    </div>
  );
}

function RacesPage() {
  const navigate = useNavigate();
  const [races, setRaces] = useState<RaceSummary[]>(() => readRaceSummaries());
  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(() =>
    readSelectedRaceId(),
  );
  const [isLoadingRaces, setIsLoadingRaces] = useState(false);
  const [isCreatingRace, setIsCreatingRace] = useState(false);
  const [raceMessage, setRaceMessage] = useState<string | null>(null);
  const [raceError, setRaceError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const hydrateRaces = async () => {
      setIsLoadingRaces(true);

      try {
        const nextRaces = await listRaceSummaries();
        if (!isCancelled) {
          setRaces(nextRaces);
        }
      } catch (error) {
        if (!isCancelled) {
          setRaceError(
            error instanceof Error
              ? error.message
              : 'Unable to load races right now.',
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingRaces(false);
        }
      }
    };

    hydrateRaces();

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleCreateRace = async () => {
    setIsCreatingRace(true);
    setRaceError(null);
    setRaceMessage(null);

    try {
      const race = await createRaceSummary();
      setRaces((currentRaces) => [
        race,
        ...currentRaces.filter((currentRace) => currentRace.id !== race.id),
      ]);
      setSelectedRaceId(race.id);
      writeSelectedRaceId(race.id);
      setRaceMessage('New race created.');
    } catch (error) {
      setRaceError(
        error instanceof Error ? error.message : 'Unable to create a race.',
      );
    } finally {
      setIsCreatingRace(false);
    }
  };

  const handleOpenRace = (raceId: string) => {
    setSelectedRaceId(raceId);
    writeSelectedRaceId(raceId);
    navigate('/');
  };

  return (
    <div className="app-shell">
      <AppHeader />

      <section className="race-workspace race-manager-workspace">
        <div className="race-workspace-header">
          <div>
            <p className="app-eyebrow">Races</p>
            <h3>Select or create a race</h3>
          </div>
          <button type="button" onClick={handleCreateRace} disabled={isCreatingRace}>
            {isCreatingRace ? 'Creating...' : 'New Race'}
          </button>
        </div>

        {raceError ? <p className="race-status race-error">{raceError}</p> : null}
        {raceMessage ? <p className="race-status race-success">{raceMessage}</p> : null}

        {isLoadingRaces ? (
          <p className="race-empty-state">Loading races...</p>
        ) : races.length === 0 ? (
          <p className="race-empty-state">
            No races yet. Create a new race to get started.
          </p>
        ) : (
          <div className="race-list race-manager-list">
            {races.map((race) => (
              <button
                key={race.id}
                type="button"
                className={
                  race.id === selectedRaceId
                    ? 'race-list-item race-list-item-active'
                    : 'race-list-item'
                }
                onClick={() => handleOpenRace(race.id)}
              >
                <strong>{race.name}</strong>
                <span>{race.rowCount} imported racers</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          fontFamily: 'sans-serif',
        }}
      >
        Loading…
      </div>
    );
  }

  if (!user) {
    return <SignIn />;
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/races" element={<RacesPage />} />
      </Routes>
    </Router>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
