import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from '@supabase/supabase-js';
import Card from '../components/ui/Card';
import {
  dataTableNames,
  deleteLabeledPersonById,
  fetchCardsByUser,
  fetchPeopleMetByUser,
  isDataSupabaseConfigured,
  saveLabeledPerson,
} from '../lib/supabaseData';

type TimeFilter = 'week' | 'month' | 'year' | 'all';
type PeopleSort = 'recent' | 'frequent' | 'name' | 'favorites';
type SectionKey = 'overview' | 'met' | 'alerts' | 'directory';

interface DashboardProps {
  user: User;
  onSignOut: () => void | Promise<void>;
}

interface Person {
  id: string;
  sourceCardId: string;
  name: string;
  relationship: string;
  pictureRaw: string;
  pictureUrl: string;
  lastMetIso: string;
  lastSeenHoursAgo: number;
  seenCount: number;
  note?: string;
  avatar: string;
}

interface Alert {
  id: string;
  pictureRaw: string;
  timestampHoursAgo: number;
  lastMetIso: string;
  imageUrl: string;
  status: 'pending';
}

const HOURS = {
  week: 24 * 7,
  month: 24 * 30,
  year: 24 * 365,
  all: Number.POSITIVE_INFINITY,
} as const;

const peopleSeed: Person[] = [];
const alertSeed: Alert[] = [];

const CARDS_TABLE = dataTableNames.cards;
const PEOPLE_TABLE = dataTableNames.peopleMet;

const toHoursAgo = (value: unknown, fallback: number) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      const diff = (Date.now() - parsed.getTime()) / (1000 * 60 * 60);
      return Math.max(0, diff);
    }
  }
  return fallback;
};

const textOr = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
};

const toImageSrc = (value: unknown) => {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:image/')) return raw;
  return `data:image/jpeg;base64,${raw}`;
};

const toIsoString = (value: unknown) => {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
};

const timeLabel = (hoursAgo: number) => {
  if (hoursAgo < 1) return 'just now';
  if (hoursAgo < 24) return `${Math.round(hoursAgo)}h ago`;
  return `${Math.round(hoursAgo / 24)}d ago`;
};

const Dashboard: React.FC<DashboardProps> = ({ user, onSignOut }) => {
  const [peopleData, setPeopleData] = useState<Person[]>(peopleSeed);
  const [alertsData, setAlertsData] = useState<Alert[]>(alertSeed);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');
  const [activeSection, setActiveSection] = useState<SectionKey>('overview');
  const [peopleTimeFilter, setPeopleTimeFilter] = useState<TimeFilter>('week');
  const [peopleSort, setPeopleSort] = useState<PeopleSort>('recent');
  const [alertsTimeFilter, setAlertsTimeFilter] = useState<'today' | '3days' | 'week'>('week');
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [topSearch, setTopSearch] = useState('');
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [labelName, setLabelName] = useState('');
  const [labelRelationship, setLabelRelationship] = useState('');
  const [toast, setToast] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  const menuRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const favoriteStorageKey = useMemo(() => `familiar-favorites-${user.id}`, [user.id]);

  const stopCameraStream = useCallback(() => {
    if (!cameraStreamRef.current) return;
    cameraStreamRef.current.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const openCameraFeed = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera API is not available on this browser/device.');
      setIsCameraOpen(true);
      return;
    }

    setCameraError('');
    setIsCameraOpen(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : 'Unable to access camera.');
    }
  }, []);

  const closeCameraFeed = useCallback(() => {
    setIsCameraOpen(false);
    stopCameraStream();
  }, [stopCameraStream]);

  const toggleFavorite = useCallback((personId: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }, []);

  const handleDeletePerson = useCallback(async (person: Person) => {
    const previousPeople = peopleData;
    const wasFavorite = favoriteIds.has(person.id);

    setPeopleData((prev) => prev.filter((item) => item.id !== person.id));
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      next.delete(person.id);
      return next;
    });

    const { error } = await deleteLabeledPersonById(person.id, user.id);
    if (error) {
      setPeopleData(previousPeople);
      if (wasFavorite) {
        setFavoriteIds((prev) => new Set(prev).add(person.id));
      }
      setToast(`Delete failed: ${error.message}`);
      window.setTimeout(() => setToast(''), 2800);
      return;
    }

    setToast('Person removed.');
    window.setTimeout(() => setToast(''), 2200);
  }, [favoriteIds, peopleData]);

  const saveAlertLabel = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedAlert) return;

    const name = labelName.trim();
    const relation = labelRelationship.trim();
    if (!name || !relation) return;

    if (!isDataSupabaseConfigured) {
      setToast('Second Supabase is not configured.');
      window.setTimeout(() => setToast(''), 2400);
      return;
    }

    const { data, error } = await saveLabeledPerson({
      userId: user.id,
      cardId: selectedAlert.id,
      name,
      relation,
    });

    if (error) {
      setToast(`Failed to save: ${error.message}`);
      window.setTimeout(() => setToast(''), 2400);
      return;
    }

    const insertedName = textOr(data?.name, name);
    const insertedRelation = textOr(data?.relation, relation);
    const insertedPerson: Person = {
      id: String(data?.id || `new-${Date.now()}`),
      sourceCardId: selectedAlert.id,
      name: insertedName,
      relationship: insertedRelation,
      pictureRaw: selectedAlert.pictureRaw,
      pictureUrl: toImageSrc(selectedAlert.pictureRaw),
      lastMetIso: selectedAlert.lastMetIso,
      lastSeenHoursAgo: toHoursAgo(selectedAlert.lastMetIso, 0),
      seenCount: 1,
      avatar: insertedName === 'Unknown' ? 'UN' : insertedName.slice(0, 2).toUpperCase(),
    };

    setPeopleData((prev) => [insertedPerson, ...prev]);
    setAlertsData((prev) => prev.filter((alert) => alert.id !== selectedAlert.id));
    setActiveSection('met');

    setToast('Details saved.');
    setSelectedAlert(null);
    setLabelName('');
    setLabelRelationship('');
    window.setTimeout(() => setToast(''), 2400);
    void loadSecondSupabaseData();
  };

  const loadSecondSupabaseData = useCallback(async () => {
    if (!isDataSupabaseConfigured) {
      setDataError('Second Supabase is not configured. Add VITE_DATA_SUPABASE_URL and VITE_DATA_SUPABASE_ANON_KEY.');
      return;
    }

    setIsDataLoading(true);
    setDataError('');

    try {
      const [peopleRes, cardsRes] = await Promise.all([
        fetchPeopleMetByUser(user.id),
        fetchCardsByUser(user.id),
      ]);

      const errors: string[] = [];
      let mappedPeople: Person[] = [];
      const rawCards = cardsRes.data || [];
      const cardById = new Map(rawCards.map((row: Record<string, unknown>) => [String(row.id || ''), row]));

      if (peopleRes.error) {
        errors.push(`People(${PEOPLE_TABLE}): ${peopleRes.error.message}`);
      } else {
        mappedPeople = (peopleRes.data || []).map((row: Record<string, unknown>, index: number) => {
          const name = textOr(row.name, 'Unknown');
          const sourceCardId = textOr(row.card_id ?? row.cardId, '');
          const sourceCard = sourceCardId ? cardById.get(sourceCardId) : undefined;
          const pictureRaw = textOr(sourceCard?.picture ?? sourceCard?.image ?? row.picture ?? row.image, '');
          const lastMetIso = toIsoString(
            sourceCard?.last_met ?? sourceCard?.time ?? row.last_met ?? row.time ?? row.last_seen ?? row.created_at
          );

          return {
            id: String(row.id || `p-${index}`),
            sourceCardId,
            name,
            relationship: textOr(row.relation ?? row.relationship, 'Unknown'),
            pictureRaw,
            pictureUrl: toImageSrc(pictureRaw),
            lastMetIso,
            lastSeenHoursAgo: toHoursAgo(lastMetIso, 9999),
            seenCount: Number(row.seen_count ?? row.interaction_count ?? 0),
            note: typeof row.note === 'string' ? row.note : undefined,
            avatar: name === 'Unknown' ? 'UN' : name.slice(0, 2).toUpperCase(),
          };
        });
      }

      if (cardsRes.error) {
        errors.push(`Cards(${CARDS_TABLE}): ${cardsRes.error.message}`);
      } else {
        const labeledCardIds = new Set(
          (peopleRes.data || [])
            .map((row: Record<string, unknown>) => textOr(row.card_id ?? row.cardId, ''))
            .filter(Boolean)
        );

        const mappedAlerts: Alert[] = rawCards
          .map((row: Record<string, unknown>, index: number) => ({
            id: String(row.id || `a-${index}`),
            pictureRaw: textOr(row.picture ?? row.image, ''),
            name: textOr(row.name, ''),
            relation: textOr(row.relation, ''),
            lastMetIso: toIsoString(row.last_met ?? row.time ?? row.created_at),
          }))
          .filter((row) => !labeledCardIds.has(row.id))
          .filter((row) => !row.name || !row.relation)
          .map((row) => ({
            id: row.id,
            pictureRaw: row.pictureRaw,
            imageUrl: toImageSrc(row.pictureRaw),
            lastMetIso: row.lastMetIso,
            timestampHoursAgo: toHoursAgo(row.lastMetIso, 9999),
            status: 'pending' as const,
          }));

        setAlertsData(mappedAlerts);
      }

      setPeopleData(mappedPeople);

      if (errors.length) {
        setDataError(errors.join(' | '));
      }
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Failed to load data from second Supabase.');
    } finally {
      setIsDataLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    void loadSecondSupabaseData();
  }, [loadSecondSupabaseData]);

  useEffect(() => {
    const saved = localStorage.getItem(favoriteStorageKey);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as string[];
      setFavoriteIds(new Set(parsed));
    } catch {
      setFavoriteIds(new Set());
    }
  }, [favoriteStorageKey]);

  useEffect(() => {
    localStorage.setItem(favoriteStorageKey, JSON.stringify(Array.from(favoriteIds)));
  }, [favoriteIds, favoriteStorageKey]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
        if (isCameraOpen) closeCameraFeed();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
      stopCameraStream();
    };
  }, [closeCameraFeed, isCameraOpen, stopCameraStream]);

  const filteredPeople = useMemo(() => {
    const maxHours = HOURS[peopleTimeFilter];
    const base = peopleData.filter((person) => person.lastSeenHoursAgo <= maxHours);
    const searched = topSearch
      ? base.filter((person) => `${person.name} ${person.relationship}`.toLowerCase().includes(topSearch.toLowerCase()))
      : base;

    if (peopleSort === 'favorites') {
      return [...searched].sort((a, b) => {
        const aFav = favoriteIds.has(a.id) ? 1 : 0;
        const bFav = favoriteIds.has(b.id) ? 1 : 0;
        return bFav - aFav || a.lastSeenHoursAgo - b.lastSeenHoursAgo;
      });
    }
    if (peopleSort === 'recent') return [...searched].sort((a, b) => a.lastSeenHoursAgo - b.lastSeenHoursAgo);
    if (peopleSort === 'frequent') return [...searched].sort((a, b) => b.seenCount - a.seenCount);
    return [...searched].sort((a, b) => a.name.localeCompare(b.name));
  }, [favoriteIds, peopleData, peopleSort, peopleTimeFilter, topSearch]);

  const filteredAlerts = useMemo(() => {
    const maxHours = alertsTimeFilter === 'today' ? 24 : alertsTimeFilter === '3days' ? 72 : 168;
    return alertsData.filter((alert) => alert.timestampHoursAgo <= maxHours);
  }, [alertsData, alertsTimeFilter]);

  const filteredDirectory = useMemo(() => {
    const query = directoryQuery.trim().toLowerCase();
    if (!query) return peopleData;
    return peopleData.filter((person) =>
      `${person.name} ${person.relationship} ${person.note || ''}`.toLowerCase().includes(query)
    );
  }, [directoryQuery, peopleData]);

  const stats = {
    peopleTracked: peopleData.length,
    favoritePeople: peopleData.filter((person) => favoriteIds.has(person.id)).length,
    pendingAlerts: alertsData.length,
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-white pb-20 text-slate-700 md:pb-0">
      <div className="pointer-events-none absolute inset-0">
        <div className="grid-overlay" />
        <div className="dot-field" />
        <div className="scan-line scan-line-a" />
        <div className="scan-line scan-line-b" />
        <div className="orb orb-cyan" />
        <div className="orb orb-green" />
      </div>

      <header className="relative sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Familiar</p>
            <p className="text-lg font-semibold text-slate-900">Caregiver Dashboard</p>
          </div>
          <div className="ml-auto flex w-full items-center gap-2 md:w-auto">
            <input
              type="text"
              placeholder="Search person..."
              value={topSearch}
              onChange={(event) => setTopSearch(event.target.value)}
              className="input-field md:min-w-[220px]"
            />
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setIsMenuOpen((prev) => !prev)}
                className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
                aria-label="Open menu"
                aria-haspopup="menu"
                aria-expanded={isMenuOpen}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 7H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M4 12H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M4 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              {isMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-14 z-30 min-w-[210px] rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsMenuOpen(false);
                      void openCameraFeed();
                    }}
                    className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Live Camera Feed
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
                    disabled
                  >
                    Settings (Soon)
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onSignOut();
                    }}
                    className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-4 py-6 md:py-8">
        <section id="overview" className="scroll-mt-24 reveal-up">
          <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">
            Welcome, {user.user_metadata?.full_name || user.email?.split('@')[0] || 'Caregiver'}
          </h1>
          <p className="mt-1 text-slate-600">Track familiar faces, label unknown alerts, and manage your people directory.</p>
          {isDataLoading && (
            <p className="mt-2 text-sm text-slate-500">Loading data from second Supabase...</p>
          )}
          {dataError && (
            <p className="mt-2 text-sm text-amber-700">{dataError}</p>
          )}
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="p-5">
              <p className="text-sm text-slate-500">Total People Tracked</p>
              <p className="mt-2 text-3xl font-bold text-emerald-700">{stats.peopleTracked}</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-slate-500">Favorite People</p>
              <p className="mt-2 text-3xl font-bold text-amber-500">{stats.favoritePeople}</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-slate-500">Pending Alerts</p>
              <p className="mt-2 text-3xl font-bold text-slate-700">{stats.pendingAlerts}</p>
            </Card>
          </div>
        </section>

        <section id="met" className="mt-8 scroll-mt-24 reveal-up">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 md:text-2xl">People You&apos;ve Met</h2>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select
                value={peopleTimeFilter}
                onChange={(event) => setPeopleTimeFilter(event.target.value as TimeFilter)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="week">Last Week</option>
                <option value="month">Last Month</option>
                <option value="year">Last Year</option>
                <option value="all">All Time</option>
              </select>
              <select
                value={peopleSort}
                onChange={(event) => setPeopleSort(event.target.value as PeopleSort)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="recent">Most Recent</option>
                <option value="frequent">Most Frequent</option>
                <option value="favorites">Favorites First</option>
                <option value="name">Name</option>
              </select>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredPeople.length === 0 && (
              <Card className="p-6 text-center md:col-span-2 xl:col-span-3">
                <p className="text-slate-600">No people recognized yet.</p>
              </Card>
            )}
            {filteredPeople.map((person) => {
              const isFavorite = favoriteIds.has(person.id);
              return (
                <Card key={person.id} className="feature-card reveal-up overflow-hidden p-0">
                  <div className="flex h-56 items-center justify-center border-b border-slate-200 bg-slate-50 p-3 sm:h-64">
                    {person.pictureUrl ? (
                      <img src={person.pictureUrl} alt={person.name || 'Unknown person'} className="max-h-full w-full object-contain" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-lg bg-emerald-100 text-xl font-semibold text-emerald-700">
                        {person.avatar}
                      </div>
                    )}
                  </div>

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xl font-semibold text-slate-900">{person.name || 'Unknown'}</p>
                        <p className="text-sm text-slate-500">{person.relationship || 'Unknown'}</p>
                      </div>
                      {isFavorite && (
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">Favorite</span>
                      )}
                    </div>

                    <p className="mt-3 text-sm text-slate-600">Last met {timeLabel(person.lastSeenHoursAgo)}</p>
                    <p className="text-sm text-slate-500">Seen {person.seenCount} times</p>

                    <div className="mt-4 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleFavorite(person.id)}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                          isFavorite
                            ? 'border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {isFavorite ? 'Unfavorite' : 'Favorite'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeletePerson(person)}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-100"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        <section id="alerts" className="mt-8 scroll-mt-24 reveal-up">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 md:text-2xl">Pending Unknown Alerts</h2>
            <div className="ml-auto">
              <select
                value={alertsTimeFilter}
                onChange={(event) => setAlertsTimeFilter(event.target.value as typeof alertsTimeFilter)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="today">Today</option>
                <option value="3days">Last 3 Days</option>
                <option value="week">Last Week</option>
              </select>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {filteredAlerts.length === 0 && (
              <Card className="p-6 text-center md:col-span-2 xl:col-span-4">
                <p className="text-slate-600">No pending unknown alerts.</p>
              </Card>
            )}
            {filteredAlerts.map((alert) => (
              <Card key={alert.id} className="feature-card reveal-up overflow-hidden p-0">
                <div className="flex h-52 items-center justify-center border-b border-slate-200 bg-slate-50 p-3">
                  {alert.imageUrl ? (
                    <img src={alert.imageUrl} alt="Unknown person" className="max-h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">No image</div>
                  )}
                </div>
                <div className="p-4">
                  <p className="font-semibold text-slate-900">Unknown</p>
                  <p className="text-sm text-slate-500">Unknown</p>
                  <p className="mt-3 text-sm text-slate-600">Last met {timeLabel(alert.timestampHoursAgo)}</p>
                  <span className="badge-unknown mt-2 inline-flex">Pending</span>
                  <button
                    type="button"
                    onClick={() => setSelectedAlert(alert)}
                    className="mt-3 w-full rounded-lg bg-emerald-400 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-emerald-500"
                  >
                    Label Person
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section id="directory" className="mt-8 scroll-mt-24 reveal-up">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 md:text-2xl">People Directory</h2>
            <input
              type="text"
              placeholder="Search by name or relationship"
              value={directoryQuery}
              onChange={(event) => setDirectoryQuery(event.target.value)}
              className="input-field ml-auto w-full md:w-80"
            />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredDirectory.map((person) => (
              <Card key={person.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{person.name || 'Unknown Name'}</p>
                    <p className="text-sm text-slate-500">{person.relationship || 'Unknown Relation'}</p>
                  </div>
                  {favoriteIds.has(person.id) && (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">Fav</span>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-500">Last met {timeLabel(person.lastSeenHoursAgo)}</p>
                {person.note && <p className="mt-3 text-sm text-slate-600">{person.note}</p>}
              </Card>
            ))}
          </div>
        </section>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur md:hidden">
        <div className="grid grid-cols-4 gap-1">
          {[
            { key: 'overview', label: 'Home' },
            { key: 'met', label: 'People' },
            { key: 'alerts', label: 'Alerts' },
            { key: 'directory', label: 'Directory' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setActiveSection(item.key as SectionKey);
                document.getElementById(item.key)?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`rounded-md px-2 py-2 text-xs font-medium ${
                activeSection === item.key ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {selectedAlert && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/30 p-4">
          <Card className="w-full max-w-md p-6">
            <h3 className="text-xl font-semibold text-slate-900">Label Unknown Person</h3>
            <p className="mt-2 text-sm text-slate-600">Alert captured {timeLabel(selectedAlert.timestampHoursAgo)}.</p>
            <form onSubmit={saveAlertLabel} className="mt-4 space-y-3">
              <input
                type="text"
                className="input-field"
                placeholder="Person name"
                value={labelName}
                onChange={(event) => setLabelName(event.target.value)}
                required
              />
              <input
                type="text"
                className="input-field"
                placeholder="Relationship"
                value={labelRelationship}
                onChange={(event) => setLabelRelationship(event.target.value)}
                required
              />
              <button
                type="submit"
                className="w-full rounded-lg bg-emerald-400 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-emerald-500"
              >
                Save Label
              </button>
            </form>
            <button
              type="button"
              onClick={() => setSelectedAlert(null)}
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </Card>
        </div>
      )}

      {isCameraOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-3xl overflow-hidden p-0">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-lg font-semibold text-slate-900">Live Camera Feed</h3>
              <p className="text-sm text-slate-500">Use this to quickly view the current camera stream.</p>
            </div>
            <div className="aspect-video w-full bg-slate-900">
              {cameraError ? (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-red-300">{cameraError}</div>
              ) : (
                <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
              )}
            </div>
            <div className="flex justify-end gap-2 p-4">
              <button
                type="button"
                onClick={closeCameraFeed}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </Card>
        </div>
      )}

      {toast && (
        <div className="fixed right-4 top-20 z-40 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {toast}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
